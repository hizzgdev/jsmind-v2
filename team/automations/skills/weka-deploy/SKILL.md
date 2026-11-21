---
name: weka-deploy
description: "Reset the live weka flow to master on this host. Use when asked to 更新流程 / deploy the flow."
type: workflow
lifecycle: active
---

# Resetting the weka flow to master

Merging is not deploying. This procedure is a **reset**: `origin/master` is the complete desired state
for every artifact the flow runs from, and each run overwrites the host's copies with it. It is not a
merge, and there is nothing on this host to negotiate with — whatever a profile copy, an installed skill
or a running process currently holds is discarded without inspection.

It is keyed to a **revision**, not to a pull request — nobody should need a PR number to run it.

Two incidents produced this document, and both were a decision that something did not need doing:

- A label-cleanup fix merged in the morning; the process had been started the day before, so the flow kept
  behaving like the bug was still open. Nothing in the logs said so.
- The profile `SOUL.md` files are copies. The repo's version moved; the copies did not, and a worker ran
  weeks-old instructions while every file looked fine.

So the procedure asks nothing about freshness. No `stat`, no mtime, no "it was touched after the last
deploy", no diffing a copy to see whether it is ahead. A `git switch` in this clone rewrites files it never
changed, and a copy made five minutes ago can still hold last week's bytes. The only question worth asking
is answered by a hash: **does the live file equal master's file, yes or no.**

## Desired state

| Artifact | Live location | This deploy |
|---|---|---|
| `team/automations/weka/SOUL.cody.md`, `SOUL.reed.md` | `~/.hermes/profiles/<p>/SOUL.md` | overwrite from master, verify hash |
| `team/automations/skills/<name>/SKILL.md` | `~/.hermes/profiles/<p>/skills/<name>/SKILL.md` | overwrite from master, verify hash |
| `team/automations/weka/github-webhook.py`, `github-webhook.service` | the clone the systemd user unit points at | restart the unit, verify it started now |
| `~/.hermes/config.yaml` → `kanban:` | not in this repo | out of scope — a human edits it, gateway restart |
| `README.md`, other `*.md`, this file | nothing to install | — |

Rows one to three have a live counterpart and are reset every run, whether or not they changed. The
`README.md` row has none: a document nobody loads at runtime needs no deployment.

Live edits do not survive, and that is intentional. Hermes's skill curator patches installed skills in
place, so a profile file can accumulate content the repo never saw. That content is treated as a draft
someone left on the host, not as a second source of truth: if it mattered it goes into the repo through a
PR and gets reviewed. A deploy never carries it forward, never diffs for it, and never reports it as
something to rescue.

## Steps

### 1. Record the starting point

```bash
cd ~/repos/jsmind-v2
git rev-parse --abbrev-ref HEAD && git status --porcelain
git rev-parse --short HEAD
git fetch -q origin master && git log --oneline HEAD..origin/master
```

Stop if the clone is not on `master` or the tree is dirty. This is the one place where local state is
respected rather than reset, because the checkout holds unpushed work — never `reset --hard` a shared clone
to make a step succeed. Branches and stashes are work; profile copies and running processes are copies.

An empty commit range does not end the deploy: it means the report will say "nothing moved" while steps 3–5
still overwrite and still restart.

### 2. Update the clone

```bash
OLD=$(git rev-parse HEAD)
git switch master && git pull --ff-only && git log -1 --oneline
git diff --name-only $OLD..HEAD -- team/automations/
```

Keep `$OLD`: the report is keyed on it. The file list is used exactly once, in step 6, to decide whether a
real event is warranted — it never decides what gets synced.

### 3. SOUL: overwrite from master

```bash
ls -l ~/.hermes/profiles/cody/SOUL.md ~/.hermes/profiles/reed/SOUL.md
```

- **Symlink** into the repo: step 2 already reset it; verify the hash only.
- **Copy**: overwrite it, every deploy.

```bash
cp team/automations/weka/SOUL.cody.md ~/.hermes/profiles/cody/SOUL.md
cp team/automations/weka/SOUL.reed.md ~/.hermes/profiles/reed/SOUL.md
md5sum team/automations/weka/SOUL.cody.md ~/.hermes/profiles/cody/SOUL.md
md5sum team/automations/weka/SOUL.reed.md ~/.hermes/profiles/reed/SOUL.md
```

Equal hashes or it is not deployed — "the copy ran" is not evidence. No restart: `SOUL.md` is read when a
worker session starts, which is also why a stale copy fails silently.

### 4. Skills installed into profiles: overwrite from master

```bash
ls -l ~/.hermes/profiles/*/skills/ | grep -E 'jsmind-review|weka-deploy'
cp team/automations/skills/<name>/SKILL.md ~/.hermes/profiles/<p>/skills/<name>/SKILL.md
md5sum team/automations/skills/<name>/SKILL.md ~/.hermes/profiles/<p>/skills/<name>/SKILL.md
```

Overwrite unconditionally, then verify the hashes. A skill symlinked into the repo needs neither step.

Do not stop to compare the two files and decide which is newer, and do not copy the live version back into
the repo as part of a deploy. Both are ways of letting the host vote on what master should be.

