# Weka — 基于 webhook + kanban 的 jsMind-V2 开发流程

weka 是 jsMind-V2 的一套自动化开发流程：GitHub 上带 `weka` 标签的 Issue 会触发 webhook，转成 Kanban 卡片，由调度器拉起 Cody（开发）、Reed（审查）和 Scout（需求梳理）三个 profile 干活，仓库所有者做终审。你在 PR 上要求修改时，webhook 会再建一张返工卡；每次 PR 关闭之后再排一张 scout 卡，把下一步写成一个待拍板的 issue。

名字是 we(webhook) + ka(kanban) 拼出来的。

运行时判据（状态语义、踩过的坑、排障顺序）在 [operating-notes.md](operating-notes.md)；动这套流程之前先读它。这份 README 管"怎么建起来"，那份管"怎么判断它现在是什么状态"。

三条基本约定，后文展开：

- **卡只是触发器**，事实来源是 GitHub 上的 issue/PR。卡里只有对象 URL 和触发快照。
- **卡标题以编号开头**（`#85: …`），编号是查卡的唯一键。
- **看板上没有"等人审核"这个状态**：人审的门在 GitHub（reviewer 请求 + PR 从 draft 翻成 ready）。
- **人的动作不会被静默丢掉**：要么建卡/追加评论，要么在对象（issue / PR）上说清为什么不建。沉默只留给三种情况——连 `weka` 标签都没有且没有 open 卡、PR 已关闭、issue 已关闭且没有 open 卡（见「拒绝与失败必须留痕」）。

本目录自包含：流程说明、脚本、SOUL、部署步骤和重建清单都在这里，入口就是这份 README。

## 目录内容

| 文件 | 作用 |
| --- | --- |
| `github-webhook.py` | webhook 接收器：GitHub 事件 → `hermes kanban` 调用，零 LLM 中转；建卡之后顺带触发一次标签对账 |
| `labels.py` | 过程标签对账：读看板、只写差异，由钩子与 webhook 事件驱动 |
| `config.example.json` | 配置模板；真实 `config.json` 已 gitignore，不入仓 |
| `github-webhook.service` | systemd user unit 模板 |
| `nginx.conf` | nginx 反代 server 块（监听 <webhook-port>，放到 `/etc/nginx/conf.d/`） |
| `SOUL.cody.md` | Cody（开发者）的行为规范 |
| `SOUL.reed.md` | Reed（审查者）的行为规范 |
| `SOUL.scout.md` | Scout（需求梳理者）的行为规范 |

## 流程全景

```
GitHub Issue（weka 标签 + 指派 zzgbot）
  → webhook: kanban create "#85: <标题>" --assignee cody
  → dispatcher 拉起 cody（60s tick）
  → labels.py（看板事件钩子）：按卡的 (status, assignee) 算出该挂的过程标签，只写差异
  → Cody: 开发 → 自测 → 开 draft PR → request_review(reed)（PR 保持 draft）
  → 卡转 review 排队 → labels.py: weka-queue；dispatcher 拉起 reed、卡变 running 后变成 weka-reviewing
  → Reed: 按 sdlc-review 流程审 draft PR（不动它的 draft 状态）→ 意见写在 PR 上
       ├─ 有必须改 → request_changes（卡回 cody → weka-queue，PR 一直是 draft，可无限轮，不计任何计数）
       └─ 通过 → scripts/weka/pass-review.sh：只做前置检查（draft 且带 weka-reviewing）+ 转成 ready；标签由 labels.py 在卡变 done 时擦 → 加 reviewer hizzgdev → complete
  → 你在 GitHub 上终审
       ├─ 合并 → webhook 删 worktree + 本地分支 + 摘 PR 上的标签，并在 groom 板建一张 scout 卡
       └─ 要求修改 → webhook 查看板：这张 PR 最新的一张卡是 done → 建 "#86: Rework N — ..." 卡给 cody
  → issue 关闭（含合并时被 `Closes #N` 自动关闭）
       → labels.py 按看板擦掉残留；webhook 另有一份 close 时的兜底
  → groom 卡（scout，groom 板）：读 milestones / roadmap / open issues
       → 写（或补全）一个 issue → assign 给 hizzgdev
       → 你在 issue 上评论 → webhook 建新的 scout 卡 → 下一轮
       → 你把 issue 转给 zzgbot → 回到上面的开发流程
```

任何时刻人在 weka 的 issue / PR 上留言，都是同一条路进来：有 open 卡就追加到那张卡（`ready` / `running` / `review` / `blocked` 四种状态各自能读到，`blocked` 那张要等人 unblock 之后才被读到），没有卡才按指派分流（实现 / groom），两个指派都不在就在 issue 上留一句说明。详见「触发规则」与「评论如何到达正在干活的人」。

关键设计：

- 人类只跟 GitHub 打交道，bot 之间只跟看板打交道；webhook 是两者之间的桥，不跑任何 LLM。
- **卡只是触发器，GitHub 才是事实来源。** 卡上只有对象 URL 和触发快照，细节由 cody/reed 自己去 GitHub 查。
- 看板上没有"等人审核"这个状态。人审的门在 GitHub 上：reviewer 请求 + PR 从 draft 翻成 ready。cody / reed 的卡没有 triage，`triage/specify` 那一整套不涉及；**reed 的卡会 block**：结论取决于 owner 的一个决定时，它先在 PR 上发一条以「## 需要 owner 决定：」开头的评论，再 block 卡（reason 第一行是那条评论的 URL），owner 在 PR 上回复即可继续——卡停在 blocked 只为等这一句回话。cody 同理（需求自相矛盾、要 owner 拍板时）。**scout 的卡也会 block**（`SOUL.scout.md` 让它在 URL 解析不出、证据不足、需求自相矛盾时停下来等人）。除此之外没有人因为「等审核」而 block。

## 卡片与编号

所有卡的标题以编号开头：

```
#85: <issue 标题>              从 issue 建的卡
#86: Rework — <PR 标题>        从 PR 建的卡（返工）
#87: <issue 标题>              从 issue 评论建的 groom 卡（在 groom_board 上）
#88: Groom — <PR 标题>         从 PR 关闭建的 groom 卡（在 groom_board 上）
```

- 编号是唯一键，查卡用前缀匹配：`title LIKE '#86:%' AND status NOT IN ('done','archived')`。
- **编号键只在各自的板上成立**：实现卡在 `kanban_board`，groom 卡在 `groom_board`，两边的 DB 是分开的，所以同一个 issue 号可以在这两张板上各有一张 open 卡，互不遮蔽。
- 不带轮次号：第几轮这件事在 PR 的 review 历史里，卡上再记一份只是多一个会算错的来源。同一个 PR 的连续返工卡标题相同，按 `created_at` 排序即可。
- 前缀锚定是关键：标题中段出现 `#86:` 不会误伤，`#860…` 也不会命中 `#86:`。
- 同一张板上一个编号最多一张 open 卡。webhook 建卡前先查，命中就把这次事件追加成那张卡的 comment，不建新卡。
- **例外是 groom 板上的编号键**：PR 关闭建的 groom 卡用 `#<PR 号>: Groom — …`，但幂等性按**板**算，不按编号——groom 只有一条对话线，板上已有任何 open 卡就把这次关闭追加成它的 comment（见「每次关闭后排下一轮：groom 卡」）。
- 编号只标识"建卡的那个对象"，issue 和 PR 之间不做映射。要串起来让 agent 自己看 PR body 里的 `Closes #N`。

