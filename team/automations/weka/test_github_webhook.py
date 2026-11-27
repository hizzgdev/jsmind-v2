#!/usr/bin/env python3
"""Regression tests for the weka webhook: a human request is never dropped.

Standard library only, like the script under test. Run from the repository root:

    python3 -m unittest discover -s team/automations/weka -p 'test_*.py'

The invariant these tests pin down: a human comment on a PR that carries
`weka-reviewed` must end in a new card, a comment on the PR's open card, or a
comment on the PR explaining why neither happened; a human comment on a `weka`
issue must end in a card for whoever is assigned, or a comment on the issue
saying why not. "Nothing happened" is the bug, so every assertion here is about
a side effect, never about a log line.
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
ISSUE_NUMBER = 223
ISSUE_TITLE = "Deliver GitHub comments to cards in every state"
CONFIG = {
    "target_label": "weka",
    "assignee": "cody",
    "human_login": "hizzgdev",
    "bot_login": "zzgbot",
    "kanban_board": "test-board",
}
GROOM = {"groom_board": "groom-board", "groom_assignee": "scout"}


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


def review_payload(state="changes_requested", number=PR_NUMBER, review_id=9):
    """A `pull_request_review.submitted` payload from the human."""
    payload = pr_payload(number=number)
    payload["action"] = "submitted"
    payload["review"] = {
        "id": review_id,
        "state": state,
        "body": "please fix the spacing on the right side",
        "html_url": f"https://github.com/hizzgdev/jsmind-v2/pull/{number}#pullrequestreview-{review_id}",
        "user": {"login": "hizzgdev"},
    }
    return payload


def inline_payload(path="src/arranger.ts", line=42, number=PR_NUMBER, comment_id=5):
    """A `pull_request_review_comment.created` payload from the human."""
    payload = pr_payload(number=number)
    payload["action"] = "created"
    payload["comment"] = {
        "id": comment_id,
        "body": "this line reads wrong",
        "path": path,
        "line": line,
        "user": {"login": "hizzgdev"},
        "html_url": f"https://github.com/hizzgdev/jsmind-v2/pull/{number}#discussion_r{comment_id}",
    }
    return payload


def issue_payload(assignees=("hizzgdev",), labels=("weka",), state="open", number=ISSUE_NUMBER):
    """The slice of a GitHub issue payload the issue-comment path reads."""
    return {
        "number": number,
        "title": ISSUE_TITLE,
        "html_url": f"https://github.com/hizzgdev/jsmind-v2/issues/{number}",
        "state": state,
        "labels": [{"name": name} for name in labels],
        "assignees": [{"login": login} for login in assignees],
    }


def issue_comment_payload(body="这一段需求再确认一下", *, assignees=("hizzgdev",),
                          labels=("weka",), state="open", login="hizzgdev",
                          comment_id=77, number=ISSUE_NUMBER):
    """An `issue_comment.created` payload for a comment on a plain issue.

    No `pull_request` key on the issue: that absence is exactly what used to
    make `handle_issue_comment` return before doing anything.
    """
    return {
        "action": "created",
        "issue": issue_payload(assignees=assignees, labels=labels, state=state, number=number),
        "comment": {
            "id": comment_id,
            "body": body,
            "user": {"login": login},
            "html_url": f"https://github.com/hizzgdev/jsmind-v2/issues/{number}#issuecomment-{comment_id}",
        },
    }


def closed_pr_payload(merged=True, labels=("weka", "weka-reviewed"), number=PR_NUMBER):
    """A `pull_request.closed` payload: the slice `handle_pr` reads."""
    payload = pr_payload(labels=labels, state="closed", number=number, action="closed")
    payload["pull_request"]["merged"] = merged
    payload["sender"] = {"login": "hizzgdev"}
    return payload


class FakeWeka(weka_webhook.Weka):
    """A Weka that records its side effects instead of performing them."""

    def __init__(self, cards=(), busy=(), kanban_ok=True, groom_cards=(), config=None):
        super().__init__({**CONFIG, **(config or {})})
        self.cards = list(cards)              # values open_card_for() should return
        self.groom_cards = list(groom_cards)  # the same, on the groom board
        self.busy = list(busy)                # values busy_cards() should return
        self.kanban_ok = kanban_ok
        self.kanban_calls = []
        self.board_calls = []                 # (args, board) for every kanban call
        self.object_comments = []             # (number, body) visible on GitHub

    def kanban(self, *args, board=None):
        self.kanban_calls.append(args)
        self.board_calls.append((args, board))
        return self.kanban_ok

    def open_card_for(self, number, board=None):
        # Any board argument is the groom board here; None is the flow's own.
        pool = self.groom_cards if board else self.cards
        return pool[0] if pool else None

    def open_groom_card(self):
        # One stream on the groom board: the first entry stands for it.
        return self.groom_cards[0] if self.groom_cards else None

    def busy_cards(self):
        return self.busy

    def comment_on_object(self, number, body):
        self.object_comments.append((number, body))
        return True

    def _run(self, cmd):
        # A subprocess here means a test run would post to GitHub or touch git:
        # every method that reaches out has to be intercepted explicitly.
        raise AssertionError(f"FakeWeka must not run a subprocess: {cmd}")

    # -- assertions helpers --------------------------------------------------

    def creates(self):
        return [call for call in self.kanban_calls if call[0] == "create"]

    def card_comments(self):
        return [call for call in self.kanban_calls if call[0] == "comment"]

    def comment_boards(self):
        return [board for args, board in self.board_calls if args[0] == "comment"]

    def create_boards(self):
        return [board for args, board in self.board_calls if args[0] == "create"]

    def create_keys(self):
        return [args[args.index("--idempotency-key") + 1] for args in self.creates()]

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
            f"the human request; calls={weka.kanban_calls} comments={weka.object_comments}",
        )
        self.assertTrue(creates[0][1].startswith(f"#{PR_NUMBER}: Rework — "), creates[0][1])
        self.assertEqual(weka.object_comments, [], "a created card needs no excuse on the PR")

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
            weka.object_comments,
            "hermes kanban create returned False; the request is in no queue, so the PR "
            "must say so instead of nothing",
        )
        self.assertIn("返工卡失败", weka.object_comments[0][1])
        self.assertEqual(weka.object_comments[0][0], PR_NUMBER)

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
        self.assertTrue(weka.object_comments, "the kept gate must explain itself on the PR")
        self.assertIn("weka-reviewed", weka.object_comments[0][1])

    def test_an_unrelated_pr_is_not_replied_to(self):
        weka = FakeWeka()
        payload = pr_payload(labels=("bug",), number=77)

        weka._create_rework_card(
            payload, event="issue_comment.created", actor="hizzgdev",
            text="thanks", ref_url="", idem_key="k",
        )

        self.assertEqual(weka.creates(), [])
        self.assertEqual(weka.object_comments, [], "weka must not comment on PRs it never owned")

    def test_a_closed_pr_is_not_replied_to(self):
        weka = FakeWeka()
        payload = pr_payload(labels=("weka",), state="closed")

        weka._create_rework_card(
            payload, event="issue_comment.created", actor="hizzgdev",
            text="thanks for the fix", ref_url="", idem_key="k",
        )

        self.assertEqual(weka.object_comments, [], "a merged PR has nothing left to rework")


class AnOpenCardAbsorbsTheCommentTests(unittest.TestCase):
    def test_the_open_card_receives_the_feedback_text(self):
        weka = FakeWeka(cards=[("t_rework", "running")])

        weka.trigger(text="the label on line 42 is wrong")

        self.assertEqual(weka.creates(), [], "one open card per number: no second card")
        comments = weka.card_comments()
        self.assertEqual(len(comments), 1)
        self.assertEqual(comments[0][1], "t_rework")
        self.assertIn("the label on line 42 is wrong", comments[0][2])
        self.assertEqual(weka.comment_boards(), [None],
                         "a PR card lives on this flow's board, so no --board override")

    def test_a_card_still_absorbs_the_comment_after_the_label_was_stripped(self):
        """cody strips weka-reviewed on pickup, so the label cannot gate this."""
        weka = FakeWeka(cards=[("t_rework", "running")])
        payload = pr_payload(labels=("weka",))

        weka._create_rework_card(
            payload, event="issue_comment.created", actor="hizzgdev",
            text="and this one too", ref_url="", idem_key="k",
        )

        self.assertEqual(len(weka.card_comments()), 1)
        self.assertEqual(weka.object_comments, [], "no refusal note: the request was absorbed")

    def test_a_failed_append_is_reported_on_the_pr(self):
        weka = FakeWeka(cards=[("t_rework", "running")], kanban_ok=False)

        weka.trigger()

        self.assertTrue(weka.object_comments, "the comment on the card failed too: say it on the PR")


class IssueCommentRoutingTests(unittest.TestCase):
    """A comment on a plain issue used to leave `handle_issue_comment` at once."""

    def test_a_human_assigned_issue_creates_a_scout_card_on_the_groom_board(self):
        weka = FakeWeka(config=GROOM)

        weka.handle_issue_comment(issue_comment_payload())

        creates = weka.creates()
        self.assertEqual(len(creates), 1, weka.kanban_calls)
        create = creates[0]
        self.assertEqual(create[1], f"#{ISSUE_NUMBER}: {ISSUE_TITLE}")
        self.assertEqual(create[create.index("--assignee") + 1], "scout")
        self.assertEqual(weka.create_boards(), ["groom-board"])
        self.assertIn("这一段需求再确认一下", create[create.index("--body") + 1])
        self.assertNotIn(
            "--workspace", create,
            "a conversation about an issue is not a code task: no checkout of the repo",
        )
        self.assertEqual(weka.object_comments, [], "a created card needs no excuse")

    def test_an_unconfigured_groom_branch_is_skipped_with_a_trace(self):
        weka = FakeWeka()          # no groom_board / groom_assignee

        weka.handle_issue_comment(issue_comment_payload())

        self.assertEqual(weka.creates(), [], "the branch stays off until it is configured")
        self.assertEqual(len(weka.object_comments), 1)
        self.assertEqual(weka.object_comments[0][0], ISSUE_NUMBER)
        self.assertIn("groom_board", weka.object_comments[0][1])

    def test_a_bot_assigned_issue_reuses_the_rework_path(self):
        weka = FakeWeka()

        weka.handle_issue_comment(issue_comment_payload(assignees=("zzgbot",)))

        creates = weka.creates()
        self.assertEqual(len(creates), 1, weka.kanban_calls)
        create = creates[0]
        self.assertTrue(create[1].startswith(f"#{ISSUE_NUMBER}: Rework — "), create[1])
        self.assertEqual(create[create.index("--assignee") + 1], "cody")
        self.assertEqual(weka.create_boards(), [None], "the implementation board")
        self.assertIn("--project", create, "an implementation card still gets a worktree")
        self.assertEqual(weka.object_comments, [])

    def test_an_unassigned_issue_gets_a_trace_and_no_card(self):
        weka = FakeWeka(config=GROOM)

        weka.handle_issue_comment(issue_comment_payload(assignees=()))

        self.assertEqual(weka.creates(), [])
        self.assertEqual(len(weka.object_comments), 1)
        note = weka.object_comments[0][1]
        self.assertIn("zzgbot", note)
        self.assertIn("hizzgdev", note)

    def test_an_issue_without_the_label_stays_silent(self):
        weka = FakeWeka(config=GROOM)

        weka.handle_issue_comment(issue_comment_payload(labels=("bug",)))

        self.assertEqual(weka.kanban_calls, [])
        self.assertEqual(
            weka.object_comments, [],
            "weka does not answer a thread nobody handed to it",
        )

    def test_a_closed_issue_without_a_card_creates_nothing(self):
        weka = FakeWeka(config=GROOM)

        weka.handle_issue_comment(issue_comment_payload(state="closed"))

        self.assertEqual(weka.kanban_calls, [])
        self.assertEqual(
            weka.object_comments, [],
            "a closed issue has no next step for the human to take",
        )

    def test_an_open_card_absorbs_the_issue_comment(self):
        weka = FakeWeka(cards=[("t_issue", "running")], config=GROOM)

        weka.handle_issue_comment(issue_comment_payload())

        self.assertEqual(weka.creates(), [], "one open card per number: no second card")
        comments = weka.card_comments()
        self.assertEqual(len(comments), 1)
        self.assertEqual(comments[0][1], "t_issue")
        self.assertIn("这一段需求再确认一下", comments[0][2])

    def test_a_card_still_absorbs_the_comment_after_the_label_was_stripped(self):
        """The card lookup is before the label gate, like the PR path's."""
        weka = FakeWeka(cards=[("t_issue", "running")], config=GROOM)

        weka.handle_issue_comment(issue_comment_payload(labels=("bug",)))

        self.assertEqual(weka.creates(), [], "the running card owns the number")
        self.assertEqual(weka.card_comments()[0][1], "t_issue")
        self.assertEqual(weka.object_comments, [], "no refusal note: the card took the comment")

    def test_a_closed_issue_keeps_feeding_the_card_that_is_still_open(self):
        """`Closes #N` closes the issue while the work is still on the board."""
        weka = FakeWeka(cards=[("t_issue", "review")], config=GROOM)

        weka.handle_issue_comment(issue_comment_payload(state="closed"))

        self.assertEqual(weka.creates(), [])
        self.assertEqual(weka.card_comments()[0][1], "t_issue")

    def test_the_groom_card_takes_a_comment_on_a_closed_issue(self):
        weka = FakeWeka(groom_cards=[("t_scout", "running")], config=GROOM)

        weka.handle_issue_comment(issue_comment_payload(state="closed"))

        self.assertEqual(weka.creates(), [], "the scout card on its board owns the number")
        self.assertEqual(weka.card_comments()[0][1], "t_scout")
        self.assertEqual(
            weka.comment_boards(), [GROOM["groom_board"]],
            "the comment is addressed at the board the card was found on; the CLI "
            "resolves the task inside that board's own database",
        )
        self.assertEqual(weka.object_comments, [], "no false 'append failed' trace")

    def test_the_implementation_card_wins_when_both_boards_hold_one(self):
        weka = FakeWeka(cards=[("t_issue", "running")],
                        groom_cards=[("t_scout", "running")], config=GROOM)

        weka.handle_issue_comment(issue_comment_payload())

        self.assertEqual(weka.card_comments()[0][1], "t_issue",
                         "the card that is writing code hears the human first")
        self.assertEqual(weka.comment_boards(), [None],
                         "the implementation card lives on this flow's board")

    def test_a_second_comment_continues_the_groom_conversation(self):
        weka = FakeWeka(groom_cards=[("t_scout", "blocked")], config=GROOM)

        weka.handle_issue_comment(issue_comment_payload())

        self.assertEqual(weka.creates(), [], "the scout card on its board owns the number")
        self.assertEqual(weka.card_comments()[0][1], "t_scout")
        self.assertEqual(weka.comment_boards(), [GROOM["groom_board"]])

    def test_a_failed_scout_create_is_reported_on_the_issue(self):
        weka = FakeWeka(kanban_ok=False, config=GROOM)

        weka.handle_issue_comment(issue_comment_payload())

        self.assertTrue(weka.object_comments, "the request is in no queue: say so on the issue")
        self.assertIn("groom 卡失败", weka.object_comments[0][1])

    def test_weka_does_not_answer_its_own_trace_on_an_issue(self):
        weka = FakeWeka(config=GROOM)
        payload = issue_comment_payload(f"{weka_webhook.TRACE_MARKER}\n这条评论没有进卡")

        weka.handle_issue_comment(payload)

        self.assertEqual(weka.kanban_calls, [])
        self.assertEqual(weka.object_comments, [])

    def test_a_comment_from_someone_else_is_ignored(self):
        weka = FakeWeka(config=GROOM)

        weka.handle_issue_comment(issue_comment_payload(login="randomuser"))

        self.assertEqual(weka.kanban_calls, [])
        self.assertEqual(weka.object_comments, [])


