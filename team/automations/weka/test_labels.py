#!/usr/bin/env python3
"""Tests for `labels.py`, the flow-label reconciler.

Standard library only, like the script under test. Run from the repository root:

    python3 -m unittest discover -s team/automations/weka -p 'test_*.py'

Every case drives the real command line as a subprocess with a fake `gh` on PATH
and a real SQLite board built from the same schema the dispatcher writes, so what
is asserted is the argv the script actually runs and the cards, events and cursor
it actually read — not an in-process stub. The fake `gh` keeps the object's
labels in a JSON file and applies the writes it is given, so "running it twice
changes nothing" is a property of a real second run rather than of a mock that
never moved.

The board is deliberately not mocked: the whole point of #304 is that the labels
follow `task_events`, so a case that stubbed the table would test nothing.
"""
import importlib.util
import json
import os
import re
import sqlite3
import stat
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

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

SCHEMA = """
CREATE TABLE tasks (
    id                   TEXT PRIMARY KEY,
    title                TEXT NOT NULL,
    body                 TEXT,
    assignee             TEXT,
    status               TEXT NOT NULL,
    priority             INTEGER DEFAULT 0,
    created_by           TEXT,
    created_at           INTEGER NOT NULL,
    started_at           INTEGER,
    completed_at         INTEGER,
    workspace_kind       TEXT NOT NULL DEFAULT 'scratch',
    workspace_path       TEXT,
    branch_name          TEXT
);
CREATE TABLE task_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id    TEXT NOT NULL,
    run_id     INTEGER,
    kind       TEXT NOT NULL,
    payload    TEXT,
    created_at INTEGER NOT NULL
);
"""


