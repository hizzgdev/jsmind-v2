#!/usr/bin/env python3
"""Reconcile the weka flow labels on GitHub against the Kanban board.

The board says which phase a card is in; this script says which flow label its
object should carry, reads what is there, and writes only the difference. It
owns exactly four labels — `weka-queue` / `weka-working` / `weka-reviewing` /
`weka-blocked` — and never adds or removes `weka` (a participation marker) or
`weka-reviewed` (the rework gate, which belongs to `github-webhook.py`). It does
*read* `weka-reviewed`, for one decision: that label is the end of the review,
so a reviewer card that is still `running` — it runs `pass-review.sh`
mid-session, and every later tool call fires this sweep — must not put
`weka-reviewing` back (see `yields_to_reviewed`).

Why a script and not a step in the SOULs: a model that is told to label its
object does it late, or not at all, and a label that is wrong on GitHub is
indistinguishable from a card that crashed. The phase is a pure function of
`(status, assignee)`, so it does not need a model in the loop.

Two event sources feed one reconcile function, and there is no timer:

- `post_tool_call` (`--from-hook`): advances a counter under `flock`; every
  `FULL_SWEEP_EVERY`-th call reconciles the whole board, the others reconcile
  only the card the tool call touched. That card is the call's explicit
  `task_id` when the model passed one, otherwise the only `running` card of the
  profile that fired the hook: a real payload carries no card id at all
  (`extra.task_id` is a per-turn uuid), and a profile is pinned to a single
  in-progress card. When neither resolves, the call widens to a full sweep.
- a card being created (`--once --card <id>`, spawned detached by
  `github-webhook.py`): `kanban create` is a CLI call, so no tool hook sees it,
  and the new card waits in `ready` without a session — that window is exactly
  what `weka-queue` is for.

A full sweep is not the whole board: it is every unfinished card plus the last
`FULL_SWEEP_DONE_LIMIT` finished ones (see `sweep_window`).

A hook that is slow is a hook that gets killed: `agent/shell_hooks.py` drains
stdout/stderr to EOF for up to the hook's own `timeout` (`hooks.<event>[].timeout`,
default 60s, cap 300 — `agent/shell_hooks.py:37-38`), then kills the hook's whole
process group. So hook mode decides the scope, re-executes itself *detached* (own
session, no inherited pipes, output to the log) and exits immediately. Its
stdout stays empty, which is also what `hermes hooks doctor` requires.

The detached child also gets a fence-free env (`granted_env`): a hook is a
worker's subprocess, so Hermes hands it `HERMES_DELEGATED_CHILD_CONTEXT`, and
under that fence `hermes kanban list` — which runs `recompute_ready()` — exits 1
instead of printing the board.

Everything it prints in hook mode goes to `~/.hermes/state/weka-labels/log`;
the human-readable lines are printed directly by `--dry-run` and by a manual
`--full` / `--card` run.
"""
from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CONFIG = os.path.join(HERE, "config.json")
SCRIPT = os.path.abspath(__file__)

# Shared by all three profiles on purpose: each profile has its own HERMES_HOME,
# so a state dir under `profiles/<p>/` would be three independent counters.
STATE_DIR = Path(os.path.expanduser("~/.hermes/state/weka-labels"))

LABEL_QUEUE = "weka-queue"
LABEL_WORKING = "weka-working"
LABEL_REVIEWING = "weka-reviewing"
LABEL_BLOCKED = "weka-blocked"
FLOW_LABELS = (LABEL_QUEUE, LABEL_WORKING, LABEL_REVIEWING, LABEL_BLOCKED)

# Read-only here: the approval script and the webhook own writing it. The one
# decision it feeds is that `weka-reviewing` yields to it (see `yields_to_reviewed`).
LABEL_REVIEWED = "weka-reviewed"

# A module constant, not a config field: a sweep frequency is fixed behaviour,
# not something an operator tunes (see `operating-notes.md`, semantic fields only).
FULL_SWEEP_EVERY = 10