class DedupeWeka(FakeWeka):
    """Models `hermes kanban create --idempotency-key` and the card it leaves.

    `create_task()` returns the existing task instead of a duplicate, and the CLI
    exits 0 for that, which is why a redelivery must not read as a failure.

    The card the first delivery created is open by the time the second arrives,
    so `open_card_for()` has to see it — that is what the second delivery
    actually does, and it is how the note below gets appended.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.keys = set()
        self.created_titles = []

    def kanban(self, *args, board=None):
        if args[0] == "create":
            key = args[args.index("--idempotency-key") + 1]
            if key in self.keys:
                return True
            self.keys.add(key)
            self.created_titles.append(args[1])
            # `board=None` is this flow's own board; anything else is the groom board.
            pool = self.groom_cards if board else self.cards
            pool.append((f"t_created_{len(self.created_titles)}", "ready"))
        return super().kanban(*args, board=board)


class RedeliveryTests(unittest.TestCase):
    """A redelivered comment must not create a second card.

    What it does do is append a second note: by the time GitHub redelivers, the
    card from the first delivery is open, so the delivery lands on the
    "already has a card" branch. The idempotency key guards the create, not the
    append — the known limit the README records, pinned here so nobody reads the
    class name as a stronger promise.
    """

    def test_a_redelivered_issue_comment_creates_one_card_and_repeats_the_note(self):
        weka = DedupeWeka(config=GROOM)
        payload = issue_comment_payload()

        weka.handle_issue_comment(payload)
        weka.handle_issue_comment(payload)

        self.assertEqual(len(weka.created_titles), 1, weka.kanban_calls)
        self.assertEqual(weka.create_keys()[0], f"gh-issue-{ISSUE_NUMBER}-comment-77")
        self.assertEqual(weka.object_comments, [], "a deduplicated create is not a failure")
        # Second delivery: one note on the card the first one created, on the
        # board that card lives on.
        self.assertEqual(len(weka.card_comments()), 1, weka.kanban_calls)
        self.assertIn("这一段需求再确认一下", weka.card_comments()[0][2])
        self.assertEqual(weka.comment_boards(), ["groom-board"])


class ClosedPRWeka(FakeWeka):
    """FakeWeka that records the close-path side effects instead of running them.

    `close_events` is one ordered list across all three steps on purpose: the
    order between cleanup and the groom card is itself the contract (a card that
    cannot be created must not cost the worktree removal that precedes it), and
    three separate lists would let the calls be swapped without a red test.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.cleaned = []
        self.stripped = []
        self.close_events = []

    def cleanup_branch(self, branch, merged):
        self.close_events.append("cleanup")
        self.cleaned.append((branch, merged))

    def strip_labels(self, number, labels):
        self.close_events.append("strip")
        self.stripped.append((number, tuple(labels)))

    def _queue_groom_for_pr(self, number, pr, payload, labels):
        self.close_events.append("create")
        return super()._queue_groom_for_pr(number, pr, payload, labels)