### 5. Restart the webhook

```bash
systemctl --user restart github-webhook
systemctl --user is-active github-webhook
systemctl --user show github-webhook -p ExecMainStartTimestamp
ss -lntp | grep 9180
journalctl --user -u github-webhook -n 5 --no-pager
```

Then prove it restarted *now*, in a way that does not touch file metadata:

```bash
awk '{printf "uptime_s=%.0f\n", $1}' /proc/uptime
systemctl --user show github-webhook -p ExecMainStartTimestampMonotonic --value \
  | awk '{printf "start_s=%.0f\n", $1/1000000}'
```

The two numbers must be seconds apart. A larger gap means the unit came back from an old definition or
never restarted — the failure this step exists to catch — read off the process itself rather than inferred
from a file.

The restart is unconditional. In the one shape where `weka/` did not change it also has a cost: the service
is a single-threaded `HTTPServer`, so a delivery arriving during the restart is dropped and GitHub does not
redeliver it. That is survivable because deploys are rare and chosen by a human at a quiet moment; it is
not survivable as an unattended unit, which is why nothing here restarts on file change.

Then reconcile what the workers left behind — a separate tool, because the service has one job:

```bash
python3 scripts/cleanup-worktrees.py --dry-run   # decisions only
python3 scripts/cleanup-worktrees.py             # merged work only
```

It removes worktrees whose branch is gone from origin **and** whose pull request GitHub reports as merged
**and** which git is willing to remove — git refuses a worktree holding a modification or an untracked
file, and accepts one whose untracked content is ignored. That makes `.gitignore` the policy: a build
artifact nobody ignored blocks its own cleanup, and the fix belongs in the ignore rules, not in a longer
list of exemptions. This is the only step that covers the events the service could not act on: the handler
answers `200` even when the work inside it raised, and GitHub does not redeliver failed deliveries — so an
event that went wrong leaves no queue to replay, just a line in the journal. It is idempotent, so a clean
host prints `0 worktree(s) removed`.

### 6. Smoke test: tests always, a real event only when behaviour could have changed

```bash
~/.hermes/venvs/weka/bin/python -m unittest discover -s team/automations/weka -p 'test_*.py'
```

Stdlib-only, milliseconds, and they now run against a process that certainly started on master. A green run
says the handlers behave; it does not say the running process is executing them, which is what one real
event is for:

- **Label cleanup / close handling**: pick a **closed issue that is not assigned to the bot account**, add a
  flow label, reopen, close. The close payload carries the label, so expect
  `[OK] removed <label> from #<n>` in `journalctl --user -u github-webhook`.

  Not any closed issue. One still assigned to the bot account passes the create gate, so adding a label to
  it calls `kanban create` again: the idempotency key (`gh-issue-<n>`) normally absorbs it because the
  original card still exists, but the journal prints `[OK] ... create ...`, and a card whose key had been
  pruned would really be created. An unassigned issue fails that gate cleanly and still exercises the strip.
- **Rework gate**: a comment on a PR carrying `weka-reviewed` must produce a card
  (`hermes kanban --board jsmind-v2 list`) or a comment on the PR explaining why not. Only the human account
  can trigger this path — bot events are ignored on purpose — so ask the user to leave the comment instead of
  working around the gate.

A real event is the one thing here that is not a reset step: it writes to GitHub and can create a card. So it
is gated on the step-2 diff — run it when that list contained `github-webhook.py` or
`github-webhook.service`, otherwise write "no executable change, smoke test not applicable". Quote the
journal line; "restarted and it is active" is not a smoke test.

### 7. Report

`$OLD` and the new `HEAD`; what the step-2 range listed; that SOUL, profile skills and the webhook were reset
to master, with the hash pairs and the restart's start time; the smoke evidence or why it did not apply; and
anything still outside this procedure (`config.yaml` → `kanban:`).

## Stop and ask instead of guessing

- The clone is dirty, or sits on a branch other than `master`.
- The change requires `~/.hermes/config.yaml` → `kanban:`. Those values are read once at gateway boot, and the
  gateway refuses to restart itself from inside its own process — hand the command over.
- The smoke test prints something other than the expected line: report it. Restarting again to "see if it
  clears" destroys the evidence.

## Do not

- **Do not add auto-restart-on-change.** A `systemd.path` unit or a self-exec would close the gap and is
  deliberately not wanted: it would restart mid-request, unattended. A human running this file is the trigger.
- **Do not compare timestamps.** No `stat`, no mtime, no "touched after the last deploy". Either the live
  file's hash equals master's, or it is not deployed.
- **Do not skip a step because the diff was empty.** The diff explains the report and gates one side-effectful
  probe; it does not decide what gets synced.
- Do not merge, reconcile or preserve anything under `~/.hermes/profiles/*/`. Those are copies, and this
  procedure exists to make them equal to master — not to be careful with them.
- Do not touch `config.json` while deploying code — it holds the webhook secret and is gitignored.
- Do not `git reset --hard` the clone the service points at.
- Do not deploy "the PR that was just merged", and do not deploy "only the files that changed". Read master
  and converge to it.