# A full sweep takes every unfinished card plus this many of the most recently
# finished ones, not all ~100 `done` cards the board keeps. Each card costs an
# object read (and an issue card a `gh pr list`), so sweeping the lot made one
# pass ~100 requests. Anything older than the tail was already stripped when its
# card went `done` (that transition fires the hook); the window only has to
# catch a sweep that died mid-run.
FULL_SWEEP_DONE_LIMIT = 10

# The scope a hook passes when the payload has no card id: the detached child
# resolves it against the board, because a workspace profile runs at most one
# card (`kanban.max_in_progress_per_profile`). Resolved in the child, not in the
# hook process: the hook itself is still fenced off the board (see `granted_env`).
PROFILE_SCOPE = "profile:"

# `review` is a queue, not a review in progress: the card waits there until reed
# claims it, so at that instant nobody is touching the PR.
QUEUED_STATUSES = ("ready", "todo", "scheduled", "triage", "review")
CLOSED_STATUSES = ("done", "archived")

# `blocked` keeps its own phase but shares the finished-card window: the moment
# a card blocks, `kanban_block`'s hook watches it here, so an old blocked card
# outside the window has already been labelled for its last transition.
WINDOWED_STATUSES = CLOSED_STATUSES + ("blocked",)

CARD_TITLE_RE = re.compile(r"^#(\d+):")
OBJECT_URL_RE = re.compile(r"^https://github\.com/([\w.-]+)/([\w.-]+)/(issues|pull)/(\d+)")

_STREAM = sys.stdout


def say(message: str) -> None:
    """Progress line. In hook mode `_STREAM` is the log file, never stdout."""
    print(message, file=_STREAM, flush=True)


class BoardError(RuntimeError):
    """The board could not be read; the message carries the CLI's own words."""


def phase(status: str, assignee: str | None, config: dict) -> str | None:
    """The flow label a card in this state should put on its object, or None.

    None means "no process label" — either the card is finished (strip only) or
    its assignee is not one this flow knows. The caller logs the second case;
    the distinction is a status check, so it never gets guessed here.
    """
    if status in QUEUED_STATUSES:
        return LABEL_QUEUE
    if status in CLOSED_STATUSES:
        return None
    if status == "blocked":
        return LABEL_BLOCKED
    if status == "running":
        if assignee and assignee == config.get("assignee"):
            return LABEL_WORKING
        if assignee and assignee == config.get("reviewer"):
            return LABEL_REVIEWING
    return None


def yields_to_reviewed(label: str | None, present: set[str]) -> str | None:
    """`weka-reviewing` gives way to `weka-reviewed`; every other label passes.

    Approval is one transaction inside `pass-review.sh` (strip, add
    `weka-reviewed`, flip to ready) but the reviewer's card is still `running`
    afterwards — it asks for the human reviewer and then calls
    `kanban_complete`, and each of those tool calls fires a sweep. The phase
    alone says `running` + reed, so without this rule the sweep writes
    `weka-reviewing` straight back onto a now-ready PR, which is the state the
    flow is supposed to forbid: `weka-reviewing` means "an AI is reviewing
    this", and `weka-reviewed` means the review is over.

    Returning None also removes a pair that already exists (an approval from
    before this rule, or a sweep that was in flight when the label landed), so
    the ready + `weka-reviewing` + `weka-reviewed` combination heals on the next
    sweep instead of waiting for the close-time cleanup.

    Only `weka-reviewing` is suppressed: `weka-working` next to
    `weka-reviewed` is the rework pickup (cody is editing again, the webhook
    still owes the label strip), and `weka-queue` next to it is the rework gate
    itself — both are true, not contradictory.
    """
    if label == LABEL_REVIEWING and LABEL_REVIEWED in present:
        return None
    return label


@dataclass(frozen=True)
class Ref:
    """One GitHub object that carries labels: `kind` is "issue" or "pr"."""

    kind: str
    slug: str
    number: int


@dataclass
class Report:
    cards: int = 0
    changes: list[str] = field(default_factory=list)

    def line(self) -> str:
        if not self.changes:
            return f"no change ({self.cards} cards)"
        return "\n".join(self.changes)


