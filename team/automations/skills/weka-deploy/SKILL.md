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
| `team/automations/skills/weka-deploy/SKILL.md` | `~/.hermes/skills/devops/weka-deploy/SKILL.md` — a symlink into this clone, in the default home rather than a profile | symlink: step 2 already moved it to master, so nothing is copied — verify the live hash against `git show master:…` |
| `team/automations/weka/github-webhook.py`, `github-webhook.service` | the clone the systemd user unit points at | restart the unit, verify it started now |
| `hooks:` in `~/.hermes/profiles/<p>/config.yaml` + `<p>/shell-hooks-allowlist.json` | not in this repo | write the four hooks of step 8 verbatim, then `hooks doctor` three times |
| `~/.hermes/config.yaml` → `kanban:` | not in this repo | out of scope — a human edits it, gateway restart |
| `README.md`, other `*.md` | nothing to install | — |

Five rows have a live counterpart and are reset on every run, whether or not it changed: SOUL, the profile
skills, the default-home skill, the webhook, and the `hooks:` block. The hooks row is the one that is
**written, not copied** — no file in this repo holds it, so a profile missing the block is a failed deploy
rather than a skipped step.

The default-home skill is the only live location that is a **symlink** into this clone rather than a copy,
so step 2 already reset it and step 4 only verifies it: overwriting is impossible (`cp` there exits 1 with
`are the same file`), and comparing it with the working-tree file compares one inode with itself. Compare
the live file with `git show master:team/automations/skills/weka-deploy/SKILL.md` instead. Without the row
nothing checks that the link still resolves into this clone: point it at a stale checkout elsewhere and every
other step stays green while the procedure the session is running is not master's. What that comparison
cannot prove is spelled out at the end of step 4 — step 2 has already moved the clone it points into.

The `README.md` row is the only one with nothing to install: a document nobody loads at runtime needs no
deployment. `~/.hermes/config.yaml` → `kanban:` stays out of scope and stays a human's edit: it is the
host's config rather than a file this repo owns byte for byte, and editing it is not a copy. The hooks row
is per-profile, which is exactly why it is in scope while that one is not.

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

### 4. Skills: overwrite from master

```bash
ls -l ~/.hermes/profiles/*/skills/ | grep -E 'jsmind-review|weka-deploy'
cp team/automations/skills/<name>/SKILL.md ~/.hermes/profiles/<p>/skills/<name>/SKILL.md
md5sum team/automations/skills/<name>/SKILL.md ~/.hermes/profiles/<p>/skills/<name>/SKILL.md
```

Overwrite unconditionally, then verify the hashes. A skill symlinked into the repo needs no overwrite, but it
still needs the hash check, spelled out at the end of this step.

Do not stop to compare the two files and decide which is newer, and do not copy the live version back into
the repo as part of a deploy. Both are ways of letting the host vote on what master should be.

One copy of a skill lives outside every profile: the file the deploy session itself reads from
`~/.hermes/skills/devops/weka-deploy/SKILL.md` in the default home. A skill symlinked into the repo needs no
overwrite — step 2 already moved the link's target to master, so only the hash is left:

```bash
ls -l ~/.hermes/skills/devops/
readlink -f ~/.hermes/skills/devops/weka-deploy/SKILL.md
md5sum ~/.hermes/skills/devops/weka-deploy/SKILL.md
git show master:team/automations/skills/weka-deploy/SKILL.md | md5sum
```

Never `cp` into that path while it is a symlink: both names resolve to one inode, so it exits 1 with
`are the same file` and writes nothing. Do not verify it against the working-tree file either — same inode,
so the two hashes are equal by construction and prove nothing. The comparison that means something is the
live file against `git show master:`. Changing this file mid-run also changes nothing for the run in
progress: those instructions were loaded before step 1, and the new bytes take effect on the next deploy.
That bounds what the check can prove, and it is less than it looks. Step 2 pulls this clone and the link
resolves into it, so by the time these hashes print the live file equals master **by construction**: a run
that started from an older copy of this document, and then followed steps master had already replaced, still
prints two equal hashes, and nothing about that run looks wrong. What the comparison catches is a link
resolving into a clone step 2 never updated, or a working tree altered after step 2. It cannot tell you which
version this session loaded — that is fixed when the session starts, before step 1.

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
- **Rework gate**: a comment on a PR whose newest card is `done` must produce a card
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

