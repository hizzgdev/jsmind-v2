---
name: weka-deploy
description: "Bring the live weka flow up to master on this host. Use when asked to 更新流程 / deploy the flow."
type: workflow
lifecycle: active
---

# Deploying the weka flow

Merging is not deploying. `origin/master` is what the flow should be; this procedure makes the host
match it. It is keyed to a **revision**, not to a pull request — nobody should need a PR number to run it.

**A deploy converges; it does not decide.** Every run makes every live copy equal to master, whatever
changed, including when nothing did. What moved is a line in the report, never a reason to skip a step.
Both incidents that produced this document were a decision that something did not need doing:

- A label-cleanup fix merged in the morning; the process had been started the day before, so the flow
  kept behaving like the bug was still open. Nothing in the logs said so.
- The profile `SOUL.md` files are copies. The repo's version moved; the copies did not, and a worker
  ran weeks-old instructions while every file looked fine.

So do not reintroduce a timestamp as evidence. `stat` answers "when was this path written"; the question
is "which revision is running". A `git switch` in this clone rewrites files it never changed, and a copy
made five minutes ago can still hold last week's bytes.

## What needs what

| Artifact | Reaches the live host by | Every deploy |
|---|---|---|
| `team/automations/weka/SOUL.cody.md`, `SOUL.reed.md` | `~/.hermes/profiles/<p>/SOUL.md` — symlink, or a copy | step 3: copy or verify |
| `team/automations/skills/<name>/SKILL.md` | `~/.hermes/profiles/<p>/skills/<name>/SKILL.md` | step 4: copy, verify |
| `team/automations/weka/github-webhook.py`, `github-webhook.service` | `git pull` in the clone the unit points at | step 5: restart |
| `~/.hermes/config.yaml` → `kanban:` | hand edit (not in this repo) | ask a human — gateway restart |
| `README.md`, other `*.md`, this file | nothing | — |

## Steps

### 1. Record the starting point

```bash
cd ~/repos/jsmind-v2
git rev-parse --abbrev-ref HEAD && git status --porcelain
git rev-parse --short HEAD
git fetch -q origin master && git log --oneline HEAD..origin/master
```

Stop if the clone is not on `master` or the tree is dirty: never reset a shared clone to make a step
succeed. The commit range is report material — an empty range does not end the deploy, it just means the
report says "nothing moved" while steps 3–5 still run.

### 2. Update the clone, and prove it

```bash
OLD=$(git rev-parse HEAD)
git switch master && git pull --ff-only && git log -1 --oneline
git diff --name-only $OLD..HEAD -- team/automations/
```

Keep `$OLD`: the report is keyed on it, and the file list above is what step 7 checks the smoke decision
against.

### 3. SOUL: copy from master every time

```bash
ls -l ~/.hermes/profiles/cody/SOUL.md ~/.hermes/profiles/reed/SOUL.md
```

- **Symlink** (`-> .../team/automations/weka/SOUL.cody.md`): step 2 already deployed it; verify only.
- **Copy**: `cp` it, every deploy, whether or not the range listed it.

```bash
cp team/automations/weka/SOUL.cody.md ~/.hermes/profiles/cody/SOUL.md
cp team/automations/weka/SOUL.reed.md ~/.hermes/profiles/reed/SOUL.md
md5sum team/automations/weka/SOUL.cody.md ~/.hermes/profiles/cody/SOUL.md
md5sum team/automations/weka/SOUL.reed.md ~/.hermes/profiles/reed/SOUL.md
```

Equal hashes or it is not deployed — "the copy ran" is not evidence. No restart is involved: `SOUL.md` is
read when a worker session starts. That is also why a drifted copy fails silently, which is why the copy
is unconditional.

### 4. Skills installed into profiles: copy from master every time

Repo sources live under `team/automations/skills/`. A profile install is a deployment target, not a fork.

```bash
ls -l ~/.hermes/profiles/*/skills/ | grep -E 'jsmind-review|weka-deploy'
cp team/automations/skills/<name>/SKILL.md ~/.hermes/profiles/<p>/skills/<name>/SKILL.md
md5sum team/automations/skills/<name>/SKILL.md ~/.hermes/profiles/<p>/skills/<name>/SKILL.md
```