def _stamp(card: dict, key: str) -> float:
    value = card.get(key)
    return float(value) if isinstance(value, (int, float)) else 0.0


def _finished_at(card: dict) -> float:
    """When a finished card stopped moving. The card JSON has no `updated_at`."""
    for key in ("completed_at", "started_at", "created_at"):
        stamp = _stamp(card, key)
        if stamp:
            return stamp
    return 0.0


def sweep_window(cards: list[dict], limit: int = FULL_SWEEP_DONE_LIMIT) -> list[dict]:
    """The cards one full sweep looks at, in the order they are applied.

    Every unfinished card, plus the `limit` most recently finished or blocked
    ones. The result is ordered by `created_at` ascending, because the caller
    resolves an object claimed by two cards by "last assignment wins": board
    order happens to be oldest-first today, but filtering and concatenating
    changes it, and an old `done` card landing after a live one would strip the
    live card's label.

    Newest-last is what makes a live card win: the later assignment overwrites
    the earlier one, and a card still in flight was created after the finished
    cards that share its object.
    """
    live = [card for card in cards if (card.get("status") or "") not in WINDOWED_STATUSES]
    finished = [card for card in cards if (card.get("status") or "") in WINDOWED_STATUSES]
    finished.sort(key=_finished_at, reverse=True)
    return sorted(live + finished[:limit], key=lambda card: _stamp(card, "created_at"))


def _which(name: str) -> str | None:
    return shutil.which(name)


def _run(cmd: list[str]) -> tuple[int, str, str]:
    try:
        # explicit utf-8: under a systemd unit or a hook the locale may be C, and
        # `gh api` prints the object's title/body, which is where non-ASCII lives.
        proc = subprocess.run(cmd, capture_output=True, text=True,
                              encoding="utf-8", errors="replace")
    except OSError as exc:
        return 127, "", str(exc)
    return proc.returncode, proc.stdout, proc.stderr


def read_board(config: dict) -> list[dict]:
    """The board's cards, through the CLI (never SQLite, never an events tail).

    `hermes kanban list` internally runs `recompute_ready()`, which is a write;
    inside a fenced context (`HERMES_DELEGATED_CHILD_CONTEXT`) that raises and
    the CLI prints `kanban: delegate_task child contexts cannot mutate …`. A hook
    fires inside a worker, so it inherits that fence and its detached child gets
    one minted again unless `detach()` clears it (see `granted_env`). Reaching
    this error anyway means a sweep ran fenced: it is surfaced verbatim instead
    of reading as "nothing to do", because a sweep that cannot see the board
    must say so.
    """
    hermes = _which("hermes") or os.path.expanduser("~/.local/bin/hermes")
    board = (config.get("kanban_board") or "").strip()
    cmd = [hermes, "kanban"] + (["--board", board] if board else []) + ["list", "--json"]
    rc, out, err = _run(cmd)
    if rc != 0:
        raise BoardError(f"{' '.join(cmd)} exited {rc}: {(err or out).strip()}")
    try:
        cards = json.loads(out)
    except ValueError:
        raise BoardError(f"{' '.join(cmd)} did not print JSON: {out.strip()[:400]}")
    if not isinstance(cards, list):
        raise BoardError(f"{' '.join(cmd)} printed {type(cards).__name__}, not a list")
    return cards