#### The label hook: registered is not the same as configured

The flow labels (`weka-queue` / `weka-working` / `weka-reviewing` / `weka-blocked`) have no writer inside a
worker any more — `labels.py` derives them from the board's `task_events` table, and what makes it run is the
`post_tool_call` hook plus the three `kanban_task_*` lifecycle events in that worker's profile. This check is
**not** gated on the step-2 diff: the block lives outside the repo, so no diff can announce that it is missing.

In each of `~/.hermes/profiles/{cody,reed,scout}/config.yaml` — four entries, one command string:

```yaml
hooks:
  post_tool_call:
    - matcher: "^kanban_.*"
      command: "/home/gg_hermes_go/.hermes/venvs/weka/bin/python /home/gg_hermes_go/repos/jsmind-v2/team/automations/weka/labels.py --reconcile --once --from-hook"
  kanban_task_claimed:
    - command: "/home/gg_hermes_go/.hermes/venvs/weka/bin/python /home/gg_hermes_go/repos/jsmind-v2/team/automations/weka/labels.py --reconcile --once --from-hook"
  kanban_task_completed:
    - command: "/home/gg_hermes_go/.hermes/venvs/weka/bin/python /home/gg_hermes_go/repos/jsmind-v2/team/automations/weka/labels.py --reconcile --once --from-hook"
  kanban_task_blocked:
    - command: "/home/gg_hermes_go/.hermes/venvs/weka/bin/python /home/gg_hermes_go/repos/jsmind-v2/team/automations/weka/labels.py --reconcile --once --from-hook"
```

The matcher is `^kanban_.*`, not `^kanban_`: `ShellHookSpec.matches_tool` uses
`compiled_matcher.fullmatch(tool_name)` (`agent/shell_hooks.py:132`), and `fullmatch` anchors both ends —
`^kanban_` matches only the literal string `kanban_`, so it would fire on nothing at all. The prefix form
(rather than a list of tool names) is deliberate: seven `kanban_*` tools change state and the list moves
with the Hermes version, while "a kanban tool was called" does not.

The three lifecycle events are what carries a card id: `kanban_task_claimed` (fired by the dispatcher,
including a claim out of `review`), `kanban_task_completed` and `kanban_task_blocked` fire after the
database commit and put the real task id in `extra.task_id`. The two transitions with no event of their
own — `kanban_request_review` (running → review) and `kanban_request_changes` (review → ready) — are
caught by the `post_tool_call` entry, whose payload names no usable card (`extra.task_id` there is a
per-turn uuid) and which therefore leans on the event cursor. `kanban_task_claimed` fires inside the
dispatch path, which is why `labels.py` re-execs itself detached and returns at once.

Absolute paths, and the string is matched **verbatim**: consent is keyed on `(event, command)`, so a
different path or a dropped flag is a different hook that has never been approved. The interpreter is part
of that string, and it is spelled out rather than left to the script's shebang: `labels.py` starts with
`#!/usr/bin/env python3`, the hook inherits the gateway unit's `PATH`
(`systemctl --user show hermes-gateway -p Environment`), and on this host `python3` resolves there to
`/usr/bin/python3` — 3.6.8, which dies on `labels.py`'s `from __future__ import annotations` before it
reads a card. The command string is identical in all four entries; only `event` (and the one matcher)
differs. It is one entry of the block step 8 writes in full — pasting this snippet as a profile's entire
`hooks:` block would drop the fence.

Consent is per profile, in `~/.hermes/profiles/<p>/shell-hooks-allowlist.json` — one entry per event,
each with that same command string:

```json
{
  "approvals": [
    {"event": "post_tool_call", "command": "/home/gg_hermes_go/.hermes/venvs/weka/bin/python /home/gg_hermes_go/repos/jsmind-v2/team/automations/weka/labels.py --reconcile --once --from-hook"},
    {"event": "kanban_task_claimed", "command": "/home/gg_hermes_go/.hermes/venvs/weka/bin/python /home/gg_hermes_go/repos/jsmind-v2/team/automations/weka/labels.py --reconcile --once --from-hook"},
    {"event": "kanban_task_completed", "command": "/home/gg_hermes_go/.hermes/venvs/weka/bin/python /home/gg_hermes_go/repos/jsmind-v2/team/automations/weka/labels.py --reconcile --once --from-hook"},
    {"event": "kanban_task_blocked", "command": "/home/gg_hermes_go/.hermes/venvs/weka/bin/python /home/gg_hermes_go/repos/jsmind-v2/team/automations/weka/labels.py --reconcile --once --from-hook"}
  ]
}
```

The command must equal the one in `config.yaml` character for character. Approving through the first-use prompt
(a foreground `hermes -p <p> chat`) or `--accept-hooks` also records `approved_at` and the script's mtime, which
is what lets doctor report drift; an entry written by hand approves the pair but cannot be checked for drift.

```bash
for p in cody reed scout; do hermes -p $p hooks doctor; done
```

Three runs, three times `All shell hooks look healthy.` A profile that answers "No shell hooks configured —
nothing to check." is a **failure**, not a pass: that profile leaves its cards' objects on whatever label they
already carry, and the only writes left are the webhook's two (card created, object closed).

The lines doctor prints, per hook, in this order — and doctor skips the smoke test entirely while the pair is
not allowlisted, which is the one ordering that matters here:

| line | meaning |
|---|---|
| `✓ script exists and is executable` | the path resolves and the file can be spawned — a typo'd path shows up here and nowhere else |
| `✓ allowlisted (approved <ts>)` | the `(event, command)` pair has consent; without this line the hook is registered but never runs |
| `✓ script unchanged since approval` | the script's mtime still matches the one recorded at approval, so nobody edited it since |
| `⚠ script modified since approval` | `labels.py` was edited after it was approved — the command string still matches, so the hook still fires; read the diff, and if the edit is master's own version, refresh the baseline: `hermes -p <p> hooks revoke '<the command string from config.yaml>'` then re-approve. That string is `revoke`'s one positional argument — the bare `hermes -p <p> hooks revoke` exits 2 |
| `✓ ran clean with empty stdout (exit=0, <t>s) — hook is observer-only` | the synthetic payload ran and the hook exited 0 with nothing on stdout, which is what `labels.py` promises: it detaches and returns at once, so a tool call is never held up |

Driving doctor is itself a reconcile. The synthetic payload names no card, so a cold cursor
(`~/.hermes/state/weka-labels/events-<board>` absent) is initialised at `max(id)` and nothing is written;
with a warm cursor it processes whatever status events are pending, so a green run may have written labels
on GitHub. That is the steady state, not a side effect to avoid. Do not delete the cursor file to "clean
up": initialising it again is safe, but the point of the file is that it survives restarts.

No gateway restart is needed. A worker is a new process that reads its profile's `config.yaml` when the card is
claimed, and a gateway picks up a change to a profile's `hooks:` block or allowlist within about 30 seconds
without any session opening.

#### Read-only check of the sweep itself

```bash
cd ~/repos/jsmind-v2
~/.hermes/venvs/weka/bin/python team/automations/weka/labels.py --dry-run --full
```

Use that interpreter, not the bare `python3` this section's older commands use: on this host `python3` is the
system 3.6.8, which dies on `labels.py`'s `from __future__ import annotations` with a `SyntaxError` before any
card is read (`README.md` →「主机侧准备」 says the same about the system Python). The weka venv is the same
interpreter the unittest above runs on.

