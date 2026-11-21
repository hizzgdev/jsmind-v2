#!/usr/bin/env python3
"""Weka webhook bridge: GitHub events -> Kanban cards.

Listens on a configurable port and translates a small set of GitHub events into
`hermes kanban` calls, so a GitHub Issue opened with the team label starts a
Kanban task without any LLM round-trip in between.

Events handled:

- issues (opened / labeled / assigned)                    -> create an issue card
- pull_request_review (submitted by the human, not an
  approval, on a PR already marked weka-reviewed)         -> create a rework card
- issue_comment (created by the human on such a PR)       -> create a rework card
- pull_request_review_comment (created by the human, same
  gate as a review)                                        -> create rework card
- pull_request (closed)                                   -> clean up worktree, strip labels
- issues (closed)                                         -> strip leftover labels

Closing is the fallback that ends a label's life on the object. Both close
payloads carry the object's current `labels`, so the cleanup reads that list and
deletes only what is still there — no extra requests, and none of the 404s a
blind DELETE would produce for the labels that are normally absent.

Design contract (see README.md for the full version):

- GitHub is the source of truth. A card is only a trigger: it carries the object
  URL plus a snapshot of the event that created it, and nothing else is
  authoritative.
- The card key is the number of the object that created it, in the title:
  `#85: <title>` for issue cards, `#86: Rework — <title>` for PR cards.
- `weka-reviewed` is the only label with flow-control meaning: a human event on
  a PR creates a card only while that label is present, and only when no card is
  already open for the same number.
- A human event is never refused silently. Every path out of
  `_create_rework_card()` leaves something visible on GitHub: a card, a comment
  on the PR's open card, or a comment on the PR saying why neither happened.
- Capacity is the dispatcher's call (`max_in_progress`,
  `max_in_progress_per_profile`): a card waits in `ready` until a slot frees up.
  The webhook does not refuse work because another card happens to be running.
- There is no "waiting for a human" card state. The human gate lives on GitHub
  (review request + weka-reviewed), which is why a finished card simply ends.

Configuration is read from `config.json` next to this script. A committed
`config.example.json` documents every field; keep `config.json` out of git (it
holds the webhook secret and machine-specific paths). Pass a path as argv[1] to
override the default location.

Requires Python 3.10+ and the standard library only (plus `git`, and `gh` for
label cleanup and for the comments that make a refusal visible on the PR). Run
it from a pinned virtualenv — see README.md for the version policy and setup
command.
"""
import hashlib
import hmac
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CONFIG = os.path.join(HERE, "config.json")
# The script lives in <repo>/team/automations/weka/, so the repo is three up.
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))

# Flow-fixed label names. `weka-reviewed` gates card creation; the other two are
# for humans reading the PR/issue, never for branching logic.
LABEL_WORKING = "weka-working"
LABEL_REVIEWING = "weka-reviewing"
LABEL_REVIEWED = "weka-reviewed"

# Card statuses that mean "an agent is (or should be) working on it now".
OPEN_STATUSES = ("todo", "ready", "running", "review", "blocked", "scheduled", "triage")
BUSY_STATUSES = ("running", "review")

# First line of every comment this script posts on GitHub. It is invisible in
# the rendered page and, more importantly, the comment handlers skip it: `gh`
# authenticates as the repository owner here, so without the marker weka would
# read its own explanation back as a human request and trigger itself.
TRACE_MARKER = "<!-- weka-webhook -->"

# Names that are build output or a dependency install, never someone's work. A
# worker symlinks the main checkout's dependencies into its worktree instead of
# installing a second copy, and `.gitignore` says `node_modules/` — with the
# trailing slash, which matches a directory but not a symlink of that name. So
# `git status --porcelain` reports it as an untracked path, and anything that
# treats a non-empty status as "real work in there" refuses to remove a worktree
# that holds nothing but that link. Every merged PR used to leave one behind.
WORKTREE_ARTIFACTS = frozenset({"node_modules", "dist", "_site", ".vite", ".cache", "coverage"})