class GroomAfterPRCloseTests(unittest.TestCase):
    """A close is the moment to plan the next round: one scout card lands.

    Merged or abandoned, the close is what moves the repository on, so the next
    step is planned from the state it left behind rather than from an event that
    only fires on success.
    """

    def test_a_merged_pr_queues_a_scout_card_on_the_groom_board(self):
        weka = ClosedPRWeka(config=GROOM)

        weka.handle_pr(closed_pr_payload(merged=True))

        creates = weka.creates()
        self.assertEqual(len(creates), 1, weka.kanban_calls)
        create = creates[0]
        self.assertEqual(create[1], f"#{PR_NUMBER}: Groom — {PR_TITLE}")
        self.assertEqual(create[create.index("--assignee") + 1], "scout")
        self.assertEqual(weka.create_boards(), [GROOM["groom_board"]])
        self.assertEqual(weka.create_keys(), [f"gh-pr-{PR_NUMBER}-closed"])
        self.assertNotIn(
            "--workspace", create,
            "scout reads documents and writes an issue: a checkout of this repo buys nothing",
        )
        body = create[create.index("--body") + 1]
        self.assertIn(f"pull/{PR_NUMBER}", body)
        self.assertIn("merged: true", body)
        self.assertIn("SOUL.scout.md", body)
        self.assertEqual(weka.object_comments, [], "a created card needs no excuse on the PR")

    def test_cleanup_runs_before_the_groom_card(self):
        weka = ClosedPRWeka(config=GROOM)

        weka.handle_pr(closed_pr_payload())

        self.assertEqual(weka.cleaned, [("fix/arranger-cousin-spacing", True)])
        self.assertEqual(weka.stripped, [(PR_NUMBER, ("weka", "weka-reviewed"))])
        self.assertEqual(
            weka.close_events, ["cleanup", "strip", "create"],
            "cleanup must land before the card create: the branches and labels are "
            "gone whatever the create does",
        )

    def test_a_closed_unmerged_pr_still_queues_a_scout_card(self):
        weka = ClosedPRWeka(config=GROOM)

        weka.handle_pr(closed_pr_payload(merged=False))

        creates = weka.creates()
        self.assertEqual(len(creates), 1, weka.kanban_calls)
        self.assertIn("merged: false", creates[0][creates[0].index("--body") + 1])

    def test_an_open_groom_card_absorbs_the_close_instead_of_a_second_lane(self):
        weka = ClosedPRWeka(groom_cards=[("t_scout", "running")], config=GROOM)

        weka.handle_pr(closed_pr_payload())

        self.assertEqual(weka.creates(), [], "one open groom card is the whole conversation")
        comments = weka.card_comments()
        self.assertEqual(len(comments), 1)
        self.assertEqual(comments[0][1], "t_scout")
        self.assertIn("merged=true", comments[0][2])
        self.assertEqual(
            weka.comment_boards(), [GROOM["groom_board"]],
            "the comment is addressed at the board the card was found on",
        )

    def test_the_implementation_card_does_not_absorb_the_next_round(self):
        """The card that owned the PR number is completed by the same close."""
        weka = ClosedPRWeka(cards=[("t_rework", "running")], config=GROOM)

        weka.handle_pr(closed_pr_payload())

        self.assertEqual(len(weka.creates()), 1)
        self.assertEqual(weka.create_boards(), [GROOM["groom_board"]])

    def test_an_unconfigured_groom_branch_stays_silent_on_the_pr(self):
        weka = ClosedPRWeka()

        weka.handle_pr(closed_pr_payload())

        self.assertEqual(weka.creates(), [], "the branch stays off until it is configured")
        self.assertEqual(
            weka.object_comments, [],
            "a close is not a human request to answer; a note here would be noise",
        )
        self.assertEqual(weka.cleaned, [("fix/arranger-cousin-spacing", True)],
                         "cleanup still happens with the groom branch off")

    def test_a_failed_groom_create_is_reported_on_the_pr(self):
        weka = ClosedPRWeka(kanban_ok=False, config=GROOM)

        weka.handle_pr(closed_pr_payload())

        self.assertTrue(weka.object_comments, "the next round is in no queue: say it")
        self.assertIn("groom 卡失败", weka.object_comments[0][1])
        self.assertEqual(weka.object_comments[0][0], PR_NUMBER)

    def test_a_non_close_action_queues_nothing(self):
        weka = ClosedPRWeka(config=GROOM)

        weka.handle_pr(pr_payload(action="edited"))

        self.assertEqual(weka.creates(), [])
        self.assertEqual(weka.cleaned, [])


