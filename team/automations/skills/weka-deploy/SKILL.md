---
name: weka-deploy
description: "Bring the live weka flow up to master on this host. Use when asked to 更新流程 / deploy the flow."
type: workflow
lifecycle: active
---

# Deploying the weka flow

Merging is not deploying. `origin/master` is what the flow should be; this procedure makes the host
match it. It is keyed to a **revision**, not to a pull request — whatever landed since the last deploy
is the work, and nobody should need a PR number to run it.

Two incidents produced this document, both from the same blind spot — the file was right and the
running thing was old:

- A label-cleanup fix merged in the morning; the process had been started the day before, so the flow
  kept behaving like the bug was still open. Nothing in the logs said so.
- The profile `SOUL.md` files are copies. The repo's version moved; the copies did not, and a worker
  ran weeks-old instructions while every file looked fine.

## What needs what

| Artifact | Reaches the live host by | Restart |
|---|---|---|
| `team/automations/weka/SOUL.cody.md`, `SOUL.reed.md` | `~/.hermes/profiles/<p>/SOUL.md` — symlink, or a copy that must be refreshed | none — read when a worker session starts |
| `team/automations/skills/<name>/SKILL.md` | `~/.hermes/profiles/<p>/skills/<name>/SKILL.md` | none — read when a session starts |
| `team/automations/weka/github-webhook.py`, `github-webhook.service` | `git pull` in the clone the unit points at | `systemctl --user restart github-webhook` |
| `~/.hermes/config.yaml` → `kanban:` | hand edit (not in this repo) | gateway restart |
| `README.md`, other `*.md`, this file | nothing | — |

A profile copy can also be **ahead** of the repo: Hermes's skill curator edits installed skills in
place, so the live file can carry lessons the repo has never seen. Treat that as knowledge that exists
only on this host — a rebuild loses it — and never overwrite it to make a deploy look clean.

## Steps

### 1. What is live, and what is on master

```bash
cd ~/repos/jsmind-v2
git rev-parse --abbrev-ref HEAD && git rev-parse --short HEAD
git fetch -q origin master && git log --oneline HEAD..origin/master
systemctl --user show github-webhook -p ExecMainStartTimestamp
```

An empty range means nothing merged since the last deploy. If the webhook also started after the last
commit that touched it, there is nothing to do — say that and stop. Do not manufacture work.

If the clone is not on `master`, or the tree is dirty, stop and report: never reset a shared clone to
make a step succeed.

### 2. Update the clone, and prove it

```bash
OLD=$(git rev-parse HEAD)
git switch master && git pull --ff-only && git log -1 --oneline
```

Keep `$OLD` — step 3 diffs against it, and the report is keyed on it.

### 3. Sort what moved into the four classes

```bash
git diff --name-only $OLD..HEAD -- team/automations/
```

| Path under `team/automations/` | Obligation |
|---|---|
| `weka/SOUL.cody.md`, `weka/SOUL.reed.md` | step 4 |
| `skills/<name>/SKILL.md` | step 5 |
| `weka/github-webhook.py`, `weka/github-webhook.service` | step 6, then step 7 |
| anything else (`README.md`, other docs) | nothing |

Name the classes that moved in the report. "Deployed" without that list is not a report, and skipping a
class is how the last two incidents happened.

### 4. SOUL: make the profile match the repo, then verify bytes

```bash
ls -l ~/.hermes/profiles/cody/SOUL.md ~/.hermes/profiles/reed/SOUL.md
```

- **Symlink** (`-> .../team/automations/weka/SOUL.cody.md`): step 2 already deployed it.
- **Copy**: refresh it.

```bash
cp team/automations/weka/SOUL.cody.md ~/.hermes/profiles/cody/SOUL.md
cp team/automations/weka/SOUL.reed.md ~/.hermes/profiles/reed/SOUL.md
```

Verify either way — equal hashes, not "the copy ran":

```bash
md5sum team/automations/weka/SOUL.cody.md ~/.hermes/profiles/cody/SOUL.md
```

No restart is involved: `SOUL.md` is read when a worker session starts, so the next card picks it up.
That is also why a drifted copy fails silently.

### 5. Skills installed into profiles — the repo wins

Repo sources live under `team/automations/skills/`. A profile install is a deployment target, not a
fork: when the two differ, the repo's version is what goes live. Do not stop to ask which side moved.