def blocking_paths(status_output: str) -> list[str]:
    """Paths from `git status --porcelain` that are not disposable artifacts.

    An empty result means the worktree holds nothing worth keeping. Matched on
    the first path component, because the artifacts are top-level directories.
    """
    blocking: list[str] = []
    for line in status_output.splitlines():
        if len(line) < 4:
            continue
        path = line[3:].strip().strip('"')
        if " -> " in path:  # porcelain rename/rewrite: "old -> new"
            path = path.split(" -> ", 1)[1]
        top = path.rstrip("/").split("/", 1)[0]
        if top in WORKTREE_ARTIFACTS:
            continue
        blocking.append(path)
    return blocking


def parse_worktrees(listing: str) -> list[tuple[str, str | None]]:
    """`(path, branch)` for each block of `git worktree list --porcelain`."""
    worktrees: list[tuple[str, str | None]] = []
    for block in listing.split("\n\n"):
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if not lines or not lines[0].startswith("worktree "):
            continue
        path = lines[0][len("worktree "):]
        branch = None
        for line in lines[1:]:
            if line.startswith("branch refs/heads/"):
                branch = line[len("branch refs/heads/"):]
                break
        worktrees.append((path, branch))
    return worktrees


def load_config(path: str) -> dict:
    if not os.path.exists(path):
        sys.exit(
            f"config not found: {path}\n"
            "(copy config.example.json to config.json and fill in real values)"
        )
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")


