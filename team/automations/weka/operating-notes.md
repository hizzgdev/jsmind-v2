# weka 运行时判据

这份文件记录 weka 流程**运行中**的判据、状态语义和踩过的坑。主要读者是操作这套流程的 agent（Hermes 侧）
和排障的人；cody、reed 的 SOUL 和 `README.md` 管的是"怎么建起来"，这里管"怎么判断它现在是什么状态"。

**weka 是哪条线：** Hermes 侧的流程（webhook + kanban + dispatcher，没有 coordinator），代码和配置都在
`team/automations/weka/`。

读法：**动 weka 的任何一部分之前，先读这份**。它和 `README.md` 不互相覆盖——README 是重建手册，这份是
操作判据；两者冲突时，以当时跑着的代码和这台机器上的实际状态为准，并把冲突记在这里。

## 卡片是触发器，GitHub 是真相源

Superseding the card model described further down: a card is a **trigger**, GitHub
is the source of truth. Full contract in `README.md`（同目录）. The four
rules that matter when touching any part of it:

- Card titles carry the key: `#85: <title>` (issue card) / `#86: Rework — <title>`
  (PR card, no round counter). Lookup is prefix-anchored (`title LIKE '#86:%'` +
  `status NOT IN ('done','archived')`), so `#860` and mid-title mentions never match.
- One open card per number; when one exists, the webhook appends a comment instead
  of creating a second card.
- `weka-reviewed` on the PR is the ONLY flow-control label. Human review/comment
  triggers a rework card only while it is present, and cody strips it on pickup.
  The four process labels (`weka-queue` / `weka-working` / `weka-reviewing` /
  `weka-blocked`) are for humans only, and **`labels.py` is their one writer** —
  no worker adds or removes them (see 「标签，以及实际跑着的那个进程」 below).
- There is no "waiting for a human" card state: reed ends with `kanban_complete`
  (approved) or `kanban_request_changes`. No block, no triage, no
  `assign <task> none`. PR merge/close is cleaned up by the webhook (worktree by
  `head.ref`, local branch, labels) with no cleanup card.

The older bullets below still describe the infrastructure (venv, nginx, HMAC,
idempotency, ignore rules) and remain accurate; they only predate the trigger-only
card model.

weka pitfalls that bit during setup (all live in the README too):
- **The bridge is a systemd *user* unit that loads its script from the working tree, so editing the file does nothing until you restart it.** `systemctl --user status github-webhook` and `journalctl --user -u github-webhook -n 50`; plain `systemctl status` answers "Unit github-webhook.service could not be found" and is a dead end, not a missing service. A merged fix stayed dark for a day because the process had started before the merge and nothing watches the file — after editing `github-webhook.py`, run `systemctl --user restart github-webhook` and confirm the startup line `weka webhook listening on 127.0.0.1:9180`. The same trap bites the reading side: a  checkout days behind master shows pre-fix code, so `git fetch origin master && git diff --stat HEAD origin/master` before concluding a handler is missing. Verify a label-cleanup change end to end by reopening and re-closing a scratch issue and watching for `[OK] removed <label> from #N` — and pick an issue that is **not** assigned to the bot account: an assigned one still passes the create gate, so the label you add replays `kanban create`, absorbed only by its idempotency key (`gh-issue-<n>`) while the old card survives.
- Run the webhook script from a pinned venv (`/usr/bin/python3.11 -m venv ~/.hermes/venvs/weka`);
  `/usr/bin/python3` on this AL3 image is 3.6 and can't run modern syntax. Do not generalise that to
  `python3` in a shell: an interactive PATH can resolve to a much newer uv-managed interpreter (3.14
  observed), while a systemd unit and a fresh login may get the old one — print `python3 -V` before
  blaming the code. Declare the version floor in the README and pin a venv instead of downgrading code to
  match the host — adapting syntax to an old interpreter never ends.
