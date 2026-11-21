---
name: weka-deploy
description: "Bring the live weka flow up to a merged revision on this host. Use when a PR touching team/automations/weka/** has merged, or when asked to 更新流程 / deploy the flow."
type: workflow
lifecycle: active
---

# Deploying the weka flow

Merging is not deploying. The repository is the source of truth for what the flow *should* be; this
procedure is how the live host catches up with it. Follow it in order, and do not report success from
`active (running)` alone.

## What needs what

| Artifact | Reaches the live host by | Restart |
|---|---|---|
| `SOUL.cody.md`, `SOUL.reed.md` | profile file (symlink, or a copy that must be refreshed) | none — read when a worker session starts |
| `github-webhook.py`, `github-webhook.service` | `git pull` in the clone the unit points at | `systemctl --user restart github-webhook` |
| `~/.hermes/config.yaml` → `kanban:` | hand edit (not in this repo) | gateway restart |
| `README.md`, `SKILL.md` (this file) | nothing | — |

Two incidents produced this table, both from the same blind spot — the file was right and the running
thing was old:

- A label-cleanup fix merged in the morning; the process had been started the day before, so the flow
  kept behaving like the bug was still open. Nothing in the logs said so.
- The profile `SOUL.md` files were copies. The repo's version moved; the copies did not, and a worker
  ran weeks-old instructions while every file looked fine.

## Steps

### 1. Confirm there is something to deploy

```bash
gh pr view <n> --repo hizzgdev/jsmind-v2 --json state,mergedAt,files \
  --jq '"\(.state) \(.mergedAt) \([.files[].path] | join(" "))"'
```

`state` must be `MERGED`. If it is not, stop — there is nothing to deploy and nothing to report.

### 2. Bring the clone current, and prove it

```bash
cd ~/repos/jsmind-v2 && git switch master && git rev-parse HEAD && git pull --ff-only && git log -1 --oneline
```

Keep the first sha — step 4 diffs against it. The printed commit must be the merge commit of that PR.
If the tree is dirty or sits on a branch, stop and say so — never reset a shared clone to make the
step "work".

### 3. SOUL: make the profile match the repo, then verify bytes

Check which mode is installed:

```bash
ls -l ~/.hermes/profiles/cody/SOUL.md ~/.hermes/profiles/reed/SOUL.md
```

- **Symlink** (`-> .../team/automations/weka/SOUL.cody.md`): step 2 already deployed it. Verify anyway:
  `md5sum team/automations/weka/SOUL.cody.md ~/.hermes/profiles/cody/SOUL.md` — the two hashes must be equal.
- **Copy**: refresh it, then verify the same way.

```bash
cp team/automations/weka/SOUL.cody.md ~/.hermes/profiles/cody/SOUL.md
cp team/automations/weka/SOUL.reed.md ~/.hermes/profiles/reed/SOUL.md
```

No service restart is involved: `SOUL.md` is read when a worker session starts, so the next card picks
it up. This is also why a drifted copy fails silently — check the hashes, do not assume.

### 4. Restart the webhook only if its inputs changed

```bash
git diff --name-only <sha-from-step-2>..HEAD -- team/automations/weka/
```

If `github-webhook.py` or `github-webhook.service` is in that list:

```bash
systemctl --user restart github-webhook
```

Then prove the process is running the *new* file, not merely running:

```bash
systemctl --user show github-webhook -p ExecMainStartTimestamp
stat -c '%y %n' team/automations/weka/github-webhook.py
ss -lntp | grep 9180
journalctl --user -u github-webhook -n 10 --no-pager
```

The start timestamp must be later than the file's mtime. A process that started before the file
changed is the exact failure this step exists to catch.

### 5. Smoke test with a real event

Listening is not working. Two proofs, cheapest first.

**The flow's own tests**, when the PR added or changed any:

```bash
~/.hermes/venvs/weka/bin/python -m unittest discover -s team/automations/weka -p 'test_*.py'
```

They are stdlib-only and take milliseconds. A green run says the handlers behave; it does not say the
running process is executing them, which is what the live event below is for.

**One real event**, then read the journal line it should have produced:

- Label cleanup / close handling: pick a **closed issue that is not assigned to the bot account**, add a
  flow label to it, reopen, close. The close payload carries the label, so expect
  `[OK] removed <label> from #<n>` out of `journalctl --user -u github-webhook`.

  Not any closed issue. One still assigned to the bot account passes the create gate, so adding a label
  to it calls `kanban create` again: the idempotency key (`gh-issue-<n>`) normally absorbs it because the
  original card still exists, but the journal prints `[OK] ... create ...` and a card whose key has been
  pruned would really be created. An unassigned issue fails that gate cleanly and still exercises the
  strip.
- Rework gate: a comment on a PR carrying `weka-reviewed` must produce a card
  (`hermes kanban --board jsmind-v2 list`) or a comment on the PR explaining why not. Only the human
  account can trigger this path — bot reviews and comments are ignored on purpose — so when the deploy
  is being run as the bot, ask the user to leave it instead of working around the gate.
- Card creation: file nothing new; reuse the above rather than polluting the board.

Quote the journal line in the report. "Restarted and it is active" is not a smoke test.

### 6. Report

Revision deployed (commit sha), which artifacts were touched, the new process start timestamp, the
smoke-test evidence, and anything the change expects a human to do (e.g. a `config.yaml` edit).

## Stop and ask instead of guessing

- The PR is not merged, the clone is dirty, or the clone is on a branch.
- The change requires `~/.hermes/config.yaml` → `kanban:`. Those values are read once at gateway boot
  and the gateway refuses to restart itself from inside its own process — hand the command to the user.
- The smoke test prints something other than the expected line: report it. Restarting again to "see if
  it clears" destroys the evidence.

## Do not

- **Do not add auto-restart-on-change.** A `systemd.path` unit or a self-exec would close the gap, and
  it is deliberately not wanted here: the service is a single-threaded `HTTPServer`, so a restart
  landing mid-request drops that GitHub delivery, and GitHub does not redeliver on its own. A human
  restart at a chosen moment is the current answer; keep it that way unless the service is made
  graceful first.
- Do not touch `config.json` while deploying code — it holds the webhook secret and is gitignored.
- Do not hand-edit anything under `~/.hermes/profiles/*/` beyond step 3; the repo is the source of truth
  and a local edit will be silently overwritten by the next deploy or silently diverge from it.
- Do not `git reset --hard` the clone the service points at.