## 触发规则

**人的动作不会静默消失**：每条人写的事件都有一个可见结果——建卡、追加到已有卡，或者在对象（issue / PR）上留一句说明。

| 方向 | 必须同时满足 | 结果 |
| --- | --- | --- |
| issue 建卡 | ① 标签里有 `weka`；② `zzgbot` 在 assignees 里（多个指派人也算，不要求它是唯一或第一个）；③ 事件是 `opened` / `labeled` / `assigned` 三者之一 | 建卡；该编号已有 open 卡则把这次事件追加成那张卡的 comment |
| issue 评论 → 已有 open 卡 | ① 该编号在实现板或 groom 板上有 open 卡（两张都有时取实现板那张） | 把评论正文追加到那张卡。**不看标签、不看指派、不看 issue 是否已关闭**，与 PR 路径的「open 卡吸收」同一条规则 |
| issue 评论 → groom | ① issue 带 `weka`；② 作者是 `hizzgdev`；③ 没有 open 卡；④ assignees 里有 `hizzgdev`；⑤ 配置了 `groom_board` / `groom_assignee` | 在 `groom_board` 上建 scout 卡，指派给 `groom_assignee` |
| issue 评论 → 实现 | ① issue 带 `weka`；② 作者是 `hizzgdev`；③ 没有 open 卡；④ assignees 里有 `zzgbot` | 建 `#<n>: Rework — …` 卡给 cody（与 PR 返工同一形状），正文带评论原文 |
| issue 评论 → 没人接 | ① issue 带 `weka`；② 作者是 `hizzgdev`；③ 没有 open 卡；④ 两个 assignee 都不在 | 在 issue 上留一句说明，不建卡 |
| PR 返工 | ① 该编号已有 open 卡 | 把评论正文追加到那张卡。**这一条不看标签、不看 PR 状态**：返工进行中的留言不能被任何标记挡住 |
| PR 返工 | ① 没有 open 卡；② PR 是 open；③ 这张 PR 最新的一张卡是 `done`；④ 入口是 `hizzgdev` 的提交 review（非 `approved`）或会话评论或行内评论 | 建返工卡，卡上带着评论原文 |
| PR 返工 | ① 没有 open 卡；② 最新一张卡不存在或是 `archived` | 不建卡，在 PR 上留一句说明（见下一节） |
| PR 关闭 → groom | ① `pull_request.closed`，merged 与否都算（与 cleanup 同范围，不看标签） | 在 `groom_board` 上建 `#<PR 号>: Groom — …` 卡给 `groom_assignee`；板上已有 open 卡就把这次关闭追加成那张卡的 comment |

`closed` 里只有 groom 这一支会建卡；它剩下的动作是标签兜底清理，见下文「关闭时的兜底清理」。

**容量不在这里判断。** 板上有没有别的卡在跑，跟"要不要接这条返工请求"无关：卡建出来就进 `ready` 排队，什么时候跑由 dispatcher 按 `max_in_progress` / `max_in_progress_per_profile` 决定（见「并发与资源」）。webhook 里曾经有一道 `busy_cards()` 门在这里挡卡，而它没有队列可排——"板上忙"在实现里就等于"丢弃"。

为什么 issue 方向要两道门：公开仓库上任何人都能给 issue 打标签，所以标签只说明"这是想交给 weka 的活"，真正决定要不要花 token 的是指派——只有仓库所有者能把 issue 指派给 bot 账号。

为什么 PR 方向要限定作者：bot 自己也会在 PR 上写评论（reed 的审查意见），限定为仓库所有者才能保证"只有人的动作触发返工卡"，不会被自己的输出喂回去。

**issue 评论为什么先看 open 卡、再看指派**：一条评论首先要到正在干活的那张卡上，这正是这个流程存在的意义，所以 open 卡（`ready` / `running` / `review`）先吸收，不看标签也不看指派。两张板都查，实现板优先：同一个编号在两张板上各有一张 open 卡时（见「卡片与编号」），评论先到实现卡。这条检查排在标签门和「issue 已关闭」门之前，所以流程标签随卡变（`weka-queue` → `weka-working` → …）、或者 issue 因为 `Closes #N` 而被关闭时，正在跑的那张卡仍然收得到人的话。没有 open 卡时才需要决定"谁来接"，而 assignees 是唯一能回答这个问题的字段：`hizzgdev` 在 = 活还没交出去，该进 groom 对话；`zzgbot` 在 = 活已经在实现上，按返工路径建一张 cody 卡。两个都不在，weka 不知道该找谁，就在 issue 上说一句，不猜。

两个 assignee 同时在场且没有 open 卡时按 `hizzgdev` 走（groom）；实际不会出现"活交给 bot 了却没有卡"的状态，所以这条优先级只在人工摆弄指派时看得见。

groom 那一支是**可关的**：`groom_board` / `groom_assignee` 留空时整支跳过，并在 issue 上留一句"未配置"的说明。所以这份代码可以先上线，等 scout 流程自己把两个键填上再启用。它建卡时不带 `--workspace worktree --project`：groom 谈的是"这个 issue 应该变成什么"，不是写代码，给它挂一个仓库 checkout 没有用（board 若自己绑了 project，那是 board 的默认行为）。

PR 关闭那一支靠同样的两个键开，但门关着时**只在 journal 打一行 `[GATE]`，不在 PR 上留言**：关闭是自动事件、不是人的请求，在每条合并的 PR 上贴一句"未配置"只会是噪音。

**标题用英文**：issue 标题、PR 标题、commit message 一律英文 `<type>(<scope>): <subject>`，类型按 `team/development/commit-types.md` 那张表选。正文和评论可以中文，审查评论的语言则跟随 PR body（见 `SOUL.reed.md`「写审查意见：语言、结构、位置」）。新建 issue 时不按正文语言决定标题语言——正文是中文，标题依然英文；这张 issue 自己的标题曾经是中文，被 owner 打回才改的。`AGENTS.md` 只写了 PR 标题与 commit message，issue 这一条由 weka 流程自己收口。

**PR body 的写法**由 `SOUL.cody.md` 的「写 PR body」一节定义：第一行 `Closes #N`，正文三节（做了什么 / 怎么验证的 / 需要人来做）、总长 ≤ 30 行，测试只写命令与结果、不写条数或文件数。本文件不再重复那套规则，改的时候只改 SOUL。

## 每次关闭后排下一轮：groom 卡

`pull_request.closed` 做完 cleanup 之后，webhook 还会在 **groom 板**（显示名「需求梳理」）上排一张 **scout 卡**。scout 是独立 profile，只干一件事：把「下一步该做什么」写成一个 owner 能直接拍板的 issue。

**为什么挂在「关闭」而不是「合并」**：合并和放弃都会让仓库进入下一个状态——一条分支落地，或者一个 issue 被放回池子——下一次规划的依据是关闭之后的样子。所以 `merged=false` 也建卡。范围与同一事件里的 cleanup 相同，不看标签。

**为什么幂等按板算**：groom 只有一条对话线，读的都是同一份 milestones / roadmap / open issues。板上已经有 open 卡时，这次关闭会作为 comment 追加到那张卡，而不是再开一条平行对话。

**卡里有什么**：触发它的 PR URL、`merged` 状态、分支、触发时的标签，以及一句「按 `SOUL.scout.md` 跑一轮」。不带 `--workspace worktree --project`——scout 不写代码，读文档走 `gh api .../contents/...`，写的是 issue。