- Under systemd the PATH lacks `~/.local/bin`, so the script must reach `hermes` explicitly: `shutil.which("hermes") or os.path.expanduser("~/.local/bin/hermes")`. Do not expose a `hermes_bin` config field — an environment workaround is not business config.
- Keep config to semantic fields only: port / secret / target_label / kanban_board / assignee / human_login / bot_login. Derive paths (a board's DB is `~/.hermes/kanban/boards/<slug>/kanban.db`, from `kanban_board`), hard-code flow-fixed behaviour (`--workspace worktree --project jsmind-v2`), and gitignore the real `config.json` (holds the HMAC secret; only `config.example.json` is committed). Config-for-everything is an anti-pattern the owner will call out.
- Gate the trigger on assignment, not the label alone. On a public repo anyone can apply a label, so a `weka` label must NOT create a task by itself — require the issue to ALSO be assigned to the bot account (`bot_login`, default `zzgbot`), and handle all of `opened`/`labeled`/`assigned` actions so label+assignment order doesn't matter. Skip with a `[GATE]` log unless `issue.assignee.login == bot_login`. The owner must assign the issue to the bot when filing it; without the gate, strangers drain the LLM budget.
- Filing the triggering issue: `gh issue create --label weka --assignee zzgbot` in ONE call delivers three events (`opened`, `labeled`, `assigned`, all passing the gate), so the board must end with exactly ONE card — `--idempotency-key gh-issue-<n>` is what collapses them. Treat one card per three deliveries as the invariant to assert when testing the flow; more cards means the key broke.
- Filing a plan of several issues — staged work. The gate's need for assignment doubles as the pause
  button: create every issue with `--label weka` and NO `--assignee`, so nothing wakes, then assign one
  at a time (`gh issue edit <n> --add-assignee zzgbot`) as the previous one lands. Numbers do not exist
  until creation, so chaining each card to the next is a second pass: create all of them, then
  `gh issue edit <n> --body-file <f>` with a `## 下一张卡` section appended, so a later session never has
  to work out which item comes next. When execution order disagrees with the numbering, say so in the
  body ("this one consumes #127's option surface, so #127 goes first") and never assign in numeric
  order. After the first assignment, confirm the count with
  `hermes kanban --board jsmind-v2 list`: exactly one card, in that issue's `#<n>:` form. A second card
  means the idempotency key or the gate broke.
- Creating the GitHub webhook needs `admin:repo_hook` scope; `zzgbot` only has `repo`, so the owner (`hizzgdev`) configures it in the UI.
- The bridge binds loopback (`127.0.0.1:9180`) and nginx fronts it as a standalone server block (`team/automations/weka/nginx.conf` → `/etc/nginx/conf.d/`) on a nonstandard port with `server_name _` (the repo holds only `<public-ip>`/`<webhook-port>` placeholders; real values live on the machine). Serve by public IP, not a domain — on a mainland (Alibaba) server a domain needs ICP filing and gets intercepted/403'd until filed, a bare IP does not. It allow-lists GitHub's webhook source IPs (`curl https://api.github.com/meta` → `hooks`), so when webhook events stop arriving, diff that whitelist against the API FIRST. Never expose a stdlib `http.server` straight to the public net — it is single-threaded/serial, so one slow request stalls every GitHub delivery, and HMAC can't stop a DoS because the request already entered the process before it is verified.
- Never `git add -A` or `git add <dir>` in this repo: one sweep carried a vim `.config.json.swp` holding the HMAC secret, another pulled in the worker `.worktrees/` scratch dir, a third added `__pycache__/*.pyc` from running the webhook locally. Stage explicit paths. `.gitignore` now has `*.swp`/`*.swo`/`*.swn`. A secret that ever hits git history is burned — rotate it (regenerate + update both the local config and the GitHub webhook), never just delete the file.
- The worker `.worktrees/` dir (each worktree carries its own `.git`, read as an embedded repo) needs ignoring in BOTH `.gitignore` (`/.worktrees/`) and the eslint flat-config `ignores` (`.worktrees/**`) — eslint does not read `.gitignore`, so without the eslint entry `format-check` lints the whole worktree and pre-push fails. Running the webhook locally leaves `team/automations/weka/__pycache__/*.pyc`; `__pycache__/` and `*.pyc` are in `.gitignore` for the same reason.

The `.worktrees/` ignore is a patch, not the clean fix, and the owner has
flagged it: worktrees should NOT live inside the project dir. Hermes hard-codes
project worktrees to `<repo>/.worktrees/<task-id>` (`_anchored_worktree`), and
`--workspace worktree:<path>` still requires the path's parent to sit inside a
git repo (`_repo_root_for_worktree_target`) — so an outside-the-repo worktree is
not expressible in current Hermes. That needs a Hermes worktree-root config
(an upstream issue), not a weka-side flag; keep the ignore entries until then.

- **Write the guard only after watching the tool answer the question.** Every guard in this flow that was
  stricter than the thing it wrapped caused the bug it was meant to prevent: `--force` allowed only on an
  empty `git status` kept 11 merged worktrees alive, and a hand-kept list of "build artifacts" had to be
  right about a filesystem to stay correct. The order that avoids it: name the decision, run the probe
  (`scripts/probe-worktree-removal.sh`, or a throwaway `git init` + one commit + one case), read which way
  the tool already answers, and write code only for the part the tool does not decide — usually exactly one
  question (here: "was this PR merged?"). A guard is justified by a case the tool gets *wrong*, and that
  case has to be observed, not imagined. Corollary: when a guard and its tool disagree, the guard is the
  suspect, not the tool.
- **A behaviour change is not finished until the sentences describing it are found, in every language.**
  `cleanup-worktrees.py`'s criterion went from `merged OR branch gone` to `merged`; the commit touched the
  script and its test, and left the same rule stated in `weka/README.md` (Chinese) and
  `weka-deploy/SKILL.md` (English), both still naming three conditions. `grep -rn "gone from origin"`
  would have printed one of them — a grep in English only would have printed neither. It surfaced a merge
  later, when the deploy was executed and the doc had to be read rather than written. Two habits: after
  changing when something happens, grep the repo for the words that describe it in every language it is
  written in; and keep such a rule stated once, in the file that must change with the code, with the
  others pointing at it. The command that finds the copies is
  `grep -rn "<old wording>" --include='*.md' --include='*.py' .` — the code review sees the diff, never the
  sentence six files away that the diff falsified. A paragraph that restates code behaviour is a claim
  with no test behind it.
- **Let git decide what counts as work — a hand-written list of "build artifacts" is a second, stricter
  policy.** `git worktree remove` already refuses a worktree holding a tracked modification or an untracked
  path, and removes one whose untracked content is ignored. The old guard duplicated that and was stricter:
  it allowed `--force` only when `git status --porcelain` came back empty, which never happens because the
  worker symlinks the main checkout's `node_modules` into its worktree, so every merge kept both the tree
  and the branch. The fix is the ignore rules plus *deleting* the classifier (`WORKTREE_ARTIFACTS`,
  `blocking_paths()`), never widening it: an artifact missing from `.gitignore` then blocks its own
  cleanup, which is the right place to repair it. Establish git's behaviour instead of recalling it:
  `scripts/probe-worktree-removal.sh` (in the repo, not in this skill) builds the four cases (ignored
  symlink, ignored dir, stray file, tracked edit) in a throwaway repo and prints REMOVED/REFUSED for each
  — that probe is what showed an ignored symlink does not block removal, and the weka README carries the
  three mechanisms it established so the next reader does not have to take this file's word for it. The
  branch-delete WARN that follows a failed removal is a *consequence* ("used by worktree"), so one WARN
  pair in the journal is one bug, not two.
- **An ignore rule ending in `/` matches a directory, never a symlink.** `.gitignore` carried
  `node_modules/`, `dist/`, `_site/`, so a worker's symlink surfaced as untracked; they are bare names now
  (`node_modules`, `dist`, `_site`, `coverage`), which match the link as well and stop `git status` in a
  worktree from lying to a human too. Every name a cleanup excuses must also be a bare `.gitignore` rule,
  and the list must not grow names nothing here produces (`.vite`, `.cache` were exactly that). Pinned by
  two tests that read `.gitignore` (`test_every_leftover_is_ignored`,
  `test_no_rule_depends_on_a_trailing_slash`), so a speculative entry fails CI instead of becoming a hole.
- **The whole-checkout reconcile is a separate tool, not a webhook mode.**
  `scripts/cleanup-worktrees.py` (`--dry-run` to report, `--all` to skip the
  GitHub question) removes a worktree only when `gh pr list --state merged --head
  <branch>` names a PR; git's own check then decides whether the directory is
  disposable. The owner asked for this split explicitly: the service turns events
  into cards, and a maintenance pass over the whole checkout is a different
  purpose — `Weka` has no `sweep_worktrees`, and a test pins that. Keep such a pass
  out of the service even though it is tempting: an event path is at-most-once and
  its ack is unconditional (the handler catches every exception and still answers
  200, and GitHub does not redeliver failures), so the tool is the only thing that
  can reconcile what the events failed to do. Run it from the deploy procedure and
  expect `0 worktree(s) removed` on a clean host. Beyond plain git the tool adds
  exactly three things: the "was this merged?" question, `git branch -D` (removing
  a worktree leaves its local branch behind every time), and `git fetch --prune`
  to drop the stale `origin/*` refs. Keep the list that short — when asked whether
  it adds any logic, answer with this inventory rather than prose. One criterion,
  not two: an `or` with "branch gone from origin" also deleted branches whose PR
  was closed unmerged, taking commits that never reached master with them. Python
  tools under `scripts/` are discovered separately — CI runs
  `unittest discover -s scripts` beside the weka suite.
- **"Does this add any logic beyond X?" is answered with an inventory and a probe, not an argument.**
  When the owner questions whether a tool earns its complexity, list the external commands it actually
  runs (search the file for `"git"` / `"gh"`), then reproduce the underlying behaviour in a scratch
  directory. Each round of that in this session removed real code; every round of defending the design in
  prose would have kept it. Two probes worth reusing: a throwaway repo for git semantics, and a
  `--dry-run` against the real tree for what the tool would do.
- `git worktree list --porcelain` parses by blocks separated by a blank line, with `worktree <path>` and
  `branch refs/heads/<name>` inside — do not re-derive it with awk one-liners, and remember worktrees of
  squash-merged branches are *not* ancestors of `master`, so `git branch --merged` answers "unmerged" for
  every one of them. Ask GitHub which PR merged, never git ancestry.

## 标签，以及实际跑着的那个进程

- **A SOUL is a prompt read every turn, not documentation — imperatives first, one state table, rationale last.**
  Both SOULs had grown to several thousand tokens, and most of the growth was the same invariant restated in
  开工 / 干活 / 交接 / 收尾 plus the weka README: the pickup label alone appeared dozens of times across four
  files. The step a worker actually skipped — give the card's object `weka-working` — opened its step with a
  paragraph about a 404 exit code and then carried four conditional sub-bullets, a third of the way down the
  file, with the profile copy byte-identical to the repo. That is local dilution, not distance from the top,
  so trimming alone does not fix it. In order of strength: make the step deterministic (`scripts/` command the
  worker runs, or a sweep that labels a running card's object when it carries no flow label), then rewrite the
  SOUL as numbered commands with the reasoning after them. Long executable recipes belong in `scripts/` where
  they can be tested — a label-cleanup bash block was a third of one SOUL — and the SOUL only names the command.
  The label sweep was the remedy that stuck: `labels.py` now derives the phase from the board, and the SOULs
  carry no labelling command at all.
- **'The event never fired' is a hypothesis; a running card looks like nothing from GitHub's side.**
  Check the bridge journal first (`[OK] … kanban … create #<n>` versus a `[GATE] … skipping` line that names
  the condition it refused), then the board (`hermes kanban --board jsmind-v2 list` shows `● running` with
  elapsed time), then the worktree (`.worktrees/<task>` on a branch that is not pushed yet). A worker can run
  for ten minutes editing a dozen files with no branch, no PR and no label on GitHub — the label is written
  by a sweep that follows the board, so its absence means the sweep has not reached the card, not that the
  worker never started. Quote the timestamps back
  instead of diagnosing the premise as given.

- **The four process labels have one writer, and it is `labels.py`.** `weka-queue` / `weka-working` /
  `weka-reviewing` / `weka-blocked` are added and removed by
  `team/automations/weka/labels.py`, which reads the board and writes only the difference. The phase is
  a pure function of `(status, assignee)`; the two event sources are the `post_tool_call` hook (every
  10th call reconciles the whole board, the rest only the card that tool call touched — the payload
  names no card id, so the sweep takes the one `running` card of the profile that fired it) and the webhook's
  create path (right after `kanban create`, that one card — `kanban create` is a CLI call no tool hook
  sees, and the new card sits in `ready` with no session until the dispatcher claims it, which is the
  window `weka-queue` is for). No timer. "The whole board" means every unfinished card plus the ten most
  recently finished ones (`FULL_SWEEP_DONE_LIMIT`), ordered by `created_at`; an older `done` card was
  stripped when it went `done`, so a sweep does not have to re-read the ~100 the board keeps. The SOULs
  no longer contain a single labelling command, so "the model forgot" cannot become a wrong label on
  GitHub any more. The one exception is `scripts/weka/pass-review.sh`: at approval it still strips
  `weka-reviewing`/`weka-working` before adding `weka-reviewed` and flipping to ready. That is the same
  transition rather than a second owner — its ordering rule cannot be handed to an asynchronous sweep
  that may land seconds later — and a sweep that starts afterwards finds nothing left to write. A sweep
  already in flight when the card flips can still land after it and write `weka-reviewing` back onto a
  now-ready PR; the window is seconds, and `weka-reviewed` is untouched. Whether that stale label heals
  then depends on the card's shape. On a rework card the object *is* the PR, so the next sweep (the
  `kanban_complete` hook) erases it. On an issue card the card is already `done`, and a finished card
  only strips the issue its body names — the PR is not read at all — so the label stays on that PR until
  the webhook's close-time `strip_labels()` clears it.
- **The hook fires inside a worker, so the sweep is handed a fence-free env.** Hermes mints
  `HERMES_DELEGATED_CHILD_CONTEXT` into every subprocess of a worker, and under that fence
  `hermes kanban list` exits 1: `list` runs `recompute_ready()`, which is a write. `labels.py` drops the
  marker (with the rest of the worker identity) for its detached child only — the sweep reads the board
  and writes to GitHub, it is not a delegate child. A log full of `[ERROR] … exited 1` naming
  `delegate_task child contexts cannot mutate` means the grant is missing; it does not mean the board
  was empty. `hooks doctor` cannot catch this: it reads only the hook's own stdout and exit code, while
  the fence error is logged by the detached child. The synthetic payload has no card id but does carry
  the firing profile, so a doctor run also reconciles that profile's card (or a full sweep) — it is not
  a no-op.
- **`weka-reviewed` and `weka` stay outside the reconciler.** `pass-review.sh` adds `weka-reviewed`, the
  webhook strips it on close, and `weka` is a participation marker nobody mutates. A sweep must never add
  or remove either one: the rework gate reads `weka-reviewed`, so a script that touched it could
  manufacture rework cards.
- **`done` strips and never adds.** A card in `done`/`archived` has no phase, so the sweep only removes
  leftover process labels, and sends no write at all when none are left. What it strips is the object the
  card's body names: a rework card's PR, or an issue card's issue. A finished **issue** card does not
  touch the PR its `branch_name` opened — the PR lookup happens only while the card still has a phase,
  because a finished issue card would otherwise cost a `gh pr list` plus a read on every sweep. That PR
  is cleared by `pass-review.sh` at approval and by the webhook's close-time `strip_labels()`. After
  `done`, an issue keeping only `weka` is the accepted result.
- **A closed object is never touched.** Its labels belong to the webhook's close-time fallback
  (`strip_labels()`), not to the sweep: re-adding a label to a merged PR would announce work on something
  nobody can act on.
- **A flow label lives on the object the card is keyed to, so its absence from a PR proves nothing.** An
  issue card's phase goes on the issue *and* on the PR its `branch_name` opened — the lookup runs only
  while the card still has a phase: a first-pass `ready` card has no branch yet, and a finished card only
  strips the object its body names. A rework card's phase goes on the PR. Read the card's status before
  reporting "the label is missing" — the object may simply be the other one.
- **`weka-queue` is ambiguous on a PR, and that ambiguity is accepted.** `review` is a queue, not a
  review in progress: after `request_review` the card waits on the board until reed claims it, and only
  `running` + reed makes the PR `weka-reviewing`. So `weka-queue` on a PR covers "waiting for cody to
  start", "sent back, waiting for cody", and "waiting for reed". That last pair is what the old label set
  could not name at all (the "sent back for changes" gap), and `weka-blocked` does the same for a card
  sitting in `blocked`. The card's `status` still answers the finer question — GitHub never did.
  The human-facing meaning of the labels is unchanged: `weka-working` = a worker is editing,
  `weka-reviewing` = handed off and under review, `weka-reviewed` = approved and waiting on the human.
- **"The card crashed" has a cheaper first check now.** A process label whose card says otherwise means
  either the sweep never ran or the card died mid-transition. Read
  `~/.hermes/state/weka-labels/log` for that reconcile first, then `hermes -p <p> hooks doctor` for
  whether the hook is registered at all, and only then GitHub.
- **"My comment did nothing" is a gate, not a lost delivery.** The ladder is short and ordered: actor
  must be the human login (bot comments and bot reviews are ignored by design), the PR must still carry
  `weka-reviewed`, and the PR must not already have an open card (which absorbs the request as a
  comment). Capacity is **not** on that ladder any more: a busy board only logs
  `[INFO] … queuing the rework card anyway` and creates the card, because the dispatcher owns the queue.
  So a `[GATE] … board is busy` line is a stale-process detector, not a state to reason about — the tree
  has the fix and the running unit does not.
  Read the verdict off `journalctl --user -u github-webhook --since -15min | grep GATE`; the line names
  which condition failed. Do not start from the labels or the board, and do not hand-create the missing
  card: it consumes the same idempotency key, so the real trigger that arrives later dedupes against it
  and the flow can never be seen working. A gate that only logs is a defect unless the owner asked for
  it — say so plainly rather than dressing "deferring" up as queueing.
- **Explain a flow failure as roles and a timeline, not as label names.** Three parts carry the story:
  GitHub (where the human speaks), the webhook (a front desk that turns words into work orders), and the
  board plus dispatcher (the rail of orders, and who hands them out). A real failure then reads "the
  front desk refused the order and tore it up" instead of "`weka-reviewed` was present but
  `busy_cards()` returned non-empty". When the owner asks for the plain version, the label vocabulary was
  doing the explaining — and the plain version is also what exposes the defect, because a guard that
  answers in statuses hides the fact that nothing was queued.

- **Editing `github-webhook.py` changes nothing until the unit restarts.** It runs as a systemd *user*
  unit whose `ExecStart` points straight at the repo file: `systemctl --user restart github-webhook`,
  and its output is in `journalctl --user -u github-webhook`. System-level `systemctl status` shows no
  such unit, which reads like "this thing has no logs" and is wrong. A tree updated by `git pull` and a
  process started the day before disagree silently for as long as nobody restarts it; that is how a fix
  merged the previous morning left a bug looking alive.

- **SOUL is a copy in the profile — and needs no restart.** `~/.hermes/profiles/<name>/SOUL.md` is a
  plain `cp` of `team/automations/weka/SOUL.<name>.md`, read by the worker at session start
  (`agent/context_file_sources.py`), so editing the repo file changes nothing and restarting the gateway
  changes nothing either: the next card picks it up. After any pull that touched either SOUL,
  `cp team/automations/weka/SOUL.cody.md ~/.hermes/profiles/cody/SOUL.md` (and reed), then confirm with
  `md5sum` on both paths — a lagging copy is silent, and the workers keep obeying yesterday's wording
  while every diff looks correct. Copy them on **every** deploy, not only when the pull happened to touch
  them: a conditional copy is how a drifted profile survives a deploy that reports success. Three layers, three answers: SOUL → next card; `github-webhook.py` →
  restart the user unit; `config.yaml` → gateway restart.
- **A deploy step that lives only in a checklist will be skipped — delete it or make it announce itself.**
  Both deploy failures on this flow were silent staleness (a process older than its code, a profile copy
  older than the repo), and both read as "the fix didn't work". Prefer removing the step: symlinking
  `~/.hermes/profiles/<name>/SOUL.md` at the repo file makes `git pull` *be* the deploy (the loader is
  `path.exists()` + read, so a symlink is fine) — at the cost of the main checkout having to stay on
  master, so if branches are worked locally, point the link at a master-only deploy clone instead. What
  the owner declined, and why it stays declined: **no auto-restart on file change** — no `systemd.path`
  unit, no self-exec — because the service is a single-threaded `HTTPServer`, so a restart landing
  mid-request drops that GitHub delivery and GitHub does not redeliver on its own. Do not "improve" this
  later without making the service finish in-flight work first.
- **Deployment has a written procedure in the repo: `team/automations/skills/weka-deploy/SKILL.md`**
  (installed locally as the `weka-deploy` skill, a symlink into the repo). Follow it rather than
  improvising the order. It is a **reset**, not a merge: `origin/master` is the whole desired state, so
  every run overwrites the profile SOUL and the profile skills and restarts the unit — no "did anything
  change?" gate, and no diffing a live copy to see which side is ahead. Behind that is the owner's rule:
  a live copy has no standing, so a step that inspects it before acting is the same judgement that let a
  stale process serve old code for a day. Verify by equality, never by metadata: `md5sum` both paths for
  each copy, and after the restart compare
  `systemctl --user show github-webhook -p ExecMainStartTimestampMonotonic` with `/proc/uptime` — seconds
  apart or it did not restart. `stat` mtime is not evidence (a `git switch` in the shared clone rewrites
  untouched files), and systemd 239 has no `--timestamp=unix`. Smoke is the one gated step: the stdlib
  tests every time, a real GitHub event only when the deploy's own diff touched `github-webhook.py` /
  `.service`, because an event writes to GitHub and can create a card. Since the cleanup tool landed, step
  5 also ends by running `scripts/cleanup-worktrees.py` (`--dry-run` first): the deploy is the one moment
  the host is already being converged, so the merged-but-uncleaned worktrees go with it.
- **Skills installed in a profile are copies too, and the deploy overwrites them from the repo.**
  `~/.hermes/profiles/<p>/skills/<name>/SKILL.md` can drift *ahead* of
  `team/automations/skills/<name>/SKILL.md`, because the curator patches an installed skill while a worker
  runs. The owner's answer is that master wins: the deploy copies the repo version over the live one
  without inspecting it. So a live edit is a draft, not a source — if it was worth keeping, it belongs in
  the repo, folded back in a normal PR *before* the deploy (that is the review gate), never resurrected by
  the deploy itself. Find what is installed with `ls -l ~/.hermes/profiles/*/skills/`; `jsmind-review` is
  the one that matters here.
- **A webhook change that ships tests is verified by running them, before any smoke test.**
  `team/automations/weka/test_github_webhook.py` is stdlib `unittest` (the weka venv has no pytest):
  `~/.hermes/venvs/weka/bin/python -m unittest discover -s team/automations/weka -p 'test_*.py'` —
  milliseconds, and it asserts side effects rather than log lines. A green run proves the handlers;
  only a real event proves the *process* is running them.

## 架构原则

This is the webhook + kanban flow that runs on **Hermes** (this machine's
gateway + `~/.hermes/kanban.db`).
Two worker profiles — Cody (developer) and Reed (reviewer) — no coordinator; the
kanban dispatcher routes directly by assignee.

When designing or modifying this flow, these principles apply
(see `README.md`（同目录） for the full design guide):

- **The dispatcher IS the coordinator.** Don't insert an extra coordinator
  agent between GitHub events and worker spawns. The dispatcher already routes
  tasks by assignee; an intermediate profile adds a wasted LLM call.
- **Event-driven, not polling.** Use GitHub webhooks to push events into Kanban
  rather than a cron job that polls. The webhook script maps GitHub events to
  `hermes kanban` CLI calls, then the dispatcher spawns workers. The boundary is
  exact: the GitHub→card half is push (zero polling); the card→spawn half is the
  Hermes kanban worker consuming a local queue (`dispatch_interval_seconds`,
  default 60 s) — queue consumption, not polling external state. Shortening that
  tick is still polling, not event-driving (the default is accepted as-is), so
  don't "optimize" it toward event-driven with a faster tick.
- **GitHub is the human UI; Kanban is bot-to-bot only.** Workers communicate
  exclusively through Kanban status transitions and comments. Humans interact
  only on GitHub (Issues, PRs). The webhook script bridges the two worlds.
- **Design as input→action per component.** For each system component
  (dispatcher, webhook script, each worker profile), enumerate its input events
  and the action it takes. If a component has no input event that triggers it,
  it's unnecessary.
- **Card = trigger; GitHub is the source of truth.** A card records *why a
  worker was woken*, not the work itself: the issue/PR holds the diff, the
  reviews, the discussion. Key a card by the number of the object that created
  it — `#85:` for an issue card, `#86:` for a PR card, rework cards being PR
  cards — and look it up with
  `title LIKE '#86:%' AND status NOT IN ('done','archived')`. The colon is the whole
  disambiguation against `#860` and against a title that merely mentions `#86:`
  mid-sentence, so never widen it to `%#86%`.
  No URL scraping and no issue↔PR mapping is needed; an agent that wants the
  issue reads `Closes #N` in the PR body. The bridge enforces "one open card per
  number" and creates a rework card only when the human's review or comment
  arrives on a PR that still carries `weka-reviewed` — the whitelist is what keeps
  the reviewer's own bot comments from feeding back into the loop.
- **One card = one unit of work; `done` is immutable.** Later work on a finished
  card is a child card (`create --parent <done-id>`), which inherits the parent's
  summary/metadata as context. Which verb each human action maps to — and which
  states accept it — is in `README.md`（同目录）; read it before
  editing the webhook or either SOUL.

## 流程命名与部署约定

Never put a platform name (grokbot / hermes) into the codebase or use it as a
team identity — name each flow by its team codename. The Hermes webhook+kanban
flow uses its own codename, not "hermes".
One codename drives all three surfaces: the GitHub label (work signal), the team
name in docs, and the `team/automations/<codename>/` directory.

The webhook script is repo code, but every tunable — port, secret, target label,
board, human login — is read from a `config.json` next to the script. Ship
`config.example.json` with placeholders; add the real `config.json` to
`.gitignore` so the secret never reaches git.

Reed's review standard is `team/automations/skills/jsmind-review/SKILL.md` —
platform-agnostic, used by the grokbot Reed and the Hermes Reed alike. A review standard is not an
incident log: the owner's test is that a reviewer needs the stance, the layers and the checks that can
change a verdict. Keep out the sessions that produced them — `seen …` examples, line/section counts,
specific version strings, host tool paths and scratch-dir recipes, and anything about the kanban lane
(a card's assignee cannot be cleared, `kanban_complete` ends the review) — that belongs in `SOUL.reed.md`.
Distil each real failure into one check: the claim, what to run to test it, and what would make it fail.
A 150-line file of transcripts is unreadable; ~100 lines of checks is the shape. Reed never
approves — it pre-checks technically; the owner (`hizzgdev`) is the final
reviewer. Reed's SOUL must make review STRICTLY read-only: forbid write tools
outright (patch / write_file / terminal write) and name the protected files
(AGENTS.md) explicitly. A headless reviewer that edits one trips an approval
prompt it cannot answer, times out, and the session dies — the card then loops
"crash" until `failure_limit` blocks it, surfacing as "Kanban execution unknown;
retained by owner". "发现问题让 Cody 改" as prose alone does not stop the model
from patching; the SOUL must be tool-level. Cody marks its issue `in-progress`
when it starts (its one allowed label, per SOUL), so progress is visible
externally.

Diagnosing "Kanban execution unknown; retained by owner" — that string is only
the worker-side surface. The real cause lives in the run history:
`hermes kanban runs <task>` (or `--json`) prints each run's full worker
last-output; grep it for `patch BLOCKED` / `AGENTS.md` / `consent` / `timed
out`. When the refusal has no `[GATE]`/`patch` trace and the run dies within a
minute, read the managed worker's own stderr instead —
`~/.hermes/profiles/<profile>/logs/managed-worker.log` — the kanban CLI shows
only the refusal, the traceback is there. The pattern (a headless worker edits
a protected file → approval times out → session dies → admission is left
unknown) also breaks Cody's CLEANUP step after a merge, not just Reed's review
— so it masquerades as failures at several nodes of the flow. Restarting the
gateway does NOT clear it: the admission failure is not a stale owner session,
so don't burn time on gateway restarts.

The review lane hard-codes one skill name, and a reviewer profile missing it
dies before the model is ever called: `gateway/session_kanban.py` appends
`sdlc-review` whenever the run's retry status is `review`, and
`_run_task_turns` raises `ValueError: kanban_skills_unavailable` when none of
the requested skills load. `jsmind-review` (the review *content*, installed by
the weka README) is a different skill from `sdlc-review` (the lane's
*protocol*) — a rebuilt machine needs both, and a curator prune that archives
`sdlc-review` silently kills the review hop. Full diagnosis ladder and the
two-step repair are in the `hermes-kanban-worker-triage` skill; don't re-derive
them here.

Reed cannot clear its own assignee, and no `kanban_*` tool unassigns: a SOUL
step that says "add reviewer, clear own assignee, wait for the human" is
unimplementable, because CLI board writes are fenced inside a worker
(`kanban_path_is_fenced`). Reviewer endings are `kanban_request_changes`
(defects found) or `kanban_complete` (none left) — never approve, never merge;
the human verdict stays on GitHub. Because `done` is terminal from the CLI, a
human comment on a still-open PR cannot be routed back with `request-changes`:
the webhook creates a NEW card keyed by the PR number (`#86: Rework — …`) instead,
so no card is ever revived and no parent/child chain is needed. The verb/state
matrix and the `--completion-contract` option for "card = one PR" are in
`README.md`（同目录）.

**A review that re-runs the suite is the flow's dominant cost.** This host has 2
vCPUs, so `npm test` (376 tests) takes ~130 s and a site build another ~50 s: a
measured review spent 418 s inside tools against 123 s of model turns (~6 s/turn,
i.e. normal API latency — the model is not the slow part) and most of that was the
same green suite executed four times. Rule for `SOUL.reed.md`: run the full suite
once on the diff under review, take coverage in that same run if it is wanted, and
use `npm run test-lite` (dot reporter) for intermediate feedback. CI already ran
format/type/test on the branch; the reviewer's own run exists to be independent,
not to be repeated. Check `free -m`, `uptime` and a content search of `dmesg -T` for
`killed process` before blaming either side: free memory alone does not clear the box (this host is
4 GB with swap off), an OOM record does convict it, and repetition stays the dominant cost either way.
