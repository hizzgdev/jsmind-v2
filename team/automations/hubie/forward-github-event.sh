#!/usr/bin/env bash
# Filter GitHub events for the Hubie flow, then forward matches to the
# Coordinator routine webhook. See agent-team-collaboration.md section 6.
#
# Required environment:
#   GITHUB_EVENT_NAME   GitHub event name (issues, pull_request, ...)
#   GITHUB_EVENT_PATH   Path to the event JSON
# Optional:
#   HUBIE_ROUTINE_WEBHOOK_URL / HUBIE_ROUTINE_WEBHOOK_KEY
#       Needed to POST. If either is empty, a matching event is skipped
#       without failing, so this workflow can exist before secrets are set.
#   HUBIE_DRY_RUN=1         Do not POST; print "forward" or "skip: ..."
#   HUBIE_PAYLOAD_OUT=path  Write the JSON body that would be sent
#   GITHUB_REPOSITORY       Defaults to hizzgdev/jsmind-v2

set -euo pipefail

EVENT_NAME="${GITHUB_EVENT_NAME:-}"
EVENT_PATH="${GITHUB_EVENT_PATH:-}"
WEBHOOK_URL="${HUBIE_ROUTINE_WEBHOOK_URL:-}"
WEBHOOK_KEY="${HUBIE_ROUTINE_WEBHOOK_KEY:-}"
DRY_RUN="${HUBIE_DRY_RUN:-}"
PAYLOAD_OUT="${HUBIE_PAYLOAD_OUT:-}"
REPO="${GITHUB_REPOSITORY:-hizzgdev/jsmind-v2}"

skip() {
  echo "skip: $1"
  exit 0
}

die() {
  echo "error: $1" >&2
  exit 1
}

login_eq() {
  local a="$1" b="$2"
  [[ "$(printf '%s' "$a" | tr '[:upper:]' '[:lower:]')" == "$(printf '%s' "$b" | tr '[:upper:]' '[:lower:]')" ]]
}

has_hubie() {
  jq -e --arg l 'hubie' 'map(.name) | index($l) != null' <<<"$1" >/dev/null
}

[[ -n "$EVENT_NAME" ]] || die "GITHUB_EVENT_NAME is not set"
[[ -n "$EVENT_PATH" ]] || die "GITHUB_EVENT_PATH is not set"
[[ -f "$EVENT_PATH" ]] || die "event file not found: $EVENT_PATH"
command -v jq >/dev/null || die "jq is required"

action="$(jq -r '.action // empty' "$EVENT_PATH")"
kind=""
labels_json="[]"
number=""
title=""
html_url=""
author=""
merged="false"
merge_commit_sha=""
comment_json="null"
comment_author=""

