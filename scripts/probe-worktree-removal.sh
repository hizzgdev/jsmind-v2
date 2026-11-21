#!/usr/bin/env bash
# What does `git worktree remove` actually refuse?
#
# Run this instead of recalling the answer. It builds a throwaway repo and asks
# git the four cases that matter for worker cleanup. Everything lives in mktemp
# and is deleted on exit, so it is safe to run at any time, from anywhere.
#
# Expected: ignored content (symlink or directory) is REMOVED without --force;
# a stray untracked file and a tracked edit are REFUSED. That split is the whole
# reason a cleanup script needs no list of "build artifact" names.
# Exits non-zero when git answers differently from those expectations, so CI can
# run it: the day a git release changes the rule, this fails instead of the
# cleanup silently leaving worktrees behind.
set -u

ROOT=$(mktemp -d "${TMPDIR:-/tmp}/wt-probe.XXXXXX") || exit 1
trap 'rm -rf "$ROOT"' EXIT

cd "$ROOT" || exit 1
git init -q -b main repo
git -C repo config user.email probe@example.invalid
git -C repo config user.name probe
cd repo || exit 1

# Bare names on purpose: `node_modules/` would match a directory only, which is
# exactly the bug this probe exists to keep in view.
printf 'node_modules\ndist\n' > .gitignore
echo tracked > tracked.txt
git add .gitignore tracked.txt
git commit -qm init

failures=0

# probe <case> <setup> <expected>
probe() {
    local name=$1 setup=$2 expected=$3 verdict
    git worktree add -q "../wt-$name" -b "probe/$name" || return 1
    ( cd "../wt-$name" && eval "$setup" )
    if git worktree remove "../wt-$name" 2>/dev/null; then
        verdict=REMOVED
    else
        verdict=REFUSED
        git worktree remove --force "../wt-$name" 2>/dev/null
    fi
    git branch -D "probe/$name" >/dev/null 2>&1
    if [ "$verdict" = "$expected" ]; then
        echo "ok       $name: $verdict"
    else
        echo "MISMATCH $name: $verdict (expected $expected)" >&2
        failures=$((failures + 1))
    fi
}

probe ignored-symlink 'ln -s /usr node_modules'              REMOVED
probe ignored-dir     'mkdir -p dist && echo x > dist/a.js'   REMOVED
probe stray-file      'echo scratch > notes.txt'              REFUSED
probe tracked-edit    'echo change >> tracked.txt'            REFUSED

if [ "$failures" -ne 0 ]; then
    echo "$failures case(s) disagree with the documented rule" >&2
    exit 1
fi
echo "all four cases match: .gitignore decides what git calls work"