scout 一轮做三件事：

1. 读 `team/development/milestones.md`、`roadmap.md`、tracker issue 的清单、open issues 与触发它的 PR。
2. 判断下一步，**先查有没有现成的 issue**：已有 open issue 覆盖同一件事就补全它，没有才新建。
3. 把 issue 写成两节——**「已明确」/「待明确」**——带规模评估（改哪些文件、大概多少行），需要拍板就在 issue 里 `@hizzgdev` 提具体问题，然后 assign 给 `hizzgdev`。

两个容易漏的点：

- scout 建的 issue **必须带 `weka` 标签**。owner 的评论要靠它进入 groom 分支（上一节的标签门），漏了就断在「评论没人接」那一步。
- 它只 assign 给 `hizzgdev`，**不 assign 给 `zzgbot`**——转交永远是人的动作。

**一卡一轮。** scout 的卡生命周期很短，三种情况都算完成并立即 close：建（或补）了一个 issue 并 assign；回复了 owner 的评论；或者判断没有下一步，在触发它的 PR / issue 上写明扫过什么、为什么停在这里。重跑的成本就是一张小卡。

**卡 blocked 时，后续关闭会追加到它上面。** scout 会 block（见 `SOUL.scout.md`：URL 解析不出、证据不足、需求自相矛盾），而 `open_groom_card()` 把板上任何未完成的卡当成那条对话线，`blocked` 也算。所以它一停，之后每次 PR 关闭都追加到这张卡，不会新建平行卡，也不会有别人被拉起来：note 不会丢（人 unblock 之后 scout 重新起来，`kanban_show()` 读得到全部），但在那之前「一卡一轮、重跑就是一张小卡」不成立，要等人处理这张卡。`block` 也只停在这一点上——dispatcher 照常拉起别的板上的卡。

**权限边界**：scout 只读仓库、只写 issue（正文、评论、assignee、`weka` 标签）。不改代码、不开 PR、不改 CI、不碰 review、不动别人的卡。

对话循环：scout assign → 你在 issue 上评论 → webhook 建一张新的 scout 卡（`issue_comment` 那条路）→ 下一轮。你满意之后把 issue 转给 `zzgbot`，就回到开发流程。

### 主机侧准备（一次性）

profile 和板都在主机上，不在这个仓库里。全新机器按「重建清单」走；已有机器上启用这一支要补三步：

```bash
hermes profile create scout --clone \
  --description "需求梳理：只读，挑下一个议题并 assign 给 hizzgdev"
hermes -p scout config set model.default deepseek-v4.1-flash
cp team/automations/weka/SOUL.scout.md ~/.hermes/profiles/scout/SOUL.md

hermes kanban boards create groom --name 需求梳理  # --name 默认是 slug 的 Title Case，不写就只有「Groom」
```

再把两个键填进 webhook 的 `config.json` 并重启服务（两个键在 §4 有详细说明）：

```json
{ "groom_board": "groom", "groom_assignee": "scout" }
```

```bash
systemctl --user restart github-webhook
```

新板不需要单独配 loop：dispatcher 每 tick 枚举所有未归档的板。但**卡停在 `ready` 不动时**先排除 profile——`hermes profile list | grep scout`，再重启 `hermes-gateway` 试一次。

**deploy 之后必须演练一次**：手动建一张 groom 卡，确认 scout 能被调度、能读文档、能写出一个像样的 issue：

```bash
hermes kanban --board groom create "演练：groom 卡能被调度" --assignee scout \
  --body $'https://github.com/hizzgdev/jsmind-v2/pull/<刚刚合并的 PR>\n\n## trigger\n- event: manual rehearsal\n'
```

不做这一步，「profile 没注册好」「板子的调度器没起来」这类问题要等下一次真实合并才暴露，而那时你只会看到「合并了却什么都没发生」。

`SOUL.scout.md` 和 cody / reed 的那两份一样由 `weka-deploy` 拷贝并校验 hash（见 `team/automations/skills/weka-deploy/SKILL.md`），所以启用这一支的那次部署顺带就把 profile 里的 `SOUL.md` 换新了。

## 评论如何到达正在干活的人

评论写进卡之后，卡的四种状态各有各的接收方式，所以**不需要 reopen-review 来唤醒**：

| 卡的状态 | 评论怎么进去 |
| --- | --- |
| `todo` / `ready` | worker 开工第一步 `kanban_show()` 读到（返回里带 comments） |
| `running` | `inject_new_comments_from_env` 轮询本卡新评论，`agent.steer()` 送进正在跑的会话 |
| `review` | 停着等人领；review 通道领走后，reed 第一步 `kanban_show()` 读到 |
| `blocked` | 停下等人处理；评论照样追加进卡，人 unblock 后 worker 重新起来，第一步 `kanban_show()` 读到。这期间不会新建卡（见「每次关闭后排下一轮：groom 卡」） |

`reopen_review_task` 的语义是 `review → ready/todo`，恢复的是**实现者**，也就是"打回 cody"；它只作为人工工具保留，weka 不自动调用。

steer 只覆盖 `running`，所以两只 SOUL 各有一条交付前的复查点：`kanban_request_review` / `kanban_complete` 之前重新 `kanban_show()` 一次，处理自开工以来新增的 operator note，新要求与已完成的工作冲突就 block，不硬交付。盖住的是评论与交付擦肩而过的那一小段窗口。

**已知缺口**：评论与收工赛跑的那一小段只靠 SOUL 的复查点兜。卡在读到评论之前就 `kanban_complete` 了，评论就贴在一张 dead 卡上没人读；彻底堵住（比如按 comment id 追投）不在这一版，另开一张卡。

## 拒绝与失败必须留痕

journal 只有运维能看，提要求的人只看得见 GitHub。所以保留下来的拒绝、以及建卡/追加的失败，都要在对象（issue 或 PR）上说一句：

| 情况 | 对象上的痕迹（issue / PR） |
| --- | --- |
| 建返工卡失败（`hermes kanban create` 非零退出） | 说明请求没有进队列，指向 journal 和 webhook 投递记录里的 redeliver |
| 追加到已有卡的评论失败（`hermes kanban comment` 非零退出） | 同上 |
| PR 没有卡，或最新一张卡不是 `done`（已归档） | 说明为什么没建卡：只有 AI 已经把这张 PR 交回来（最新一张卡 `done`）、等终审的阶段才接人的返工请求 |
| issue 评论没有进卡：issue 没指派给 `zzgbot` 也没指派给 `hizzgdev` | 说明两个指派各接哪条路，指派之后再留一次言 |
| issue 评论没有进卡：指派给了 `hizzgdev`，但 `groom_board` / `groom_assignee` 没配 | 说明这一支现在是关的、配置补上后再留一次言 |
| issue 上建 scout 卡 / 返工卡失败 | 同 PR 侧的建卡失败说明（两种情况文案分别写"groom 卡失败"和"返工卡失败"） |
| PR 关闭时建 groom 卡失败 | 同 PR 侧的建卡失败说明，文案写"建 groom 卡失败"，并说明下一轮需求梳理没有进队列 |

只有三种情况留在 journal 里，因为它们没有可执行的下文，在对象上留言只会是噪音：