class Weka:
    def __init__(self, config: dict):
        self.secret = (config.get("secret") or "").encode("utf-8")
        # systemd's PATH lacks ~/.local/bin; fall back to the standard install shim.
        self.hermes_bin = shutil.which("hermes") or os.path.expanduser("~/.local/bin/hermes")
        self.label = config["target_label"]
        self.assignee = config.get("assignee", "cody")
        self.human = config.get("human_login", "hizzgdev")
        # Assignee gate: an issue triggers the flow only when assigned to this
        # bot account, so strangers on the public repo cannot burn LLM budget.
        self.gate_login = config.get("bot_login", "zzgbot")
        self.board = config.get("kanban_board")
        # A board's DB sits at ~/.hermes/kanban/boards/<slug>/kanban.db — derive
        # it instead of asking users to hand-fill a path that follows naturally.
        if self.board:
            self.kanban_db = os.path.expanduser(f"~/.hermes/kanban/boards/{self.board}/kanban.db")
        else:
            self.kanban_db = os.path.expanduser("~/.hermes/kanban.db")
        # weka is scoped to jsMind-V2: always work in a worktree of the project.
        self.create_args = ["--workspace", "worktree", "--project", "jsmind-v2"]
        # `owner/repo` for the gh API calls, looked up at most once per process.
        self._slug: str | None = None
        self._slug_known = False
        # systemd's PATH lacks ~/.local/bin: fall back to the install shim, same
        # story as hermes_bin. gh is flow-critical now — it carries the visible
        # traces — so it is resolved once and reused.
        local_gh = os.path.expanduser("~/.local/bin/gh")
        self.gh = shutil.which("gh") or (local_gh if os.path.exists(local_gh) else "")

    # ---- hermes CLI helpers -------------------------------------------------

    def kanban(self, *args) -> bool:
        cmd = [self.hermes_bin, "kanban"]
        if self.board:
            cmd += ["--board", self.board]
        cmd += list(args)
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"[ERROR] {' '.join(cmd)}: {result.stderr.strip()}", file=sys.stderr)
            return False
        print(f"[OK] {' '.join(cmd)}")
        return True

    # ---- board lookups ------------------------------------------------------

    def _query(self, sql: str, params: tuple) -> list[tuple]:
        db = sqlite3.connect(f"file:{self.kanban_db}?mode=ro", uri=True)
        try:
            return db.execute(sql, params).fetchall()
        finally:
            db.close()

    def open_card_for(self, number: int | None) -> tuple[str, str] | None:
        """`(task_id, status)` of the open card keyed on this number, else None.

        The key is the title prefix `#<number>:` — prefix-anchored so that a card
        mentioning `#86:` mid-title never shadows the card that owns the number.
        """
        if number is None:
            return None
        try:
            rows = self._query(
                "SELECT id, status FROM tasks WHERE title LIKE ? "
                "AND status NOT IN ('done', 'archived') "
                "ORDER BY created_at DESC LIMIT 1",
                (f"#{number}:%",),
            )
        except Exception as exc:
            print(f"[WARN] card lookup failed for #{number}: {exc}", file=sys.stderr)
            return None
        return (rows[0][0], rows[0][1]) if rows else None

    def busy_cards(self) -> list[tuple[str, str, str]]:
        """Cards with an agent working them right now: `(id, status, title)`.

        Informational only, for the journal line: capacity belongs to the
        dispatcher (`max_in_progress*`), which holds a new card in `ready` until
        a slot frees up. Nothing here may decide that a human request is dropped.
        """
        try:
            return self._query(
                "SELECT id, status, title FROM tasks WHERE status IN ('running', 'review') "
                "ORDER BY created_at DESC LIMIT 5",
                (),
            )
        except Exception as exc:
            print(f"[WARN] busy-card lookup failed: {exc}", file=sys.stderr)
            return []

    # ---- git / gh helpers ---------------------------------------------------

    def _run(self, cmd: list[str]) -> tuple[int, str]:
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO_ROOT)
        return result.returncode, (result.stderr or result.stdout or "").strip()

    def repo_slug(self) -> str | None:
        """`owner/repo` for the gh API, resolved once. None when gh cannot say.

        Run from REPO_ROOT so gh picks the repository up from the working tree
        instead of needing the slug in config.json, which follows the checkout.
        """
        if self._slug_known:
            return self._slug
        self._slug_known = True
        if not self.gh:
            print("[WARN] gh not found: cannot reach GitHub", file=sys.stderr)
            return None
        rc, out = self._run([self.gh, "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"])
        if rc != 0:
            print(f"[WARN] repo lookup failed: {out}", file=sys.stderr)
            return None
        slug = (out.splitlines() or [""])[-1].strip()
        if slug.count("/") != 1:
            print(f"[WARN] repo lookup returned {slug!r}: not owner/repo", file=sys.stderr)
            return None
        self._slug = slug
        return slug

    def comment_on_pr(self, number: int | None, body: str) -> bool:
        """Post `body` under the PR so a refusal or a failure is visible there.

        The journal answers "why did nothing happen" for the operator, not for
        the human who left the comment on GitHub. So a gate that keeps refusing,
        and a card whose creation failed, say why on the object itself.

        The body starts with TRACE_MARKER, which the comment handlers skip: the
        token here belongs to the repository owner, so without the marker weka
        would treat its own explanation as a fresh human request.
        """
        if number is None:
            print("[WARN] no PR number in payload: cannot leave a visible trace", file=sys.stderr)
            return False
        slug = self.repo_slug()
        if slug is None:
            return False
        rc, out = self._run([
            self.gh, "api", "-X", "POST", f"repos/{slug}/issues/{number}/comments",
            "-f", f"body={TRACE_MARKER}\n{body.strip()}",
        ])
        if rc != 0:
            # Nothing else can be done from here: this run's only record is the
            # journal line, which is why the attempt is logged rather than raised.
            print(f"[WARN] comment on #{number} failed: {out}", file=sys.stderr)
            return False
        print(f"[OK] commented on #{number}")
        return True

    def cleanup_branch(self, branch: str, merged: bool) -> None:
        """Drop the worktree checked out on `branch`, then its local branch."""
        if not branch:
            print("[WARN] cleanup skipped: no branch in payload", file=sys.stderr)
            return
        removed = self.remove_worktree(branch)
        if removed == "kept":
            print(
                f"[INFO] kept local branch {branch}: still checked out in a worktree",
                file=sys.stderr,
            )
            return
        if removed is None and self.worktree_for(branch):
            # The main checkout has it; deleting a checked-out branch only fails.
            return
        if merged:
            rc, out = self._run(["git", "branch", "-D", branch])
            if rc != 0:
                print(f"[WARN] branch delete failed for {branch}: {out}", file=sys.stderr)
            else:
                print(f"[OK] deleted local branch {branch}")
        else:
            print(f"[INFO] PR closed unmerged: kept local branch {branch}", file=sys.stderr)
        self._run(["git", "fetch", "--prune", "origin"])

    def worktree_for(self, branch: str) -> str | None:
        """Path of the worktree with `branch` checked out, if any."""
        rc, out = self._run(["git", "worktree", "list", "--porcelain"])
        if rc != 0:
            print(f"[ERROR] git worktree list failed: {out}", file=sys.stderr)
            return None
        for path, checked_out in parse_worktrees(out):
            if checked_out == branch:
                return path
        return None

    def remove_worktree(self, branch: str) -> str | None:
        """Remove `branch`'s worktree. `removed` on success, `kept`, or None.

        None means no worktree had that branch checked out — the normal case for
        a branch that was never worked on locally, and also the case for the main
        checkout, which must never be removed.
        """
        path = self.worktree_for(branch)
        if path is None:
            return None
        if os.path.realpath(path) == os.path.realpath(REPO_ROOT):
            # The PR branch is checked out in our own working tree (someone
            # developed it in place). git refuses `worktree remove` on a main
            # working tree, so skip it instead of failing once per merge.
            print(
                f"[INFO] {branch} is checked out in the main working tree; leaving it",
                file=sys.stderr,
            )
            return None
        rc, status = self._run(["git", "-C", path, "status", "--porcelain"])
        if rc != 0:
            print(f"[WARN] git status failed in {path}: {status}", file=sys.stderr)
            return "kept"
        blockers = blocking_paths(status)
        if blockers:
            # Never --force over real changes. Name them: git's own message only
            # says "contains modified or untracked files", and a path that is
            # build litter misread as work is what left a worktree behind after
            # every single merge.
            shown = ", ".join(blockers[:5]) + (" …" if len(blockers) > 5 else "")
            print(
                f"[WARN] kept worktree {path}: {len(blockers)} path(s) that are not build output: {shown}",
                file=sys.stderr,
            )
            return "kept"
        # Build output only — a dependency symlink, dist/, _site/. `worktree
        # remove` refuses to delete those without --force, and they are not work,
        # so this is exactly where --force is safe.
        rc, out = self._run(["git", "worktree", "remove", "--force", path])
        if rc != 0:
            print(f"[WARN] worktree remove failed for {path}: {out}", file=sys.stderr)
            return "kept"
        print(f"[OK] removed worktree {path}")
        return "removed"

    def sweep_worktrees(self) -> int:
        """Remove worktrees whose pull request is already merged.

        The close event is the primary path; this is the backstop for the cases
        it cannot cover. The event path is at-most-once and its success signal is
        not trustworthy: the handler catches every exception and still answers
        200, so a cleanup that failed inside is acked to GitHub as delivered, and
        GitHub does not redeliver failures anyway (a delivery is also failed if
        the response takes over 10 s, which the synchronous handler can hit).

        So this is the only thing that reconciles the host with what actually got
        merged. Safe to run at any time, because a worktree is only removed when
        all three hold:

        - its branch is gone from origin (GitHub deletes the head branch on merge),
        - GitHub reports a merged PR for that branch,
        - it holds nothing but build output.

        Returns the number of worktrees removed.
        """
        rc, out = self._run(["git", "worktree", "list", "--porcelain"])
        if rc != 0:
            print(f"[ERROR] git worktree list failed: {out}", file=sys.stderr)
            return 0
        removed = 0
        for path, branch in parse_worktrees(out):
            if branch is None or os.path.realpath(path) == os.path.realpath(REPO_ROOT):
                continue
            if self._run(["git", "ls-remote", "--exit-code", "--heads", "origin", branch])[0] == 0:
                continue  # still on origin: open, or not merged
            rc, merged_pr = self._run(
                ["gh", "pr", "list", "--head", branch, "--state", "merged",
                 "--json", "number", "--jq", ".[0].number // empty"]
            )
            if rc != 0:
                print(f"[WARN] cannot ask GitHub about {branch}: {merged_pr}", file=sys.stderr)
                continue
            number = merged_pr.strip()
            if not number:
                print(f"[INFO] kept {path}: no merged PR for {branch}", file=sys.stderr)
                continue
            if self.remove_worktree(branch) != "removed":
                continue
            rc, out = self._run(["git", "branch", "-D", branch])
            if rc != 0:
                print(f"[WARN] branch delete failed for {branch}: {out}", file=sys.stderr)
                continue
            print(f"[OK] swept {path} (PR #{number})")
            removed += 1
        self._run(["git", "fetch", "--prune", "origin"])
        print(f"[OK] sweep done: {removed} worktree(s) removed")
        return removed

    def strip_labels(self, number: int | None, labels: list[str]) -> None:
        """Best-effort removal of the flow labels still carrying `number`.

        `labels` is the object's label list from the close payload, so only the
        flow labels that are actually present get a request. A label that is
        already gone needs none, which is the normal case on most closes: an
        issue carries `weka-working` alone, a PR at merge time usually carries
        `weka` and `weka-reviewed` alone.
        """
        if number is None:
            print("[WARN] close payload carries no number: leaving flow labels in place", file=sys.stderr)
            return
        targets = [
            label for label in (LABEL_WORKING, LABEL_REVIEWING, LABEL_REVIEWED) if label in labels
        ]
        if not targets:
            print(f"[INFO] #{number} closed without flow labels: nothing to strip", file=sys.stderr)
            return
        gh = self.gh
        if not gh:
            print("[WARN] gh not found: leaving flow labels in place", file=sys.stderr)
            return
        slug = self.repo_slug()
        if slug is None:
            return
        for label in targets:
            rc, err = self._run(
                [gh, "api", "-X", "DELETE", f"repos/{slug}/issues/{number}/labels/{label}"]
            )
            if rc != 0:
                # The list said it was there, so a 404 means someone removed it
                # in between: the goal state either way, not a failure. Reserving
                # WARN for real errors keeps it meaningful.
                if "HTTP 404" in err or "Label does not exist" in err:
                    continue
                print(f"[WARN] label {label} not removed from #{number}: {err}", file=sys.stderr)
            else:
                print(f"[OK] removed {label} from #{number}")

    # ---- event handlers -----------------------------------------------------

    def handle_issue(self, payload: dict) -> None:
        action = payload.get("action", "")
        issue = payload.get("issue", {})
        label_names = [lbl.get("name", "") for lbl in issue.get("labels", [])]
        number = issue.get("number")

        # Closing is the fallback that ends a label's life on the issue: an issue
        # card puts weka-working on the Issue, and no worker is left holding it
        # once the card is done, so a label that outlives the issue would stay
        # forever. Checked before the open-time gates, which a close never passes.
        if action == "closed":
            self.strip_labels(number, label_names)
            return

        if action not in ("opened", "labeled", "assigned"):
            return
        if self.label not in label_names:
            return

        # Resource gate: only an issue assigned to the bot account proceeds —
        # otherwise anyone on the public repo could open an issue with the label
        # and drain the team's LLM budget. `assignees` is the full list; the
        # scalar `assignee` is order-dependent when several people are assigned.
        assigned = [a.get("login") for a in (issue.get("assignees") or []) if a]
        if not assigned:
            assigned = [(issue.get("assignee") or {}).get("login")]
        if self.gate_login not in assigned:
            print(
                f"[GATE] Issue #{number} not assigned to {self.gate_login} "
                f"(assignees={', '.join(a for a in assigned if a) or 'none'}), skipping",
                file=sys.stderr,
            )
            return

        existing = self.open_card_for(number)
        if existing:
            self.kanban("comment", existing[0], f"issue event {action} (ignored: card is {existing[1]})")
            return

        title = issue.get("title", "")
        url = issue.get("html_url", "")
        issue_body = (issue.get("body") or "").strip()
        body = (
            f"{url}\n\n"
            "## trigger\n"
            f"- event: issues.{action}\n"
            f"- actor: {(issue.get('user') or {}).get('login', '')}\n"
            f"- received: {_now()}\n"
            "\n## issue body\n"
            f"{issue_body or '(empty)'}\n"
            "\n> Source of truth is GitHub. Fetch anything else yourself:\n"
            f"> `gh issue view {number} --comments`\n"
        )
        self.kanban(
            "create",
            f"#{number}: {title}",
            "--assignee", self.assignee,
            "--body", body,
            "--idempotency-key", f"gh-issue-{number}",
            *self.create_args,
        )

    def handle_pr_review(self, payload: dict) -> None:
        if payload.get("action") != "submitted":
            return
        review = payload.get("review") or {}
        login = (review.get("user") or {}).get("login", "")
        if login != self.human:
            # Bots and other collaborators do not drive the flow; log it so a
            # "why did nothing happen" question has an answer in the journal.
            print(f"[GATE] review by {login or 'unknown'} ignored (not {self.human})", file=sys.stderr)
            return
        state = review.get("state", "")
        if state == "approved":
            print(f"[INFO] human approved PR #{self._pr_number(payload)}: nothing to trigger", file=sys.stderr)
            return
        self._create_rework_card(
            payload,
            event=f"pull_request_review.submitted ({state})",
            actor=(review.get("user") or {}).get("login", ""),
            text=review.get("body") or "",
            ref_url=review.get("html_url") or "",
            idem_key=f"gh-pr-{self._pr_number(payload)}-review-{review.get('id', '')}",
        )

    def handle_issue_comment(self, payload: dict) -> None:
        if payload.get("action") != "created":
            return
        issue = payload.get("issue") or {}
        if not issue.get("pull_request"):
            return
        comment = payload.get("comment") or {}
        body = comment.get("body") or ""
        if body.lstrip().startswith(TRACE_MARKER):
            # weka's own explanation of a refusal. gh posts it as the repository
            # owner, so without this check the note would read back as a fresh
            # human request and weka would answer its own answer.
            print(f"[SKIP] PR #{issue.get('number')}: comment is weka's own trace", file=sys.stderr)
            return
        if (comment.get("user") or {}).get("login", "") != self.human:
            return
        self._create_rework_card(
            payload,
            event="issue_comment.created",
            actor=(comment.get("user") or {}).get("login", ""),
            text=body,
            ref_url=comment.get("html_url") or "",
            idem_key=f"gh-pr-{self._pr_number(payload)}-comment-{comment.get('id', '')}",
        )

    def handle_pr_review_comment(self, payload: dict) -> None:
        """Inline review comments arrive as their own event type.

        GitHub sends `pull_request_review_comment` for a comment left inside the
        diff; a review submitted with only inline comments produces that event
        and an empty review body. Treating them as feedback is what makes a
        drive-by inline comment trigger a rework card.
        """
        if payload.get("action") != "created":
            return
        comment = payload.get("comment") or {}
        login = (comment.get("user") or {}).get("login", "")
        body = comment.get("body") or ""
        if body.lstrip().startswith(TRACE_MARKER):
            # Same reason as issue_comment: do not answer our own trace.
            print(f"[SKIP] PR #{self._pr_number(payload)}: inline comment is weka's own trace", file=sys.stderr)
            return
        if login != self.human:
            return
        where = comment.get("path") or ""
        line = comment.get("line") or comment.get("original_line")
        if where and line:
            where = f"{where}:{line}"
        self._create_rework_card(
            payload,
            event="pull_request_review_comment.created",
            actor=login,
            text=f"{where}\n{body}".strip(),
            ref_url=comment.get("html_url") or "",
            idem_key=f"gh-pr-{self._pr_number(payload)}-review-comment-{comment.get('id', '')}",
        )

    def _create_rework_card(self, payload: dict, *, event: str, actor: str, text: str,
                            ref_url: str, idem_key: str) -> None:
        """Annotate the PR's open card, or create one — never drop the request.

        Every exit from here leaves something visible on GitHub: a new card, a
        comment on the card that is already open, or a comment on the PR saying
        why neither happened. Capacity is not a reason to refuse — a card waits
        in `ready` until the dispatcher has a slot, while a webhook-side gate has
        no queue behind it, so "board is busy" used to mean "discarded".
        """
        pr = payload.get("pull_request") or (payload.get("issue") or {})
        number = pr.get("number")
        labels = [lbl.get("name", "") for lbl in (pr.get("labels") or [])]

        # Checked before the label gate on purpose: cody strips weka-reviewed as
        # its first move on a rework card, so gating on the label first would
        # drop everything the human says while that rework is still running.
        existing = self.open_card_for(number)
        if existing:
            note = f"{event} from {actor}: card already {existing[1]}"
            if text.strip():
                note += f"\n\n{text.strip()}"
            if not self.kanban("comment", existing[0], note):
                self.comment_on_pr(
                    number,
                    f"收到这条评论，但追加到卡片 `{existing[0]}` 失败（`hermes kanban comment` "
                    "非零退出），请求没有记录进去。webhook journal 里有具体错误。",
                )
            return

        if LABEL_REVIEWED not in labels:
            print(
                f"[GATE] PR #{number} has no {LABEL_REVIEWED} label "
                f"({', '.join(labels) or 'no labels'}): human event ignored",
                file=sys.stderr,
            )
            self._explain_refusal(
                pr,
                labels,
                "这条评论没有触发返工：这个 PR 上现在没有 `weka-reviewed` 标签，"
                "weka 只把该标签存在时的留言当作返工请求（AI 审查通过、等终审的阶段）。"
                "标签出现之后再留一次言即可。",
            )
            return

        # Context only, no longer a gate: the dispatcher owns capacity
        # (max_in_progress / max_in_progress_per_profile) and holds a card in
        # `ready` until a slot frees up. Refusing here had nothing behind it but
        # a journal line the human on GitHub cannot see.
        busy = self.busy_cards()
        if busy:
            print(
                f"[INFO] PR #{number}: {len(busy)} card(s) already in progress "
                f"({', '.join(f'{t} {s}' for t, s, _ in busy)}); queuing the rework card anyway",
                file=sys.stderr,
            )

        branch = ((pr.get("head") or {}).get("ref")) or ""
        pr_url = pr.get("html_url") or ""
        pr_title = pr.get("title") or ""
        body = (
            f"{pr_url}\n\n"
            "## trigger\n"
            f"- event: {event}\n"
            f"- actor: {actor}\n"
            f"- received: {_now()}\n"
            f"- labels at trigger: {', '.join(labels)}\n"
        )
        if ref_url:
            body += f"- source: {ref_url}\n"
        body += (
            "\n## branch\n"
            f"{branch or '(unknown)'}\n"
            f"\n## human feedback\n{text.strip() or '(empty)'}\n"
            "\n> Source of truth is GitHub. Read the whole history, not just this text:\n"
            f"> `gh pr view {number} --comments`\n"
            f"> `gh api repos/{{owner}}/{{repo}}/pulls/{number}/reviews`\n"
            f"> `gh api repos/{{owner}}/{{repo}}/pulls/{number}/comments`\n"
            f"> `gh pr diff {number}`\n"
        )
        created = self.kanban(
            "create",
            f"#{number}: Rework — {pr_title}"[:120],
            "--assignee", self.assignee,
            "--body", body,
            "--idempotency-key", idem_key,
            *self.create_args,
        )
        if not created:
            # A failed create used to be one journal line, and the human who
            # asked for the change saw an ignored PR.
            self.comment_on_pr(
                number,
                f"收到 `{event}`，但建返工卡失败（`hermes kanban create` 非零退出），"
                "请求没有进队列。webhook journal 里有具体错误，也可以在 GitHub 的 webhook "
                "投递记录里 redeliver 这一条。",
            )

    def _explain_refusal(self, pr: dict, labels: list[str], reason: str) -> None:
        """Post `reason` on the PR — but only where a human can act on it.

        Two refusals stay journal-only and neither leaves anyone waiting: a PR
        without the `weka` label was never in this flow (weka does not comment on
        unrelated pull requests), and a closed PR has no code left to rework.
        Every other refusal is answered on the thread.
        """
        number = pr.get("number")
        if self.label not in labels:
            print(f"[GATE] PR #{number} is not a weka PR: no comment left", file=sys.stderr)
            return
        if (pr.get("state") or "open") != "open":
            print(f"[GATE] PR #{number} is closed: no comment left", file=sys.stderr)
            return
        self.comment_on_pr(number, reason)

    def handle_pr(self, payload: dict) -> None:
        if payload.get("action") != "closed":
            return
        pr = payload.get("pull_request") or {}
        number = pr.get("number")
        merged = bool(pr.get("merged"))
        branch = ((pr.get("head") or {}).get("ref")) or ""
        labels = [lbl.get("name", "") for lbl in (pr.get("labels") or [])]
        print(f"[INFO] PR #{number} closed (merged={merged}), cleaning up {branch}", file=sys.stderr)

        existing = self.open_card_for(number)
        if existing:
            self.kanban("comment", existing[0], f"PR #{number} closed (merged={merged}); card closed by webhook")
            self.kanban(
                "complete", existing[0],
                "--result", f"PR #{number} closed by the webhook (merged={merged}); no further work.",
            )

        self.cleanup_branch(branch, merged)
        self.strip_labels(number, labels)

    @staticmethod
    def _pr_number(payload: dict) -> int | None:
        pr = payload.get("pull_request") or (payload.get("issue") or {})
        return pr.get("number")