From the clone that holds the real, gitignored `team/automations/weka/config.json` — a worktree does not, and
answers `config not found`. Run it at a plain host shell: inside a worker, `hermes kanban list` exits 1 under
the delegate fence and the sweep can only log `[ERROR] … delegate_task child contexts cannot mutate`.

`no change (n cards)` is the expected line on a quiet host, `n` being the cards the sweep window covers. Anything
else is one line per card whose labels would move, as `-old +new`. `--dry-run` sends no write request at all —
it is the only way to see what the sweep thinks without writing to GitHub.

Diff lines are not the only output. Skip and progress lines print too, and they are information, not failures:

| line | why it prints |
|---|---|
| ``<id>: title does not start with `#<number>:`; skipping`` | a side card that merely quotes an object URL — a follow-up card pointing at the PR it follows — is deliberately not keyed to that object |
| `<id>: body does not start with a GitHub object URL; skipping` | the card names no object, so there is nothing to label |
| `<id>: status=<status> assignee=<who> is not in the phase table; skipping` | that pairing maps to no flow label in `phase()` |
| `profile <p>: N running cards; falling back to a full sweep` | a hook payload names no card; N=1 resolves to that card, anything else sweeps |

One of those skip lines deserves its own reading. `phase()` recognizes the reviewer as `config.get("reviewer")`,
and nothing validates the key — `load_config()` only checks that the file exists, so a missing key degrades
silently instead of failing: a **`running` card assigned to reed printing `is not in the phase table; skipping`
means the gitignored `config.json` on this host has no `"reviewer": "reed"`**. `config.example.json` carries it,
a host copy written before that line existed is a plain miss, and until the key is added no card ever reaches
`weka-reviewing` — while `hooks doctor` stays green, because doctor proves the hook is registered, not that the
config gives the phase table a reviewer. Read the current value before trusting the sweep:

```bash
~/.hermes/venvs/weka/bin/python -c 'import json; print(json.load(open("team/automations/weka/config.json")).get("reviewer"))'
```

`reed` is correct; `None` means adding the key, which is a host edit to a gitignored deploy file (like
`~/.hermes/config.yaml` → `kanban:`), not a change to this repo.

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

### 8. Profile hooks: one ledger, three events, one fence

Two kinds of `hooks:` entries are desired state too, and they live in a file none of the steps above touch:
each profile's own `config.yaml`. Put the whole block in **cody, reed and scout** — the dispatcher hands any
of the three a worker session, so a fence present on two of them is a fence with a door.

```yaml
hooks:
  post_tool_call:
    - matcher: "^kanban_.*"
      command: "/home/gg_hermes_go/.hermes/venvs/weka/bin/python /home/gg_hermes_go/repos/jsmind-v2/team/automations/weka/labels.py --reconcile --once --from-hook"
      timeout: 5
  kanban_task_claimed:
    - command: "/home/gg_hermes_go/.hermes/venvs/weka/bin/python /home/gg_hermes_go/repos/jsmind-v2/team/automations/weka/labels.py --reconcile --once --from-hook"
      timeout: 5
  kanban_task_completed:
    - command: "/home/gg_hermes_go/.hermes/venvs/weka/bin/python /home/gg_hermes_go/repos/jsmind-v2/team/automations/weka/labels.py --reconcile --once --from-hook"
      timeout: 5
  kanban_task_blocked:
    - command: "/home/gg_hermes_go/.hermes/venvs/weka/bin/python /home/gg_hermes_go/repos/jsmind-v2/team/automations/weka/labels.py --reconcile --once --from-hook"
      timeout: 5
  pre_tool_call:
    - matcher: "^kanban_create$"
      command: "/usr/bin/python3 /home/gg_hermes_go/repos/jsmind-v2/team/automations/weka/deny_card_create.py"
      timeout: 5
      fail_closed: true
```

Six details in that block carry the meaning:

- **The ledger matcher is `^kanban_.*`, and the `.*` is load-bearing.** `ShellHookSpec.matches_tool` calls
  `compiled_matcher.fullmatch(tool_name)` (`agent/shell_hooks.py:132`), so a pattern that is only a prefix
  matches only that literal string. `^kanban_` fires on nothing; `^kanban_create$` (the fence) still
  matches exactly one tool name. The prefix form on the ledger is deliberate: the tool list moves with the
  Hermes version, "a kanban tool was called" does not.
- **Three lifecycle events plus one tool matcher, because two transitions have no event.** `claimed`,
  `completed` and `blocked` fire after the database commit with the card id in `extra.task_id`.
  `kanban_request_review` (running → review) and `kanban_request_changes` (review → ready) only write the
  board and append an event, so `post_tool_call` covers them; its payload's `extra.task_id` is a per-turn
  uuid, and the sweep leans on the event cursor instead of trusting it.
- **`fail_closed: true` only applies to `pre_tool_call`** (`agent/shell_hooks.py`'s
  `_BLOCKING_EVENTS`), which is why the fence is the event that gets it. Drop the key and a
  `deny_card_create.py` that crashes (exit 1, no directive) or times out fails *open*:
  `kanban_create` succeeds, and nothing says the fence moved. A script the interpreter cannot open is
  not that case — python exits 2, and 2 blocks on its own (`:587-592`).
- **`command` is a string, never a YAML list.** `_parse_single_entry` drops a non-`str` `command`
  with one warning and registers nothing (`agent/shell_hooks.py:413-416`), and a config with no
  registered hooks makes `hooks doctor` print `No shell hooks configured — nothing to check.` and exit
  0 (`hermes_cli/hooks.py:274-276`) — so the three greens below would pass with no fence at all. Keep
  it a single string, byte-identical to the allowlist entry.
- **Each command names its interpreter, and the two differ on purpose.** The fence names
  `/usr/bin/python3`, which is 3.6.8 here, so `deny_card_create.py` has to stay inside 3.6's stdlib and
  has to be checked with that interpreter:
  `/usr/bin/python3 -m py_compile team/automations/weka/deny_card_create.py`. Plain `python3 -m
  py_compile` resolves to a newer interpreter on this box and passes a file the hook cannot import. The
  ledger names `~/.hermes/venvs/weka/bin/python`, because `labels.py` imports
  `from __future__ import annotations` and the bare-script form would resolve its
  `#!/usr/bin/env python3` shebang against a `PATH` whose `python3` is the same 3.6.8. A wrong
  interpreter is not a red doctor line: the smoke test prints `(exit=1)` with empty stdout and stays
  green, so read the exit code.
- **The ledger's state lives in `~/.hermes/state/weka-labels/`.** `events-<board>` is the per-board event
  cursor (initialised at `max(id)`, so a fresh file never replays history), `counter` is the wake counter
  (every tenth wake adds the fallback sweep), `lock`/`dirty` serialise concurrent hooks, and `log` holds
  everything the detached child prints. None of it is per profile on purpose: three profiles watching one
  board need one cursor, not three.

Then consent, because `hooks_auto_accept` is `false` here. A hook that is neither allowlisted nor
launched with `accept_hooks` is **skipped, not failed closed**: `register_from_config` logs
`not allowlisted … — skipped` and never wires it (`agent/shell_hooks.py:173`), and `fail_closed` only
covers a hook that did register and then errored, timed out, or printed something that is not a JSON
object (`:577-609`). A missing allowlist entry is therefore not a weaker fence — in a session with no
launch consent it is no fence at all.