- **连 `weka` 标签都没有，也没有 open 卡**（PR 或 issue 都是）：这个对象从来不在 weka 的流程里，weka 不去陌生对象的评论区插话。
- **PR 已经关闭**：没有可返工的代码。
- **issue 已经关闭，且两张板上都没有 open 卡**：没有下一步可做，建出来的卡只能对着一个死 issue。

关闭的对象若还挂着 open 卡，评论照样追加到那张卡（这正是「评论如何到达正在干活的人」里那条赛跑窗口）。

两条规则：拒绝不静默；沉默必须有理由，而理由写在这里。

脚本自动发的 comment 第一行是 HTML 注释 `<!-- weka-webhook -->`。`gh` 在这台机器上用的是仓库所有者的 token，留言看起来就是人写的——脚本靠这个标记跳过自己发的 comment，否则会把自己的说明当成新的返工请求，自己喂自己。

## 标签与人工审核门

cody 与 reed 的 SOUL 只写「做什么、按什么顺序」，状态机的理由和边界在这一节。改规则时改这里，SOUL 里只留动作。

**过程标签不是 SOUL 的动作。** `weka-queue` / `weka-working` / `weka-reviewing` / `weka-blocked` 这四个标签由 `labels.py` 按卡的 `(status, assignee)` 算出来，读一遍对象上的现状、只写差异；触发源是看板自己的事件表 `task_events`——每条真实的状态转换都记在那里，谁写的都算（`kanban_*` 工具、dispatcher、webhook 的 `hermes kanban create`）。没有定时器，两只 SOUL 里也已经没有任何一条打标签的命令：模型忘了打、或者打错一个，都不再能让 GitHub 上的标签和看板对不上。`weka` 不归它管，见下面那张表。

| 标签 | 打在哪 | 谁打 | 用途 |
| --- | --- | --- | --- |
| `weka-queue` | issue 卡同时打 issue 和它 branch 开出来的 PR；PR 卡打 PR | `labels.py`（卡在 `ready` / `todo` / `scheduled` / `triage` / `review`） | 给人看：在排队——等 cody 开工、被退回等 cody、或者等 reed 领取。`review` 算排队，不是「正在审」 |
| `weka-working` | issue 卡同时打 issue 和它 branch 开出来的 PR；PR 卡打 PR | `labels.py`（卡 `running` 且 assignee 是 cody） | 给人看：AI 正在干 |
| `weka-reviewing` | issue 卡同时打 issue 和它 branch 开出来的 PR；PR 卡打 PR | `labels.py`（卡 `running` 且 assignee 是 reed） | 给人看：AI 正在审 |
| `weka-blocked` | issue 卡同时打 issue 和它 branch 开出来的 PR；PR 卡打 PR | `labels.py`（卡 `blocked`） | 给人看：卡停住等人处理，不是崩了 |
| `weka` | issue / PR | 人 | 归属标记。只有它没有流程含义，脚本从不加也从不删 |

**没有第五个标签。** 曾经有一个 `weka-reviewed` 表示「AI 审完了、球在你这儿」，同时当返工闸门用。它有两个写入者（`pass-review.sh` 加、cody 返工起手摘、对账器还要小心别覆盖它），今晚那次审查就是「加回去了却没人擦」的那一半出了问题：PR #297 停在 ready + `weka-reviewing` + `weka-reviewed`，因为卡变 `done` 之后对账不再看它的 PR。现在「审完了」是看板上的事实——这张 PR 最新的一张卡是 `done`——由 webhook 直接查库判断；标签只表达「谁在动它」。

**删除是部署之后的一次性动作。** 代码合并、webhook 重启、三个 profile 的钩子都绿了之后，才 `gh label delete weka-reviewed --yes`（它会把所有 PR 上的这个标签一并去掉，不用逐个清）。顺序反过来的话，新闸门还没上线、旧闸门要的标签已经没了，这段时间里的返工请求会全部被拒。

**对账读事件游标，不按 profile 猜卡。** 每次唤醒读 `~/.hermes/state/weka-labels/events-<board>` 里的 cursor，查 `task_events` 里 id 大于它、且 kind 属于状态转换（`created` / `promoted` / `claimed` / `review_requested` / `changes_requested` / `completed` / `blocked` / `unblocked` / `scheduled` / `archived`）的行，去重 task_id，逐张对账，最后才推进 cursor。几个钉死的点：

- **游标初始化成 `max(id)`，不是 0。** 这块板有几千条历史事件，从 0 重放是 `gh` 限流事故，不是修复。
- **游标按板分开**：groom 板是另一个数据库、另一套 id 空间。
- **先写标签、后推进游标**：中途崩了就是重放一次，对账是幂等的。
- **SQL 里过滤 kind**：给的是**不改状态的 kind 黑名单**（`heartbeat` 一项就占事件表的一大半，`spawned` / `worker_result` / `commented` / `edited` / `respawn_guarded` 等都在里面）。为什么是黑名单不是白名单：不认识的 kind 多读一张卡、代价是一次幂等比较；漏掉一种 kind 就是一张卡永远带着上一张卡的标签。重试熔断那条路就是活例子——卡被置 `blocked` 时只 append `gave_up`（前面还有 `timed_out` / `crashed` / `rate_limited`），不发 `kanban_task_blocked`，而 blocked 的卡不产生工具调用，白名单漏了它 `weka-blocked` 就永远写不上。`stale` / `reconciled` / `reclaimed`（dispatcher 重新排队）、`dependency_wait`（停回 `todo`）、`assigned`（改了 `phase()` 读的 assignee）同理。
- **每第 10 次唤醒补一次兜底扫**：所有**非 running** 的活卡 + 最近 10 张有状态事件的卡。它救的是「事件消费了但标签没写成功」。running 的卡故意不扫——它的标签在 `claimed` 那一刻就写好了，而重读一张还在 `running` 的 reed 卡，正是「PR 已批准又被写回 `weka-reviewing`」的成因。

两个转换没有生命周期事件（`kanban_request_review` 的 running → review 和 `kanban_request_changes` 的 review → ready 只写库），所以 `post_tool_call` 用 `^kanban_.*` 这个 matcher 补一刀（`matches_tool` 走的是 `fullmatch`，只写 `^kanban_` 一个都匹配不上）；另外三条 `kanban_task_claimed` / `kanban_task_completed` / `kanban_task_blocked` 直接在 payload 里带卡号（`extra.task_id`）。`--from-hook` 把 payload 点名的卡和游标新事件拼成一批，交给一个 detached 子进程处理，自己立刻退出——工具调用不会被钩子的 `timeout` 拖住（`hooks.<event>[].timeout`，默认 60s、上限 300）。

`labels.py` 有四个入口：`--from-hook`（钩子，读 stdin、spawn 后立刻退出）、`--events`（钩子的子进程：游标批处理；带 `--fallback` 时追加兜底扫）、`--full` 手动全量扫一遍、`--card <id>` 只对账一张卡；`--dry-run` 只打印差异、不发任何写请求，也不推进游标。三个 profile 共用 `~/.hermes/state/weka-labels/`：`events-<board>` 是每块板的事件游标，`counter` 是唤醒计数（每第 10 次带兜底），`lock` + `dirty` 保证同一时刻只跑一轮，`log` 是钩子模式的全部输出——钩子没有 stdout，排障第一步就是看这个文件。

看板数据直读 SQLite（只读连接 `mode=ro` + `busy_timeout`），不再 shell 调 `hermes kanban list`：事件游标没有 CLI 对应物，而 `list` 内部会跑一次 `recompute_ready()` 写板——那正是 worker 里被围栏挡住的那一步。只读不走围栏，所以也不再需要剥掉 worker 身份。

