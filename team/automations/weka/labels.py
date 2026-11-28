#!/usr/bin/env python3
"""Reconcile the weka flow labels on GitHub against the Kanban board.

The board says which phase a card is in; this script says which flow label its
object should carry, reads what is there, and writes only the difference. It
owns exactly four labels — `weka-queue` / `weka-working` / `weka-reviewing` /
`weka-blocked` — and never adds or removes `weka` (a participation marker).
There is no fifth label: a finished review is a card state, not a label.

Why a script and not a step in the SOULs: a model that is told to label its
object does it late, or not at all, and a label that is wrong on GitHub is
indistinguishable from a card that crashed. The phase is a pure function of
`(status, assignee)`, so it does not need a model in the loop.

One event source feeds one reconcile function, and there is no timer: the board's
own `task_events` table. Every real status transition appends a row there,
whoever wrote it (`kanban_*` tools, the dispatcher, the webhook's `hermes kanban
create`), so the table is the fact this sweep reads instead of guessing a card
from a profile:

- a batch of events since a per-board cursor (`--events`, the detached child of
  the hook), plus the card the firing payload names directly (`extra.task_id` on
  the three lifecycle events, `tool_input.task_id` when the model passed one);
- one card (`--card <id>`, spawned detached by `github-webhook.py`): `kanban
  create` is a CLI call, so no tool hook sees it, and the new card waits in
  `ready` without a session — that window is exactly what `weka-queue` is for;
- the whole board (`--full`), a manual read-only check.

Every tenth wake additionally runs a fallback sweep — all non-running live cards
plus the ten cards with the most recent status events — which is what repairs a
batch whose labels were never written. Running cards are deliberately left out:
their labels were written when `claimed` fired, and re-reading a running card is
how a review that has already passed gets `weka-reviewing` written back onto it.

A hook that is slow is a hook that gets killed: `agent/shell_hooks.py` drains
stdout/stderr to EOF for up to the hook's own `timeout` (`hooks.<event>[].timeout`,
default 60s, cap 300 — `agent/shell_hooks.py:37-38`), then kills the hook's whole
process group. So hook mode decides the scope, re-executes itself *detached* (own
session, no inherited pipes, output to the log) and exits immediately. Its
stdout stays empty, which is also what `hermes hooks doctor` requires.

The board is read, never written: SQLite in `mode=ro` with a busy timeout. That
is also why no worker-identity env has to be stripped any more — the old path
shelled out to `hermes kanban list`, which runs a board write internally and is
fenced inside a worker.

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
import sqlite3
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CONFIG = os.path.join(HERE, "config.json")
SCRIPT = os.path.abspath(__file__)

# Shared by all three profiles on purpose: each profile has its own HERMES_HOME,
# so a state dir under `profiles/<p>/` would be three independent cursors.
STATE_DIR = Path(os.path.expanduser("~/.hermes/state/weka-labels"))

LABEL_QUEUE = "weka-queue"
LABEL_WORKING = "weka-working"
LABEL_REVIEWING = "weka-reviewing"
LABEL_BLOCKED = "weka-blocked"
FLOW_LABELS = (LABEL_QUEUE, LABEL_WORKING, LABEL_REVIEWING, LABEL_BLOCKED)

# A module constant, not a config field: a sweep frequency is fixed behaviour,
# not something an operator tunes (see `operating-notes.md`, semantic fields only).
FULL_SWEEP_EVERY = 10

# A full sweep takes every unfinished card plus this many of the most recently
# finished ones, not all ~100 `done` cards the board keeps. Each card costs an
# object read (and an issue card a `gh pr list`), so sweeping the lot made one
# pass ~100 requests.
FULL_SWEEP_DONE_LIMIT = 10

# The fallback sweep's second half: the cards with the most recent status events.
# It is a repair window for "the event was consumed but the label write failed",
# not a history replay.
FALLBACK_EVENT_WINDOW = 10

# One batch is bounded so a cold cursor cannot turn into an unbounded run; the
# next wake continues from where this one stopped.
EVENT_BATCH_LIMIT = 200

# The event kinds that never move a card's phase, so the batch query skips them
# before they reach Python (`heartbeat` alone is more than half the table).
#
# A denylist, not an allowlist. An unknown kind costs one card read and one
# idempotent compare; a *missing* kind costs a card that keeps another card's
# label until something else happens. The retry paths are why: a circuit-break
# sets `blocked` and appends only `gave_up` (behind `timed_out` / `crashed` /
# `rate_limited`), never firing `kanban_task_blocked`, and a blocked card makes
# no tool calls — so no hook and no fallback wake ever arrives to correct
# `weka-working`. Same shape for `stale` / `reconciled` / `reclaimed`
# (requeued by the dispatcher), `dependency_wait` (parked in `todo`),
# `promoted_manual` and `assigned` (which changes the assignee `phase()` reads).
# Enumerating the state-changing kinds means re-auditing Hermes on every
# upgrade; enumerating the chatter means an upgrade can only add reads.
NON_STATE_EVENT_KINDS = (
    "heartbeat",             # phase stays put
    "commented",             # card text, not status
    "attached",
    "attachment_removed",
    "edited",
    "reprioritized",
    "linked",
    "unlinked",
    "pr_acceptance",
    "spawned",               # run bookkeeping; the status event came earlier
    "worker_registered",
    "worker_bound",
    "worker_result",
    "owner_admitted",
    "terminal_worker_reaped",
    "claim_rejected",
    "reclaim_deferred",
    "respawn_guarded",
    "skipped_nonspawnable",
    "archive_worker_termination",
    "tip_scratch_workspace",
)

# `review` is a queue, not a review in progress: the card waits there until reed
# claims it, so at that instant nobody is touching the PR.
QUEUED_STATUSES = ("ready", "todo", "scheduled", "triage", "review")
CLOSED_STATUSES = ("done", "archived")

# `blocked` keeps its own phase but shares the finished-card window: the moment
# a card blocks its event is reconciled, so an old blocked card outside the
# window has already been labelled for its last transition.
WINDOWED_STATUSES = CLOSED_STATUSES + ("blocked",)

# The columns `refs_for` and the window need; the board's `tasks` table has many
# more and none of them matter here.
CARD_COLUMNS = "id, title, body, status, assignee, branch_name, created_at, started_at, completed_at"

CARD_TITLE_RE = re.compile(r"^#(\d+):")
OBJECT_URL_RE = re.compile(r"^https://github\.com/([\w.-]+)/([\w.-]+)/(issues|pull)/(\d+)")

_STREAM = sys.stdout


def say(message: str) -> None:
    """Progress line. In hook mode `_STREAM` is the log file, never stdout."""
    print(message, file=_STREAM, flush=True)


class BoardError(RuntimeError):
    """The board could not be read; the message carries the reason."""


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
    """When a finished card stopped moving. `tasks` keeps `completed_at`."""
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


def fallback_cards(cards: list[dict], recent_ids: list[str],
                   limit: int = FALLBACK_EVENT_WINDOW) -> list[dict]:
    """The cards the every-tenth-wake repair pass reconciles.

    Two halves, both excluding `running`: every live (not done/archived) card
    that is not running, plus the `limit` cards whose status events are newest.

    A running card is skipped on purpose. Its label was written when `claimed`
    fired, so re-reading it buys nothing — and it costs something: a reviewer's
    card is still `running` after `pass-review.sh` has flipped the PR, and any
    pass that reads it there writes `weka-reviewing` back onto an approved PR.
    """
    by_id = {card.get("id"): card for card in cards}
    picked: dict[str, dict] = {}
    for card in cards:
        status = card.get("status") or ""
        if status == "running" or status in CLOSED_STATUSES:
            continue
        picked[card.get("id") or ""] = card
    for task_id in recent_ids[:limit]:
        card = by_id.get(task_id)
        if card is None or (card.get("status") or "") == "running":
            continue
        picked[task_id] = card
    return sorted(picked.values(), key=lambda card: _stamp(card, "created_at"))


# ---- board: read-only SQLite -----------------------------------------------


def board_db_path(config: dict) -> str:
    """`~/.hermes/kanban/boards/<slug>/kanban.db`, or the default-board file."""
    board = (config.get("kanban_board") or "").strip()
    root = os.path.expanduser("~/.hermes/kanban")
    if not board:
        return os.path.join(root, "kanban.db")
    return os.path.join(root, "boards", board, "kanban.db")


class Board:
    """Read-only view of one board: its cards and its event log.

    Direct SQLite rather than `hermes kanban list` because the event cursor has
    no CLI equivalent, and because `list` internally runs `recompute_ready()` —
    a write — which a hook firing inside a worker is fenced off. This connection
    only reads, so no fence applies.
    """

    def __init__(self, config: dict, path: str | None = None):
        self.path = path or board_db_path(config)

    def _connect(self) -> sqlite3.Connection:
        if not os.path.exists(self.path):
            raise BoardError(f"board database not found: {self.path}")
        try:
            db = sqlite3.connect(f"file:{self.path}?mode=ro", uri=True, timeout=10)
            # Both boards are WAL: a reader can land while a writer holds the
            # write lock, so wait rather than fail the sweep.
            db.execute("PRAGMA busy_timeout = 10000")
        except sqlite3.Error as exc:
            raise BoardError(f"cannot open {self.path}: {exc}")
        db.row_factory = sqlite3.Row
        return db

    def _fetch(self, sql: str, params: tuple) -> list[sqlite3.Row]:
        db = self._connect()
        try:
            return db.execute(sql, params).fetchall()
        except sqlite3.Error as exc:
            raise BoardError(f"cannot read {self.path}: {exc}")
        finally:
            db.close()

    def cards(self) -> list[dict]:
        rows = self._fetch(f"SELECT {CARD_COLUMNS} FROM tasks ORDER BY created_at", ())
        return [dict(row) for row in rows]

    def max_event_id(self) -> int:
        rows = self._fetch("SELECT COALESCE(MAX(id), 0) FROM task_events", ())
        return int(rows[0][0])

    def events_since(self, cursor: int, limit: int = EVENT_BATCH_LIMIT) -> list[dict]:
        marks = ", ".join("?" for _ in NON_STATE_EVENT_KINDS)
        rows = self._fetch(
            f"SELECT id, task_id, kind FROM task_events "
            f"WHERE id > ? AND kind NOT IN ({marks}) ORDER BY id LIMIT ?",
            (cursor, *NON_STATE_EVENT_KINDS, limit),
        )
        return [dict(row) for row in rows]

    def recent_event_task_ids(self, limit: int = FALLBACK_EVENT_WINDOW) -> list[str]:
        marks = ", ".join("?" for _ in NON_STATE_EVENT_KINDS)
        rows = self._fetch(
            f"SELECT task_id, MAX(id) AS last FROM task_events "
            f"WHERE kind NOT IN ({marks}) GROUP BY task_id ORDER BY last DESC LIMIT ?",
            (*NON_STATE_EVENT_KINDS, limit),
        )
        return [str(row["task_id"]) for row in rows]


def read_board(config: dict) -> list[dict]:
    """The board's cards. Kept as a function so the tests can stub one lookup."""
    return Board(config).cards()


