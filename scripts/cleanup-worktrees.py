#!/usr/bin/env python3
"""Remove worker worktrees and local branches whose work is already merged.

The webhook deletes a worktree when GitHub tells it a pull request closed. That
is the primary path and this script is not part of it: it exists for the case
the event cannot cover — a delivery that was acked after the cleanup inside it
failed, or one that never arrived — so the state on disk can be reconciled by
hand without teaching the service a second purpose.

Two things make a worktree removable, and both have to hold:

- **nothing but build output inside it**: a dependency symlink, `dist/`, `_site/`.
  A worktree holding a real modification or a stray file is left alone and named,
  because nothing here can tell a finished task from one that is running right
  now.
- **the work is already on master**: the branch is gone from origin, or GitHub
  reports a merged pull request for it.

Usage:

    python3 scripts/cleanup-worktrees.py            # merged work only
    python3 scripts/cleanup-worktrees.py --dry-run  # say what would go
    python3 scripts/cleanup-worktrees.py --all      # ignore the merge check

`--all` still refuses a worktree with anything other than build output in it. It
is for the case where the branch was deleted from origin without a merge (a PR
closed unmerged, a stray experiment) and you have decided the directory is dead.

Standard library only, and it never touches the main checkout.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def run(cmd: list[str]) -> tuple[int, str]:
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO_ROOT)
    return result.returncode, (result.stdout or result.stderr or "").strip()


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


def merged_pr(branch: str) -> int | None:
    """Number of the merged PR whose head is `branch`, if GitHub knows one."""
    rc, out = run(
        ["gh", "pr", "list", "--head", branch, "--state", "merged",
         "--json", "number", "--jq", ".[0].number // empty"]
    )
    if rc != 0:
        print(f"[WARN] cannot ask GitHub about {branch}: {out}", file=sys.stderr)
        return None
    return int(out) if out.strip().isdigit() else None


def gone_from_origin(branch: str) -> bool:
    rc, _ = run(["git", "ls-remote", "--exit-code", "--heads", "origin", branch])
    return rc != 0


def clean(dry_run: bool, everything: bool) -> int:
    rc, listing = run(["git", "worktree", "list", "--porcelain"])
    if rc != 0:
        print(f"[ERROR] git worktree list failed: {listing}", file=sys.stderr)
        return 1

    removed = 0
    for path, branch in parse_worktrees(listing):
        if os.path.realpath(path) == os.path.realpath(REPO_ROOT):
            continue  # the main checkout is not ours to delete
        if branch is None:
            print(f"[INFO] skipping {path}: detached HEAD", file=sys.stderr)
            continue

        if not everything:
            number = merged_pr(branch)
            if number is None and not gone_from_origin(branch):
                print(f"[INFO] keeping {path}: {branch} is still open on origin")
                continue

        if dry_run:
            print(f"[DRY] would remove {path} and branch {branch}")
            removed += 1
            continue
        # No --force: git refuses a worktree holding a modification or an
        # untracked path, and removes one whose untracked content is ignored.
        # That is the line this script wants, and it is git's to draw.
        rc, out = run(["git", "worktree", "remove", path])
        if rc != 0:
            print(f"[KEEP] {path}: {out}")
            continue
        print(f"[OK] removed worktree {path}")
        rc, out = run(["git", "branch", "-D", branch])
        if rc != 0:
            print(f"[WARN] branch delete failed for {branch}: {out}", file=sys.stderr)
            continue
        print(f"[OK] deleted local branch {branch}")
        removed += 1

    if not dry_run:
        run(["git", "fetch", "--prune", "origin"])
    print(f"[OK] done: {removed} worktree(s) removed")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Remove worker worktrees and local branches whose work is already merged."
    )
    parser.add_argument("--dry-run", action="store_true", help="print decisions, change nothing")
    parser.add_argument(
        "--all",
        action="store_true",
        help="skip the merge check (a worktree with real changes is still kept)",
    )
    args = parser.parse_args()
    raise SystemExit(clean(args.dry_run, args.all))


if __name__ == "__main__":
    main()
