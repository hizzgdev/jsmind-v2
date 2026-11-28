#!/usr/bin/env python3
"""Tests for `labels.py`, the flow-label reconciler.

Standard library only, like the script under test. Run from the repository root:

    python3 -m unittest discover -s team/automations/weka -p 'test_*.py'

Every case drives the real command line as a subprocess with a fake `gh` and a
fake `hermes` on PATH, so what is asserted is the argv the script actually runs
and the board command it actually builds — not an in-process stub. The fake `gh`
keeps the object's labels in a JSON file and applies the writes it is given, so
"running it twice changes nothing" is a property of a real second run rather
than of a mock that never moved.
"""
import importlib.util
import json
import os
import re
import stat
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "labels.py")


def _load_labels():
    spec = importlib.util.spec_from_file_location("weka_labels", SCRIPT)
    assert spec is not None and spec.loader is not None, f"cannot load {SCRIPT}"
    module = importlib.util.module_from_spec(spec)
    # dataclasses resolve their string annotations through sys.modules, so the
    # module has to be registered before it is executed.
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


labels = _load_labels()

CONFIG = {"target_label": "weka", "kanban_board": "test-board", "assignee": "cody", "reviewer": "reed"}


def card(number, status, assignee="cody", branch="", kind="issue", title=None,
         created_at=None, completed_at=None):
    path = "issues" if kind == "issue" else "pull"
    url = f"https://github.com/hizzgdev/jsmind-v2/{path}/{number}"
    entry = {
        "id": f"t_{number}",
        "title": title or (f"#{number}: something" if kind == "issue" else f"#{number}: Rework — something"),
        "body": f"{url}\n\n## trigger\n- event: issues.assigned\n",
        "status": status,
        "assignee": assignee,
        "branch_name": branch,
    }
    if created_at is not None:
        entry["created_at"] = created_at
    if completed_at is not None:
        entry["completed_at"] = completed_at
    return entry


# A `gh` that answers the four calls the script makes and records every argv. It
# keeps label state on disk and applies the mutations, which is what makes the
# idempotency case meaningful.
GH_STUB = '''#!/usr/bin/env python3
import json, os, sys, time

state_path, calls_path = os.environ["WEKA_TEST_GH_STATE"], os.environ["WEKA_TEST_GH_CALLS"]
args = sys.argv[1:]
with open(calls_path, "a", encoding="utf-8") as fh:
    fh.write(" ".join(args) + "\\n")

with open(state_path, encoding="utf-8") as fh:
    state = json.load(fh)


def save():
    with open(state_path, "w", encoding="utf-8") as fh:
        json.dump(state, fh)


def fail(message):
    sys.stderr.write(message + "\\n")
    sys.exit(1)


if args[:1] == ["api"]:
    rest, method = args[1:], "GET"
    if rest[:1] == ["-X"]:
        method, rest = rest[1], rest[2:]
    path = rest[0]
    if method == "GET":
        delay = os.environ.get("WEKA_TEST_GH_DELAY")
        if delay:
            time.sleep(float(delay))
        obj = state["objects"].get(path.rsplit("/", 1)[-1])
        if obj is None:
            fail("HTTP 404: Not Found")
        # The real endpoint answers labels as objects, not bare names.
        print(json.dumps({"state": obj["state"], "labels": [{"name": n} for n in obj["labels"]]}))
    elif path.endswith("/labels"):
        number = path.split("/")[-2]
        label = rest[rest.index("-f") + 1].split("=", 1)[1]
        if label not in state["objects"][number]["labels"]:
            state["objects"][number]["labels"].append(label)
        save()
        print("[]")
    else:
        number, label = path.split("/")[-3], path.rsplit("/", 1)[-1]
        if label not in state["objects"][number]["labels"]:
            fail("HTTP 404: Label does not exist")
        state["objects"][number]["labels"].remove(label)
        save()
        print("[]")
elif args[:2] == ["pr", "list"]:
    number = state.get("prs", {}).get(args[args.index("--head") + 1])
    print(json.dumps([{"number": number}] if number else []))
else:
    fail("unexpected argv: " + " ".join(args))
'''

