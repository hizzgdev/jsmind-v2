#!/usr/bin/env python3
"""Regression tests for the weka webhook: a human request is never dropped.

Standard library only, like the script under test. Run from the repository root:

    python3 -m unittest discover -s team/automations/weka -p 'test_*.py'

The invariant these tests pin down: a human comment on a PR that carries
`weka-reviewed` must end in a new card, a comment on the PR's open card, or a
comment on the PR explaining why neither happened. "Nothing happened" is the
bug, so every assertion here is about a side effect, never about a log line.
"""
import importlib.util
import os
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))


def _load_webhook():
    """Import `github-webhook.py`, whose name is not a valid module name."""
    path = os.path.join(HERE, "github-webhook.py")
    spec = importlib.util.spec_from_file_location("weka_webhook", path)
    assert spec is not None and spec.loader is not None, f"cannot load {path}"
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


weka_webhook = _load_webhook()

PR_NUMBER = 151
PR_TITLE = "fix(arranger): correct cousin spacing calculation"
CONFIG = {
    "target_label": "weka",
    "assignee": "cody",
    "human_login": "hizzgdev",
    "bot_login": "zzgbot",
    "kanban_board": "test-board",
}


def pr_payload(labels=("weka", "weka-reviewed"), state="open", number=PR_NUMBER, action="created"):
    """The slice of a GitHub payload `_create_rework_card()` reads."""
    return {
        "action": action,
        "pull_request": {
            "number": number,
            "title": PR_TITLE,
            "html_url": f"https://github.com/hizzgdev/jsmind-v2/pull/{number}",
            "state": state,
            "labels": [{"name": name} for name in labels],
            "head": {"ref": "fix/arranger-cousin-spacing"},
        },
    }


def comment_payload(body, number=PR_NUMBER, login="hizzgdev"):
    """An `issue_comment.created` payload for a comment on a PR."""
    payload = pr_payload()
    payload["issue"] = {
        **payload["pull_request"],
        "pull_request": {"url": f"https://api.github.com/repos/o/r/pulls/{number}"},
    }
    payload["comment"] = {
        "id": 1,
        "body": body,
        "user": {"login": login},
        "html_url": f"https://github.com/hizzgdev/jsmind-v2/pull/{number}#issuecomment-1",
    }
    return payload


class FakeWeka(weka_webhook.Weka):
    """A Weka that records its side effects instead of performing them."""

    def __init__(self, cards=(), busy=(), kanban_ok=True):
        super().__init__(dict(CONFIG))
        self.cards = list(cards)          # values open_card_for() should return
        self.busy = list(busy)            # values busy_cards() should return
        self.kanban_ok = kanban_ok
        self.kanban_calls = []
        self.pr_comments = []             # (number, body) visible on GitHub

    def kanban(self, *args):
        self.kanban_calls.append(args)
        return self.kanban_ok

    def open_card_for(self, number):
        return self.cards[0] if self.cards else None

    def busy_cards(self):
        return self.busy

    def comment_on_pr(self, number, body):
        self.pr_comments.append((number, body))
        return True

    # -- assertions helpers --------------------------------------------------

    def creates(self):
        return [call for call in self.kanban_calls if call[0] == "create"]

    def card_comments(self):
        return [call for call in self.kanban_calls if call[0] == "comment"]

    def trigger(self, text="this branch spacing is off, please re-check"):
        self._create_rework_card(
            pr_payload(),
            event="issue_comment.created",
            actor="hizzgdev",
            text=text,
            ref_url=f"https://github.com/hizzgdev/jsmind-v2/pull/{PR_NUMBER}#issuecomment-1",
            idem_key="gh-pr-151-comment-1",
        )


class ARunningCardElsewhereTests(unittest.TestCase):
    """The regression: capacity used to be read as "drop the request"."""

    def test_a_running_card_on_the_board_does_not_swallow_the_rework(self):
        busy = [("t_57c8763e", "running", "#149: some other work")]
        weka = FakeWeka(busy=busy)

        weka.trigger()

        creates = weka.creates()
        self.assertEqual(
            len(creates), 1,
            "a card running elsewhere is the dispatcher's problem, not a reason to drop "
            f"the human request; calls={weka.kanban_calls} comments={weka.pr_comments}",
        )
        self.assertTrue(creates[0][1].startswith(f"#{PR_NUMBER}: Rework — "), creates[0][1])
        self.assertEqual(weka.pr_comments, [], "a created card needs no excuse on the PR")

    def test_a_card_in_review_does_not_swallow_the_rework(self):
        weka = FakeWeka(busy=[("t_1", "review", "#150: Rework — something")])

        weka.trigger()

        self.assertEqual(len(weka.creates()), 1)