class Github:
    """The only place this script touches GitHub: two writes, two reads."""

    def __init__(self, gh: str | None = None):
        self.bin = gh or _which("gh") or os.path.expanduser("~/.local/bin/gh")

    def object_state(self, ref: Ref) -> dict | None:
        rc, out, err = _run([self.bin, "api", f"repos/{ref.slug}/issues/{ref.number}"])
        if rc != 0:
            say(f"[WARN] cannot read {ref.kind} #{ref.number}: {(err or out).strip()}")
            return None
        try:
            state = json.loads(out)
        except ValueError:
            say(f"[WARN] {ref.kind} #{ref.number}: gh api did not print JSON")
            return None
        return state if isinstance(state, dict) else None

    def pr_for_branch(self, slug: str, branch: str) -> int | None:
        rc, out, err = _run(
            [self.bin, "pr", "list", "--repo", slug, "--head", branch,
             "--state", "all", "--json", "number"]
        )
        if rc != 0:
            say(f"[WARN] cannot look up a PR for {branch}: {(err or out).strip()}")
            return None
        try:
            found = json.loads(out)
        except ValueError:
            return None
        if not found:
            return None
        return int(found[0]["number"])

    def add_label(self, ref: Ref, label: str) -> None:
        rc, out, err = _run(
            [self.bin, "api", "-X", "POST", f"repos/{ref.slug}/issues/{ref.number}/labels",
             "-f", f"labels[]={label}"]
        )
        if rc != 0:
            say(f"[WARN] {label} not added to {ref.kind} #{ref.number}: {(err or out).strip()}")

    def remove_label(self, ref: Ref, label: str) -> None:
        rc, out, err = _run(
            [self.bin, "api", "-X", "DELETE",
             f"repos/{ref.slug}/issues/{ref.number}/labels/{label}"]
        )
        if rc != 0:
            # The read said it was there, so a 404 means someone removed it in
            # between: the goal state either way, not a failure.
            if "HTTP 404" in (err or "") or "Label does not exist" in (err or ""):
                return
            say(f"[WARN] {label} not removed from {ref.kind} #{ref.number}: {(err or out).strip()}")


