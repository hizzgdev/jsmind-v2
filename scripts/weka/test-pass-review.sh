#!/usr/bin/env bash
# Cases for scripts/weka/pass-review.sh, run against a stub `gh`.
#
# The script has one job — the draft -> ready flip — so the assertions are: the
# flip happens exactly once and is the last call, and nothing else is ever
# written. The flow labels belong to `labels.py` alone; a `-X DELETE` or
# `-X POST` here would be a second writer, and that is the bug #297 exposed.
#
# The other half is the gate: a PR that is not a draft, or does not carry
# `weka-reviewing`, is refused without a single call that could change it. The
# caller is a model and the number it passes may be one it read somewhere.
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
# Records every call, answers the two shapes pass-review.sh asks for.
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
# One call, and it is the last: the flip is the whole job.
[ "$(grep -c . "$GH_LOG")" = 3 ] || { echo "FAIL happy-path: expected 3 calls (repo view, the gate read, the flip), got: $(tr '\n' ' ' < "$GH_LOG")"; failed=1; }
[ "$(tail -1 "$GH_LOG")" = "pr ready 42" ] || { echo "FAIL happy-path: flip is not last: $(tail -1 "$GH_LOG")"; failed=1; }
grep -qE -- "-X (DELETE|POST)" "$GH_LOG" \
    && { echo "FAIL happy-path: touched a label; labels.py is the only writer"; failed=1; }
grep -qF -- "weka-reviewed" "$GH_LOG" && { echo "FAIL happy-path: posted the retired weka-reviewed"; failed=1; }

export GH_FAIL="--jq"
run_case read-fails 1
mutated && { echo "FAIL read-fails: mutated without reading the state"; failed=1; }
unset GH_FAIL

# The gate. An unrelated PR is draft-or-not and is not under review; either way
# it must be refused before anything is flipped.
export GH_META='false weka,weka-reviewing'
run_case not-a-draft 1
mutated && { echo "FAIL not-a-draft: flipped a ready PR"; failed=1; }

export GH_META='true weka,weka-working'
run_case not-in-handoff 1
mutated && { echo "FAIL not-in-handoff: flipped a PR that is not under review"; failed=1; }

# A retired shape: draft + `weka` only used to pass, because the old script had
# stripped the labels before failing to flip. There is nothing to strip any
# more, so a draft with no `weka-reviewing` is not a handoff and gets no flip.
export GH_META='true weka'
run_case no-reviewing-label 1
mutated && { echo "FAIL no-reviewing-label: flipped a PR nobody was reviewing"; failed=1; }

run_case non-numeric-argument 2 "https://github.com/owner/repo/pull/42"
mutated && { echo "FAIL non-numeric-argument: mutated on bad input"; failed=1; }

if [ "$failed" -ne 0 ]; then
    exit 1
fi
echo "all cases passed"