class RefusalsAreVisibleTests(unittest.TestCase):
    """Whatever still refuses has to say so where the human can read it."""

    def test_a_failed_create_is_reported_on_the_pr(self):
        weka = FakeWeka(kanban_ok=False)

        weka.trigger()

        self.assertTrue(
            weka.pr_comments,
            "hermes kanban create returned False; the request is in no queue, so the PR "
            "must say so instead of nothing",
        )
        self.assertIn("返工卡失败", weka.pr_comments[0][1])
        self.assertEqual(weka.pr_comments[0][0], PR_NUMBER)

    def test_a_pr_without_weka_reviewed_says_why_on_the_pr(self):
        weka = FakeWeka()
        payload = pr_payload(labels=("weka", "weka-reviewing"))

        weka._create_rework_card(
            payload,
            event="issue_comment.created",
            actor="hizzgdev",
            text="please also handle the edge case",
            ref_url="",
            idem_key="gh-pr-151-comment-2",
        )

        self.assertEqual(weka.creates(), [])
        self.assertTrue(weka.pr_comments, "the kept gate must explain itself on the PR")
        self.assertIn("weka-reviewed", weka.pr_comments[0][1])

    def test_an_unrelated_pr_is_not_replied_to(self):
        weka = FakeWeka()
        payload = pr_payload(labels=("bug",), number=77)

        weka._create_rework_card(
            payload, event="issue_comment.created", actor="hizzgdev",
            text="thanks", ref_url="", idem_key="k",
        )

        self.assertEqual(weka.creates(), [])
        self.assertEqual(weka.pr_comments, [], "weka must not comment on PRs it never owned")

    def test_a_closed_pr_is_not_replied_to(self):
        weka = FakeWeka()
        payload = pr_payload(labels=("weka",), state="closed")

        weka._create_rework_card(
            payload, event="issue_comment.created", actor="hizzgdev",
            text="thanks for the fix", ref_url="", idem_key="k",
        )

        self.assertEqual(weka.pr_comments, [], "a merged PR has nothing left to rework")


class AnOpenCardAbsorbsTheCommentTests(unittest.TestCase):
    def test_the_open_card_receives_the_feedback_text(self):
        weka = FakeWeka(cards=[("t_rework", "running")])

        weka.trigger(text="the label on line 42 is wrong")

        self.assertEqual(weka.creates(), [], "one open card per number: no second card")
        comments = weka.card_comments()
        self.assertEqual(len(comments), 1)
        self.assertEqual(comments[0][1], "t_rework")
        self.assertIn("the label on line 42 is wrong", comments[0][2])

    def test_a_card_still_absorbs_the_comment_after_the_label_was_stripped(self):
        """cody strips weka-reviewed on pickup, so the label cannot gate this."""
        weka = FakeWeka(cards=[("t_rework", "running")])
        payload = pr_payload(labels=("weka",))

        weka._create_rework_card(
            payload, event="issue_comment.created", actor="hizzgdev",
            text="and this one too", ref_url="", idem_key="k",
        )

        self.assertEqual(len(weka.card_comments()), 1)
        self.assertEqual(weka.pr_comments, [], "no refusal note: the request was absorbed")

    def test_a_failed_append_is_reported_on_the_pr(self):
        weka = FakeWeka(cards=[("t_rework", "running")], kanban_ok=False)

        weka.trigger()

        self.assertTrue(weka.pr_comments, "the comment on the card failed too: say it on the PR")


class SelfFeedingTests(unittest.TestCase):
    """`gh` posts as the repository owner, so weka's own notes look human."""

    def test_weka_does_not_trigger_on_its_own_trace_comment(self):
        weka = FakeWeka()
        payload = comment_payload(f"{weka_webhook.TRACE_MARKER}\n这条评论没有触发返工")

        weka.handle_issue_comment(payload)

        self.assertEqual(weka.kanban_calls, [])

    def test_a_human_comment_still_goes_through(self):
        weka = FakeWeka()

        weka.handle_issue_comment(comment_payload("please fix the spacing"))

        self.assertEqual(len(weka.creates()), 1)

    def test_weka_does_not_trigger_on_an_inline_trace_comment(self):
        weka = FakeWeka()
        payload = comment_payload(f"{weka_webhook.TRACE_MARKER}\nno card")
        payload["comment"]["path"] = "src/arranger.ts"
        payload["comment"]["line"] = 42

        weka.handle_pr_review_comment(payload)

        self.assertEqual(weka.kanban_calls, [])


class CommentShapeTests(unittest.TestCase):
    """The trace goes through gh, and carries the marker that stops the loop."""

    def test_comment_on_pr_posts_a_marked_body_via_gh(self):
        weka = weka_webhook.Weka(dict(CONFIG))
        weka._slug = "hizzgdev/jsmind-v2"
        weka._slug_known = True
        calls = []

        def fake_run(cmd):
            calls.append(cmd)
            return 0, ""

        weka._run = fake_run  # type: ignore[method-assign]
        weka.gh = "/usr/bin/gh"

        self.assertTrue(weka.comment_on_pr(PR_NUMBER, "为什么没有建卡"))

        self.assertEqual(calls[0][:5], [
            "/usr/bin/gh", "api", "-X", "POST", "repos/hizzgdev/jsmind-v2/issues/151/comments",
        ])
        body = calls[0][calls[0].index("-f") + 1]
        self.assertTrue(body.startswith("body=" + weka_webhook.TRACE_MARKER))
        self.assertIn("为什么没有建卡", body)

    def test_a_comment_without_a_number_is_a_no_op_not_a_crash(self):
        weka = weka_webhook.Weka(dict(CONFIG))

        self.assertFalse(weka.comment_on_pr(None, "x"))


