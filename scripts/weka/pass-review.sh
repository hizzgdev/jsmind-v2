#!/usr/bin/env bash
# Flip a PR from "an AI is reviewing this" to "the human's turn".
#
# One ordering rule decides everything: strip the flow labels the review owned,
# and only then turn the draft into ready. A cleanup that fails half-way has to
# leave the PR in draft, because draft plus `weka-working` reads as "the AI is
# still on it", while ready plus `weka-working` tells a human to review work
# nobody cleaned up after.
#
# The caller is a model, so the argument is not trusted to be the PR the review
# was about. Before anything is mutated the PR has to look like it is in the
# handoff state: draft, and carrying `weka-reviewing`. A PR that is a draft with
# `weka` and no flow label at all also passes, because that is exactly what a
# previous run that cleaned up and then failed to flip leaves behind — a re-run
# has to be able to finish the job without someone re-adding a label by hand.
# An unrelated PR carries neither shape and is refused untouched.
#
# There is no `weka-reviewed` any more: "the review is over" is a card state
# (`done`), not a label. GitHub is left with the participation marker only.
#
# The label deletion is guarded by the same read: `DELETE` on an absent label
# answers 404 and exits 1, so "already removed" must not be called a failure.
#
# usage: bash scripts/weka/pass-review.sh <pr-number>

set -uo pipefail

die() {
    echo "pass-review: $*" >&2
    exit 1
}

pr="${1:-}"
case "$pr" in
    ''|*[!0-9]*) echo "usage: bash scripts/weka/pass-review.sh <pr-number>" >&2; exit 2 ;;
esac

repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner) \
    || die "could not resolve the repository"

# One read, up front: the state gate and the labels come from the same snapshot,
# so the decision and the mutations cannot disagree. If it fails, touch nothing -
# a cleanup that never looked is not a cleanup, and a blind `gh pr ready` would
# announce a review that was not finished.
meta=$(gh api "repos/$repo/pulls/$pr" \
    --jq '"\(.draft) \(.labels | map(.name) | join(","))"') \
    || die "could not read #$pr; nothing was touched"

is_draft=${meta%% *}
labels=${meta#* }
[ "$labels" = "$meta" ] && labels=""
labels=$(printf '%s' "$labels" | tr ',' '\n')

has_label() {
    printf '%s\n' "$labels" | grep -qx "$1"
}

has_flow_label() {
    local name
    for name in weka-queue weka-working weka-reviewing weka-blocked; do
        has_label "$name" && return 0
    done
    return 1
}

[ "$is_draft" = "true" ] \
    || die "refusing: #$pr is not a draft, so it is not in the handoff state"

if has_label weka-reviewing; then
    :
elif has_label weka && ! has_flow_label; then
    # A previous run stripped the labels and then failed to flip. Nothing left to
    # clean, so the re-run only has to do the flip.
    echo "pass-review: #$pr was already cleaned up; finishing the flip" >&2
else
    die "refusing: #$pr is not in the weka review handoff state (no weka-reviewing)"
fi

status=0

if has_label weka-reviewing; then
    gh api -X DELETE "repos/$repo/issues/$pr/labels/weka-reviewing" || status=1
fi

# Cody adds this when it opens the PR and again when a rework starts, so it is
# normally present. An older PR, or one whose worker died before adding it, is a
# no-op rather than a failure.
if has_label weka-working; then
    gh api -X DELETE "repos/$repo/issues/$pr/labels/weka-working" || status=1
fi

if [ "$status" -ne 0 ]; then
    die "cleanup failed; #$pr stays in draft. Fix and run again."
fi

# The one draft -> ready flip in the whole flow.
gh pr ready "$pr" || die "labels are clean but the flip failed; #$pr is still draft"

echo "pass-review: #$pr is ready for the human"