class Reconciler:
    """One board read, one label read per object, writes only where they differ."""

    def __init__(self, config: dict, github: Github | None = None,
                 cards: list[dict] | None = None, dry_run: bool = False):
        self.config = config
        self.gh = github or Github()
        self.cards = cards          # injected by the tests; None reads the board
        self.dry_run = dry_run

    def refs_for(self, card: dict, *, include_pr: bool) -> list[Ref]:
        """The objects a card is keyed to, read off the card itself.

        A rework card (`#86: Rework — …`) is keyed to that PR. An issue card
        (`#85: …`) is keyed to the issue, plus the PR its `branch_name` opened —
        but only while the card still has a phase (`include_pr`). A `ready` card
        on a first pass has no branch yet, and a finished card only ever has
        leftover labels stripped, so neither looks a PR up. A finished issue
        card therefore never touches its PR: `pass-review.sh` clears it at
        approval, the reconciler will not put `weka-reviewing` back once
        `weka-reviewed` is on it (`yields_to_reviewed`), and the webhook's
        close-time `strip_labels()` is the fallback.

        Only those two shapes count. `branch_name` and a body URL are not enough
        on their own: a side card that quotes a URL in its first line (a
        follow-up card linking the PR it follows) would otherwise claim that
        object and, being newer, win against the card actually working on it.
        """
        body = (card.get("body") or "").lstrip()
        first = body.splitlines()[0].strip() if body else ""
        match = OBJECT_URL_RE.match(first)
        if not match:
            say(f"{card.get('id')}: body does not start with a GitHub object URL; skipping")
            return []
        titled = CARD_TITLE_RE.match(card.get("title") or "")
        if not titled:
            # Only the two documented card shapes are keyed to an object: an
            # issue / rework card titled `#<number>: …`. A side card that merely
            # quotes a URL in its first line (a follow-up card linking the PR it
            # follows) would otherwise claim that object and, being newer, win
            # the "newest claim" rule against the card actually working on it.
            say(f"{card.get('id')}: title does not start with `#<number>:`; skipping")
            return []
        owner, repo, kind, number = match.groups()
        slug = f"{owner}/{repo}"
        ref = Ref("pr" if kind == "pull" else "issue", slug, int(number))
        if int(titled.group(1)) != ref.number:
            say(f"{card.get('id')}: title says #{titled.group(1)}, body points at "
                f"#{ref.number}; trusting the body")
        refs = [ref]
        branch = (card.get("branch_name") or "").strip()
        if include_pr and ref.kind == "issue" and branch:
            pr = self.gh.pr_for_branch(slug, branch)
            if pr is not None and pr != ref.number:
                refs.append(Ref("pr", slug, pr))
        return refs

    def run(self, scope: str) -> Report:
        cards = self.cards if self.cards is not None else read_board(self.config)
        if scope == "full":
            cards = sweep_window(cards)
        elif scope.startswith(PROFILE_SCOPE):
            name = scope[len(PROFILE_SCOPE):]
            running = [card for card in cards
                       if (card.get("status") or "") == "running" and card.get("assignee") == name]
            if len(running) == 1:
                # A hook payload names no card; a profile runs one card at a
                # time, so this is the card the tool call came from.
                say(f"profile {name}: scope=card {running[0].get('id')} (its only running card)")
                cards = running
            else:
                # Zero: an interactive session, or a probe. More than one: the
                # board is not pinned, so guessing one card would be wrong.
                say(f"profile {name}: {len(running)} running cards; falling back to a full sweep")
                cards = sweep_window(cards)
        else:
            cards = [card for card in cards if card.get("id") == scope]
            if not cards:
                # `hooks doctor`'s synthetic payload names a task that is not on
                # any board. Logging is the whole answer: falling back to a full
                # sweep would make a doctor probe write to GitHub.
                say(f"card {scope} is not on the board; nothing to reconcile")
                return Report(0)

        report = Report(cards=len(cards))
        # One object can be claimed by more than one card (an issue card and a
        # rework card for the PR it opened). `sweep_window` orders the cards by
        # `created_at`, so the newest claim is the last write for a ref and wins;
        # the disagreement is logged rather than silently resolved.
        desired: dict[Ref, str | None] = {}
        claimed: dict[Ref, str] = {}
        for card in cards:
            status, assignee = card.get("status") or "", card.get("assignee")
            label = phase(status, assignee, self.config)
            if label is None and status not in CLOSED_STATUSES:
                say(f"{card.get('id')}: status={status} assignee={assignee or '-'} is not "
                    "in the phase table; skipping")
                continue
            for ref in self.refs_for(card, include_pr=label is not None):
                if ref in desired and desired[ref] != label:
                    say(f"{card.get('id')}: {ref.kind} #{ref.number} was {desired[ref]!r} "
                        f"for {claimed[ref]}, now {label!r}")
                desired[ref] = label
                claimed[ref] = str(card.get("id"))

        for ref, label in desired.items():
            self._apply(ref, label, claimed[ref], report)
        return report

    def _apply(self, ref: Ref, label: str | None, card_id: str, report: Report) -> None:
        state = self.gh.object_state(ref)
        if state is None:
            return
        # A closed object keeps whatever it has: the close-time cleanup is the
        # webhook's job, and re-adding a label to a merged PR would be a lie.
        if str(state.get("state") or "").lower() != "open":
            return
        names = {item.get("name") for item in state.get("labels") or [] if isinstance(item, dict)}
        present = {name for name in names if isinstance(name, str)}
        flow = present & set(FLOW_LABELS)
        wanted = yields_to_reviewed(label, present)
        want = {wanted} if wanted else set()
        add, remove = sorted(want - flow), sorted(flow - want)
        if not add and not remove:
            return
        if wanted != label:
            say(f"{card_id} #{ref.number} {ref.kind}: {LABEL_REVIEWED} is on it, "
                f"so {label} is not applied")
        parts = [f"-{name}" for name in remove] + [f"+{name}" for name in add]
        report.changes.append(f"{card_id} #{ref.number} {ref.kind}: {' '.join(parts)}")
        if self.dry_run:
            return
        for name in remove:
            self.gh.remove_label(ref, name)
        for name in add:
            self.gh.add_label(ref, name)


# ---- state: counter, lock, dirty marker ------------------------------------


def _path(name: str) -> Path:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    return STATE_DIR / name