class ScriptedGitWeka(weka_webhook.Weka):
    """A Weka whose git/gh calls are scripted, so a cleanup decision is testable."""

    def __init__(self, worktrees, status_by_path=None, origin_alive=(), merged_prs=()):
        super().__init__(dict(CONFIG))
        self.calls = []
        self.worktrees = list(worktrees)          # [(path, branch)]
        self.status_by_path = status_by_path or {}
        self.origin_alive = set(origin_alive)     # branches still on origin
        self.merged_prs = dict(merged_prs)        # branch -> merged PR number
        self.removed = []

    def _run(self, cmd):
        self.calls.append(cmd)
        if cmd[:3] == ["git", "worktree", "list"]:
            blocks = []
            for path, branch in self.worktrees:
                block = f"worktree {path}\nHEAD 0123456789abcdef"
                if branch:
                    block += f"\nbranch refs/heads/{branch}"
                blocks.append(block)
            return 0, "\n\n".join(blocks)
        if cmd[:2] == ["git", "-C"] and cmd[3:] == ["status", "--porcelain"]:
            return 0, self.status_by_path.get(cmd[2], "")
        if cmd[:3] == ["git", "worktree", "remove"]:
            self.removed.append(cmd[-1])  # path is last, after an optional --force
            return 0, ""
        if cmd[:2] == ["git", "ls-remote"]:
            return (0, "") if cmd[-1] in self.origin_alive else (2, "")
        if cmd[:3] == ["gh", "pr", "list"]:
            number = self.merged_prs.get(cmd[cmd.index("--head") + 1])
            return 0, (str(number) if number else "")
        return 0, ""


class ArtifactClassificationTests(unittest.TestCase):
    """What counts as build litter rather than someone's uncommitted work."""

    def test_a_dependency_symlink_is_an_artifact(self):
        # The worker links the main checkout's node_modules in. `.gitignore` says
        # `node_modules/`, which does not match a symlink of that name, so this
        # arrives as an untracked path — and it is the reason every merged PR
        # used to leave its worktree behind.
        self.assertEqual(weka_webhook.blocking_paths("?? node_modules\n"), [])

    def test_build_output_is_an_artifact(self):
        self.assertEqual(weka_webhook.blocking_paths("?? dist/\n?? _site/\n?? coverage/\n"), [])

    def test_a_stray_file_blocks(self):
        self.assertEqual(weka_webhook.blocking_paths("?? scratch.md\n"), ["scratch.md"])

    def test_a_tracked_modification_blocks(self):
        self.assertEqual(weka_webhook.blocking_paths(" M src/a.ts\n"), ["src/a.ts"])

    def test_a_nested_dependency_tree_blocks(self):
        # Only the top-level name is exempt: a vendored tree inside a package is
        # not the link this rule exists for.
        self.assertEqual(
            weka_webhook.blocking_paths("?? src/node_modules/x.js\n"), ["src/node_modules/x.js"]
        )


class WorktreeCleanupTests(unittest.TestCase):
    """A close event must actually remove the worktree it is responsible for."""

    def test_a_worktree_holding_only_a_dependency_link_is_removed(self):
        weka = ScriptedGitWeka(
            [("/repo/.worktrees/t_x", "fix/x")],
            {"/repo/.worktrees/t_x": "?? node_modules\n"},
        )

        weka.cleanup_branch("fix/x", merged=True)

        self.assertEqual(weka.removed, ["/repo/.worktrees/t_x"])
        self.assertIn(["git", "branch", "-D", "fix/x"], weka.calls)

    def test_real_changes_keep_the_worktree_and_its_branch(self):
        weka = ScriptedGitWeka(
            [("/repo/.worktrees/t_x", "fix/x")],
            {"/repo/.worktrees/t_x": "?? notes.txt\n M src/a.ts\n"},
        )

        weka.cleanup_branch("fix/x", merged=True)

        self.assertEqual(weka.removed, [])
        self.assertNotIn(["git", "branch", "-D", "fix/x"], weka.calls)

    def test_the_main_checkout_is_never_removed(self):
        main = weka_webhook.REPO_ROOT
        weka = ScriptedGitWeka([(main, "fix/x")], {main: ""})

        weka.cleanup_branch("fix/x", merged=True)

        self.assertEqual(weka.removed, [])
        self.assertNotIn(["git", "branch", "-D", "fix/x"], weka.calls)


class SweepTests(unittest.TestCase):
    """The backstop for close events the service never saw lives in
    `scripts/cleanup-worktrees.py` — its own tests are next to it."""

    def test_the_webhook_has_no_sweep_mode_of_its_own(self):
        # The service has one job: turn events into cards and clean up after the
        # close event it was given. A maintenance pass of the whole checkout is a
        # different purpose, and lives in its own script so this one stays a
        # bridge rather than a toolbox.
        self.assertFalse(hasattr(weka_webhook.Weka, "sweep_worktrees"))


if __name__ == "__main__":
    unittest.main()
