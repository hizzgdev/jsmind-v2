# hubie 运行时判据

这份文件记录 hubie（grokbot 侧）流程的运行判据和踩过的坑，读者是操作和排障的人。
流程本身、监听机制和 coordinator 的分工在 [agent-team-collaboration.md](agent-team-collaboration.md)。

**hubie 是哪条线：** grokbot 侧的流程（例行监听 + 内部消息 + Holt 做协调）。

读法：动 hubie 之前先读这份；它和 collaboration 文档冲突时，以跑着的代码和实际状态为准，并记回这里。

Hubie runs on the **grokbot** platform: same repo, no shared state. Roster, entry paths, the retired label-driven trio and the vocabulary it defines for itself
are in `team/automations/hubie/agent-team-collaboration.md` — read that before touching the process or judging its docs.

What applies on every contact, without reading it:

- **`hubie` is ownership, not a trigger.** It means the owner handed the item to the team. Never add it
  "helpfully", never nudge anyone to add it, and never read its absence as a missed switch.
- **The team does not take orders from me.** Do not assign issues to `zzgbot`, do not add `hubie` to
  anything, and do not write PR comments meant as instructions to Holt/Cody/Reed. If work is needed in
  this repo, it goes through the owner.
- **A hubie PR the owner asks me to review:** do the review, deliver it in chat, and do not post it on
  GitHub while the PR still carries `hubie-reviewing`. That label means their reviewer is mid-flight; a
  `zzgbot` comment landing inside it reads as pipeline input rather than an outside opinion. Offer to
  post it if they want the public record, and say in one line why it was held back.

**The event-filter workflow's two jobs do not overlap, and `paths:` would break the half that matters.**
`Filter tests` runs the shell test on `pull_request` (opened/synchronize/reopened) and `workflow_dispatch`;
`Filter and forward` is skipped on those and runs only for `issues` / `issue_comment` /
`pull_request_review_comment` / `pull_request closed`. So the test is the only pre-merge gate for a script
whose whole job is to POST to the Coordinator, and it is *not* a duplicate of the forward job. When the
owner asks whether it has to run on every PR, that is the answer plus the trade: trimming it from unrelated
PRs is defensible, but a `paths:` filter on the workflow's `pull_request` trigger also silences `closed` —
the merge notification, the one moment the forward side is most needed — and it fails silently. Gate the
`test` job on changed files instead. A job skipped by its own `if` reports **success**, so a skipped suite can
still sit under a required check — it is a *workflow* skipped by `paths:` that strands required checks at
`Expected`, which is why the trigger stays unfiltered. The owner's chosen shape, not yet implemented: the
cases move into `ci.yml` as a job named `Optional tests` (the bucket for every future non-blocking suite),
`hubie-event-filter.yml` loses its `test` job, narrows `pull_request` to `closed`, and renames its remaining
job `Filter and forward` → `Custom webhook` (the workflow name already carries the verb, so the job name only
names the destination), and `What changed` becomes `Change detection`. Keep an optional suite in its own job
and never append it as a step to
`Format, types, tests, build`: required is a job-level property, so a step added there inherits the gate.

**The CI taxonomy the owner settled on.** required = `Format, types, tests, build`, `Docs site`, `UI tests`,
`Change detection`; optional = `Render preview`, `Optional tests`; `Custom webhook` is production and belongs
in no ruleset at all (it is *never run* on a PR rather than "run but ignorable" — those are different things,
and it can and does fail: non-200 from the endpoint hits `die` → exit 1, with no redelivery from GitHub).
Docs are code here, so a broken site build is a required failure, not advice. Why the classifier is required:
a failed `needs:` makes every dependent job *skip*, and a skipped job reports success — so without the
classifier itself required, a broken diff script turns the whole gate green having run nothing. Naming taste
to apply to the next job: a name says what the job **is**, not what it decides for you (`Choose which checks
run` was rejected; `Change detection` accepted), and it must not repeat a verb the workflow name already
carries. Open question the owner raised: writing `required`/`optional` into the names. My recommendation, not
yet accepted, is to keep the word only in `Optional tests` — there it is the bucket's identity — and leave the
four required names bare, because gate status otherwise exists as two copies (YAML `name:` vs ruleset) with
no test that can catch them disagreeing.