Copy unconditionally, then verify the hashes. A skill installed as a symlink into the repo needs neither.

What the policy costs, and why it is still right: the profile copy can carry edits made live by Hermes's
skill curator, and git has none of them. Treat such an edit as a draft — if it was worth keeping, it
belonged in the repo where it would have been reviewed. The one obligation left is not to lose it
silently: count what only the profile has (`diff <repo> <profile> | grep -c '^>'`) before overwriting and
name the file and the count in the report. A deploy that discards live edits without saying so is
indistinguishable from one that never noticed them.

### 5. Restart the webhook every time

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

The two numbers must be seconds apart. Any larger gap means the unit came back from its old definition or
never restarted — the failure this step exists to catch — and it is read off the process itself rather
than inferred from a file.

Restarting even when `weka/` did not change is the point of the rule, and it has a real cost: the service
is a single-threaded `HTTPServer`, so a delivery arriving during the restart is dropped and GitHub does
not redeliver it. That is survivable because deploys are rare and chosen by a human at a quiet moment; it
is not survivable as an unattended unit, which is why nothing here restarts on file change.

### 6. Smoke test: tests always, a real event only when behaviour could have changed

```bash
~/.hermes/venvs/weka/bin/python -m unittest discover -s team/automations/weka -p 'test_*.py'
```

Stdlib-only, milliseconds, and they now run against a process that certainly started on master. A green
run says the handlers behave; it does not say the running process is executing them, which is what one
real event is for:

- **Label cleanup / close handling**: pick a **closed issue that is not assigned to the bot account**,
  add a flow label, reopen, close. The close payload carries the label, so expect
  `[OK] removed <label> from #<n>` in `journalctl --user -u github-webhook`.

  Not any closed issue. One still assigned to the bot account passes the create gate, so adding a label
  to it calls `kanban create` again: the idempotency key (`gh-issue-<n>`) normally absorbs it because the
  original card still exists, but the journal prints `[OK] ... create ...`, and a card whose key had been
  pruned would really be created. An unassigned issue fails that gate cleanly and still exercises the
  strip.
- **Rework gate**: a comment on a PR carrying `weka-reviewed` must produce a card
  (`hermes kanban --board jsmind-v2 list`) or a comment on the PR explaining why not. Only the human
  account can trigger this path — bot events are ignored on purpose — so ask the user to leave the
  comment instead of working around the gate.

A real event is the one thing here that is not a convergence step: it writes to GitHub and can create a
card. So it is gated on the diff, not on a hunch — run it when step 2 listed `github-webhook.py` or
`github-webhook.service`, and otherwise write "no executable change, smoke test not applicable". Quote
the journal line; "restarted and it is active" is not a smoke test.

### 7. Report

`$OLD` and the new `HEAD`; what the range listed; that SOUL, profile skills and the webhook were each
made to match master, with hashes and the restart's start time; the smoke evidence or why it did not
apply; and anything left for a human (a `config.yaml` edit, a skill draft that a copy discarded).

## Stop and ask instead of guessing

- The clone is dirty, or sits on a branch other than `master`.
- The change requires `~/.hermes/config.yaml` → `kanban:`. Those values are read once at gateway boot, and
  the gateway refuses to restart itself from inside its own process — hand the command over.
- The smoke test prints something other than the expected line: report it. Restarting again to "see if it
  clears" destroys the evidence.

## Do not

- **Do not add auto-restart-on-change.** A `systemd.path` unit or a self-exec would close the gap and is
  deliberately not wanted: it would restart in the middle of whatever the service was doing, unattended.
  A human running this file is the trigger.
- **Do not compare timestamps instead of syncing.** No `stat`, no mtime, no "it was touched after the last
  deploy". Either the copy's hash equals master's, or it is not deployed.
- **Do not skip a step because the diff was empty.** The diff explains the report; it does not decide the
  work.
- Do not touch `config.json` while deploying code — it holds the webhook secret and is gitignored.
- Do not hand-edit anything under `~/.hermes/profiles/*/` beyond steps 3 and 4; the repo is the source of
  truth, and a local edit is overwritten by the next deploy or silently diverges from it.
- Do not `git reset --hard` the clone the service points at.
- Do not deploy "the PR that was just merged", and do not deploy "only the files that changed". Read
  master and converge to it.