**钩子要登记在两个地方，因为它们按进程注册。** gateway 启动时注册的是它自己 profile（这台机器上是默认 profile）的 `hooks:`，而 `kanban_task_claimed` 是 gateway 的 dispatcher 在领取卡时发的——只写进 cody / reed / scout 三份 `config.yaml` 的话，这个事件一条都收不到，`weka-working` 得等 worker 第一次调 `kanban_*` 工具才出现。所以：默认 `~/.hermes/config.yaml` 放三条生命周期事件（**不放** `post_tool_call`，那是人机对话的 profile，会把每次工具调用都变成一次对账）；三份 worker profile 放 `post_tool_call` + `kanban_task_completed` + `kanban_task_blocked` + 那条 `pre_tool_call` 围栏。两个细节：payload 里的 `extra.board` / `profile` 是**发事件那个进程**的，不是卡的（探针卡在 `jsmind-v2` 板上、事件里写的是 `default`），选库要用 `config.json` 的 `kanban_board`，卡号只用 `extra.task_id`；改完配置不会立刻生效，gateway 按 mtime 签名周期性重同步（约 6 分钟），部署后要等一个周期或重启 gateway，再做一次探针卡验证。写法、allowlist 与核对见 `team/automations/skills/weka-deploy/SKILL.md`。

没注册的表现很干净、也很误导人：标签只在 GitHub 事件到达时才动，也就是 webhook 建卡那一下；卡跑起来之后的 `weka-queue → weka-working → weka-queue → weka-reviewing` 一次都不会自己发生，而 `~/.hermes/state/weka-labels/` 里什么都不会多出来。如果将来跨进程桥接失效（升级后行为变了），退路是只留 `post_tool_call` + 事件游标：功能都在，代价是 `weka-working` 晚到——直到 worker 第一次调 `kanban_*` 工具才出现。

规则只有一条：**人在 PR 上的动作（提交 review 或留言），只在看板上这张 PR 最新的一张卡是 `done` 时才建新卡**。有 open 卡时走「追加到那张卡」，不看标签；没有卡或最新一张是 `archived`，说明这张 PR 不在本流程里，留一句说明。

副产品：`weka-working` 挂在对象上、但板上没有对应的卡在跑，就是"卡崩了"的可视信号——排查先看标签，比翻看板快。

### PR 的 draft 状态：从 cody 开工一直到 AI 审查通过

cody 手上的 PR 一律是 **draft**：开 PR 时 `--draft` 开出、返工起点 `gh pr ready --undo` 转回去。**交接时不翻 ready**——draft 一直保持到 reed 通过的那一刻，由 reed 跑 `scripts/weka/pass-review.sh`（它的最后一步才是 `gh pr ready`；reed 跑的是 `origin/master` 上的那份副本，不跑被审查分支里的代码，见 `SOUL.reed.md`）。draft 是 GitHub 原生状态，不能合并、页面上有徽章，不需要新标签。

命令顺序：cody 返工起手先 `gh pr ready --undo` 回 draft（`weka-working` / `weka-queue` 由 `labels.py` 改，不用手打）；reed 通过时跑 `scripts/weka/pass-review.sh`，它只做前置检查（PR 是 draft 且带 `weka-reviewing`，否则一步不动地退出）和那一次 `gh pr ready`——**它不碰任何标签**，`weka-reviewing` / `weka-working` 由 `labels.py` 在卡变成 `done` 的那次对账里擦（脚本带 `scripts/weka/test-pass-review.sh`，CI 会跑）。只有一个标签写入者，代价是标签比 PR 晚十几秒消失，这是确定的滞后、不是竞态。这样任何一步崩掉都停在 draft——不会停在「ready 却还挂着 `weka-working`」。

标签操作不是原子的，所以判定按**稳态**看：返工起手退 draft 之后、`labels.py` 那次对账之前会短暂出现 draft + `weka-reviewing` 这种「上一轮的标签」。这是过渡，不是新加的合法状态——真停在那儿说明 worker 死在两步之间，卡还在板上。

为什么 draft 一直保持到 AI 审查通过：draft 表达的是「还没到人该看的时候」。reed 审的时候 AI 的结论还没出来，这时把 PR 摆成 ready，人会被叫去终审一份还没过 AI 预检的东西。ready 的唯一入口就是 reed 那个脚本。

验收按这两条核：**PR 是 draft 时挂着一个过程标签**（排队是 `weka-queue`，cody 手上是 `weka-working`，reed 手上是 `weka-reviewing`）；**PR 是 ready 时没有任何过程标签**，只剩 `weka`。后半条由 `labels.py` 的终态规则兜住：卡 `done` 时它的 PR 也会被解析并擦干净（`refs_for` 不再按阶段决定要不要查 PR），所以 approver 之后落下的 `weka-reviewing` 会在 `kanban_task_completed` 那一次对账里消失。draft + `weka-reviewing` 是正常状态——reed 审的时候 PR 还没到人手上。

cody 若死在 draft，PR 就停在 draft + `weka-working`：合不了，但不需要谁来把它「救」成 ready——那等于替 cody 宣布审查通过。`weka-working` 挂着而板上没有卡在跑，就是「卡崩了」的可视信号（见上一节），人看到了可以直接处理。

两个方向的 `gh pr ready` 在「已经是目标状态」时都 exit 0（只在 stderr 打一行 `!` 提示），反复执行无害：返工起点 cody 跑 `--undo`，通过那一刻 reed 跑 `ready`。这条幂等性也是它俩能各自反复执行的前提。

### 关闭时的兜底清理

标签的清理不靠谁"记得摘"，靠 `closed` 事件兜底：`issues.closed` 和 `pull_request.closed` 都在 webhook 订阅里，两条 payload 各自带着对象的 `labels`，脚本按这份列表判断存在性，只删确实还在的 `weka-*`。

为什么放在这里而不是让 reed 去 PR body 里找 `Closes #N`：

- 只有 `close` 这个事件知道"这个对象彻底结束了"。审批通过时 issue 还开着，那一刻清掉 issue 上的标签并不比关闭时更正确。
- 编号和对象类型不用推断——payload 里是哪个对象就清哪个，不存在"从 PR 号猜 issue 号"这一步，也就不会删错对象。
- 判断存在性用的是事件自带的列表，比"先 GET 一次标签、再 DELETE"少一次请求；列表里没有的标签根本不发 DELETE，也就不会产生 `HTTP 404` 那种看起来像失败的日志。

覆盖到的路径：

| 关闭方式 | 事件 | 清掉的标签 |
| --- | --- | --- |
| PR 合并 | `pull_request.closed`（`merged=true`） | PR 上残留的 `weka-working` / `weka-reviewing` |
| PR 直接关闭不合并 | `pull_request.closed`（`merged=false`） | 同上（本地分支保留，只清标签） |
| issue 手动关闭 | `issues.closed` | issue 上残留的 `weka-working` |
| 合并时被 `Closes #N` 自动关闭的 issue | `issues.closed` | 同上 |

`weka` 标签只表示归属，不在这份清理名单里——对象关掉之后留着它没有意义，但它也是人筛"哪些是 weka 管的"的依据，脚本不动它。