What keeps the fence live inside a Kanban worker is the launch, not that file: the dispatcher builds
the session context with `accept_hooks=True` (`gateway/session_kanban.py:65`), and the worker registers
the frozen config under that consent (`gateway/session_policy.py:796-809`), which records the approval
into the allowlist as a side effect (`_prompt_and_record`, `agent/shell_hooks.py:748`). The allowlist is
what carries that consent to every *other* session, so the entries still have to exist even though a
worker would reach the same registration without them — and they are what makes the fence **profile
level, not worker level**. `_consented` keys on the `(event, command)` pair and never asks whether the
session is a worker (`agent/shell_hooks.py:314-325`), so an interactive `hermes -p cody` — or `-p reed`,
`-p scout` — refuses `kanban_create` too and returns the same fixed message; no terminal is exempt.
Outside the fence: the `hermes kanban create` subcommand writes to the board without passing through
the tool layer, and a profile with neither the hook nor its entry has nothing to fire.

Within a registered session a block with a new line in `~/.hermes/state/weka-labels/deny.log` is this
script's decision. A block with **no** new line came from somewhere else, and the line is not enough to
tell where — read the message the tool returns. `fail_closed` names the hook:
`hook <command> failed closed: …` (`agent/shell_hooks.py:550-551`). An interpreter that cannot read the
script exits 2 with python's own `can't open file '…'` on stderr, and any `exit 2` on a blocking event
blocks by itself, `fail_closed` or not (`:587-592`). The allowlist is per Hermes home, which for a
profile process is the profile directory (`get_hermes_home()`; `hermes -p <p>` sets it to
`~/.hermes/profiles/<p>`), so it is `~/.hermes/profiles/<p>/shell-hooks-allowlist.json`:

```json
{"approvals": [
  {"event": "post_tool_call", "command": "/home/gg_hermes_go/.hermes/venvs/weka/bin/python /home/gg_hermes_go/repos/jsmind-v2/team/automations/weka/labels.py --reconcile --once --from-hook"},
  {"event": "kanban_task_claimed", "command": "/home/gg_hermes_go/.hermes/venvs/weka/bin/python /home/gg_hermes_go/repos/jsmind-v2/team/automations/weka/labels.py --reconcile --once --from-hook"},
  {"event": "kanban_task_completed", "command": "/home/gg_hermes_go/.hermes/venvs/weka/bin/python /home/gg_hermes_go/repos/jsmind-v2/team/automations/weka/labels.py --reconcile --once --from-hook"},
  {"event": "kanban_task_blocked", "command": "/home/gg_hermes_go/.hermes/venvs/weka/bin/python /home/gg_hermes_go/repos/jsmind-v2/team/automations/weka/labels.py --reconcile --once --from-hook"},
  {"event": "pre_tool_call", "command": "/usr/bin/python3 /home/gg_hermes_go/repos/jsmind-v2/team/automations/weka/deny_card_create.py"}
]}
```

The `command` string must equal the config's `command` string, byte for byte:
that pair is the key the approval is looked up by, so a `~` or a different quoting on one side of the
two files buys a permanently unapproved hook — silently, since a skipped hook only logs one warning.

```bash
for p in cody reed scout; do hermes -p "$p" hooks doctor; done
```

Three greens, or the step is not done — but read what a green line proves. `doctor` fires each hook
against a synthetic payload, so it answers three questions only: the command is executable, the pair is
allowlisted, and the script can be spawned. It does **not** prove the script parses: `_doctor_one`
prints `✓ ran clean with empty stdout (exit=N, …)` for *any* exit code as long as stdout is empty
(`hermes_cli/hooks.py:333-335`), so a `deny_card_create.py` written in 3.10 syntax — SyntaxError under
`/usr/bin/python3` 3.6.8, empty stdout, `exit=1` — still shows a green `pre_tool_call` line. Read the
`(exit=N)` value on every line; parsing is proven by the `-m py_compile` above, run with the same
interpreter, not by doctor.
What doctor also cannot prove is the fence firing inside a worker — the tool layer has to be exercised:
`kanban_create` in a worker session returns the fixed message, `SELECT count(*) FROM tasks` on the board
does not move, and the deny log gains a line.

Proving `fail_closed` needs a non-zero exit that is not 2: `chmod 000` does not do it. The
interpreter cannot read the script, exits 2, and 2 is the block code on its own (`:587-592`), so that
probe stays blocked with `fail_closed` deleted — and the message is python's `can't open file '…'`, not
the hook's. Use a copy of the script written in 3.10 syntax at the same path instead: under
`/usr/bin/python3` 3.6.8 it raises SyntaxError before printing anything, so it exits 1 with empty stdout,
and only a `fail_closed` hook turns that into a block (`:600-602`). Expect the call refused with
`failed closed: hook exited 1 with no directive`, no new card, no new log line; then put the real script
back. A host where that run creates a card has lost `fail_closed`. While the copy is in place, doctor
prints `⚠ script modified since approval` for an entry that recorded the script's mtime at approval —
one approved at a first-use prompt or a launch, not one written by hand, which records no mtime and
therefore no drift line. That warning is the mtime check working, not a second failure, and restoring
the file does not clear it: the baseline has to be re-recorded. Revoke the entry with
`hermes -p <p> hooks revoke '<the command string>'`, then let that same profile approve it again —
the next worker launch with `accept_hooks=True`, or the first-use prompt. The `-p`
is not optional — the allowlist is read from `get_hermes_home()`
(`agent/shell_hooks.py:687-689`), so a `hooks revoke` from an ordinary shell reads the
root home, reports `No allowlist entry found for command`, and leaves the baseline in place. An
existing entry is never re-recorded on its own, whoever wrote it: `_consented` returns as soon as the
`(event, command)` pair is allowlisted (`:314-325`), and `_record_approval` is reachable only from
`_prompt_and_record` (`:748`, `:771`). A handwritten entry therefore never grows an mtime, doctor
answers only its three questions for it and never prints a drift line, and it reaches an mtime
baseline by the same revoke-then-approve route.

