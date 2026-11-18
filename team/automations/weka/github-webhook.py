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
- pull_request (closed)                                   -> clean up worktree

Design contract (see README.md for the full version):

- GitHub is the source of truth. A card is only a trigger: it carries the object
  URL plus a snapshot of the event that created it, and nothing else is
  authoritative.
- The card key is the number of the object that created it, in the title:
  `#85: <title>` for issue cards, `#86: Rework N — <title>` for PR cards.
- `weka-reviewed` is the only label with flow-control meaning: a human event on
  a PR creates a card only while that label is present, and only when no card is
  already open for the same number.
- There is no "waiting for a human" card state. The human gate lives on GitHub
  (review request + weka-reviewed), which is why a finished card simply ends.

Configuration is read from `config.json` next to this script. A committed
`config.example.json` documents every field; keep `config.json` out of git (it
holds the webhook secret and machine-specific paths). Pass a path as argv[1] to
override the default location.

Requires Python 3.10+ and the standard library only (plus `git`, and `gh` for
best-effort label cleanup). Run it from a pinned virtualenv — see README.md for
the version policy and setup command.
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

    def open_card_for(self, number: int) -> tuple[str, str] | None:
        """`(task_id, status)` of the open card keyed on this number, else None.

        The key is the title prefix `#<number>:` — prefix-anchored so that a card
        mentioning `#86:` mid-title never shadows the card that owns the number.
        """
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
        """Cards with an agent working them right now: `(id, status, title)`."""
        try:
            return self._query(
                "SELECT id, status, title FROM tasks WHERE status IN ('running', 'review') "
                "ORDER BY created_at DESC LIMIT 5",
                (),
            )
        except Exception as exc:
            print(f"[WARN] busy-card lookup failed: {exc}", file=sys.stderr)
            return []

    def rework_count(self, number: int) -> int:
        try:
            rows = self._query(
                "SELECT COUNT(*) FROM tasks WHERE title LIKE ?", (f"#{number}: Rework%",)
            )
        except Exception as exc:
            print(f"[WARN] rework count failed for #{number}: {exc}", file=sys.stderr)
            return 0
        return int(rows[0][0]) if rows else 0

    # ---- git / gh helpers ---------------------------------------------------

    def _run(self, cmd: list[str]) -> tuple[int, str]:
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO_ROOT)
        return result.returncode, (result.stderr or result.stdout or "").strip()

    def cleanup_branch(self, branch: str, merged: bool) -> None:
        """Drop the worktree checked out on `branch`, then its local branch."""
        if not branch:
            print("[WARN] cleanup skipped: no branch in payload", file=sys.stderr)
            return
        rc, out = self._run(["git", "worktree", "list", "--porcelain"])
        if rc != 0:
            print(f"[ERROR] git worktree list failed: {out}", file=sys.stderr)
            return
        path = None
        for block in out.split("\n\n"):
            lines = [line.strip() for line in block.splitlines() if line.strip()]
            if lines and lines[0].startswith("worktree "):
                current_path = lines[0][len("worktree "):]
                if f"branch refs/heads/{branch}" in lines:
                    path = current_path
                    break
        if path:
            rc, out = self._run(["git", "worktree", "remove", path])
            if rc != 0:
                # Never --force: an unforced failure means uncommitted work there.
                print(f"[WARN] worktree remove failed for {path}: {out}", file=sys.stderr)
            else:
                print(f"[OK] removed worktree {path}")
        if merged:
            rc, out = self._run(["git", "branch", "-D", branch])
            if rc != 0:
                print(f"[WARN] branch delete failed for {branch}: {out}", file=sys.stderr)
            else:
                print(f"[OK] deleted local branch {branch}")
        else:
            print(f"[INFO] PR closed unmerged: kept local branch {branch}", file=sys.stderr)
        self._run(["git", "fetch", "--prune", "origin"])

    def strip_labels(self, number: int) -> None:
        """Best-effort removal of the flow labels from an issue/PR."""
        gh = shutil.which("gh")
        if gh is None:
            print("[WARN] gh not found: leaving flow labels in place", file=sys.stderr)
            return
        rc, out = self._run(["gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"])
        if rc != 0 or not out:
            print(f"[WARN] repo lookup failed: {out}", file=sys.stderr)
            return
        for label in (LABEL_WORKING, LABEL_REVIEWING, LABEL_REVIEWED):
            rc, err = self._run(
                ["gh", "api", "-X", "DELETE", f"repos/{out}/issues/{number}/labels/{label}"]
            )
            if rc != 0:
                print(f"[WARN] label {label} not removed from #{number}: {err}", file=sys.stderr)

    # ---- event handlers -----------------------------------------------------

    def handle_issue(self, payload: dict) -> None:
        action = payload.get("action", "")
        if action not in ("opened", "labeled", "assigned"):
            return
        issue = payload.get("issue", {})
        label_names = [lbl.get("name", "") for lbl in issue.get("labels", [])]
        if self.label not in label_names:
            return

        # Resource gate: only an issue assigned to the bot account proceeds —
        # otherwise anyone on the public repo could open an issue with the label
        # and drain the team's LLM budget. `assignees` is the full list; the
        # scalar `assignee` is order-dependent when several people are assigned.
        number = issue.get("number")
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
        if (comment.get("user") or {}).get("login", "") != self.human:
            return
        self._create_rework_card(
            payload,
            event="issue_comment.created",
            actor=(comment.get("user") or {}).get("login", ""),
            text=comment.get("body") or "",
            ref_url=comment.get("html_url") or "",
            idem_key=f"gh-pr-{self._pr_number(payload)}-comment-{comment.get('id', '')}",
        )

    def _create_rework_card(self, payload: dict, *, event: str, actor: str, text: str,
                            ref_url: str, idem_key: str) -> None:
        """Gate on weka-reviewed, then create (or annotate) the PR's card."""
        pr = payload.get("pull_request") or (payload.get("issue") or {})
        number = pr.get("number")
        labels = [lbl.get("name", "") for lbl in (pr.get("labels") or [])]

        if LABEL_REVIEWED not in labels:
            print(
                f"[GATE] PR #{number} has no {LABEL_REVIEWED} label "
                f"({', '.join(labels) or 'no labels'}): human event ignored",
                file=sys.stderr,
            )
            return

        existing = self.open_card_for(number)
        if existing:
            self.kanban("comment", existing[0], f"{event} from {actor}: card already {existing[1]}")
            return

        busy = self.busy_cards()
        if busy:
            print(
                f"[GATE] PR #{number}: board is busy ({', '.join(f'{t} {s}' for t, s, _ in busy)}), "
                "deferring the rework card",
                file=sys.stderr,
            )
            return

        branch = ((pr.get("head") or {}).get("ref")) or ""
        pr_url = pr.get("html_url") or ""
        pr_title = pr.get("title") or ""
        round_no = self.rework_count(number) + 1
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
        self.kanban(
            "create",
            f"#{number}: Rework {round_no} — {pr_title}"[:120],
            "--assignee", self.assignee,
            "--body", body,
            "--idempotency-key", idem_key,
            *self.create_args,
        )

    def handle_pr(self, payload: dict) -> None:
        if payload.get("action") != "closed":
            return
        pr = payload.get("pull_request") or {}
        number = pr.get("number")
        merged = bool(pr.get("merged"))
        branch = ((pr.get("head") or {}).get("ref")) or ""
        print(f"[INFO] PR #{number} closed (merged={merged}), cleaning up {branch}", file=sys.stderr)

        existing = self.open_card_for(number)
        if existing:
            self.kanban("comment", existing[0], f"PR #{number} closed (merged={merged}); card closed by webhook")
            self.kanban(
                "complete", existing[0],
                "--result", f"PR #{number} closed by the webhook (merged={merged}); no further work.",
            )

        self.cleanup_branch(branch, merged)
        self.strip_labels(number)

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
                elif event == "pull_request":
                    weka.handle_pr(payload)
            except Exception as exc:
                print(f"[ERROR] {event}: {exc}", file=sys.stderr)

            self.send_response(200)
            self.end_headers()

    return Handler


def main() -> None:
    config_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CONFIG
    config = load_config(config_path)
    weka = Weka(config)
    port = int(config.get("port", 9180))
    # Loopback only: nginx faces the public net and proxies /weka-webhook here.
    server = HTTPServer(("127.0.0.1", port), make_handler(weka))
    print(f"weka webhook listening on 127.0.0.1:{port} (label={weka.label}, board={weka.board or 'default'})")
    server.serve_forever()


if __name__ == "__main__":
    main()