HERMES_STUB = '''#!/bin/sh
# Ignore argv: the test asserts it separately from the recorded line.
echo "hermes $*" >> "${WEKA_TEST_CALLS:?}"
# Mirror `kanban_path_is_fenced()`: a subprocess that still carries the marker
# may not run a board command, because `list` does a write internally.
if [ -n "${HERMES_DELEGATED_CHILD_CONTEXT:-}" ]; then
  echo "kanban: delegate_task child contexts cannot mutate Kanban tasks or boards" >&2
  exit 1
fi
cat "${WEKA_TEST_BOARD:?}"
'''


class Fixture:
    """A temp HOME with stub binaries, a board file and a fake GitHub."""

    def __init__(self, cards, objects, prs=None):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        bindir = self.root / "bin"
        bindir.mkdir()
        for name, body in (("gh", GH_STUB), ("hermes", HERMES_STUB)):
            path = bindir / name
            path.write_text(body, encoding="utf-8")
            path.chmod(path.stat().st_mode | stat.S_IEXEC)
        (self.root / "board.json").write_text(json.dumps(cards), encoding="utf-8")
        (self.root / "gh-state.json").write_text(
            json.dumps({"objects": objects, "prs": prs or {}}), encoding="utf-8"
        )
        (self.root / "config.json").write_text(json.dumps(CONFIG), encoding="utf-8")
        self.state_dir = self.root / "home" / ".hermes" / "state" / "weka-labels"
        # Behave the same in a plain shell and inside a worker: a worker's env
        # carries the board fence, and the fake `hermes` honours it. The fence
        # case re-adds it explicitly.
        base = {k: v for k, v in os.environ.items() if k not in labels.WORKER_ENV_KEYS}
        self.env = {
            **base,
            "HOME": str(self.root / "home"),
            "PATH": f"{bindir}:{os.environ.get('PATH', '')}",
            "WEKA_TEST_BOARD": str(self.root / "board.json"),
            "WEKA_TEST_CALLS": str(self.root / "hermes-calls.log"),
            "WEKA_TEST_GH_STATE": str(self.root / "gh-state.json"),
            "WEKA_TEST_GH_CALLS": str(self.root / "gh-calls.log"),
        }

    def close(self):
        self._tmp.cleanup()

    def run(self, *argv, delay=None, stdin=None):
        env = dict(self.env)
        if delay is not None:
            env["WEKA_TEST_GH_DELAY"] = str(delay)
        return subprocess.run(
            [sys.executable, SCRIPT, "--config", str(self.root / "config.json"), *argv],
            env=env, input=stdin, capture_output=True, text=True, timeout=60,
        )

    def labels_of(self, number):
        state = json.loads((self.root / "gh-state.json").read_text(encoding="utf-8"))
        return sorted(state["objects"][str(number)]["labels"])

    def calls(self, name="gh-calls.log"):
        path = self.root / name
        if not path.exists():
            return []
        return [line for line in path.read_text(encoding="utf-8").splitlines() if line]

    def writes(self):
        return [line for line in self.calls() if " -X " in line]

    def reset_calls(self):
        for name in ("gh-calls.log", "hermes-calls.log"):
            (self.root / name).unlink(missing_ok=True)


class PhaseTests(unittest.TestCase):
    """`phase()` is the whole design as a pure function."""

    def test_the_table(self):
        cases = [
            ("ready", "cody", labels.LABEL_QUEUE),
            ("todo", "reed", labels.LABEL_QUEUE),
            ("scheduled", None, labels.LABEL_QUEUE),
            ("triage", None, labels.LABEL_QUEUE),
            ("running", "cody", labels.LABEL_WORKING),
            ("running", "reed", labels.LABEL_REVIEWING),
            ("blocked", "cody", labels.LABEL_BLOCKED),
            ("done", "cody", None),
            ("archived", "reed", None),
        ]
        for status, assignee, expected in cases:
            with self.subTest(status=status, assignee=assignee):
                self.assertEqual(labels.phase(status, assignee, CONFIG), expected)

    def test_review_is_a_queue_not_a_review_in_progress(self):
        # The card waits in `review` until reed claims it, so nobody is on the PR
        # yet. Mapping it to `weka-reviewing` would put the label on before the
        # reviewer exists — and would also break `pass-review.sh`'s draft gate.
        self.assertEqual(labels.phase("review", None, CONFIG), labels.LABEL_QUEUE)
        self.assertNotEqual(labels.phase("review", "reed", CONFIG), labels.LABEL_REVIEWING)

    def test_an_unknown_assignee_has_no_phase(self):
        # The groom board's scout cards land here; the caller logs the card id.
        self.assertIsNone(labels.phase("running", "scout", CONFIG))
        self.assertIsNone(labels.phase("running", None, CONFIG))


