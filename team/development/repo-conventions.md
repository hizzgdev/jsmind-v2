# 仓库约定（超出 commit/PR 规范的那一层）

这份文件收录的是**关于这个仓库该怎么改**的判断：什么算过约束、一个任务该拆成几张卡、命名空间怎么分、
哪些话能写进公开文本。它比 `AGENTS.md`（入口和命令）和 `team/development/commit-types.md`（提交类型）
更进一步，讲的是取舍，不是格式。

读法：**动手改这个仓库之前先读这份**。它记的是踩过之后才定下来的东西，同一条被推翻过一次的，
这里只写结论和理由，不再重复中间的争论。

## 命名与分层

命令名和命名空间的划分方式，以及为什么不能按“动词的类别”挪动命令。

- **A CLI command name must survive a sibling pairing.** `mind add-child` keeps its name rather than
  becoming `add`, because a future `add-sibling` has to read distinctly beside it. 2.x ships on the
  `v2-preview` channel, so deleting a command outright is allowed — do not carry aliases or deprecation
  windows for a preview release's users.

- **`mind` is the mind-level namespace, not "structure".** `mind` holds what happens to the map as a
  whole (`add-child`, `move`, `set-style`); `node` holds one node's attributes. Do not relocate a
  command out of `mind` on the argument that it is "not structural" — that move was proposed for
  document-level style and the owner refused it. The grouping is by the object being changed, not by
  the kind of verb. The other half of the rule is the command *shape*: every command is
  `<group> <verb> <file>`, verb first, exactly two segments. A nested group (`mind style set`) breaks
  that shape and drags a special case into both the dispatcher and the help ladder, so a new mind-level
  setting is `mind set-<field>`, mirroring `node set-<field>`: `mind set-style` against `mind.style`,
  `node set-style` against `node.style`. The same verb in two groups is fine — the group is the
  disambiguator, and each help line states its own scope ("the document's style" vs "override the theme
  for one node").

- **`kernel` is a boundary word, not a synonym for "library".** `team/development/v2-requirements.md`
  §1.1–1.2 defines it by what the project refuses: not a fuller editor, no own cloud storage, no
  hosted service, no feature-list race with mind-map applications, no complex mobile editing. Keep it
  in README, `package.json` and the docs tagline; "library" reverts to v1's positioning and
  "solution" contradicts §1.2. The same rule covers marketing surfaces — never advertise a
  capability the code lacks: the FreeMind serializer is a placeholder that throws, there is no XMind
  support, and there is no MCP server, so none of those belongs in a topic, badge or description.
  The format is JSON, not "a documented format" — the public data-format page is still marked in
  progress, so that adjective is a claim the repo does not back. Field limits bite: GitHub's description
  takes 350 characters, Gitee's takes 200 and truncates mid-word with no error, so the Gitee blurb is its
  own shorter text rather than the same string pasted.

## 测试与验收

什么样的断言算过约束——这个仓库的答案是改测试，不是改实现。

- **An over-specific test is the thing to change, not the implementation.** The owner treats assertions
  that pin an internal detail ("exactly one module script", exact coverage last-digit, a private shape)
  as over-constraint: relax them to what the intent actually is ("loads the local bundle") and say so in
  the issue. Bending the implementation to satisfy a deepEqual is the wrong answer here. Hard-won
  invariants (the CDN range, the escape-it-or-it-executes rule) stay and are not tests' job to police.

## 一个任务的形状

该拆几张卡、拆在哪一层、什么情况算同一张。

- **Research first, then file a weka issue — do not implement it yourself.** When the owner describes a
  feature, a UI tweak or a suspected bug, the deliverable is a feasibility answer plus an issue, not a
  diff. Read the code, and where behaviour is in question prove it in a real browser; then file with
  `gh issue create --label weka --assignee zzgbot` (one call — see the weka section) and stop. Handing
  over a patch nobody asked for is the wrong outcome even when the patch works. A prototype made to
  answer "is this possible" is throwaway: before filing, `git checkout -- <files>`, delete the scratch
  branch, stop any local server you started, and say in one line that the tree is clean. Leaving the
  proof-of-concept in the working tree invites the next turn to finish it by accident.

- **Route review findings by kind: wording goes on the PR, behaviour gets an issue.** A doc/skill wording
  fix lands as a comment on the open PR (line numbers, the current sentence, the suggested replacement),
  because the owner's own comment is what creates the rework card — `gh` on this machine is
  authenticated as `zzgbot`, so anything posted from here appears as the bot and does NOT pass the
  webhook's human gate. A CLI or view defect gets its own `weka` issue carrying the repro and the
  expected behaviour. Never push commits into someone else's open PR branch to apply review findings
  yourself.

- **Split an issue where the deliverable crosses a layer.** If part of the request is playground/docs
  work and part is blocked by a library defect, file two issues and put the blocked follow-up (e.g.
  "once the view repaints, add these two templates") inside the library issue's acceptance criteria.
  Sequencing belongs on one card, not in a reader's head.

- **Same-layer fixes are ONE issue, however many parts there are.** A bad word, a broken install
  snippet and an under-specified example prompt on the same page are a single deliverable: one `weka`
  issue with a section per part. Splitting them into three cards hands the owner a sequencing job and
  makes the reviewer compare three diffs against three standards. The owner asks for this outright
  ("combine them into the same issue") — treat "one card per layer" as the rule, not "one card per
  paragraph".

- **One component, one purpose — a second job gets its own file, not a flag.** The owner rejected
  `--sweep` on the webhook for this reason: the service turns events into cards, and a maintenance pass
  over the whole checkout is a different job, so it became `scripts/cleanup-worktrees.py` with its own
  tests and its own CI discovery. The same instinct governs truth: the deploy **overwrites** the live
  copies from master instead of diffing them to decide, because a copy with no standing should not get a
  vote. When a fix looks like a new mode on an existing script, ask what that script's one job is; if
  the work falls outside it, write the sibling.

- **Parking a filed issue ("先不加这个了").** Do not delete anything: archive its card
  (`hermes kanban --board jsmind-v2 archive <task>`), remove the trigger (`gh issue edit <n>
  --remove-label weka --remove-assignee zzgbot`) and keep the issue open as the record, with a comment
  naming why it is parked plus whatever repro the research produced. Re-arming later is just re-adding
  the label and assignee — no new writeup. Leaving the card live means a worker starts against a
  decision that has been withdrawn.

## 文档边界

哪些内容能进仓库文本、哪些只能留在本地，以及知识应该分几层存放。

- **Repo docs and issue bodies describe the mechanism, never this host.** No CPU/RAM figures, no OOM
  counts, no dates, no "on our machine" anecdotes in README, commits, PR bodies or issues — say what
  the rule is and why it exists in general terms. Machine facts belong in this skill, which stays
  local. The owner will strip host detail out of public text on sight.

- **Knowledge about the flow lives in the repo, in three layers — this file is the third.** The owner
  asked for it outright: a lesson that only exists in a personal skill is filed where nobody maintaining
  the repo will find it. So split it by consumer — the *mechanism* goes into `team/automations/weka/README.md`
  (a human reads it), the *rule as an executable check* goes into `scripts/` and into CI (the pipeline does
  not read prose), and only the coordinates and the why-that-cost-a-session stay here. A probe that asserts
  outcomes (`scripts/probe-worktree-removal.sh`, which prints `ok`/`MISMATCH` and exits non-zero) is worth
  more than a paragraph: it turns "we believe git behaves this way" into a check that fails when a tool
  release changes the answer. When writing such a probe, keep it self-checking and put it in CI in the same
  PR — a probe nobody runs is a comment with extra steps.

## 合并门

**规则在两个 ruleset 里，不在 branch protection API 里。** `/branches/master/protection` 会因为缺少
admin 权限返回 404，看起来像“没有保护”；实际生效的是 `/rulesets`：

```bash
gh api repos/hizzgdev/jsmind-v2/rulesets            # 有哪几个
gh api repos/hizzgdev/jsmind-v2/rulesets/<id>       # 每个的具体规则
```

截至 2026-11-27 实测有两个：`Required CI Task` 要求四个状态检查通过（`Change detection`、
`Format, types, tests, build`、`UI tests`、`Docs site`，`bypass_actors` 为 null，谁也绕不过），
`branch-master-protection` 只管禁止删除和 force push，**没有**要求 PR 审批。

判据（不会随规则变化）：

- **required 绑的是 job 的 `name:` 字符串**。要改 job 名，就在那条 job 被列为 required 之前改；一旦
  required 了，改名会让门永远等一个不存在的检查。
- **被 `if:` 跳过的 job 算通过**，所以必需项要挑那条不会被跳过的（这就是 `Change detection` 必须在
  required 里的原因：分类器坏了，其余检查全被跳过，门照样变绿，一个检查都没跑）。
- **`needs:` 失败的 job 也是被跳过**，同样算通过——所以必需项不能只挂在会被上游拖垮的 job 上。
- 具体是四个还是三个、叫什么名字，一律现查，不要背。这份文件只保证你查得对。