No restart is involved: the gateway re-syncs hooks from the live config when it opens a session
(`gateway/session_policy.py` → `sync_from_config`), and a worker reads the config it was launched with.
Adding a hook is therefore not a reason to bounce the webhook unit — and bouncing it is the one action
here that can drop a delivery.

### 9. Report

`$OLD` and the new `HEAD`; what the step-2 range listed; that SOUL, the profile skills, the default-home
skill and the webhook were reset to master, with the hash pairs — for the default-home skill the live file
against `git show master:` — and the restart's start time;
the smoke evidence or why it did not apply; the two concurrency ceilings as step 7 found them (the file's
numbers and the value the gateway booted with); the three `hooks doctor` verdicts and, for the fence, whether
a worker call was actually refused; and anything still outside this procedure (`config.yaml` → `kanban:`).

## Stop and ask instead of guessing

- The clone is dirty, or sits on a branch other than `master`.
- The change requires `~/.hermes/config.yaml` → `kanban:` — hand over the edit *and* the restart that makes
  it take effect. Or step 7 disagrees: hand over whichever branch fits — file not 3 / 1 means edit the
  `kanban:` section then restart; file already 3 / 1 with an older gateway start time or a mismatched boot
  line means restart only, and say plainly that `config.yaml` needs no change. Those values are read once at
  gateway boot, and the gateway refuses to restart itself from inside its own process.
- The smoke test prints something other than the expected line: report it. Restarting again to "see if it
  clears" destroys the evidence.
- A profile's `hooks doctor` is not fully green. Report which hook and which answer line is red;
  `_doctor_one` (`hermes_cli/hooks.py:286`) prints at most four — script executable, allowlist status,
  mtime drift, and the JSON smoke line. Drift appears only when the entry recorded
  `script_mtime_at_approval`, which a handwritten entry does not, and the smoke line is where
  `(exit=N, Xs)` lives, so timing is not an answer line of its own: a healthy hook shows three lines for
  a handwritten entry and four for one recorded at a prompt or a launch. Do not "fix" it by running a
  hook test interactively, because the point of the allowlist entry written in step 8 is that nobody has
  to be at a prompt.

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