def card(number, status, assignee: str | None = "cody", branch="", kind="issue", title=None,
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
    entry["created_at"] = created_at if created_at is not None else number
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
        if label == os.environ.get("WEKA_TEST_GH_FAIL_LABEL"):
            fail("HTTP 403: Resource not accessible by integration")
        if label not in state["objects"][number]["labels"]:
            state["objects"][number]["labels"].append(label)
        save()
        print("[]")
    else:
        number, label = path.split("/")[-3], path.rsplit("/", 1)[-1]
        if label == os.environ.get("WEKA_TEST_GH_FAIL_LABEL"):
            fail("HTTP 403: Resource not accessible by integration")
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

# The board is read from SQLite now, never from the CLI. A stub that fails loudly
# proves the script did not fall back to it.
HERMES_STUB = '''#!/bin/sh
echo "hermes $*" >> "${WEKA_TEST_CALLS:?}"
exit 9
'''


class Fixture:
    """A temp HOME with stub binaries, a SQLite board and a fake GitHub."""

    def __init__(self, cards, objects, prs=None, events=None, board="test-board"):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.board = board
        bindir = self.root / "bin"
        bindir.mkdir()
        for name, body in (("gh", GH_STUB), ("hermes", HERMES_STUB)):
            path = bindir / name
            path.write_text(body, encoding="utf-8")
            path.chmod(path.stat().st_mode | stat.S_IEXEC)
        self.home = self.root / "home"
        self._make_board(cards, events or [])
        (self.root / "gh-state.json").write_text(
            json.dumps({"objects": objects, "prs": prs or {}}), encoding="utf-8"
        )
        config = {**CONFIG, "kanban_board": board}
        (self.root / "config.json").write_text(json.dumps(config), encoding="utf-8")
        self.state_dir = self.home / ".hermes" / "state" / "weka-labels"
        self.env = {
            **os.environ,
            "HOME": str(self.home),
            "PATH": f"{bindir}:{os.environ.get('PATH', '')}",
            "WEKA_TEST_CALLS": str(self.root / "hermes-calls.log"),
            "WEKA_TEST_GH_STATE": str(self.root / "gh-state.json"),
            "WEKA_TEST_GH_CALLS": str(self.root / "gh-calls.log"),
        }
        # A worker's env carries the board fence Hermes mints into every child.
        # Reading SQLite is not a board write, so it must not matter; the fence
        # case sets it explicitly.
        self.env.pop("HERMES_DELEGATED_CHILD_CONTEXT", None)

    def _make_board(self, cards, events):
        path = self.home / ".hermes" / "kanban" / "boards" / self.board / "kanban.db"
        path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(path)
        try:
            db.executescript(SCHEMA)
            for entry in cards:
                db.execute(
                    "INSERT INTO tasks (id, title, body, assignee, status, created_at, "
                    "started_at, completed_at, branch_name) VALUES (?,?,?,?,?,?,?,?,?)",
                    (entry["id"], entry["title"], entry.get("body"), entry.get("assignee"),
                     entry["status"], entry["created_at"],
                     entry.get("started_at"), entry.get("completed_at"),
                     entry.get("branch_name", "")),
                )
            for event_id, task_id, kind in events:
                db.execute(
                    "INSERT INTO task_events (id, task_id, kind, created_at) VALUES (?,?,?,?)",
                    (event_id, task_id, kind, event_id),
                )
            db.commit()
        finally:
            db.close()
        self.db_path = path

    def close(self):
        self._tmp.cleanup()

    def run(self, *argv, delay=None, stdin=None, fail_label=None):
        env = dict(self.env)
        if delay is not None:
            env["WEKA_TEST_GH_DELAY"] = str(delay)
        if fail_label is not None:
            env["WEKA_TEST_GH_FAIL_LABEL"] = fail_label
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

    # -- event cursor --------------------------------------------------------

    def cursor_file(self):
        return self.state_dir / f"events-{self.board}"

    def set_cursor(self, value):
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.cursor_file().write_text(f"{value}\n", encoding="utf-8")

    def cursor(self):
        try:
            return int(self.cursor_file().read_text(encoding="utf-8").strip())
        except FileNotFoundError:
            return None

    def pending_file(self):
        return self.state_dir / f"pending-{self.board}"

    def pending(self):
        try:
            return json.loads(self.pending_file().read_text(encoding="utf-8"))
        except FileNotFoundError:
            return {}

    def log(self):
        path = self.state_dir / "log"
        return path.read_text(encoding="utf-8") if path.exists() else ""

    def wait_for_log(self, needle, timeout=15):
        """The sweep runs detached, so the log is the only way to see it land."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if needle in self.log():
                return True
            time.sleep(0.05)
        return False

    def wait_for_log_count(self, needle, count, timeout=20):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.log().count(needle) >= count:
                return True
            time.sleep(0.05)
        return False


class PhaseTests(unittest.TestCase):
    """`phase()` is the whole phase table as a pure function."""

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

    def test_a_finished_card_has_no_phase_at_all(self):
        # `weka-reviewed` used to be the phase of a finished review. There is no
        # fifth label any more: done and archived only ever strip.
        for status in ("done", "archived"):
            for assignee in ("cody", "reed", None):
                with self.subTest(status=status, assignee=assignee):
                    self.assertIsNone(labels.phase(status, assignee, CONFIG))
        self.assertEqual(labels.FLOW_LABELS,
                         (labels.LABEL_QUEUE, labels.LABEL_WORKING,
                          labels.LABEL_REVIEWING, labels.LABEL_BLOCKED))

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
        finished = [card(n, "done", created_at=1000 + n, completed_at=2000 + n)
                    for n in range(401, 413)]
        blocked = {**card(501, "blocked", created_at=1001), "started_at": 900}
        window = labels.sweep_window([blocked] + finished)
        self.assertNotIn("t_501", [c["id"] for c in window])
        self.assertEqual(len(window), 10)

    def test_the_window_is_ordered_by_created_at_not_by_input_order(self):
        newest = card(412, "done", created_at=4000, completed_at=5000)
        live = card(500, "running", created_at=9000)
        oldest = card(401, "done", created_at=1000, completed_at=5000)
        window = labels.sweep_window([newest, live, oldest])
        self.assertEqual([c["id"] for c in window], ["t_401", "t_412", "t_500"])

    def test_a_finished_card_without_stamps_sorts_first(self):
        bare = {"id": "t_1", "status": "done"}
        live = card(500, "running", created_at=9000)
        self.assertEqual([c["id"] for c in labels.sweep_window([live, bare])], ["t_1", "t_500"])


class FallbackWindowTests(unittest.TestCase):
    """The every-tenth-wake repair pass, as a pure function."""

    def test_a_running_card_is_never_re_read(self):
        # Acceptance: one running card and one review card, both with recent
        # state events. Only the review card is reconciled. Re-reading a running
        # card is how an already-approved PR used to regain `weka-reviewing`.
        running = card(262, "running", assignee="reed", created_at=2000)
        review = card(301, "review", assignee="reed", created_at=1000)
        picked = labels.fallback_cards([running, review], ["t_262", "t_301"])
        self.assertEqual([c["id"] for c in picked], ["t_301"])

    def test_live_cards_are_added_even_without_events(self):
        ready = card(300, "ready", assignee=None, created_at=1000)
        blocked = card(302, "blocked", created_at=2000)
        picked = labels.fallback_cards([ready, blocked], [])
        self.assertEqual([c["id"] for c in picked], ["t_300", "t_302"])

    def test_finished_cards_only_enter_through_the_event_window(self):
        done = card(401, "done", created_at=1000, completed_at=2000)
        archived = card(402, "archived", created_at=2000, completed_at=3000)
        self.assertEqual(labels.fallback_cards([done, archived], []), [])
        self.assertEqual([c["id"] for c in labels.fallback_cards([done, archived], ["t_401"])],
                         ["t_401"])

    def test_the_result_is_newest_last(self):
        newest = card(302, "blocked", created_at=3000)
        oldest = card(300, "ready", created_at=1000)
        picked = labels.fallback_cards([newest, oldest], [])
        self.assertEqual([c["id"] for c in picked], ["t_300", "t_302"])


class ReconcileTests(unittest.TestCase):
    def make(self, cards, objects, prs=None, events=None):
        fixture = Fixture(cards, objects, prs, events)
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

    def test_a_done_issue_card_resolves_its_pr_and_strips_it(self):
        # The gap that left PR #297 dirty: a sweep wrote `weka-reviewing` back
        # onto an approved PR, the card went `done` right after, and the code
        # stopped looking at the PR at all. A finished card must still resolve
        # (and strip) it — `_apply` writes nothing to a merged PR, so this costs
        # one lookup.
        board = self.make(
            [card(298, "done", assignee="reed", branch="jsmind-v2/t-298",
                  completed_at=5000)],
            {
                "298": {"state": "open", "labels": ["weka", "weka-reviewing"]},
                "299": {"state": "open", "labels": ["weka", "weka-reviewing"]},
            },
            prs={"jsmind-v2/t-298": 299},
        )
        result = board.run("--reconcile", "--once", "--full")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("t_298 #299 pr: -weka-reviewing", result.stdout)
        self.assertEqual(board.labels_of(299), ["weka"], "a finished card still owns its PR's labels")
        self.assertEqual(board.labels_of(298), ["weka"])

    def test_a_ready_card_without_a_branch_looks_up_no_pr(self):
        board = self.make([card(262, "ready", assignee=None)],
                          {"262": {"state": "open", "labels": ["weka"]}})
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
        # `hooks doctor`'s synthetic payload names a task that exists nowhere.
        # Falling back to a full sweep would make a probe write to GitHub.
        board = self.make([card(262, "running")], {"262": {"state": "open", "labels": []}})
        result = board.run("--reconcile", "--once", "--card", "t_test-task")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("card t_test-task is not on the board", result.stdout)
        self.assertEqual(board.writes(), [])
        self.assertEqual([call for call in board.calls() if call.startswith("api")], [])

    def test_a_running_reviewer_marks_an_unapproved_pr(self):
        board = self.make(
            [card(298, "running", assignee="reed", branch="jsmind-v2/t-298")],
            {
                "298": {"state": "open", "labels": ["weka"]},
                "299": {"state": "open", "labels": ["weka"]},
            },
            prs={"jsmind-v2/t-298": 299},
        )
        result = board.run("--reconcile", "--once", "--full")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("t_298 #299 pr: +weka-reviewing", result.stdout)
        self.assertEqual(board.labels_of(299), ["weka", "weka-reviewing"])

    def test_a_full_sweep_does_not_read_finished_cards_outside_the_window(self):
        finished = [card(n, "done", created_at=1000 + n, completed_at=2000 + n)
                    for n in range(401, 413)]
        objects = {str(n): {"state": "open", "labels": ["weka", "weka-working"]}
                   for n in range(401, 413)}
        board = self.make(finished, objects)

        result = board.run("--reconcile", "--once", "--full")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(board.labels_of(401), ["weka", "weka-working"])
        self.assertEqual(board.labels_of(402), ["weka", "weka-working"])
        self.assertEqual(board.labels_of(403), ["weka"])
        calls = " ".join(board.calls())
        self.assertNotIn("issues/401", calls)
        self.assertNotIn("issues/402", calls)
        self.assertEqual(len(board.writes()), 10, board.writes())

    def test_a_live_card_wins_over_a_finished_card_on_the_same_object(self):
        live = {**card(412, "ready", created_at=9000), "id": "t_live"}
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

    def test_the_board_is_read_from_the_configured_board_database(self):
        # The old path shelled out to `hermes kanban list`; the replacement reads
        # that board's own SQLite file, so nothing reaches the CLI any more.
        board = self.make([card(262, "ready", assignee=None)],
                          {"262": {"state": "open", "labels": []}})
        result = board.run("--reconcile", "--once", "--full")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(board.calls("hermes-calls.log"), [], "labels.py must not call the CLI")
        self.assertEqual(board.labels_of(262), ["weka-queue"])

    def test_a_missing_board_database_is_an_error_not_a_silent_no_op(self):
        board = self.make([], {})
        board.db_path.unlink()
        result = board.run("--reconcile", "--once", "--full")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("board database not found", result.stdout)


class EventCursorTests(unittest.TestCase):
    """The cursor is the fact source: `task_events`, filtered to status changes."""

    def make(self, cards, objects, prs=None, events=None):
        fixture = Fixture(cards, objects, prs, events)
        self.addCleanup(fixture.close)
        return fixture

    def test_only_status_events_are_consumed_and_the_cursor_advances(self):
        # Two events that do not change a status (heartbeat, a comment) and one
        # that does. Only the latter's card is reconciled — proof the filter is
        # in the query, not in a later pass.
        board = self.make(
            [
                card(262, "running", assignee="reed", branch="jsmind-v2/t-262", created_at=1),
                card(301, "ready", assignee=None, created_at=2),
                card(303, "ready", assignee=None, created_at=3),
            ],
            {
                "262": {"state": "open", "labels": ["weka"]},
                "264": {"state": "open", "labels": ["weka"]},
                "301": {"state": "open", "labels": ["weka"]},
                "303": {"state": "open", "labels": ["weka"]},
            },
            prs={"jsmind-v2/t-262": 264},
            events=[(1, "t_301", "heartbeat"), (2, "t_303", "commented"),
                    (3, "t_262", "review_requested")],
        )
        board.set_cursor(0)

        result = board.run("--reconcile", "--once", "--events")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("events: 1 status event(s) since 0, 1 card(s) to read", result.stdout)
        self.assertEqual(board.labels_of(262), ["weka", "weka-reviewing"])
        self.assertEqual(board.labels_of(264), ["weka", "weka-reviewing"])
        calls = " ".join(board.calls())
        self.assertNotIn("issues/301", calls)
        self.assertNotIn("issues/303", calls)
        self.assertEqual(board.cursor(), 3, "the cursor advances to the last event read")

    def test_the_retry_paths_are_consumed_too(self):
        # A circuit-break sets the card `blocked` and appends only `gave_up`
        # (`timed_out` / `crashed` / `rate_limited` behind it); it never fires
        # `kanban_task_blocked`, and a blocked card makes no tool calls, so this
        # batch is the only chance to write `weka-blocked`. An allowlist of
        # `kanban_task_*`-shaped kinds dropped all four and left the card
        # labelled `weka-working` forever.
        board = self.make(
            [card(301, "blocked", assignee="cody", created_at=1)],
            {"301": {"state": "open", "labels": ["weka", "weka-working"]}},
            events=[(1, "t_301", "timed_out"), (2, "t_301", "crashed"),
                    (3, "t_301", "rate_limited"), (4, "t_301", "gave_up")],
        )
        board.set_cursor(0)

        result = board.run("--reconcile", "--once", "--events")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("events: 4 status event(s) since 0, 1 card(s) to read", result.stdout)
        self.assertEqual(board.labels_of(301), ["weka", "weka-blocked"])
        self.assertEqual(board.cursor(), 4)

    def test_a_dispatcher_requeue_is_consumed(self):
        # The same class of miss, from the other direction: `dependency_wait`
        # parks a card in `todo` and `reconciled` / `stale` requeue a `running`
        # one that lost its worker. Neither fires a lifecycle hook.
        board = self.make(
            [card(305, "todo", assignee="cody", created_at=1)],
            {"305": {"state": "open", "labels": ["weka", "weka-working"]}},
            events=[(1, "t_305", "dependency_wait"), (2, "t_305", "reconciled")],
        )
        board.set_cursor(0)

        result = board.run("--reconcile", "--once", "--events")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("events: 2 status event(s) since 0, 1 card(s) to read", result.stdout)
        self.assertEqual(board.labels_of(305), ["weka", "weka-queue"])

    def test_the_first_run_initialises_the_cursor_and_replays_nothing(self):
        # Acceptance: with no cursor file the first run sets the cursor to
        # `max(id)` and touches nothing. Starting at 0 would replay every event
        # the board has ever recorded — thousands of `gh` calls.
        board = self.make(
            [card(262, "running", assignee="reed", branch="jsmind-v2/t-262")],
            {"262": {"state": "open", "labels": ["weka"]},
             "264": {"state": "open", "labels": ["weka"]}},
            prs={"jsmind-v2/t-262": 264},
            events=[(4, "t_262", "created"), (5, "t_262", "review_requested")],
        )

        result = board.run("--reconcile", "--once", "--events")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("initialised at 5 (history is not replayed)", result.stdout)
        self.assertEqual(board.cursor(), 5)
        self.assertEqual(board.calls(), [], "no historical event may cause a GitHub read or write")
        self.assertEqual(board.labels_of(262), ["weka"])

    def test_a_payload_named_card_is_reconciled_without_an_event(self):
        board = self.make(
            [card(301, "ready", assignee=None, created_at=1)],
            {"301": {"state": "open", "labels": ["weka"]}},
            events=[],
        )
        board.set_cursor(0)

        result = board.run("--reconcile", "--once", "--events", "--card", "t_301")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("t_301 #301 issue: +weka-queue", result.stdout)
        self.assertEqual(board.labels_of(301), ["weka", "weka-queue"])

    def test_the_cursor_is_kept_per_board(self):
        # The groom board is a second database with its own id space; a shared
        # cursor would strand whichever board moved last.
        board = self.make([], {})
        self.assertNotEqual(labels.cursor_path({**CONFIG, "kanban_board": "jsmind-v2"}).name,
                            labels.cursor_path({**CONFIG, "kanban_board": "groom"}).name)

    def test_the_fallback_sweep_skips_running_cards(self):
        # Acceptance: a running card and a review card are both inside the
        # fallback window; only the review card is read. Remove the skip and
        # this case reads the running card too.
        board = self.make(
            [
                card(262, "running", assignee="reed", branch="jsmind-v2/t-262", created_at=1),
                card(301, "review", assignee="reed", created_at=2),
            ],
            {
                "262": {"state": "open", "labels": ["weka", "weka-reviewing"]},
                "264": {"state": "open", "labels": ["weka", "weka-reviewing"]},
                "301": {"state": "open", "labels": ["weka"]},
            },
            prs={"jsmind-v2/t-262": 264},
            events=[(1, "t_262", "claimed"), (2, "t_301", "review_requested")],
        )
        board.set_cursor(2)

        result = board.run("--reconcile", "--once", "--events", "--fallback")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("fallback sweep: 1 card(s)", result.stdout)
        self.assertEqual(board.labels_of(301), ["weka", "weka-queue"])
        self.assertEqual(board.labels_of(262), ["weka", "weka-reviewing"],
                         "a running card is never re-read by the fallback")
        self.assertEqual(board.labels_of(264), ["weka", "weka-reviewing"])

    def test_a_batch_larger_than_the_limit_continues_on_the_next_wake(self):
        events = [(n, "t_301", "commented") for n in range(1, 6)]
        events.append((6, "t_301", "review_requested"))
        board = self.make(
            [card(301, "review", assignee="reed", created_at=1)],
            {"301": {"state": "open", "labels": ["weka"]}},
            events=events,
        )
        board.set_cursor(4)

        result = board.run("--reconcile", "--once", "--events")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("events: 1 status event(s) since 4, 1 card(s) to read", result.stdout)
        self.assertEqual(board.cursor(), 6)

    def test_a_rejected_label_write_holds_the_cursor_and_is_retried(self):
        # The batch is consumed once. A `403` / `5xx` on the write would
        # otherwise record work that never happened: the cursor moved, the card
        # kept its old label, and only the tenth-wake sweep might ever return.
        board = self.make(
            [card(301, "review", assignee="reed", created_at=1)],
            {"301": {"state": "open", "labels": ["weka"]}},
            events=[(1, "t_301", "review_requested")],
        )
        board.set_cursor(0)

        result = board.run("--reconcile", "--once", "--events", fail_label="weka-queue")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("whose labels could not be written: t_301", result.stdout)
        self.assertIn("cursor held at 0", result.stdout)
        self.assertEqual(board.cursor(), 0, "a refused write is not consumed work")
        self.assertEqual(board.pending(), {"t_301": 1})
        self.assertEqual(board.labels_of(301), ["weka"])

        # The retry list is read on every wake, so the repair does not depend on
        # another event arriving for that card: the cursor is past the batch and
        # only the list names it.
        board.set_cursor(1)
        result = board.run("--reconcile", "--once", "--events")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("retry list: 1 card(s)", result.stdout)
        self.assertEqual(board.labels_of(301), ["weka", "weka-queue"])
        self.assertEqual(board.pending(), {}, "a healed card leaves the retry list")

    def test_a_permanently_rejected_card_stops_holding_the_cursor(self):
        # Giving up is what keeps one unreachable object from pinning the cursor
        # and stopping every later event. The card stays on the list at the cap
        # so it is not read again, and the batch is allowed through.
        board = self.make(
            [card(301, "review", assignee="reed", created_at=1)],
            {"301": {"state": "open", "labels": ["weka"]}},
            events=[(1, "t_301", "review_requested")],
        )
        board.set_cursor(0)

        for _ in range(labels.PENDING_RETRY_LIMIT - 1):
            result = board.run("--reconcile", "--once", "--events", fail_label="weka-queue")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(board.cursor(), 0)

        result = board.run("--reconcile", "--once", "--events", fail_label="weka-queue")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("no longer retried", result.stdout)
        self.assertEqual(board.cursor(), 1)
        self.assertEqual(board.pending(), {"t_301": labels.PENDING_RETRY_LIMIT})

        board.reset_calls()
        board.run("--reconcile", "--once", "--events")
        self.assertEqual(board.writes(), [], "a given-up card is not retried again")


class DirtyMarkerTests(unittest.TestCase):
    """A wake that loses the lock leaves work behind in a shape the holder reads.

    `--card` and `--events` share one lock, so a completion hook regularly loses
    it to a webhook `--card` child. The marker used to be the bare scope, which
    made the two indistinguishable: the holder looked for a card called `events`,
    found none, and dropped the whole event batch — and that was the batch nobody
    re-sends, because the card it belonged to had just gone `done`.
    """

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        original_dir = labels.STATE_DIR
        setattr(labels, "STATE_DIR", Path(tmp.name))
        self.addCleanup(setattr, labels, "STATE_DIR", original_dir)

    def hold_the_lock(self):
        holder = labels._lock(labels._path("lock"), blocking=False)
        self.assertIsNotNone(holder, "the fixture lock must be free")
        self._holder = holder
        self.addCleanup(self.release)
        return holder

    def release(self):
        holder = getattr(self, "_holder", None)
        if holder is not None:
            os.close(holder)
            self._holder = None

    def marker(self):
        return labels._path("dirty").read_text(encoding="utf-8").strip()

    def test_a_lost_event_wake_marks_events_not_a_card(self):
        self.hold_the_lock()

        self.assertEqual(labels.events_pass(CONFIG), 0)

        self.assertEqual(self.marker(), labels.DIRTY_EVENTS,
                         "`events` has to be recognisable as a scope, not a card id")

    def test_a_lost_card_wake_is_encoded_as_a_card(self):
        self.hold_the_lock()

        self.assertEqual(labels.events_pass(CONFIG, named="t_301"), 0)
        self.assertEqual(self.marker(), "card:t_301")

    def test_a_lost_full_wake_stays_full(self):
        self.hold_the_lock()

        self.assertEqual(labels.reconcile_locked("full", CONFIG), 0)

        self.assertEqual(self.marker(), labels.DIRTY_FULL)

    def test_a_card_holder_that_finds_events_pending_runs_the_event_pass(self):
        # The reported sequence: `kanban_task_completed` lost the lock to a
        # webhook `--card` child, so the holder owed it one event batch.
        holder = self.hold_the_lock()
        labels.events_pass(CONFIG)
        self.release()

        ran = []
        self.record(lambda: ran.append)

        self.assertEqual(labels.reconcile_locked("t_301", CONFIG), 0)

        self.assertEqual(ran, [("card", "t_301"), ("events", None)],
                         "the pending marker was an event batch, not a card id")

    def test_an_event_holder_that_finds_a_card_pending_reads_that_card(self):
        holder = self.hold_the_lock()
        labels.reconcile_locked("t_301", CONFIG)
        self.release()

        ran = []
        self.record(lambda: ran.append)

        self.assertEqual(labels.events_pass(CONFIG), 0)

        self.assertIn(("events", "t_301"), ran,
                      "the pending marker named a card, so the event pass owes it that card")

    def record(self, sink):
        """Replace the two scope runners with recorders; restore afterwards."""
        original_reconciler, original_events = labels.Reconciler, labels._events_once

        class RecordingReconciler:
            def __init__(self, config, **kwargs):
                pass

            def run(self, scope):
                sink()(("card", scope))
                return labels.Report(0)

        def recording_events_once(config, named, fallback, dry_run):
            sink()(("events", named))
            return 0

        setattr(labels, "Reconciler", RecordingReconciler)
        setattr(labels, "_events_once", recording_events_once)
        self.addCleanup(setattr, labels, "Reconciler", original_reconciler)
        self.addCleanup(setattr, labels, "_events_once", original_events)


class HookTests(unittest.TestCase):
    def make(self, cards, objects, prs=None, events=None):
        fixture = Fixture(cards, objects, prs, events)
        self.addCleanup(fixture.close)
        return fixture

    def payload(self, task_id=None, profile="cody", extra=None,
                event="post_tool_call", tool="kanban_show"):
        return json.dumps({
            "hook_event_name": event,
            "tool_name": tool,
            "tool_input": {"task_id": task_id} if task_id else {},
            "session_id": "test-session",
            "cwd": "/tmp",
            "profile": profile,
            # A real `post_tool_call` payload's `extra.task_id` is
            # `effective_task_id`: `task_id or str(uuid.uuid4())`. Never a card.
            "extra": extra if extra is not None
                     else {"task_id": "34a45557-fc92-4fbe-9c98-abed2772bc54"},
        })

    def lifecycle(self, event, task_id):
        """A `kanban_task_*` payload: `extra.task_id` is the real card id."""
        return json.dumps({
            "hook_event_name": event,
            "tool_name": None,
            "tool_input": None,
            "session_id": "",
            "cwd": "/tmp",
            "profile": "cody",
            "extra": {"task_id": task_id, "board": "test-board",
                      "assignee": "cody", "run_id": 7},
        })

    def test_the_detached_sweep_is_not_fenced_by_the_workers_env(self):
        # A hook fires inside a worker, so its env carries the marker Hermes
        # mints into every child. The old path shelled out to `hermes kanban
        # list` — a board write — and had to strip the identity to get through.
        # Reading SQLite needs no grant; the fence may stay.
        board = self.make(
            [card(262, "running", branch="jsmind-v2/t-262")],
            {"262": {"state": "open", "labels": ["weka"]}},
        )
        board.env["HERMES_DELEGATED_CHILD_CONTEXT"] = str(board.home / ".hermes")
        board.set_cursor(0)

        result = board.run("--reconcile", "--once", "--from-hook", stdin=self.payload("t_262"))

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(
            board.wait_for_log("t_262 #262 issue: +weka-working"),
            f"the sweep never reached the board: {board.log()}",
        )
        self.assertNotIn("[ERROR]", board.log(), board.log())
        self.assertEqual(board.labels_of(262), ["weka", "weka-working"])

    def test_the_hook_returns_before_the_sweep_finishes(self):
        # The hook's stdout must reach EOF immediately: `agent/shell_hooks.py`
        # drains it to EOF for up to the hook's own `timeout` and then kills the
        # process group, so a hook that waits loses the reconcile *and* delays
        # every tool call. A 2s `gh` makes the difference measurable.
        board = self.make(
            [card(262, "running", branch="jsmind-v2/t-262")],
            {"262": {"state": "open", "labels": ["weka"]}},
        )
        board.set_cursor(0)
        started = time.monotonic()
        result = board.run("--reconcile", "--once", "--from-hook",
                           stdin=self.payload("t_262"), delay=2)
        elapsed = time.monotonic() - started
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "",
                         "`hooks doctor` fails a hook whose stdout is non-empty and not JSON")
        self.assertLess(elapsed, 1.0, f"the hook took {elapsed:.2f}s; it must not wait for the sweep")

        self.assertTrue(board.wait_for_log("t_262 #262 issue: +weka-working"), board.log())
        self.assertEqual(board.labels_of(262), ["weka", "weka-working"])

    def test_a_lifecycle_event_naming_the_card_reconciles_it(self):
        board = self.make(
            [card(262, "running", branch="jsmind-v2/t-262")],
            {"262": {"state": "open", "labels": ["weka"]}},
        )
        board.set_cursor(0)

        result = board.run("--reconcile", "--once", "--from-hook",
                           stdin=self.lifecycle("kanban_task_claimed", "t_262"))

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(board.wait_for_log("t_262 #262 issue: +weka-working"), board.log())
        self.assertIn("trigger 1: card t_262", board.log())

    def test_a_post_tool_call_uuid_is_not_mistaken_for_a_card(self):
        # `extra.task_id` on a tool call is a per-turn uuid. It must resolve to
        # nothing, leave the cursor alone, and write no label — the newest event
        # is what names the card.
        board = self.make(
            [card(262, "running", branch="jsmind-v2/t-262")],
            {"262": {"state": "open", "labels": ["weka"]}},
            events=[(1, "t_262", "claimed")],
        )
        board.set_cursor(1)

        result = board.run("--reconcile", "--once", "--from-hook", stdin=self.payload())

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(board.wait_for_log_count("no change (0 cards)", 1), board.log())
        self.assertIn("name no card on this board", board.log())
        self.assertEqual(board.calls(), [])
        self.assertEqual(board.labels_of(262), ["weka"])

    def test_a_payload_without_a_card_does_not_guess_the_running_card(self):
        # The old scope was "the profile's only running card", which fails the
        # moment the card leaves `running` — and then silently widened to a full
        # sweep. Nothing here guesses: with no event and no card id, no card is
        # read at all.
        board = self.make(
            [card(262, "running", branch="jsmind-v2/t-262")],
            {"262": {"state": "open", "labels": ["weka"]}},
        )
        board.set_cursor(0)

        result = board.run("--reconcile", "--once", "--from-hook", stdin=self.payload())

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(board.wait_for_log_count("no change (0 cards)", 1), board.log())
        self.assertNotIn("t_262", board.log().split("trigger")[-1])
        self.assertEqual(board.labels_of(262), ["weka"])

    def test_the_tenth_wake_runs_one_fallback_sweep(self):
        board = self.make(
            [card(301, "ready", assignee=None)],
            {"301": {"state": "open", "labels": ["weka"]}},
        )
        board.set_cursor(0)
        for index in range(1, 11):
            result = board.run("--reconcile", "--once", "--from-hook", stdin=self.payload())
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(board.wait_for_log_count("no change (0 cards)", index), board.log())

        text = board.log()
        triggers = re.findall(r"trigger (\d+): (?:card \S+|cursor only)( \+ fallback.*)?", text)
        self.assertEqual([count for count, _ in triggers], [str(n) for n in range(1, 11)], text)
        fallbacks = [count for count, mark in triggers if mark]
        self.assertEqual(fallbacks, ["10"], "only the tenth wake carries the repair sweep")
        self.assertIn("fallback sweep: 1 card(s)", text)
        self.assertTrue(board.wait_for_log("t_301 #301 issue: +weka-queue"), board.log())
        self.assertEqual(board.labels_of(301), ["weka", "weka-queue"])


if __name__ == "__main__":
    unittest.main()