class SweepWindowTests(unittest.TestCase):
    """What one full sweep looks at, and in which order it applies it."""

    def test_the_window_keeps_every_live_card_and_the_recent_finished_tail(self):
        finished = [card(n, "done", created_at=1000 + n, completed_at=2000 + n)
                    for n in range(401, 413)]
        live = [card(500, "ready", created_at=9000)]
        window = labels.sweep_window(live + finished)
        self.assertEqual([c["id"] for c in window],
                         ["t_403", "t_404", "t_405", "t_406", "t_407", "t_408", "t_409",
                          "t_410", "t_411", "t_412", "t_500"])

    def test_a_blocked_card_shares_the_finished_tail(self):
        # `blocked` has a phase but is not live work: it is reconciled when it
        # blocks (the `kanban_block` hook) and then ages out of the window like
        # a finished card, instead of being read on every sweep forever.
        finished = [card(n, "done", created_at=1000 + n, completed_at=2000 + n)
                    for n in range(401, 413)]
        blocked = {**card(501, "blocked", created_at=1001), "started_at": 900}
        window = labels.sweep_window([blocked] + finished)
        self.assertNotIn("t_501", [c["id"] for c in window])
        self.assertEqual(len(window), 10)

    def test_the_window_is_ordered_by_created_at_not_by_input_order(self):
        # The caller resolves an object two cards claim by "last assignment
        # wins", so the order has to be explicit: an old `done` card that lands
        # after a live one would strip the label the live card wants.
        newest = card(412, "done", created_at=4000, completed_at=5000)
        live = card(500, "running", created_at=9000)
        oldest = card(401, "done", created_at=1000, completed_at=5000)
        window = labels.sweep_window([newest, live, oldest])
        self.assertEqual([c["id"] for c in window], ["t_401", "t_412", "t_500"])

    def test_a_finished_card_without_stamps_sorts_first(self):
        # `completed_at` is missing on an interrupted card; `started_at` and
        # `created_at` are the fallbacks, and a card with none of them must not
        # crash the sort or outrank a live card.
        bare = {"id": "t_1", "status": "done"}
        live = card(500, "running", created_at=9000)
        self.assertEqual([c["id"] for c in labels.sweep_window([live, bare])], ["t_1", "t_500"])