class PRCommentRegressionTests(unittest.TestCase):
    """The three PR shapes keep producing exactly what they produced before."""

    def test_a_conversation_comment_creates_the_rework_card(self):
        weka = FakeWeka()

        weka.handle_issue_comment(comment_payload("please also handle the edge case"))

        creates = weka.creates()
        self.assertEqual(len(creates), 1)
        self.assertTrue(creates[0][1].startswith(f"#{PR_NUMBER}: Rework — "), creates[0][1])
        self.assertEqual(creates[0][creates[0].index("--idempotency-key") + 1],
                         f"gh-pr-{PR_NUMBER}-comment-1")
        body = creates[0][creates[0].index("--body") + 1]
        self.assertIn("## branch", body)
        self.assertIn("gh pr view", body)
        self.assertEqual(weka.create_boards(), [None])

    def test_a_submitted_review_creates_the_rework_card(self):
        weka = FakeWeka()

        weka.handle_pr_review(review_payload())

        creates = weka.creates()
        self.assertEqual(len(creates), 1)
        self.assertEqual(creates[0][creates[0].index("--idempotency-key") + 1],
                         f"gh-pr-{PR_NUMBER}-review-9")
        self.assertIn("pull_request_review.submitted (changes_requested)",
                      creates[0][creates[0].index("--body") + 1])

    def test_an_inline_comment_creates_the_rework_card(self):
        weka = FakeWeka()

        weka.handle_pr_review_comment(inline_payload())

        creates = weka.creates()
        self.assertEqual(len(creates), 1)
        self.assertEqual(creates[0][creates[0].index("--idempotency-key") + 1],
                         f"gh-pr-{PR_NUMBER}-review-comment-5")
        self.assertIn("src/arranger.ts:42", creates[0][creates[0].index("--body") + 1])

    def test_an_issue_payload_never_reaches_the_pr_path(self):
        """The fork is decided once, on `pull_request` being present."""
        weka = FakeWeka(config=GROOM)

        weka.handle_issue_comment(issue_comment_payload())

        self.assertEqual(
            [key for key in weka.create_keys() if key.startswith("gh-pr-")], [],
            "a plain issue must not be keyed as a PR",
        )


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

    def test_comment_on_object_posts_a_marked_body_via_gh(self):
        weka = weka_webhook.Weka(dict(CONFIG))
        weka._slug = "hizzgdev/jsmind-v2"
        weka._slug_known = True
        calls = []

        def fake_run(cmd):
            calls.append(cmd)
            return 0, ""

        weka._run = fake_run  # type: ignore[method-assign]
        weka.gh = "/usr/bin/gh"

        self.assertTrue(weka.comment_on_object(PR_NUMBER, "为什么没有建卡"))

        self.assertEqual(calls[0][:5], [
            "/usr/bin/gh", "api", "-X", "POST", "repos/hizzgdev/jsmind-v2/issues/151/comments",
        ])
        body = calls[0][calls[0].index("-f") + 1]
        self.assertTrue(body.startswith("body=" + weka_webhook.TRACE_MARKER))
        self.assertIn("为什么没有建卡", body)

    def test_a_comment_without_a_number_is_a_no_op_not_a_crash(self):
        weka = weka_webhook.Weka(dict(CONFIG))

        self.assertFalse(weka.comment_on_object(None, "x"))