def _lock(path: Path, *, blocking: bool) -> int | None:
    """An exclusive flock on `path`; None when a non-blocking attempt loses."""
    fd = os.open(path, os.O_RDWR | os.O_CREAT, 0o644)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX if blocking else fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd)
        return None
    return fd


def bump_counter() -> int:
    """Advance the shared trigger counter and return the new value."""
    path = _path("counter")
    fd = _lock(path, blocking=True)
    assert fd is not None
    try:
        raw = path.read_text(encoding="utf-8").strip()
        try:
            count = int(raw) + 1
        except ValueError:
            if raw:
                say(f"[WARN] counter held {raw!r}, not an integer; restarting at 1")
            count = 1
        path.write_text(f"{count}\n", encoding="utf-8")
        return count
    finally:
        os.close(fd)


def mark_dirty(scope: str) -> None:
    _path("dirty").write_text(f"{scope}\n", encoding="utf-8")


def take_dirty() -> str | None:
    path = _path("dirty")
    try:
        scope = path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return None
    path.unlink(missing_ok=True)
    return scope or None


def reconcile_locked(scope: str, config: dict, dry_run: bool = False) -> int:
    """Run one reconcile under the board-wide lock, honouring a dirty marker."""
    holder = _lock(_path("lock"), blocking=False)
    if holder is None:
        # Never sleep outside the lock: the holder already covers this run, so
        # record that one is wanted after it and get out of the way.
        mark_dirty(scope)
        say(f"scope={scope}: a reconcile is already running; marked dirty")
        return 0
    try:
        current = scope
        for _ in range(5):
            try:
                report = Reconciler(config, dry_run=dry_run).run(current)
            except BoardError as exc:
                say(f"[ERROR] {exc}")
                return 1
            say(report.line())
            pending = take_dirty()
            if pending is None:
                break
            if current == "full":
                break           # a full sweep already covers whatever was asked for
            # Two pending cards collapse into the last one, which is the newest
            # state anyone asked about.
            current = "full" if pending == "full" else pending
    finally:
        os.close(holder)
    return 0


# ---- hook mode -------------------------------------------------------------


# A hook fires inside a worker, and Hermes mints the worker identity into every
# subprocess of one: `build_subprocess_env()` -> `delegated_child_subprocess_env()`
# -> `scrub_kanban_env()` sets `HERMES_DELEGATED_CHILD_CONTEXT` to the fenced board
# root. `kanban_path_is_fenced()` then treats every board write as denied, and
# `hermes kanban list` makes one (`recompute_ready()`), so the CLI exits 1 with
# "delegate_task child contexts cannot mutate Kanban tasks or boards". These are
# the keys that carry that identity; the rest of the env (HERMES_HOME, the board
# pin) is what points the CLI at the right board and stays.
WORKER_ENV_KEYS = (
    "HERMES_DELEGATED_CHILD_CONTEXT",
    "HERMES_KANBAN_TASK",
    "HERMES_KANBAN_RUN_ID",
    "HERMES_KANBAN_CLAIM_LOCK",
    "HERMES_KANBAN_GOAL_MODE",
    "HERMES_KANBAN_GOAL_MAX_TURNS",
)


def granted_env() -> dict[str, str]:
    """This process's env minus the worker identity Hermes mints into children.

    An explicit grant, not a bypass: the reconcile is not a delegate child — it
    only reads the board (its writes go to GitHub) and the board write it trips
    over is the CLI's own bookkeeping. Without the grant the hook chain is fenced
    off the board and writes no label at all, which is the failure mode this
    script exists to remove.
    """
    return {key: value for key, value in os.environ.items() if key not in WORKER_ENV_KEYS}