class ReconcileTests(unittest.TestCase):
    def make(self, cards, objects, prs=None):
        fixture = Fixture(cards, objects, prs)
        self.addCleanup(fixture.close)
        return fixture

    def test_a_second_run_changes_nothing(self):
        board = self.make(
            [card(262, "running", branch="jsmind-v2/t-262")],
            {"262": {"state": "open", "labels": ["weka"]}},
        )
        first = board.run("--reconcile", "--once", "--full")
        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertIn("t_262 #262 issue: +weka-working", first.stdout)
        self.assertEqual(board.labels_of(262), ["weka", "weka-working"])

        board.reset_calls()
        second = board.run("--reconcile", "--once", "--full")
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertIn("no change (1 cards)", second.stdout)
        self.assertEqual(board.writes(), [], "a run with nothing to change must send no write")

    def test_a_done_card_only_strips(self):
        board = self.make(
            [card(262, "done", assignee="reed")],
            {"262": {"state": "open", "labels": ["weka", "weka-working"]}},
        )
        done = board.run("--reconcile", "--once", "--full")
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertIn("t_262 #262 issue: -weka-working", done.stdout)
        self.assertEqual(board.labels_of(262), ["weka"])
        writes = board.writes()
        self.assertEqual(len(writes), 1, writes)
        self.assertIn("-X DELETE", writes[0])
        self.assertNotIn("POST", " ".join(writes), "a finished card never adds a label")

        board.reset_calls()
        self.assertIn("no change", board.run("--reconcile", "--once", "--full").stdout)
        self.assertEqual(board.writes(), [])

    def test_a_closed_object_is_left_alone(self):
        board = self.make(
            [card(262, "done")],
            {"262": {"state": "closed", "labels": ["weka", "weka-working"]}},
        )
        result = board.run("--reconcile", "--once", "--full")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(board.writes(), [], "a closed object keeps its labels; close-time cleanup is the webhook's")
        self.assertIn("no change", result.stdout)

    def test_an_issue_card_labels_its_pr_too(self):
        board = self.make(
            [card(262, "running", branch="jsmind-v2/t-262")],
            {
                "262": {"state": "open", "labels": []},
                "264": {"state": "open", "labels": ["weka"]},
            },
            prs={"jsmind-v2/t-262": 264},
        )
        result = board.run("--reconcile", "--once", "--full")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(board.labels_of(262), ["weka-working"])
        self.assertEqual(board.labels_of(264), ["weka", "weka-working"])
        self.assertIn("t_262 #264 pr: +weka-working", result.stdout)
        self.assertTrue(
            any("pr list --repo hizzgdev/jsmind-v2 --head jsmind-v2/t-262" in call for call in board.calls()),
            board.calls(),
        )

    def test_a_ready_card_without_a_branch_looks_up_no_pr(self):
        # `ready` on a first pass has no branch yet, so there is no PR to find;
        # asking for one would spend a request per card on every sweep. A rework
        # card does come back `ready` with a branch, and its draft PR is then
        # labelled `weka-queue` too — that is the accepted meaning.
        board = self.make([card(262, "ready", assignee=None)], {"262": {"state": "open", "labels": ["weka"]}})
        result = board.run("--reconcile", "--once", "--full")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("t_262 #262 issue: +weka-queue", result.stdout)
        self.assertEqual([call for call in board.calls() if call.startswith("pr list")], [])

    def test_an_unknown_assignee_is_skipped_with_the_card_id(self):
        board = self.make(
            [card(262, "running", assignee="scout")],
            {"262": {"state": "open", "labels": ["weka"]}},
        )
        result = board.run("--reconcile", "--once", "--full")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("t_262: status=running assignee=scout is not in the phase table", result.stdout)
        self.assertEqual(board.writes(), [])
        self.assertNotIn("262", " ".join(board.calls()), "a skipped card does not even read the object")

    def test_a_card_that_is_not_on_the_board_is_not_a_full_sweep(self):
        # This is `hooks doctor`'s synthetic payload: a task id that exists
        # nowhere. Falling back to a full sweep would make a probe write to GitHub.
        board = self.make([card(262, "running")], {"262": {"state": "open", "labels": []}})
        result = board.run("--reconcile", "--once", "--card", "t_test-task")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("card t_test-task is not on the board", result.stdout)
        self.assertEqual(board.writes(), [])
        self.assertEqual([call for call in board.calls() if call.startswith("api")], [])

    def test_a_finished_issue_card_strips_only_the_issue(self):
        # Reed's must-fix: `include_pr` is decided by "does this card still have
        # a phase", not by status == ready. A finished issue card only strips the
        # object its body names; its PR is cleared by `pass-review.sh` at
        # approval and by the webhook's close-time `strip_labels()`. Reading the
        # PR here would cost one `gh pr list` + one `gh api` per finished card,
        # on every full sweep.
        board = self.make(
            [card(262, "done", branch="jsmind-v2/t-262")],
            {
                "262": {"state": "open", "labels": ["weka", "weka-working"]},
                "264": {"state": "open", "labels": ["weka", "weka-working"]},
            },
            prs={"jsmind-v2/t-262": 264},
        )
        result = board.run("--reconcile", "--once", "--full")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("t_262 #262 issue: -weka-working", result.stdout)
        self.assertEqual(board.labels_of(262), ["weka"])
        self.assertEqual(board.labels_of(264), ["weka", "weka-working"],
                         "a finished issue card never touches its PR")
        self.assertEqual([call for call in board.calls() if call.startswith("pr list")], [])

    def test_a_full_sweep_does_not_read_finished_cards_outside_the_window(self):
        finished = [card(n, "done", created_at=1000 + n, completed_at=2000 + n)
                    for n in range(401, 413)]
        objects = {str(n): {"state": "open", "labels": ["weka", "weka-working"]}
                   for n in range(401, 413)}
        board = self.make(finished, objects)

        result = board.run("--reconcile", "--once", "--full")

        self.assertEqual(result.returncode, 0, result.stderr)
        # 10 of the 12 finished cards are in the window; the two oldest are not
        # read at all, so their stale labels stay (they were stripped when their
        # cards went `done`).
        self.assertEqual(board.labels_of(401), ["weka", "weka-working"])
        self.assertEqual(board.labels_of(402), ["weka", "weka-working"])
        self.assertEqual(board.labels_of(403), ["weka"])
        calls = " ".join(board.calls())
        self.assertNotIn("issues/401", calls)
        self.assertNotIn("issues/402", calls)
        self.assertEqual(len(board.writes()), 10, board.writes())

    def test_a_live_card_wins_over_a_finished_card_on_the_same_object(self):
        # The board order is arbitrary here on purpose (the live card is first):
        # `sweep_window` re-sorts by `created_at` so the newest claim is applied
        # last and wins. Without the sort the `done` card would strip the label
        # the live card just earned.
        live = card(412, "ready", created_at=9000)
        finished = [card(n, "done", created_at=1000 + n, completed_at=2000 + n)
                    for n in range(403, 413)]
        objects = {str(n): {"state": "open", "labels": ["weka", "weka-working"]}
                   for n in range(403, 413)}
        board = self.make([live] + finished, objects)

        result = board.run("--reconcile", "--once", "--full")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(board.labels_of(412), ["weka", "weka-queue"])
        writes_412 = [call for call in board.writes() if "issues/412" in call]
        self.assertTrue(any("weka-queue" in call for call in writes_412), writes_412)
        self.assertFalse(
            any("weka-working" in call and "POST" in call for call in writes_412),
            f"the finished card won the object: {writes_412}",
        )

    def test_a_card_whose_title_does_not_key_an_object_is_skipped(self):
        # A follow-up card whose body begins with the PR it follows is not keyed
        # to that PR: only `#<number>: …` titles are. Without the gate the newer
        # follow-up card would win the object against the card working on it and
        # put `weka-queue` on a PR that is being edited.
        side = {**card(287, "todo", kind="pr"), "id": "t_followup",
                "title": "#273 follow-up: README label owner"}
        board = self.make(
            [side, card(287, "running", kind="pr", created_at=1000)],
            {"287": {"state": "open", "labels": ["weka"]}},
        )
        result = board.run("--reconcile", "--once", "--full")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("t_followup: title does not start with `#<number>:`; skipping", result.stdout)
        self.assertEqual(board.labels_of(287), ["weka", "weka-working"])

    def test_the_board_command_names_the_configured_board(self):
        board = self.make([], {})
        result = board.run("--dry-run", "--full")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            board.calls("hermes-calls.log"), ["hermes kanban --board test-board list --json"]
        )
        self.assertIn("no change (0 cards)", result.stdout)

    def test_an_unreadable_board_reports_the_cli_stderr(self):
        board = self.make([], {})
        (board.root / "hermes-calls.log").unlink(missing_ok=True)
        (board.root / "bin" / "hermes").write_text(
            '#!/bin/sh\necho "kanban: delegate_task child contexts cannot mutate Kanban tasks" >&2\nexit 1\n',
            encoding="utf-8",
        )
        result = board.run("--reconcile", "--once", "--full")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("delegate_task child contexts cannot mutate", result.stdout)