case "$EVENT_NAME" in
  issues)
    [[ "$action" == "assigned" ]] || skip "issues action is ${action:-empty}, not assigned"
    kind="issue-assigned"
    labels_json="$(jq -c '.issue.labels // []' "$EVENT_PATH")"
    number="$(jq -r '.issue.number' "$EVENT_PATH")"
    title="$(jq -r '.issue.title // empty' "$EVENT_PATH")"
    html_url="$(jq -r '.issue.html_url // empty' "$EVENT_PATH")"
    author="$(jq -r '.issue.user.login // empty' "$EVENT_PATH")"
    ;;
  pull_request)
    [[ "$action" == "closed" ]] || skip "pull_request action is ${action:-empty}, not closed"
    merged="$(jq -r '.pull_request.merged // false' "$EVENT_PATH")"
    if [[ "$merged" == "true" ]]; then
      kind="pr-merged"
      merge_commit_sha="$(jq -r '.pull_request.merge_commit_sha // empty' "$EVENT_PATH")"
    else
      kind="pr-closed"
    fi
    labels_json="$(jq -c '.pull_request.labels // []' "$EVENT_PATH")"
    number="$(jq -r '.pull_request.number' "$EVENT_PATH")"
    title="$(jq -r '.pull_request.title // empty' "$EVENT_PATH")"
    html_url="$(jq -r '.pull_request.html_url // empty' "$EVENT_PATH")"
    author="$(jq -r '.pull_request.user.login // empty' "$EVENT_PATH")"
    ;;
  issue_comment)
    [[ "$action" == "created" ]] || skip "issue_comment action is ${action:-empty}, not created"
    if ! jq -e '.issue.pull_request != null' "$EVENT_PATH" >/dev/null; then
      skip "issue_comment is not on a pull request"
    fi
    kind="pr-comment"
    labels_json="$(jq -c '.issue.labels // []' "$EVENT_PATH")"
    number="$(jq -r '.issue.number' "$EVENT_PATH")"
    title="$(jq -r '.issue.title // empty' "$EVENT_PATH")"
    html_url="$(jq -r '.issue.pull_request.html_url // .issue.html_url // empty' "$EVENT_PATH")"
    author="$(jq -r '.issue.user.login // empty' "$EVENT_PATH")"
    comment_author="$(jq -r '.comment.user.login // empty' "$EVENT_PATH")"
    comment_json="$(jq -c '.comment | {id, author: .user.login, body, html_url}' "$EVENT_PATH")"
    ;;
  pull_request_review_comment)
    [[ "$action" == "created" ]] || skip "pull_request_review_comment action is ${action:-empty}, not created"
    kind="inline-review-comment"
    labels_json="$(jq -c '.pull_request.labels // []' "$EVENT_PATH")"
    number="$(jq -r '.pull_request.number' "$EVENT_PATH")"
    title="$(jq -r '.pull_request.title // empty' "$EVENT_PATH")"
    html_url="$(jq -r '.pull_request.html_url // empty' "$EVENT_PATH")"
    author="$(jq -r '.pull_request.user.login // empty' "$EVENT_PATH")"
    comment_author="$(jq -r '.comment.user.login // empty' "$EVENT_PATH")"
    comment_json="$(jq -c '.comment | {id, author: .user.login, body, html_url, path, line}' "$EVENT_PATH")"
    ;;
  *)
    skip "unsupported event ${EVENT_NAME}"
    ;;
esac

has_hubie "$labels_json" || skip "no hubie label"

if [[ "$kind" == "pr-comment" || "$kind" == "inline-review-comment" ]]; then
  login_eq "$author" "zzgbot" || skip "PR author is ${author}, not zzgbot"
  login_eq "$comment_author" "hizzgdev" || skip "comment author is ${comment_author}, not hizzgdev"
fi

label_names="$(jq -c 'map(.name)' <<<"$labels_json")"
merged_json="false"
[[ "$merged" == "true" ]] && merged_json="true"

payload="$(jq -n \
  --arg source "github-action" \
  --arg event "$kind" \
  --arg repo "$REPO" \
  --argjson number "$number" \
  --arg title "$title" \
  --arg html_url "$html_url" \
  --argjson labels "$label_names" \
  --arg author "$author" \
  --argjson merged "$merged_json" \
  --arg merge_commit_sha "$merge_commit_sha" \
  --argjson comment "$comment_json" \
  '{
      source: $source,
      event: $event,
      repo: $repo,
      number: $number,
      title: $title,
      html_url: $html_url,
      labels: $labels,
      author: $author
    }
    + (if ($event == "pr-merged" or $event == "pr-closed") then {merged: $merged} else {} end)
    + (if ($event == "pr-merged" and $merge_commit_sha != "") then {merge_commit_sha: $merge_commit_sha} else {} end)
    + (if $comment != null then {comment: $comment} else {} end)
  ')"

if [[ -n "$PAYLOAD_OUT" ]]; then
  printf '%s\n' "$payload" > "$PAYLOAD_OUT"
fi

if [[ -n "$DRY_RUN" && "$DRY_RUN" != "0" ]]; then
  echo "forward"
  exit 0
fi

if [[ -z "$WEBHOOK_URL" || -z "$WEBHOOK_KEY" ]]; then
  skip "secrets not configured"
fi

body="$(mktemp)"
trap 'rm -f "$body"' EXIT
printf '%s\n' "$payload" > "$body"

echo "forwarding ${kind} #${number}"

http_code="$(
  curl -sS -o /dev/null -w "%{http_code}" \
    -X POST "$WEBHOOK_URL" \
    -H "Authorization: Bearer ${WEBHOOK_KEY}" \
    -H "Content-Type: application/json" \
    --data-binary @"$body"
)"

if [[ "$http_code" != "200" ]]; then
  die "webhook responded with HTTP ${http_code}"
fi

echo "forwarded ${kind} #${number}: HTTP 200"