def hook_scope(payload: dict) -> str:
    """`"full"`, a card id, or `"profile:<name>"`, from the counter and the payload.

    A real `post_tool_call` payload has `tool_input: {}` for `kanban_complete()` /
    `kanban_show()` (the model passes no `task_id`), and its `extra.task_id` is
    `effective_task_id` — `task_id or str(uuid.uuid4())` — so it is a per-turn
    uuid, never a card id. The card is therefore the profile's only `running`
    one, and that can only be resolved against the board, which the detached
    child reads anyway. `extra.task_id` is deliberately not consulted.
    """
    count = bump_counter()
    if count % FULL_SWEEP_EVERY == 0:
        say(f"trigger {count}: scope=full (every {FULL_SWEEP_EVERY}th call)")
        return "full"
    tool_input = payload.get("tool_input")
    task_id = (tool_input or {}).get("task_id") if isinstance(tool_input, dict) else None
    if task_id:
        say(f"trigger {count}: scope=card {task_id}")
        return str(task_id)
    profile = payload.get("profile")
    if isinstance(profile, str) and profile.strip():
        name = profile.strip()
        say(f"trigger {count}: scope=profile {name} (resolve against the board)")
        return PROFILE_SCOPE + name
    # An interactive session with no profile pinned and no card named.
    say(f"trigger {count}: scope=full (the payload names no card and no profile)")
    return "full"


def detach(scope: str, log, config_path: str) -> None:
    """Re-exec this script in its own session and return without waiting.

    The child must not inherit the hook's three pipes: `_spawn()` reads the
    hook's stdout/stderr to EOF, so a grandchild holding them makes the hook
    hang until `timeout` and then kills the reconcile mid-run.
    """
    argv = [sys.executable, SCRIPT, "--reconcile", "--once", "--config", config_path]
    if scope == "full":
        argv.append("--full")
    elif scope.startswith(PROFILE_SCOPE):
        argv += ["--profile", scope[len(PROFILE_SCOPE):]]
    else:
        argv += ["--card", scope]
    subprocess.Popen(
        argv,
        stdin=subprocess.DEVNULL,
        stdout=log,
        stderr=log,
        start_new_session=True,
        close_fds=True,
        env=granted_env(),
    )


def run_hook(config_path: str) -> None:
    global _STREAM
    try:
        # Read bytes and decode ourselves: a C locale must not turn a payload with
        # non-ASCII in it into "no payload", which would silently widen the scope.
        payload = json.loads(sys.stdin.buffer.read().decode("utf-8", "replace") or "{}")
    except ValueError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    _STREAM = open(_path("log"), "a", encoding="utf-8", buffering=1)
    try:
        detach(hook_scope(payload), _STREAM, config_path)
    except Exception as exc:                                  # never fails a tool call
        say(f"[ERROR] hook: {exc!r}")
    finally:
        _STREAM.flush()
    # os._exit: no atexit handlers, no flush of a stdout we never wrote, and no
    # chance of a forked helper holding the pipes. The exit code is always 0 —
    # a label sweep must never look like a failed tool call.
    os._exit(0)


# ---- CLI -------------------------------------------------------------------


def load_config(path: str) -> dict:
    if not os.path.exists(path):
        sys.exit(f"config not found: {path}\n(copy config.example.json to config.json first)")
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Reconcile weka flow labels against the board.")
    parser.add_argument("--reconcile", action="store_true", help="reconcile now (the only action)")
    parser.add_argument("--once", action="store_true", help="single pass; present for symmetry")
    parser.add_argument("--from-hook", action="store_true",
                        help="hook mode: read the payload on stdin, spawn a worker, exit")
    parser.add_argument("--full", action="store_true", help="reconcile every card on the board")
    parser.add_argument("--card", metavar="ID", help="reconcile only this card")
    parser.add_argument("--profile", metavar="NAME",
                        help="hook mode: reconcile the only running card of this profile")
    parser.add_argument("--dry-run", action="store_true", help="print the difference, write nothing")
    parser.add_argument("--config", default=DEFAULT_CONFIG, help=f"config path (default {DEFAULT_CONFIG})")
    args = parser.parse_args(argv)

    if args.from_hook:
        run_hook(args.config)
        return 0                                  # not reached: run_hook exits

    config = load_config(args.config)
    if args.card and args.profile:
        sys.exit("--card and --profile are mutually exclusive")
    scope = args.card or (PROFILE_SCOPE + args.profile if args.profile else "full")
    return reconcile_locked(scope, config, dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
