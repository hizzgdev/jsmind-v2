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
| `team/automations/weka/SOUL.cody.md`, `SOUL.reed.md`, `SOUL.scout.md` | `~/.hermes/profiles/<p>/SOUL.md` | overwrite from master, verify hash |
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
ls -l ~/.hermes/profiles/cody/SOUL.md ~/.hermes/profiles/reed/SOUL.md ~/.hermes/profiles/scout/SOUL.md
```

- **Symlink** into the repo: step 2 already reset it; verify the hash only.
- **Copy**: overwrite it, every deploy.

```bash
cp team/automations/weka/SOUL.cody.md ~/.hermes/profiles/cody/SOUL.md
cp team/automations/weka/SOUL.reed.md ~/.hermes/profiles/reed/SOUL.md
cp team/automations/weka/SOUL.scout.md ~/.hermes/profiles/scout/SOUL.md
md5sum team/automations/weka/SOUL.cody.md ~/.hermes/profiles/cody/SOUL.md
md5sum team/automations/weka/SOUL.reed.md ~/.hermes/profiles/reed/SOUL.md
md5sum team/automations/weka/SOUL.scout.md ~/.hermes/profiles/scout/SOUL.md
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

The rule — what counts as disposable, and why only GitHub can answer "was this merged?" — is stated once,
in the script's own docstring. Read that instead of this file: a second copy here is a second thing to
drift, and this one did. What belongs here is why the step exists at all: the handler answers `200` even
when the work inside it raised, and GitHub does not redeliver failed deliveries, so an event that went
wrong leaves no queue to replay, just a line in the journal. This is the only step that covers that. It is
idempotent, so a clean host prints `0 worktree(s) removed`.

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
- **Groom card (scout)**: when `groom_board` / `groom_assignee` are configured, the manual rehearsal in
  `team/automations/weka/README.md` →「主机侧准备」is what proves the profile and the board are dispatchable —
  a real merge is too expensive to discover that with. The rehearsal card's title is its own; the
  `#<pr>: Groom — …` shape is covered by `test_a_merged_pr_queues_a_scout_card_on_the_groom_board`, and the
  next real close is the end-to-end confirmation that the branch fires, not a gate for this deploy.

A real event is the one thing here that is not a reset step: it writes to GitHub and can create a card. So it
is gated on the step-2 diff — run it when that list contained `github-webhook.py` or
`github-webhook.service`, otherwise write "no executable change, smoke test not applicable". Quote the
journal line; "restarted and it is active" is not a smoke test.

### 7. Concurrency ceilings: 3 and 1

`max_in_progress` must be 3 and `max_in_progress_per_profile` must be 1 — that is one card for each of the
three roles the same dispatcher serves (cody implementing, reed reviewing, scout grooming). Both keys are read
once at gateway boot and cached for the life of the process, so there are three separate things to prove here
and a green on one says nothing about the next: what the file says, whether the running process started after
that file was written, and what the process actually resolved.

```bash
# the file. Pin the home: from a profile shell this reads that profile's
# config.yaml, where neither key lives, and prints null on a correct host.
HERMES_HOME=$HOME/.hermes hermes config get kanban.max_in_progress             # must be 3
HERMES_HOME=$HOME/.hermes hermes config get kanban.max_in_progress_per_profile # must be 1

# the process started after that file was last written
systemctl --user show hermes-gateway -p ExecMainStartTimestamp
stat -c '%y' ~/.hermes/config.yaml

# the cap it booted with
grep -E 'kanban dispatcher: max_in_progress(_per_profile)?=' ~/.hermes/logs/gateway.log | tail -2
```

The boot line is a cap, not live concurrency: a tick may start fewer — none while host memory pressure is
`critical`, at most one while it is `elevated` (`kanban_db_dispatch.py`).