class HookTests(unittest.TestCase):
    def make(self, cards, objects, prs=None):
        fixture = Fixture(cards, objects, prs)
        self.addCleanup(fixture.close)
        return fixture

    def payload(self, task_id=None):
        return json.dumps({
            "hook_event_name": "post_tool_call",
            "tool_name": "kanban_show",
            "tool_input": {"task_id": task_id} if task_id else {},
            "session_id": "test-session",
            "cwd": "/tmp",
            "profile": "cody",
            "extra": {},
        })

    def log(self, board):
        path = board.state_dir / "log"
        return path.read_text(encoding="utf-8") if path.exists() else ""

    def wait_for_log(self, board, needle, timeout=15):
        """The sweep runs detached, so the log is the only way to see it land."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if needle in self.log(board):
                return True
            time.sleep(0.05)
        return False

    def test_the_granted_env_drops_the_worker_identity(self):
        # Hermes re-mints the fence for every subprocess of a worker, so the
        # detached sweep has to be handed an env that does not carry it.
        with mock.patch.dict(os.environ, {
            "HERMES_DELEGATED_CHILD_CONTEXT": "/home/someone/.hermes",
            "HERMES_KANBAN_TASK": "t_1",
            "HERMES_KANBAN_CLAIM_LOCK": "host:1",
            "HERMES_HOME": "/home/someone/.hermes/profiles/cody",
        }, clear=False):
            env = labels.granted_env()
        self.assertNotIn("HERMES_DELEGATED_CHILD_CONTEXT", env)
        self.assertNotIn("HERMES_KANBAN_TASK", env)
        self.assertNotIn("HERMES_KANBAN_CLAIM_LOCK", env)
        # The profile home is what points `hermes` at the right board: it stays.
        self.assertEqual(env["HERMES_HOME"], "/home/someone/.hermes/profiles/cody")

    def test_the_detached_sweep_is_not_fenced_by_the_workers_env(self):
        # A hook fires inside a worker, so its env carries
        # HERMES_DELEGATED_CHILD_CONTEXT and the board command exits 1 under it
        # (`list` runs `recompute_ready()`, a write). Without the grant the only
        # trigger that follows the board writes no label at all — the log holds
        # `[ERROR] … exited 1` and the object keeps its stale label.
        board = self.make(
            [card(262, "running", branch="jsmind-v2/t-262")],
            {"262": {"state": "open", "labels": ["weka"]}},
        )
        board.env["HERMES_DELEGATED_CHILD_CONTEXT"] = str(board.root / "home" / ".hermes")
        result = board.run("--reconcile", "--once", "--from-hook", stdin=self.payload("t_262"))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(
            self.wait_for_log(board, "t_262 #262 issue: +weka-working"),
            f"the sweep never reached the board: {self.log(board)}",
        )
        self.assertNotIn("[ERROR]", self.log(board), self.log(board))
        self.assertEqual(board.labels_of(262), ["weka", "weka-working"])

    def test_the_tenth_trigger_is_the_only_full_sweep(self):
        cards = [card(number, "ready", assignee=None) for number in (301, 302)]
        board = self.make(cards, {"301": {"state": "open", "labels": []},
                                  "302": {"state": "open", "labels": []}})
        for index in range(1, 12):
            card_id = "t_301" if index % 2 else "t_302"
            result = board.run("--reconcile", "--once", "--from-hook", stdin=self.payload(card_id))
            self.assertEqual(result.returncode, 0, result.stderr)
        text = self.log(board)
        # Count what each hook decided, not every line that mentions a scope: a
        # sweep that loses the lock writes `scope=full: a reconcile is already
        # running; marked dirty`, which is the lock talking, not a 12th trigger.
        scopes = re.findall(r"trigger \d+: scope=(\S+)", text)
        self.assertEqual(scopes.count("full"), 1, text)
        self.assertEqual(scopes.count("card"), 10, text)
        # The 10th call is the one that broadened out to the whole board.
        self.assertIn("trigger 10: scope=full", text)

    def test_a_payload_without_a_task_id_falls_back_to_a_full_sweep(self):
        board = self.make([card(301, "ready", assignee=None)], {"301": {"state": "open", "labels": []}})
        result = board.run("--reconcile", "--once", "--from-hook", stdin=self.payload())
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("scope=full (the payload carries no task_id)", self.log(board))

    def test_the_hook_returns_before_the_sweep_finishes(self):
        # The hook's stdout must reach EOF immediately: `agent/shell_hooks.py`
        # drains it to EOF with `timeout: 5` and then kills the process group, so
        # a hook that waits for the reconcile loses the reconcile *and* delays
        # every tool call. A 2s `gh` makes the difference measurable.
        board = self.make(
            [card(262, "running", branch="jsmind-v2/t-262")],
            {"262": {"state": "open", "labels": ["weka"]}},
        )
        started = time.monotonic()
        result = board.run("--reconcile", "--once", "--from-hook",
                           stdin=self.payload("t_262"), delay=2)
        elapsed = time.monotonic() - started
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "",
                         "`hooks doctor` fails a hook whose stdout is non-empty and not JSON")
        self.assertLess(elapsed, 1.0, f"the hook took {elapsed:.2f}s; it must not wait for the sweep")

        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            if "t_262 #262 issue: +weka-working" in self.log(board):
                break
            time.sleep(0.05)
        self.assertIn("t_262 #262 issue: +weka-working", self.log(board),
                      "the detached sweep has to finish on its own after the hook exits")
        self.assertEqual(board.labels_of(262), ["weka", "weka-working"])


if __name__ == "__main__":
    unittest.main()
