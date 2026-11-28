#!/usr/bin/env bash
# Cases for scripts/weka/pass-review.sh, run against a stub `gh`.
#
# The rule the script exists for is an ordering rule, so the assertions are about
# order: `pr ready` must be the last call, and it must not happen at all when a
# label operation failed. The other half is the state gate: a PR that is not a
# draft, or is not in the review handoff state, must be refused without a single
# mutation - the caller is a model, and the number it passes may be one it read
# somewhere. A stub that only records argv is enough - no network, no repository -
# because the script's whole job is the sequence it emits.
#
# `weka-reviewed` is gone from the flow: the script must never post it, and a
# draft PR that still carries it is not enough on its own.
#
# usage: bash scripts/weka/test-pass-review.sh

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/scripts/weka/pass-review.sh"
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT

mkdir -p "$scratch/bin"
cat > "$scratch/bin/gh" <<'STUB'
#!/usr/bin/env bash
# Records every call, answers the four shapes pass-review.sh asks for.
echo "$*" >> "$GH_LOG"
if [ -n "${GH_FAIL:-}" ] && [[ "$*" == *"$GH_FAIL"* ]]; then
    exit 1
fi
case "$*" in
    "repo view"*) echo "owner/repo" ;;
    pr\ ready\ *) exit 0 ;;
    -X\ DELETE\ *|-X\ POST\ *) exit 0 ;;
    api\ repos/*/pulls/*)
        # The state gate read: "<isDraft> <comma-separated labels>".
        [ -n "${GH_META:-}" ] && printf '%s\n' "$GH_META"
        ;;
esac
STUB
chmod +x "$scratch/bin/gh"

failed=0

# usage: run_case <name> <expected-exit> [argument]
run_case() {
    local name="$1" expected_status="$2" arg="${3:-42}"
    export GH_LOG="$scratch/$name.log"
    : > "$GH_LOG"
    PATH="$scratch/bin:$PATH" bash "$SCRIPT" "$arg" > "$scratch/$name.out" 2> "$scratch/$name.err"
    local status=$?
    if [ "$status" -ne "$expected_status" ]; then
        echo "FAIL $name: exit $status, wanted $expected_status"
        sed 's/^/      /' "$scratch/$name.err"
        failed=1
    else
        echo "ok   $name (exit $status)"
    fi
}

mutated() { grep -qE -- "-X (DELETE|POST)|^pr ready" "$GH_LOG"; }

export GH_META='true weka,weka-working,weka-reviewing'
unset GH_FAIL
run_case happy-path 0
grep -q "pr ready 42" "$GH_LOG" || { echo "FAIL happy-path: no flip"; failed=1; }
# The flip has to be the LAST call: a later label write would be the very
# ready-plus-working state the ordering exists to prevent.
[ "$(tail -1 "$GH_LOG")" = "pr ready 42" ] || { echo "FAIL happy-path: flip is not last: $(tail -1 "$GH_LOG")"; failed=1; }
grep -q -- "-X DELETE repos/owner/repo/issues/42/labels/weka-reviewing" "$GH_LOG" || { echo "FAIL happy-path: reviewing not cleared"; failed=1; }
grep -q -- "-X DELETE repos/owner/repo/issues/42/labels/weka-working" "$GH_LOG" || { echo "FAIL happy-path: working not cleared"; failed=1; }
grep -qF -- "weka-reviewed" "$GH_LOG" && { echo "FAIL happy-path: posted the retired weka-reviewed"; failed=1; }

export GH_FAIL="labels/weka-working"
run_case cleanup-fails 1
grep -q "pr ready" "$GH_LOG" && { echo "FAIL cleanup-fails: flipped anyway"; failed=1; }
unset GH_FAIL

export GH_FAIL="--jq"
run_case read-fails 1
grep -qE -- "-X (DELETE|POST)|^pr ready" "$GH_LOG" && { echo "FAIL read-fails: mutated without reading the state"; failed=1; }
unset GH_FAIL

# The gate. An unrelated PR is draft-or-not and is not in the handoff state;
# either way it must be refused before anything is written.
export GH_META='false weka,weka-reviewing'
run_case not-a-draft 1
mutated && { echo "FAIL not-a-draft: mutated a ready PR"; failed=1; }

export GH_META='true weka,weka-working'
run_case not-in-handoff 1
mutated && { echo "FAIL not-in-handoff: mutated a PR that is not under review"; failed=1; }

# A run that cleaned up and then failed to flip leaves `weka` with no flow
# label. There is nothing left to delete, so the re-run only has to flip and
# must not invent a DELETE for a label that is not there (404).
export GH_META='true weka'
run_case rerun-after-failed-flip 0
grep -q -- "-X DELETE" "$GH_LOG" && { echo "FAIL rerun: deleted an absent label"; failed=1; }
grep -q "pr ready 42" "$GH_LOG" || { echo "FAIL rerun: no flip"; failed=1; }

run_case non-numeric-argument 2 "https://github.com/owner/repo/pull/42"
grep -qE -- "-X (DELETE|POST)|^pr ready" "$GH_LOG" && { echo "FAIL non-numeric-argument: mutated on bad input"; failed=1; }

if [ "$failed" -ne 0 ]; then
    exit 1
fi
echo "all cases passed"
