#!/usr/bin/env bash
# Flip a PR from "an AI is reviewing this" to "reviewed, the human's turn".
#
# One ordering rule decides everything: strip the flow labels the review owned,
# add `weka-reviewed`, and only then turn the draft into ready. A cleanup that
# fails half-way has to leave the PR in draft, because draft plus
# `weka-working` reads as "the AI is still on it", while ready plus
# `weka-working` tells a human to review work nobody cleaned up after.
#
# The label deletion is guarded by a read: `DELETE` on an absent label answers
# 404 and exits 1, so a re-run (the flips are not atomic, and this script may be
# run twice) would call "already removed" a failure and wait forever for a
# status that never comes. Reading first is what makes the re-run idempotent.
#
# usage: bash scripts/weka/pass-review.sh <pr-number>

set -uo pipefail

pr="${1:-}"
if [ -z "$pr" ]; then
    echo "usage: bash scripts/weka/pass-review.sh <pr-number>" >&2
    exit 2
fi

repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner) \
    || { echo "pass-review: could not resolve the repository" >&2; exit 1; }

# One read, up front. If it fails, touch nothing: a cleanup that never looked is
# not a cleanup, and a blind `gh pr ready` would announce a review that was not
# finished.
labels=$(gh api "repos/$repo/issues/$pr" --jq '.labels[].name') || {
    echo "pass-review: could not read the labels of #$pr; nothing was touched" >&2
    exit 1
}

has_label() {
    printf '%s\n' "$labels" | grep -qx "$1"
}

status=0

if has_label weka-reviewing; then
    gh api -X DELETE "repos/$repo/issues/$pr/labels/weka-reviewing" || status=1
fi

# Adding is idempotent: GitHub answers 200 when the label is already there.
gh api -X POST "repos/$repo/issues/$pr/labels" -f labels[]=weka-reviewed || status=1

# Cody adds this when it opens the PR and again when a rework starts, so it is
# normally present. An older PR, or one whose worker died before adding it, is a
# no-op rather than a failure.
if has_label weka-working; then
    gh api -X DELETE "repos/$repo/issues/$pr/labels/weka-working" || status=1
fi

if [ "$status" -ne 0 ]; then
    echo "pass-review: cleanup failed; #$pr stays in draft. Fix and run again." >&2
    exit 1
fi

# The one draft -> ready flip in the whole flow.
gh pr ready "$pr" || {
    echo "pass-review: labels are clean but the flip failed; #$pr is still draft" >&2
    exit 1
}

echo "pass-review: #$pr is ready for the human"