class ScriptedGitWeka(weka_webhook.Weka):
    """A Weka whose git/gh calls are scripted, so a cleanup decision is testable."""

    def __init__(self, worktrees, remove_fails=()):
        super().__init__(dict(CONFIG))
        self.calls = []
        self.worktrees = list(worktrees)          # [(path, branch)]
        self.remove_fails = set(remove_fails)     # paths git refuses to remove
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
        if cmd[:3] == ["git", "worktree", "remove"]:
            path = cmd[-1]
            if path in self.remove_fails:
                return 1, f"fatal: '{path}' contains modified or untracked files, use --force to delete it"
            self.removed.append(path)
            return 0, ""
        return 0, ""


class WorktreeCleanupTests(unittest.TestCase):
    """A close event must actually remove the worktree it is responsible for."""

    def test_a_worktree_git_accepts_removing_is_removed(self):
        # `git worktree remove` succeeds when the only untracked content is
        # ignored, so no name list of ours has to know what build litter is.
        weka = ScriptedGitWeka([("/repo/.worktrees/t_x", "fix/x")])

        weka.cleanup_branch("fix/x", merged=True)

        self.assertEqual(weka.removed, ["/repo/.worktrees/t_x"])
        self.assertIn(["git", "branch", "-D", "fix/x"], weka.calls)

    def test_a_worktree_git_refuses_keeps_the_worktree_and_its_branch(self):
        weka = ScriptedGitWeka([("/repo/.worktrees/t_x", "fix/x")], remove_fails={"/repo/.worktrees/t_x"})

        weka.cleanup_branch("fix/x", merged=True)

        self.assertEqual(weka.removed, [])
        self.assertNotIn(["git", "branch", "-D", "fix/x"], weka.calls)

    def test_the_main_checkout_is_never_removed(self):
        main = weka_webhook.REPO_ROOT
        weka = ScriptedGitWeka([(main, "fix/x")])

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