The two `config get` lines are not the check on their own. They resolve `config.yaml` through
`get_config_value()` → `load_config()` and never ask the running gateway, which read both keys once in
`_kanban_dispatcher_boot()` and has not re-read them since. On a host where the file was updated and nobody
restarted, the file says 3 and the dispatcher still enforces 2: the `get` lines print a clean 3 / 1, the
start-time comparison and the boot line do not. That is the drift this step exists to find.

Quote the boot line in the report, and keep the `kanban dispatcher:` anchor — inbound chat text that mentions
the key is logged too, and a loose `grep max_in_progress` matches it. A missing line is a stop as well: with
`max_in_progress` unset the boot prints the `unset; using memory-derived default …` warning instead of
`max_in_progress=<n>`, and with `max_in_progress_per_profile` unset it prints nothing at all — which also
means `tail -2` can pair this boot's one line with the previous boot's. Check each line's timestamp against
`ExecMainStartTimestamp` before quoting it, and treat a key that did not print at this boot as missing.
Both ceilings were asked for explicitly.

If any of the three disagree, stop short of the report and hand over the right one of two branches — they are
not the same instruction, and telling a human to "fix the file" when the file already holds 3 / 1 sends them
looking at a number that is correct:

- **The file is not 3 / 1.** Edit the `kanban:` section of `~/.hermes/config.yaml`, then restart the gateway.
  The dispatcher reads these keys once at boot, so the restart is what makes the edit take effect.
- **The file already says 3 / 1, but the gateway started before its last write, or the boot line carries
  another number.** The config is already correct — there is nothing to edit and nothing to add. The only
  thing missing is the restart, so the process re-reads the file it booted on.

Do not edit `config.yaml` here and do not restart the gateway — the desired-state table puts that row out of
scope, and the gateway refuses to restart itself from inside its own process. A red deploy on a document that
was changed but not yet brought live is the intended outcome, not a defect in this step.

### 8. Report

`$OLD` and the new `HEAD`; what the step-2 range listed; that SOUL, profile skills and the webhook were reset
to master, with the hash pairs and the restart's start time; the smoke evidence or why it did not apply; the
two concurrency ceilings as step 7 found them (the file's numbers and the value the gateway booted with); and
anything still outside this procedure (`config.yaml` → `kanban:`).

## Stop and ask instead of guessing

- The clone is dirty, or sits on a branch other than `master`.
- The change requires `~/.hermes/config.yaml` → `kanban:` — hand over the edit *and* the restart that makes
  it take effect. Or step 7 disagrees: hand over whichever branch fits — file not 3 / 1 means edit the
  `kanban:` section then restart; file already 3 / 1 with an older gateway start time or a mismatched boot
  line means restart only, and say plainly that `config.yaml` needs no change. Those values are read once at
  gateway boot, and the gateway refuses to restart itself from inside its own process.
- The smoke test prints something other than the expected line: report it. Restarting again to "see if it
  clears" destroys the evidence.

## Do not

- **Do not add auto-restart-on-change.** A `systemd.path` unit or a self-exec would close the gap and is
  deliberately not wanted: it would restart mid-request, unattended. A human running this file is the trigger.
- **Do not compare timestamps to decide whether a file needs deploying.** No `stat`, no mtime, no "touched
  after the last deploy". Either the live file's hash equals master's, or it is not deployed. Step 7's `stat`
  answers a different question — whether a *process* re-read a config it only reads at boot — and file
  metadata is the right evidence for that one; it says nothing about whether a file is deployed.
- **Do not skip a step because the diff was empty.** The diff explains the report and gates one side-effectful
  probe; it does not decide what gets synced.
- Do not merge, reconcile or preserve anything under `~/.hermes/profiles/*/`. Those are copies, and this
  procedure exists to make them equal to master — not to be careful with them.
- Do not touch `config.json` while deploying code — it holds the webhook secret and is gitignored.
- Do not `git reset --hard` the clone the service points at.
- Do not deploy "the PR that was just merged", and do not deploy "only the files that changed". Read master
  and converge to it.