兜底只覆盖**部署之后**的 close 事件：在这份代码上线前就关掉的对象不会再收到 `close`，它们身上残留的标签不会自己消失。`labels.py` 也不碰已经 closed 的对象——给一个已合并的 PR 补标签等于宣告一件没人能推进的事——所以这类一次性残留只能手工清：用 `gh issue list --state closed --label weka-working` 找出来，对每个编号 `gh api -X DELETE repos/{owner}/{repo}/issues/<number>/labels/weka-working`。

`weka-queue` 与 `weka-blocked` 连这条兜底都不在名单里（`strip_labels()` 只清 `weka-working` / `weka-reviewing`）：对象在 `review` 里被关掉、或者被 block 之后关掉，就会一直挂着它们，除了这里没有别的回收路径。查法一样，换 `--label`：`gh issue list --state closed --label weka-queue`、`gh pr list --state merged --label weka-blocked`，再对每个编号 DELETE 同名的那一个。

## 安全边界

两层防线，层叠生效：

1. HMAC-SHA256 验签（脚本，核心）：靠 secret 证明请求确为 GitHub 所发，与来源 IP 无关。
2. IP 白名单（nginx，辅助）：只放行 GitHub webhook 来源 IP 段，见 `nginx.conf` 的 allow 列表，数据来自 `https://api.github.com/meta` 的 `hooks` 字段。

GitHub 明确不推荐按 IP 做白名单——这些段会不定期更新，且 meta API 的列表并非穷尽。既然选了这条路，就有一个排查约定：

> **收不到 webhook 事件时，第一步先查 IP 白名单。** 重新 `curl https://api.github.com/meta`，
> 对比 `nginx.conf` 里的 allow 列表，缺了新段就补上再 `sudo systemctl reload nginx`。
> 别一上来就去应用层乱找。

## 运行环境

webhook 脚本要求 Python 3.10+，只依赖标准库。不要用系统自带的老 Python（本机 `/usr/bin/python3` 是 3.6），在独立虚拟环境锁版本：

```bash
/usr/bin/python3.11 -m venv ~/.hermes/venvs/weka
```

下面 service 模板的 `ExecStart` 已经指向这个 venv；换机器时按实际 Python 路径调整。

## 测试

webhook 的回归测试用标准库 `unittest`，同样没有第三方依赖。任何版本的 Python 3.10+ 都能跑（不必是上面那个 venv）：

```bash
python3 -m unittest discover -s team/automations/weka -p 'test_*.py' -v
```

守的就是上文那条不变量——让 `busy_cards()` 返回一张 `running` 卡，再模拟人留言，断言"建了卡"、追加到了卡上、或"在对象上留了痕"，而不是**什么都没发生**。CI 的 `checks` job 里跑同一条命令（见 `.github/workflows/ci.yml`），所以这条不变量不会只靠谁记得跑。

## 并发与资源

**webhook 不判断容量。** 板上有没有卡在跑是 dispatcher 的事，webhook 只负责把人的动作用一张卡表达出来。曾经这里有一道 `busy_cards()` 门：板上只要有任何一张 `running` / `review` 的卡，就丢弃返工请求，只往 journal 写一行 `deferring`。它既不看是不是同一个 PR，也没有队列可排，于是别人在跑的时候，人在 GitHub 上看到的只是"没人理"。现在同一份查询只用来打一行 `[INFO]` 日志。

同一时刻能跑几个 worker，由两个键决定，都在 `~/.hermes/config.yaml` 的 `kanban:` 段：

```yaml
kanban:
  max_in_progress_per_profile: 1   # 每个 profile 最多同时运行一个实例
  max_in_progress: 3               # 整机同时最多三个
```

注意位置：这两个键属于调度器，写 Hermes 的主配置；本目录的 `config.json` 只管 webhook 自己的事（端口、密钥、标签、指派、board、groom 目标），两者不要混。

| 键 | 作用 | 取值 |
| --- | --- | --- |
| `max_in_progress_per_profile` | 按 assignee 数 `running` 卡。到上限的 profile 本轮被跳过（`skipped_per_profile_capped`），下一 tick 再试。每个 profile 最多同时运行一个实例。 | `1` |
| `max_in_progress` | 整机上限，跨 board 计数，不看 assignee。 | `3` |

两个都是正整数，用 `hermes config set` 写：

```bash
HERMES_HOME=$HOME/.hermes hermes config set kanban.max_in_progress_per_profile 1
HERMES_HOME=$HOME/.hermes hermes config set kanban.max_in_progress 3
```

为什么设这两个值：

- 每个 profile 最多同时运行一个实例。同一个 profile 的两张卡会抢同一个工作区和分支，串行比并行稳。
- 整机上限定成 3，正好是三个角色各一张：`cody` 实现、`reed` 评审、`scout` 需求梳理（groom 板上的卡同样占用这 3 个名额——上限按整机算、跨 board 计数）。三个都有位置，谁也不会把另一个饿死。
- worker 是完整的 Hermes 会话，各自要跑构建和测试；并行数直接叠加 CPU 和内存占用。放开名额不会让流程变快，只会让几个 worker 抢同一台机器，一起变慢。

`max_in_progress` 不显式设置时，调度器按内存总量推一个默认值（每 512MB 一个名额，下限 2、上限 8）。这个默认值偏向让机器跑满，建议显式写死。

两个键在 gateway 启动时读一次并缓存，改完必须重启才生效：

```bash
systemctl --user restart hermes-gateway
grep -E 'kanban dispatcher: max_in_progress(_per_profile)?=' ~/.hermes/logs/gateway.log | tail -2
```

这两行是 gateway 启动时解析出的实际值（`kanban dispatcher: max_in_progress=3`、`kanban dispatcher: max_in_progress_per_profile=1`）。前缀不能省：日志里回显的聊天文本也会带键名，只 grep `max_in_progress` 会把那句回显一起捞进来。`max_in_progress` 显式设置后，那条 `kanban.max_in_progress unset; using memory-derived default …` 就不再出现。

`tail -2` 取的是最后两行，不是最后一次启动的两行：`max_in_progress_per_profile` 未设置时它不打任何日志（只有 `max_in_progress` 未设置才有那条 memory-derived warning），这时最近一次启动只落一行，`tail -2` 会把上一次启动的残留行拼进来。引用前把行首时间戳和 `ExecMainStartTimestamp` 对一下，对不上的那行不是这次启动的值。

`team/automations/skills/weka-deploy/SKILL.md` 收尾前会核对三样：`~/.hermes/config.yaml` 里的值、gateway 是否在那个文件最后一次写入之后启动、启动日志里解析出的实际值。守住的是这三样，不是运行中的实时状态——`hermes config get` 只读文件，不问进程，文件改了没重启时它照样打印 3。测试守不了这条：CI 里没有 `~/.hermes/config.yaml`。

### 流程变慢先看这两个键

症状：卡在板上 `ready`，十几分钟不动；或者 gateway 日志里 `spawned=0` 而队列非空。

- `hermes kanban --board jsmind-v2 list --status ready` 有卡，`running` 却只有一张：`max_in_progress_per_profile=1` 挡住了第二张（同一个 profile 的前一张还没收尾）。排队是设计如此，不是故障。
- 已经三张在跑，新卡不动：`max_in_progress=3` 用满了，等其中一张收尾。
- 长期只有一张卡在跑：所有卡都指派给了同一个 profile。per-profile 的 1 是按 profile 算的，不是全局。

要放宽就先确认机器扛得住：worker 跑构建和测试时的 CPU、内存占用不会因为上限调大而变小，上限放开只是让它们同时抢。