```bash
ls -l ~/.hermes/profiles/*/skills/ | grep -E 'jsmind-review|weka-deploy'
cp team/automations/skills/<name>/SKILL.md ~/.hermes/profiles/<p>/skills/<name>/SKILL.md
md5sum team/automations/skills/<name>/SKILL.md ~/.hermes/profiles/<p>/skills/<name>/SKILL.md
```

Copy unconditionally, then verify the hashes are equal — "the copy ran" is not evidence.

What that policy costs, and why it is still right: the profile copy can carry edits made live by
Hermes's skill curator, and git has none of them. Treat such an edit as a draft — if it was worth
keeping, it belonged in the repo, where it would have been reviewed. The one obligation left is to not
lose it silently: before overwriting, count what only the profile has
(`diff <repo> <profile> | grep -c '^>'`) and name the file and the count in the report. A deploy that
discards live edits without saying so is indistinguishable from one that never noticed them.

### 6. Restart the webhook, only when its own inputs moved

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

The start timestamp must be later than the file's mtime. A process that started before the file changed
is exactly the failure this step exists to catch.

A docs-, SOUL- or skills-only deploy restarts nothing. Say so explicitly in the report — an unexplained
"no restart" reads like an omission.

### 7. Smoke test, only when behaviour changed

Behaviour changed when `github-webhook.py` moved, or when a handler's inputs did. Nothing else can
affect what the service does at runtime.

Cheapest proof first — the flow's own tests:

```bash
~/.hermes/venvs/weka/bin/python -m unittest discover -s team/automations/weka -p 'test_*.py'
```

They are stdlib-only and take milliseconds. A green run says the handlers behave; it does not say the
running process is executing them, which is what one real event is for:

- **Label cleanup / close handling**: pick a **closed issue that is not assigned to the bot account**,
  add a flow label, reopen, close. The close payload carries the label, so expect
  `[OK] removed <label> from #<n>` in `journalctl --user -u github-webhook`.

  Not any closed issue. One still assigned to the bot account passes the create gate, so adding a label
  to it calls `kanban create` again: the idempotency key (`gh-issue-<n>`) normally absorbs it because
  the original card still exists, but the journal prints `[OK] ... create ...`, and a card whose key had
  been pruned would really be created. An unassigned issue fails that gate cleanly and still exercises
  the strip.
- **Rework gate**: a comment on a PR carrying `weka-reviewed` must produce a card
  (`hermes kanban --board jsmind-v2 list`) or a comment on the PR explaining why not. Only the human
  account can trigger this path — bot events are ignored on purpose — so ask the user to leave the
  comment instead of working around the gate.

When nothing executable moved, do not manufacture an event: real events have side effects (see the
assigned-issue trap above) and they prove nothing about code that did not change. Write "no executable
change, smoke test not applicable" instead.

Quote the journal line in the report. "Restarted and it is active" is not a smoke test.

### 8. Report

What was live (`$OLD`) and what is live now; which of the four classes moved; every restart with its
start timestamp; the smoke evidence, or why it was not applicable; and anything a human still has to do
(a `config.yaml` edit, folding a profile-ahead skill back into the repo).

## Stop and ask instead of guessing

- The clone is dirty, or sits on a branch other than `master`.
- The change requires `~/.hermes/config.yaml` → `kanban:`. Those values are read once at gateway boot,
  and the gateway refuses to restart itself from inside its own process — hand the command over.
- The smoke test prints something other than the expected line: report it. Restarting again to "see if
  it clears" destroys the evidence.

## Do not

- **Do not add auto-restart-on-change.** A `systemd.path` unit or a self-exec would close the gap, and
  it is deliberately not wanted: the service is a single-threaded `HTTPServer`, so a restart landing
  mid-request drops that GitHub delivery, and GitHub does not redeliver on its own. A human restart at a
  chosen moment is the current answer; keep it that way unless the service is made graceful first.
- Do not touch `config.json` while deploying code — it holds the webhook secret and is gitignored.
- Do not hand-edit anything under `~/.hermes/profiles/*/` beyond steps 4 and 5; the repo is the source
  of truth, and a local edit will either be silently overwritten by the next deploy or silently diverge
  from it.
- Do not `git reset --hard` the clone the service points at.
- Do not deploy "the PR that was just merged" by name. Read master: the newest commit may not be the
  only thing that landed since the last deploy.
