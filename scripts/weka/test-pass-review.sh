#!/usr/bin/env bash
# Cases for scripts/weka/pass-review.sh, run against a stub `gh`.
#
# The rule the script exists for is an ordering rule, so the assertions are about
# order: `pr ready` must be the last call, and it must not happen at all when a
# label operation failed. A stub that only records argv is enough - no network, no
# repository - because the script's whole job is the sequence it emits.
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
    api\ repos/*)
        # The label read: one label per line.
        [ -n "${GH_LABELS:-}" ] && printf '%s\n' "$GH_LABELS"
        ;;
esac
STUB
chmod +x "$scratch/bin/gh"

failed=0

run_case() {
    local name="$1" expected_status="$2"
    shift 2
    export GH_LOG="$scratch/$name.log"
    : > "$GH_LOG"
    PATH="$scratch/bin:$PATH" bash "$SCRIPT" 42 > "$scratch/$name.out" 2> "$scratch/$name.err"
    local status=$?
    if [ "$status" -ne "$expected_status" ]; then
        echo "FAIL $name: exit $status, wanted $expected_status"
        sed 's/^/      /' "$scratch/$name.err"
        failed=1
    else
        echo "ok   $name (exit $status)"
    fi
}

export GH_LABELS=$'weka\nweka-working\nweka-reviewing'
unset GH_FAIL
run_case happy-path 0
grep -q "pr ready 42" "$GH_LOG" || { echo "FAIL happy-path: no flip"; failed=1; }
# The flip has to be the LAST call: a later label write would be the very
# ready-plus-working state the ordering exists to prevent.
[ "$(tail -1 "$GH_LOG")" = "pr ready 42" ] || { echo "FAIL happy-path: flip is not last: $(tail -1 "$GH_LOG")"; failed=1; }
grep -q -- "-X DELETE repos/owner/repo/issues/42/labels/weka-reviewing" "$GH_LOG" || { echo "FAIL happy-path: reviewing not cleared"; failed=1; }
grep -qF -- "-X POST repos/owner/repo/issues/42/labels -f labels[]=weka-reviewed" "$GH_LOG" || { echo "FAIL happy-path: reviewed not added"; failed=1; }

export GH_FAIL="labels/weka-working"
run_case cleanup-fails 1
grep -q "pr ready" "$GH_LOG" && { echo "FAIL cleanup-fails: flipped anyway"; failed=1; }
unset GH_FAIL

export GH_FAIL="--jq"
run_case label-read-fails 1
grep -qE -- "-X (DELETE|POST)" "$GH_LOG" && { echo "FAIL label-read-fails: mutated without reading"; failed=1; }
unset GH_FAIL

export GH_LABELS=$'weka'
run_case already-clean 0
grep -q -- "-X DELETE" "$GH_LOG" && { echo "FAIL already-clean: deleted an absent label"; failed=1; }
grep -q "pr ready 42" "$GH_LOG" || { echo "FAIL already-clean: no flip"; failed=1; }

if [ "$failed" -ne 0 ]; then
    exit 1
fi
echo "all cases passed"