## 重建清单

在全新机器上按顺序重建：

### 1. 审查 skill（Reed 用）

两个都要装，缺第二个会让 reed 的 worker 启动即崩：

```bash
# 项目审查标准（我们自己的）
mkdir -p ~/.hermes/profiles/reed/skills/jsmind-review
cp team/automations/skills/jsmind-review/SKILL.md \
   ~/.hermes/profiles/reed/skills/jsmind-review/SKILL.md

# 框架的 review 通道协议（Hermes 自带，硬编码要求）
hermes skills repair-official sdlc-review --restore
```

`sdlc-review` 是 review 通道写死要加载的 skill（`gateway/session_kanban.py` 在这一轮来自 review 通道时无条件追加）。profile 里没有它时，worker 会在调用模型之前抛 `ValueError: kanban_skills_unavailable` 死掉，外层只报 "Kanban execution unknown; retained by owner"，卡崩两次自动 blocked——看起来完全不像缺文件。

还要确认它没被 curator 剪枝记录挡住：`skills/.curator_suppressed` 里有 `sdlc-review` 的话删掉那一行（`~/.hermes` 和各 profile 的都要查），否则下一次 update 或剪枝会把它再移走。

### 2. Hermes profile

```bash
hermes profile create cody --clone \
  --description "Weka developer: writes code and opens PRs"
hermes profile create reed --clone \
  --description "Weka reviewer: reviews PR diffs and writes review comments"
hermes profile create scout --clone \
  --description "需求梳理：只读，挑下一个议题并 assign 给 hizzgdev"

cp team/automations/weka/SOUL.cody.md ~/.hermes/profiles/cody/SOUL.md
cp team/automations/weka/SOUL.reed.md ~/.hermes/profiles/reed/SOUL.md
cp team/automations/weka/SOUL.scout.md ~/.hermes/profiles/scout/SOUL.md
```

模型：`--clone` 会继承 default profile 的模型（本机是 `deepseek-v4.1-flash`）。三个
worker 干机械活，不要用 pro 模型；若 default 用了 pro，记得手动切 flash：

```bash
hermes -p cody config set model.default deepseek-v4.1-flash
hermes -p reed config set model.default deepseek-v4.1-flash
hermes -p scout config set model.default deepseek-v4.1-flash
```

### 3. Kanban board + project

```bash
hermes kanban boards create jsmind-v2
hermes kanban boards create groom --name 需求梳理   # scout 的板
hermes project create jsmind-v2 ~/repos/jsmind-v2 --board jsmind-v2 --use

# 调度器并发上限（见上文「并发与资源」）
HERMES_HOME=$HOME/.hermes hermes config set kanban.max_in_progress_per_profile 1
HERMES_HOME=$HOME/.hermes hermes config set kanban.max_in_progress 3
```

`--use` 把 project 设为 active。board 的 DB 会落在
`~/.hermes/kanban/boards/jsmind-v2/kanban.db`（webhook 脚本按 board slug 自动推导，不用手填）。

### 4. webhook 脚本 + nginx 反代

脚本只监听 loopback（`127.0.0.1`），对外由 nginx 反代，脚本不直连公网。

先起脚本：

```bash
cd team/automations/weka
cp config.example.json config.json
openssl rand -hex 32        # 把输出填进 config.json 的 "secret"
# 视情况改 port / target_label / human_login 等字段

systemctl --user link "$(pwd)/github-webhook.service"
systemctl --user daemon-reload
systemctl --user enable --now github-webhook.service
```

**groom 那一支要两个键才启用**：`config.json` 里的 `groom_board`（board slug）和 `groom_assignee`（profile 名）。`config.example.json` 里两个都是 `null`，意思是"这条分支关着"——指派给 `hizzgdev` 的 issue 上的评论此时只会在 issue 上留一句说明。scout 那张卡就位之后填成 `"groom_board": "groom"`、`"groom_assignee": "scout"`，重启服务即生效。填了 board slug 但那个 board 还不存在时，issue 侧建卡失败会在 issue 上留痕、PR 侧会在 PR 上留痕（不会静默）。另外 `SOUL.scout.md` 要拷进 `~/.hermes/profiles/scout/SOUL.md`，和下面 cody / reed 那两份一起。

**改了 `github-webhook.py` 或 `config.json` 之后，主 checkout 要先拉代码再重启，否则跑的还是旧代码。** `ExecStart` 直接指向主 checkout 里那份脚本，`Restart=always` 只在进程退出时重启，不会因为文件变了就重载——和 gateway、nginx 一样，改完不重启就是静默不生效：

```bash
cd ~/repos/jsmind-v2 &&
  git switch master &&          # 主 checkout 可能停在已合并的旧分支上，那种分支远端已删，pull 会直接报错
  git pull --ff-only &&
  git log -1 --oneline &&       # 应看到刚合并的那次提交，不是旧的
  systemctl --user restart github-webhook.service
```

四步用 `&&` 串起来，任何一步失败都不会走到 `restart`——最坏的情况是停在那一步、什么都没变，而不是把旧代码重新拉起来一遍。

**`SOUL.cody.md` / `SOUL.reed.md` / `SOUL.scout.md` 也要重拷。** profile 里的 `SOUL.md` 是这三个文件的副本（§2 的 `cp`），worker 起会话时才从 profile 读它。所以改了 SOUL 同样要在 pull 之后重拷一次，否则 live 的 agent 拿到的还是旧指令：

```bash
cp team/automations/weka/SOUL.cody.md ~/.hermes/profiles/cody/SOUL.md
cp team/automations/weka/SOUL.reed.md ~/.hermes/profiles/reed/SOUL.md
cp team/automations/weka/SOUL.scout.md ~/.hermes/profiles/scout/SOUL.md
```

这一步不需要重启任何服务：SOUL.md 在每次 worker 起会话时读，下一张卡自然生效。

再挂 nginx 反代（独立 server 块，按公网 IP 直连，监听端口 <webhook-port>）：

先把 `nginx.conf` 里的 `<public-ip>`、`<webhook-port>` 两个占位符替换成本机的真实公网 IP 和端口，再执行：

```bash
sudo cp nginx.conf /etc/nginx/conf.d/weka-webhook.conf
sudo nginx -t && sudo systemctl reload nginx
```

验证脚本 + 反代链路：

```bash
ss -tlnp | grep 9180          # 应看到 127.0.0.1:9180（不再是 0.0.0.0）
# 直接打脚本：无签名应 403
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST http://127.0.0.1:9180 -d '{}' -H 'X-GitHub-Event: issues'
# 走 nginx（用 IP 的 Host 头）：本地 IP 不在白名单，应被 deny 返回 403
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Host: <public-ip>:<webhook-port>' -H 'X-GitHub-Event: issues' \
  -d '{}' http://127.0.0.1:<webhook-port>/
```

### 5. GitHub 侧

先把五个 label 建好（`gh` 不会自动创建，加一个不存在的 label 会直接报错）：

> **这五个标签在当前仓库里已经存在**，下面这串命令只对从零重建的仓库有意义：`gh label create` 不覆盖同名标签，只会报已存在——今天照着本节跑，五条一条也改不动，看起来却像「建好了」。要核对线上现状用 `gh label list | grep weka`。

