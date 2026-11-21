#!/usr/bin/env python3
"""Tests for scripts/cleanup-worktrees.py.

Standard library only. Run from the repository root:

    python3 -m unittest discover -s scripts -p 'test_*.py'

The decisions worth pinning: build litter is never a reason to keep a directory,
anything else is, and neither the merge check nor `--all` can talk the script
into deleting the main checkout or a running task's work.
"""
import importlib.util
import os
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))


def _load_cleaner():
    """Import `cleanup-worktrees.py`, whose name is not a valid module name."""
    path = os.path.join(HERE, "cleanup-worktrees.py")
    spec = importlib.util.spec_from_file_location("cleanup_worktrees", path)
    assert spec is not None and spec.loader is not None, f"cannot load {path}"
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


cleaner = _load_cleaner()

LISTING = "\n\n".join(
    [
        "worktree /repo\nHEAD 1111111\nbranch refs/heads/master",
        "worktree /repo/.worktrees/t_a\nHEAD 2222222\nbranch refs/heads/fix/a",
        "worktree /repo/.worktrees/t_detached\nHEAD 3333333\ndetached",
    ]
)


class ParseWorktreesTests(unittest.TestCase):
    def test_blocks_are_paired_with_their_branch(self):
        self.assertEqual(
            cleaner.parse_worktrees(LISTING),
            [
                ("/repo", "master"),
                ("/repo/.worktrees/t_a", "fix/a"),
                ("/repo/.worktrees/t_detached", None),
            ],
        )


class GitignoreCoversWhatWorkersLeaveTests(unittest.TestCase):
    """The cleanup trusts git's dirty check, so `.gitignore` is the whole policy.

    What this pins: the paths a worker actually leaves behind are ignored, and
    ignored by a pattern that matches a symlink as well as a directory.
    """

    def _rules(self):
        # Resolved from this file, not from REPO_ROOT: a test that fakes the
        # checkout root must not be able to point this at nothing.
        path = os.path.join(HERE, os.pardir, ".gitignore")
        with open(path, encoding="utf-8") as handle:
            return [
                line.strip()
                for line in handle
                if line.strip() and not line.strip().startswith("#")
            ]

    WORKER_LEFTOVERS = ("node_modules", "dist", "_site", "coverage")

    def test_every_leftover_is_ignored(self):
        rules = self._rules()
        for name in self.WORKER_LEFTOVERS:
            self.assertIn(name, rules, f"{name} would block a worktree removal")

    def test_no_rule_depends_on_a_trailing_slash(self):
        # `name/` matches a directory only. A worker's `node_modules` symlink is
        # not a directory, so it surfaced as untracked and pinned the worktree —
        # the bug this whole change exists for.
        rules = self._rules()
        for name in self.WORKER_LEFTOVERS:
            self.assertNotIn(f"{name}/", rules, f"{name}/ does not match a symlink")


class CleanTests(unittest.TestCase):
    """`clean()` with git and gh scripted, so each decision is visible."""

    def setUp(self):
        self.calls = []
        self.removed = []
        self.worktrees = [("/repo/.worktrees/t_a", "fix/a")]
        self.remove_fails = False
        self.origin_alive = set()
        self.merged = {"fix/a": 99}
        self._saved = (cleaner.run, cleaner.REPO_ROOT)

        def fake_run(cmd):
            self.calls.append(cmd)
            if cmd[:3] == ["git", "worktree", "list"]:
                blocks = ["worktree /repo\nbranch refs/heads/master"]
                for path, branch in self.worktrees:
                    blocks.append(f"worktree {path}\nHEAD 22\nbranch refs/heads/{branch}")
                return 0, "\n\n".join(blocks)
            if cmd[:3] == ["git", "worktree", "remove"]:
                if self.remove_fails:
                    return 1, "fatal: contains modified or untracked files"
                self.removed.append(cmd[-1])
                return 0, ""
            if cmd[:2] == ["git", "branch"]:
                self.removed.append(cmd[-1])
                return 0, ""
            if cmd[:2] == ["git", "ls-remote"]:
                return (0, "") if cmd[-1] in self.origin_alive else (2, "")
            if cmd[:3] == ["gh", "pr", "list"]:
                number = self.merged.get(cmd[cmd.index("--head") + 1])
                return 0, (str(number) if number else "")
            return 0, ""

        setattr(cleaner, "run", fake_run)
        setattr(cleaner, "REPO_ROOT", "/repo")

    def tearDown(self):
        setattr(cleaner, "run", self._saved[0])
        setattr(cleaner, "REPO_ROOT", self._saved[1])

    def test_a_merged_worktree_git_accepts_removing_is_removed(self):
        self.assertEqual(cleaner.clean(dry_run=False, everything=False), 0)
        self.assertEqual(self.removed, ["/repo/.worktrees/t_a", "fix/a"])

    def test_a_dry_run_changes_nothing(self):
        cleaner.clean(dry_run=True, everything=False)
        self.assertEqual(self.removed, [])

    def test_a_worktree_git_refuses_is_kept(self):
        self.remove_fails = True
        self.assertEqual(cleaner.clean(dry_run=False, everything=False), 0)
        self.assertEqual(self.removed, [])

    def test_an_open_branch_is_kept_without_the_merge_check(self):
        self.origin_alive = {"fix/a"}
        self.merged = {}
        cleaner.clean(dry_run=False, everything=False)
        self.assertEqual(self.removed, [])

    def test_all_skips_the_merge_check_only(self):
        self.origin_alive = {"fix/a"}
        self.merged = {}
        cleaner.clean(dry_run=False, everything=True)
        self.assertEqual(self.removed, ["/repo/.worktrees/t_a", "fix/a"])

    def test_the_main_checkout_is_never_touched(self):
        self.worktrees = [("/repo", "master")]
        cleaner.clean(dry_run=False, everything=True)
        self.assertEqual(self.removed, [])


if __name__ == "__main__":
    unittest.main()