def make_handler(weka: Weka):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            # Keep the default per-request line out of the journal.
            pass

        def do_POST(self):
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length)

            signature = self.headers.get("X-Hub-Signature-256", "")
            if weka.secret:
                expected = "sha256=" + hmac.new(weka.secret, raw, hashlib.sha256).hexdigest()
                if not hmac.compare_digest(signature, expected):
                    self.send_response(403)
                    self.end_headers()
                    return

            try:
                payload = json.loads(raw.decode("utf-8"))
            except ValueError:
                self.send_response(400)
                self.end_headers()
                return

            event = self.headers.get("X-GitHub-Event", "")
            try:
                if event == "issues":
                    weka.handle_issue(payload)
                elif event == "pull_request_review":
                    weka.handle_pr_review(payload)
                elif event == "issue_comment":
                    weka.handle_issue_comment(payload)
                elif event == "pull_request_review_comment":
                    weka.handle_pr_review_comment(payload)
                elif event == "pull_request":
                    weka.handle_pr(payload)
                else:
                    # Silence here is what makes "the webhook ignored me" undebuggable:
                    # name the event so the subscription can be checked.
                    print(f"[SKIP] unhandled event: {event}", file=sys.stderr)
            except Exception as exc:
                print(f"[ERROR] {event}: {exc}", file=sys.stderr)

            self.send_response(200)
            self.end_headers()

    return Handler


def main() -> None:
    args = sys.argv[1:]
    sweep = "--sweep" in args
    args = [a for a in args if a != "--sweep"]
    config_path = args[0] if args else DEFAULT_CONFIG
    config = load_config(config_path)
    weka = Weka(config)
    if sweep:
        # One-shot backstop for merges whose close event was missed. Run by hand
        # (`--sweep`) or from the deploy procedure; it never blocks the service.
        raise SystemExit(0 if weka.sweep_worktrees() >= 0 else 1)
    port = int(config.get("port", 9180))
    # Loopback only: nginx faces the public net and proxies /weka-webhook here.
    server = HTTPServer(("127.0.0.1", port), make_handler(weka))
    print(f"weka webhook listening on 127.0.0.1:{port} (label={weka.label}, board={weka.board or 'default'})")
    server.serve_forever()


if __name__ == "__main__":
    main()