# ---- state: cursor, counter, lock, dirty marker -----------------------------


def _path(name: str) -> Path:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    return STATE_DIR / name


def _board_key(config: dict) -> str:
    """A filename-safe board name: the cursor is per board, never per board id.

    The groom board is a second database with its own id space, so one shared
    cursor would strand whichever board moved last.
    """
    name = (config.get("kanban_board") or "").strip() or "default"
    return re.sub(r"[^A-Za-z0-9_.-]", "_", name)


def cursor_path(config: dict) -> Path:
    return _path(f"events-{_board_key(config)}")


def read_cursor(config: dict) -> int | None:
    path = cursor_path(config)
    try:
        raw = path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return None
    try:
        return int(raw)
    except ValueError:
        say(f"[WARN] cursor held {raw!r}, not an integer; re-initialising")
        return None


def write_cursor(config: dict, value: int) -> None:
    path = cursor_path(config)
    tmp = path.parent / f"{path.name}.tmp"
    tmp.write_text(f"{value}\n", encoding="utf-8")
    os.replace(tmp, path)


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


# ---- GitHub ----------------------------------------------------------------


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

    def add_label(self, ref: Ref, label: str) -> bool:
        rc, out, err = _run(
            [self.bin, "api", "-X", "POST", f"repos/{ref.slug}/issues/{ref.number}/labels",
             "-f", f"labels[]={label}"]
        )
        if rc != 0:
            say(f"[WARN] {label} not added to {ref.kind} #{ref.number}: {(err or out).strip()}")
            return False
        return True

    def remove_label(self, ref: Ref, label: str) -> bool:
        rc, out, err = _run(
            [self.bin, "api", "-X", "DELETE",
             f"repos/{ref.slug}/issues/{ref.number}/labels/{label}"]
        )
        if rc != 0:
            # The read said it was there, so a 404 means someone removed it in
            # between: the goal state either way, not a failure.
            if "HTTP 404" in (err or "") or "Label does not exist" in (err or ""):
                return True
            say(f"[WARN] {label} not removed from {ref.kind} #{ref.number}: {(err or out).strip()}")
            return False
        return True


