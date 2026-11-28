#!/usr/bin/env bash
# Flip a PR from "an AI is reviewing this" to "the human's turn".
#
# One job: the draft -> ready flip. Nothing else touches GitHub's labels.
#
# `labels.py` is the single writer of the four process labels, and it erases
# `weka-reviewing` / `weka-working` when the card goes `done`. A second writer
# here is what produced the #297 mess: this script removed `weka-reviewing`, the
# next sweep saw the card still `running` and wrote it back, and the PR stayed
# labelled after the review was over. So the label now outlives the flip by one
# model turn — a fixed lag, not a race, documented in `README.md`
# 「标签与人工审核门」.
#
# The caller is a model, so the argument is not trusted to name the PR the
# review was about. Before anything is mutated the PR has to look like it is in
# the handoff state: draft, and carrying `weka-reviewing` (reed's card, written
# by `labels.py` when the card was claimed). This is one read: a refusal costs
# nothing and leaves the PR exactly as it was.
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

# The state gate, from the PR itself. If this read fails, do nothing: a blind
# `gh pr ready` would announce a review that was never finished.
meta=$(gh api "repos/$repo/pulls/$pr" \
    --jq '"\(.draft) \(.labels | map(.name) | join(","))"') \
    || die "could not read #$pr; nothing was touched"

is_draft=${meta%% *}
labels=${meta#* }
[ "$labels" = "$meta" ] && labels=""
labels=$(printf '%s' "$labels" | tr ',' '\n')

[ "$is_draft" = "true" ] \
    || die "refusing: #$pr is not a draft, so it is not in the handoff state"

printf '%s\n' "$labels" | grep -qx "weka-reviewing" \
    || die "refusing: #$pr does not carry weka-reviewing, so no review is being handed over"

# The one draft -> ready flip in the whole flow.
gh pr ready "$pr" || die "the flip failed; #$pr is still draft"

echo "pass-review: #$pr is ready for the human"