```bash
gh label create weka           --description "Weka webhook+kanban flow: issues with this label become kanban tasks"
gh label create weka-queue     --description "weka: nobody is working on it — queued for the implementer, or waiting for the reviewer to claim it"
gh label create weka-working   --description "weka: the implementer is working on it"
gh label create weka-reviewing --description "weka: the reviewer is reviewing it"
gh label create weka-blocked   --description "weka: stopped, waiting on a human decision"
```

描述沿用仓库现值；不给 `--color`，从零重建时颜色由 GitHub 分配，颜色不参与任何判断。

名字必须逐字一致（`weka-queue`，不是 `weka-queued` 之类）：`labels.py` 按字符串比对，建错的表现是对账每次都认为这个标签缺失、每次都想去补，而 `gh` 加一个不存在的 label 每次都回 422——GitHub 上看起来只是标签不动。建完 `gh label list | grep weka` 对一遍，五个一并列出来才算建齐。

`weka` 在 issue 上是开工信号（必须配指派才生效），在 PR 上只是"这个 PR 归 weka 管"的归属标记、不参与任何判断。返工闸门也不在标签上：它问看板「这张 PR 最新的一张卡是不是 `done`」（见上文「标签与人工审核门」）。

再配 webhook：Settings → Webhooks → Add webhook：

- Payload URL：`http://<public-ip>:<webhook-port>`
- Content type：`application/json`
- Secret：第 4 步生成的 secret
- Events：**Issues、Issue comments、Pull requests、Pull request reviews、Pull request review comments**

两个 review 相关的事件都要勾。它们在 GitHub 上是两件事：提交一个 review（Approved / Request changes / Comment）走 `pull_request_review`，而在 diff 上留一条行内评论走 `pull_request_review_comment`——只在行内评论里提意见时，review 的 body 是空的，只有后一个事件会来。只勾一个的话，提意见的方式换个按钮就静默失效了。

`Issues` 和 `Pull requests` 两条订阅覆盖的不只是新建：`closed` 这个 action 也走它们，关闭时的标签兜底清理就靠这两条，不要因为"只关心新建"就不勾。

云控制台放通 <webhook-port> 入站（安全组）——只放 <webhook-port>，不放 9180。

### 6. 端到端自检

建一个打 `weka` 标签、指派给 `zzgbot` 的 Issue，观察这条链：

1. 卡片 `#<issue>: <标题>` 被创建并跑起来；
2. issue 上先出现 `weka-queue`，卡跑起来后变成 `weka-working`；开 PR 后 PR 是以 draft 开出、带 `weka-working`；交接后卡转 review 排队，PR **仍是 draft**、标签回到 `weka-queue`，reed 领到后又变成 `weka-reviewing`（主机 `config.json` 缺 `"reviewer": "reed"` 时这一步不会发生——`phase()` 认不出 reed，sweep 只打一行 `… is not in the phase table; skipping`；见 `team/automations/skills/weka-deploy/SKILL.md` 的只读冒烟一节）；
3. Reed 审完（跑 `pass-review.sh`，只翻 draft → ready），PR 在这一刻变成 ready，你被加为 reviewer；`weka-working` / `weka-reviewing` 要等 reed 的卡 `kanban_complete` 落库、`kanban_task_completed` 触发的那次对账，十几秒后消失，最终只剩 `weka`；
4. 你在 PR 上提一条 `changes_requested` 的 review → webhook 查库看到这张 PR 最新的一张卡是 `done`，建出卡片 `#<pr>: Rework 1 — ...`，PR 标签回到 `weka-queue`；
5. 你合并 PR → worktree 和本地分支被删掉，PR 上标签清空，不再有卡片；PR body 里带 `Closes #N` 时 issue 会自动关闭，issue 上残留的过程标签被擦掉——`labels.py` 在卡变 `done` 时擦一次，webhook 在 close 时还有一份兜底（手动关闭 issue 同理）。

   删除由 `pull_request.closed` 事件触发，因此它只覆盖这条投递真的到达过的合并。投递丢了、或者当时删不掉（判据把构建产物误当成未提交的改动），worktree 就会留下。清理是独立工具，不塞进 webhook——那个脚本只负责把事件变成卡片：

   ```
   python3 scripts/cleanup-worktrees.py --dry-run   # 只报告，不动手
   python3 scripts/cleanup-worktrees.py             # 只清已完成的工作
   ```

   只在两件事同时成立时删——GitHub 说这个分支的 PR 已合并、git 愿意删（有未提交改动的它自己就拒绝，只剩被忽略文件的它接受）。也就是说 `.gitignore` 就是这里的策略：某个构建产物没被忽略，它就会拦住自己的清理，该修的是忽略规则，不是再往白名单里加一条。分支还在不在 origin 不参与判断——没合并就被删掉的分支是废弃的工作，不是垃圾。规则只写在 `scripts/cleanup-worktrees.py` 的 docstring 里一份，这里和部署 skill 都只做引用。`--all` 跳过合并检查。幂等，干净时输出 `0 worktree(s) removed`。

   支撑这个判断的三条机制，都不是推测：

   - `git worktree remove` 拒绝一个含已跟踪改动或未跟踪文件的 worktree，而对只剩被忽略内容的照删——不加 `--force` 也是这个行为。
   - `.gitignore` 里 `name/` 只匹配目录，`name` 才同时匹配目录和同名符号链接。worker 把主 checkout 的 `node_modules` 用符号链接链进 worktree，带斜杠的规则看不见它，`git status` 于是报出一条未跟踪路径。
   - 删 worktree 不会顺带删本地分支，`git branch -D` 得单独跑。

   想自己验证，或者要改清理逻辑之前，先跑 `scripts/probe-worktree-removal.sh`：它在临时仓库里把四种情况各试一遍，逐条打印 `ok` 或 `MISMATCH`，跑完自动清理，不碰当前 checkout。它也在 CI 里跑，所以哪天 git 改了这条规则，是那条流水线先红，而不是又攒出一堆没人删的 worktree。

6. 同一次合并还会在 groom 板上建一张 `#<pr>: Groom — …` 卡给 scout：`hermes kanban --board groom list` 能看到它，scout 起来后写（或补全）一个带 `weka` 标签、assign 给 `hizzgdev` 的 issue。scout 的卡按「一卡一轮」跑完就 close，所以出现在 `done` 里也是对的；一直停在 `ready` 才是 profile 或板没配好。

任何一环卡住，按顺序看：

```bash
journalctl --user -u github-webhook.service     # webhook 侧：验签、gate、建卡、[SKIP] 事件名
hermes kanban --board jsmind-v2 list            # 卡片侧：状态、assignee
hermes kanban --board jsmind-v2 runs <task>     # 每次尝试的结果
tail -n 40 ~/.hermes/profiles/<worker>/logs/managed-worker.log   # worker 真正的报错
```

日志里出现 `[SKIP] unhandled event: xxx`，说明 GitHub 送来了这个脚本不认识的事件——多半是 Settings → Webhooks 里少勾了对应的 events，或者脚本来不及支持这个动作。出现 `[GATE]` 则是收到了但条件不满足，括号里会写清是哪一条（最新一张卡不是 `done`、不是仓库所有者、PR / issue 不归 weka 管、对象已关闭且没有 open 卡）。其中"最新一张卡不是 `done`"这一条会在 PR 上留一句说明（见「拒绝与失败必须留痕」），所以这类问题现在不用翻 journal 也能看见。

卡崩两次会被自动 block。先看 `weka-working` 是不是还挂在对象上——挂着但板上没卡在跑，说明 worker 起不来，直接看上面那个 `managed-worker.log`。
