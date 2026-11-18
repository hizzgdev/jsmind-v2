#!/usr/bin/env python3
"""Weka webhook bridge: GitHub events -> Kanban cards.

Listens on a configurable port and translates three GitHub event types into
`hermes kanban` calls, so a GitHub Issue opened with the team label starts a
Kanban task without any LLM round-trip in between.

Events handled:

- issues (opened / labeled with the target label)  -> kanban create
- pull_request_review_comment (created by the human owner) -> request-changes
- issue_comment (created by the human owner on a PR)   -> request-changes
- pull_request (closed + merged)                   -> reassign coder (cleanup)

PR URL -> task id is resolved by searching the Kanban `task_comments` table for
the PR URL that Cody leaves behind when he opens the PR.

Configuration is read from `config.json` next to this script. A committed
`config.example.json` documents every field; keep `config.json` out of git (it
holds the webhook secret and machine-specific paths). Pass a path as argv[1] to
override the default location.

Requires Python 3.10+ and the standard library only. Run it from a pinned
virtualenv — see README.md for the version policy and setup command.
"""
import json
import os
import sys
import hmac
import hashlib
import shutil
import sqlite3
import subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CONFIG = os.path.join(HERE, "config.json")


def load_config(path: str) -> dict:
    if not os.path.exists(path):
        sys.exit(
            f"config not found: {path}\n"
            "(copy config.example.json to config.json and fill in real values)"
        )
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


class Weka:
    def __init__(self, config: dict):
        self.secret = (config.get("secret") or "").encode("utf-8")
        # systemd's PATH lacks ~/.local/bin; fall back to the standard install shim.
        self.hermes_bin = shutil.which("hermes") or os.path.expanduser("~/.local/bin/hermes")
        self.label = config["target_label"]
        self.assignee = config.get("assignee", "cody")
        self.human = config.get("human_login", "hizzgdev")
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

    def find_task_by_pr_url(self, pr_url: str) -> str | None:
        """Return the task id whose comments mention this PR URL, else None."""
        try:
            db = sqlite3.connect(f"file:{self.kanban_db}?mode=ro", uri=True)
            row = db.execute(
                "SELECT task_id FROM task_comments WHERE body LIKE ? "
                "ORDER BY created_at DESC LIMIT 1",
                (f"%{pr_url}%",),
            ).fetchone()
            db.close()
            return row[0] if row else None
        except Exception as exc:
            print(f"[WARN] task lookup failed: {exc}", file=sys.stderr)
            return None

    # ---- GitHub event handlers ----------------------------------------------

    def handle_issue(self, payload: dict) -> None:
        action = payload.get("action", "")
        if action not in ("opened", "labeled"):
            return
        issue = payload.get("issue", {})
        label_names = [lbl.get("name", "") for lbl in issue.get("labels", [])]
        if self.label not in label_names:
            return

        number = issue.get("number")
        title = issue.get("title", "")
        url = issue.get("html_url", "")
        body = (issue.get("body") or "").strip()
        opening = url if not body else f"{url}\n\n{body}"

        self.kanban(
            "create",
            f"Issue #{number}: {title}",
            "--assignee", self.assignee,
            "--body", opening,
            "--idempotency-key", f"gh-issue-{number}",
            *self.create_args,
        )

    def handle_pr_review_comment(self, payload: dict) -> None:
        # Inline comment on a diff line.
        if payload.get("action") != "created":
            return
        comment = payload.get("comment", {})
        if (comment.get("user") or {}).get("login", "") != self.human:
            return
        pr_url = (payload.get("pull_request") or {}).get("html_url", "")
        self._handle_human_feedback(pr_url, comment.get("body") or "")

    def handle_issue_comment(self, payload: dict) -> None:
        # Conversation comment. Only a PR carries `pull_request` inside the
        # issue object; a plain issue comment is not a review signal.
        if payload.get("action") != "created":
            return
        issue = payload.get("issue", {})
        if not issue.get("pull_request"):
            return
        comment = payload.get("comment", {})
        if (comment.get("user") or {}).get("login", "") != self.human:
            return
        pr_url = (issue.get("pull_request") or {}).get("html_url", "") or issue.get("html_url", "")
        self._handle_human_feedback(pr_url, comment.get("body") or "")

    def _handle_human_feedback(self, pr_url: str, text: str) -> None:
        # The human owner commented on a PR we are driving: send it back to the
        # coder for rework.
        if not pr_url:
            return
        task_id = self.find_task_by_pr_url(pr_url)
        if not task_id:
            print(f"[WARN] no kanban task for PR {pr_url}", file=sys.stderr)
            return

        body = (text or "")[:500]
        self.kanban("comment", task_id, f"human review: {body}")
        self.kanban("request-changes", task_id, "human review feedback")

    def handle_pr(self, payload: dict) -> None:
        pr = payload.get("pull_request", {})
        if not (payload.get("action") == "closed" and pr.get("merged")):
            return
        pr_url = pr.get("html_url", "")
        task_id = self.find_task_by_pr_url(pr_url)
        if not task_id:
            print(f"[WARN] no kanban task for merged PR {pr_url}", file=sys.stderr)
            return
        self.kanban("comment", task_id, "PR merged: clean up worktree and branch")
        self.kanban("assign", task_id, self.assignee)


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
                elif event == "pull_request_review_comment":
                    weka.handle_pr_review_comment(payload)
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
