#!/usr/bin/env bash
# Unit tests for forward-github-event.sh. Does not POST anywhere.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$ROOT/forward-github-event.sh"
FIXTURES="$ROOT/testdata"
failed=0

run_case() {
  local name="$1"
  local event_name="$2"
  local expect="$3"
  local reason_contains="${4:-}"
  local out status=0

  set +e
  out="$(
    GITHUB_EVENT_NAME="$event_name" \
    GITHUB_EVENT_PATH="$FIXTURES/$name.json" \
    HUBIE_DRY_RUN=1 \
    "$SCRIPT"
  )"
  status=$?
  set -e

  if [[ "$status" -ne 0 ]]; then
    echo "FAIL $name: exit $status, output: $out"
    failed=1
    return
  fi

  if [[ "$expect" == "forward" ]]; then
    if [[ "$out" != "forward" ]]; then
      echo "FAIL $name: expected forward, got: $out"
      failed=1
      return
    fi
  else
    if [[ "$out" != skip:* ]]; then
      echo "FAIL $name: expected skip, got: $out"
      failed=1
      return
    fi
    if [[ -n "$reason_contains" && "$out" != *"$reason_contains"* ]]; then
      echo "FAIL $name: skip reason should contain '$reason_contains', got: $out"
      failed=1
      return
    fi
  fi
  echo "ok $name: $out"
}

run_case issue-assigned-hubie issues forward
run_case issue-assigned-no-hubie issues skip "no hubie label"
run_case pr-merged-hubie pull_request forward
run_case pr-merged-no-hubie pull_request skip "no hubie label"
run_case pr-closed-hubie pull_request forward
run_case pull-request-opened pull_request skip "not closed"
run_case pr-comment-hizzgdev-hubie issue_comment forward
run_case pr-comment-case-insensitive issue_comment forward
run_case pr-comment-zzgbot issue_comment skip "not hizzgdev"
run_case pr-comment-other-author issue_comment skip "not hizzgdev"
run_case pr-comment-no-hubie issue_comment skip "no hubie label"
run_case pr-comment-not-zzgbot-pr issue_comment skip "not zzgbot"
run_case issue-comment-not-on-pr issue_comment skip "not on a pull request"
run_case inline-review-comment-pass pull_request_review_comment forward

# Payload shape for a merged PR and an inline comment.
payload="$(mktemp)"
trap 'rm -f "$payload"' EXIT

GITHUB_EVENT_NAME=pull_request \
GITHUB_EVENT_PATH="$FIXTURES/pr-merged-hubie.json" \
HUBIE_DRY_RUN=1 \
HUBIE_PAYLOAD_OUT="$payload" \
  "$SCRIPT" >/dev/null

jq -e '
  .source == "github-action" and
  .event == "pr-merged" and
  .repo == "hizzgdev/jsmind-v2" and
  .number == 132 and
  .merged == true and
  .merge_commit_sha == "4f2e259a706860e8f02bb5517f55659df5c8109f" and
  .author == "zzgbot" and
  (.labels | index("hubie") != null) and
  (.comment | not)
' "$payload" >/dev/null || {
  echo "FAIL pr-merged payload: $(cat "$payload")"
  failed=1
}
echo "ok pr-merged payload"

GITHUB_EVENT_NAME=pull_request_review_comment \
GITHUB_EVENT_PATH="$FIXTURES/inline-review-comment-pass.json" \
HUBIE_DRY_RUN=1 \
HUBIE_PAYLOAD_OUT="$payload" \
  "$SCRIPT" >/dev/null

jq -e '
  .event == "inline-review-comment" and
  .number == 132 and
  .comment.author == "hizzgdev" and
  .comment.path == "src/view/export.ts" and
  .comment.line == 115
' "$payload" >/dev/null || {
  echo "FAIL inline payload: $(cat "$payload")"
  failed=1
}
echo "ok inline-review-comment payload"

# Matching event without secrets should skip, not fail, when not in dry-run.
set +e
out="$(
  GITHUB_EVENT_NAME=issues \
  GITHUB_EVENT_PATH="$FIXTURES/issue-assigned-hubie.json" \
  "$SCRIPT"
)"
status=$?
set -e
if [[ "$status" -ne 0 || "$out" != "skip: secrets not configured" ]]; then
  echo "FAIL secrets missing: exit $status, output: $out"
  failed=1
else
  echo "ok secrets not configured: $out"
fi

if [[ "$failed" -ne 0 ]]; then
  echo "FAILED"
  exit 1
fi

echo "All tests passed"