# ---- reconcile -------------------------------------------------------------


class Reconciler:
    """One board read, one label read per object, writes only where they differ."""

    def __init__(self, config: dict, github: Github | None = None,
                 cards: list[dict] | None = None, board: Board | None = None,
                 dry_run: bool = False):
        self.config = config
        self.gh = github or Github()
        self.cards = cards          # injected by the tests; None reads the board
        self.board = board or Board(config)
        self.dry_run = dry_run

    def refs_for(self, card: dict) -> list[Ref]:
        """The objects a card is keyed to, read off the card itself.

        A rework card (`#86: Rework — …`) is keyed to that PR. An issue card
        (`#85: …`) is keyed to the issue, plus the PR its `branch_name` opened.

        There is no "phase" gate any more. A finished card's PR used to be left
        alone on the theory that `pass-review.sh` had already cleared it; when a
        sweep wrote `weka-reviewing` back onto a just-approved PR (#297), the
        card went `done` right afterwards and nothing ever looked at the PR
        again. Only open objects are written to (`_apply`), so resolving a
        merged PR's number costs one lookup and changes nothing.

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
        if ref.kind == "issue" and branch:
            pr = self.gh.pr_for_branch(slug, branch)
            if pr is not None and pr != ref.number:
                refs.append(Ref("pr", slug, pr))
        return refs

    def run(self, scope: str) -> Report:
        """Reconcile one scope: `"full"` or a card id."""
        cards = self.cards if self.cards is not None else self.board.cards()
        if scope == "full":
            return self.reconcile(sweep_window(cards))
        selected = [card for card in cards if card.get("id") == scope]
        if not selected:
            # `hooks doctor`'s synthetic payload names a task that is not on
            # any board. Logging is the whole answer: falling back to a sweep
            # would make a doctor probe write to GitHub.
            say(f"card {scope} is not on the board; nothing to reconcile")
            return Report(0)
        return self.reconcile(selected)

    def reconcile(self, cards: list[dict]) -> Report:
        """Write the labels for a set of cards, newest card last.

        One object can be claimed by more than one card (an issue card and a
        rework card for the PR it opened). Ordering by `created_at` makes the
        newest claim the last write for a ref, so it wins; the disagreement is
        logged rather than silently resolved.
        """
        cards = sorted(cards, key=lambda card: _stamp(card, "created_at"))
        report = Report(cards=len(cards))
        desired: dict[Ref, str | None] = {}
        claimed: dict[Ref, str] = {}
        for card in cards:
            status, assignee = card.get("status") or "", card.get("assignee")
            label = phase(status, assignee, self.config)
            if label is None and status not in CLOSED_STATUSES:
                say(f"{card.get('id')}: status={status} assignee={assignee or '-'} is not "
                    "in the phase table; skipping")
                continue
            for ref in self.refs_for(card):
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
        want = {label} if label else set()
        add, remove = sorted(want - flow), sorted(flow - want)
        if not add and not remove:
            return
        parts = [f"-{name}" for name in remove] + [f"+{name}" for name in add]
        report.changes.append(f"{card_id} #{ref.number} {ref.kind}: {' '.join(parts)}")
        if self.dry_run:
            return
        for name in remove:
            self.gh.remove_label(ref, name)
        for name in add:
            self.gh.add_label(ref, name)


# ---- event cursor ----------------------------------------------------------


def payload_card(payload: dict) -> str | None:
    """The card id the firing event names directly, if it names one at all.

    The three lifecycle events carry the real card id in `extra.task_id`.
    `post_tool_call` carries the model's own argument there — usually absent,
    and `extra.task_id` is `effective_task_id` (`task_id or str(uuid4())`), a
    per-turn uuid. A uuid simply matches no card and costs one dict lookup;
    the rest of the work comes from the cursor, which is the point.
    """
    for container in (payload.get("tool_input"), payload.get("extra")):
        if not isinstance(container, dict):
            continue
        task_id = container.get("task_id")
        if isinstance(task_id, str) and task_id.strip():
            return task_id.strip()
    return None


def _events_once(config: dict, named: str | None, fallback: bool, dry_run: bool) -> int:
    board = Board(config)
    cards = board.cards()
    by_id = {card.get("id"): card for card in cards}

    cursor = read_cursor(config)
    batch: list[dict] = []
    if cursor is None:
        # Never start at 0: this board has thousands of historical events, and
        # replaying them is a `gh` rate-limit incident, not a repair.
        cursor = board.max_event_id()
        say(f"event cursor: none; initialised at {cursor} (history is not replayed)")
        if not dry_run:
            write_cursor(config, cursor)
    else:
        batch = board.events_since(cursor)

    wanted = list(dict.fromkeys([str(event["task_id"]) for event in batch]
                                + ([named] if named else [])))
    known = [by_id[task_id] for task_id in wanted if task_id in by_id]
    unknown = [task_id for task_id in wanted if task_id not in by_id]
    if unknown:
        shown = ", ".join(unknown[:3]) + (", …" if len(unknown) > 3 else "")
        say(f"{len(unknown)} trigger id(s) name no card on this board ({shown}); cursor only")
    if batch:
        say(f"events: {len(batch)} status event(s) since {cursor}, {len(known)} card(s) to read")

    reconciler = Reconciler(config, cards=cards, board=board, dry_run=dry_run)
    report = reconciler.reconcile(known)
    say(report.line())

    # Labels first, cursor second: a crash in between replays this batch, and
    # the reconcile is idempotent.
    if batch and not dry_run:
        write_cursor(config, int(batch[-1]["id"]))

    if fallback:
        extra = fallback_cards(cards, board.recent_event_task_ids())
        say(f"fallback sweep: {len(extra)} card(s) (running cards are never re-read)")
        say(reconciler.reconcile(extra).line())
    return 0


def events_pass(config: dict, named: str | None = None, fallback: bool = False,
                dry_run: bool = False) -> int:
    """Read new events, reconcile their cards, advance the cursor.

    Under the same board-wide lock as every other pass: two hook children that
    read the same cursor would both do the work. A lost race marks the dirties
    and retries after the holder finishes — the cursor alone would eventually
    catch up on the next wake, but the wake that lost the race may be the last
    one (a completion, for instance).
    """
    holder = _lock(_path("lock"), blocking=False)
    if holder is None:
        mark_dirty(named or "events")
        where = f"events card {named}" if named else "events"
        say(f"{where}: a reconcile is already running; marked dirty")
        return 0
    try:
        for _ in range(5):
            try:
                status = _events_once(config, named, fallback, dry_run)
            except BoardError as exc:
                say(f"[ERROR] {exc}")
                return 1
            if status != 0:
                return status
            if take_dirty() is None:
                break
    finally:
        os.close(holder)
    return 0


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


def detach(named: str | None, fallback: bool, log, config_path: str) -> None:
    """Re-exec this script in its own session and return without waiting.

    The child must not inherit the hook's three pipes: `_spawn()` reads the
    hook's stdout/stderr to EOF, so a grandchild holding them makes the hook
    hang until `timeout` and then kills the reconcile mid-run.
    """
    argv = [sys.executable, SCRIPT, "--reconcile", "--once", "--config", config_path, "--events"]
    if named:
        argv += ["--card", named]
    if fallback:
        argv.append("--fallback")
    subprocess.Popen(
        argv,
        stdin=subprocess.DEVNULL,
        stdout=log,
        stderr=log,
        start_new_session=True,
        close_fds=True,
    )


def run_hook(config_path: str) -> None:
    global _STREAM
    try:
        # Read bytes and decode ourselves: a C locale must not turn a payload with
        # non-ASCII in it into "no payload".
        payload = json.loads(sys.stdin.buffer.read().decode("utf-8", "replace") or "{}")
    except ValueError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    _STREAM = open(_path("log"), "a", encoding="utf-8", buffering=1)
    try:
        count = bump_counter()
        named = payload_card(payload)
        fallback = count % FULL_SWEEP_EVERY == 0
        say(f"trigger {count}: " + (f"card {named}" if named else "cursor only")
            + (f" + fallback (every {FULL_SWEEP_EVERY}th wake)" if fallback else ""))
        detach(named, fallback, _STREAM, config_path)
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
    parser.add_argument("--events", action="store_true",
                        help="reconcile the cards named by new board events (the hook's child)")
    parser.add_argument("--fallback", action="store_true",
                        help="with --events: also run the every-tenth-wake repair sweep")
    parser.add_argument("--full", action="store_true", help="reconcile every card on the board")
    parser.add_argument("--card", metavar="ID", help="reconcile only this card")
    parser.add_argument("--dry-run", action="store_true", help="print the difference, write nothing")
    parser.add_argument("--config", default=DEFAULT_CONFIG, help=f"config path (default {DEFAULT_CONFIG})")
    args = parser.parse_args(argv)

    if args.from_hook:
        run_hook(args.config)
        return 0                                  # not reached: run_hook exits

    config = load_config(args.config)
    if args.events:
        return events_pass(config, named=args.card, fallback=args.fallback,
                           dry_run=args.dry_run)
    return reconcile_locked("full" if args.full or not args.card else args.card,
                            config, dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
