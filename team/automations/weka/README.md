# Weka — 基于 webhook + kanban 的 jsMind-V2 开发流程

weka 是 jsMind-V2 的一套自动化开发流程：GitHub 上带 `weka` 标签的 Issue 会触发 webhook，转成 Kanban 卡片，由调度器拉起 Cody（开发）和 Reed（审查）两个 profile 干活，仓库所有者做终审。你在 PR 上要求修改时，webhook 会再建一张返工卡。

名字是 we(webhook) + ka(kanban) 拼出来的。

三条基本约定，后文展开：

- **卡只是触发器**，事实来源是 GitHub 上的 issue/PR。卡里只有对象 URL 和触发快照。
- **卡标题以编号开头**（`#85: …`），编号是查卡的唯一键。
- **看板上没有"等人审核"这个状态**：人审的门在 GitHub（reviewer 请求 + `weka-reviewed` 标签）。
- **人的动作不会被静默丢掉**：要么建卡/追加评论，要么在 PR 上说清为什么不建。沉默只留给"这张 PR 不归 weka 管"和"PR 已关闭"。

本目录自包含：流程说明、脚本、SOUL、部署步骤和重建清单都在这里，入口就是这份 README。

## 目录内容

| 文件 | 作用 |
| --- | --- |
| `github-webhook.py` | webhook 接收器：GitHub 事件 → `hermes kanban` 调用，零 LLM 中转 |
| `config.example.json` | 配置模板；真实 `config.json` 已 gitignore，不入仓 |
| `github-webhook.service` | systemd user unit 模板 |
| `nginx.conf` | nginx 反代 server 块（监听 <webhook-port>，放到 `/etc/nginx/conf.d/`） |
| `SOUL.cody.md` | Cody（开发者）的行为规范 |
| `SOUL.reed.md` | Reed（审查者）的行为规范 |

## 流程全景

```
GitHub Issue（weka 标签 + 指派 zzgbot）
  → webhook: kanban create "#85: <标题>" --assignee cody
  → dispatcher 拉起 cody（60s tick）
  → Cody: 打 weka-working → 开发 → 自测 → 开 draft PR + 补 weka-working → 打 weka-reviewing（保持 draft）→ request_review(reed)
  → dispatcher 拉起 reed
  → Reed: 按 sdlc-review 流程审 draft PR（不动它的 draft 状态）→ 意见写在 PR 上
       ├─ 有必须改 → request_changes（卡回 cody，PR 一直是 draft，cody 补上 weka-working，可无限轮，不计任何计数）
       └─ 通过 → 摘 weka-reviewing 与 PR 上的 weka-working、加 weka-reviewed、转成 ready、加 reviewer hizzgdev、complete
  → 你在 GitHub 上终审
       ├─ 合并 → webhook 删 worktree + 本地分支 + 摘 PR 上的标签（不建卡）
       └─ 要求修改 → webhook 见 weka-reviewed → 建 "#86: Rework N — ..." 卡给 cody
  → issue 关闭（含合并时被 `Closes #N` 自动关闭）
       → webhook 按事件里的标签兜底清掉 issue 上残留的 weka-working
```

关键设计：

- 人类只跟 GitHub 打交道，bot 之间只跟看板打交道；webhook 是两者之间的桥，不跑任何 LLM。
- **卡只是触发器，GitHub 才是事实来源。** 卡上只有对象 URL 和触发快照，细节由 cody/reed 自己去 GitHub 查。
- 看板上没有"等人审核"这个状态。人审的门在 GitHub 上：reviewer 请求 + `weka-reviewed` 标签。所以卡不会被 block 也不会有 triage，`block/triage/specify` 那一整套都不涉及。

## 卡片与编号

所有卡的标题以编号开头：

```
#85: <issue 标题>              从 issue 建的卡
#86: Rework — <PR 标题>        从 PR 建的卡（返工）
```

- 编号是唯一键，查卡用前缀匹配：`title LIKE '#86:%' AND status NOT IN ('done','archived')`。
- 不带轮次号：第几轮这件事在 PR 的 review 历史里，卡上再记一份只是多一个会算错的来源。同一个 PR 的连续返工卡标题相同，按 `created_at` 排序即可。
- 前缀锚定是关键：标题中段出现 `#86:` 不会误伤，`#860…` 也不会命中 `#86:`。
- 同一个编号最多一张 open 卡。webhook 建卡前先查，命中就把这次事件追加成那张卡的 comment，不建新卡。
- 编号只标识"建卡的那个对象"，issue 和 PR 之间不做映射。要串起来让 agent 自己看 PR body 里的 `Closes #N`。

## 触发规则

**人的动作不会静默消失**：每条人写的事件都有一个可见结果——建卡、追加到已有卡，或者在 PR 上留一句说明。

| 方向 | 必须同时满足 | 结果 |
| --- | --- | --- |
| issue 建卡 | ① 标签里有 `weka`；② `zzgbot` 在 assignees 里（多个指派人也算，不要求它是唯一或第一个）；③ 事件是 `opened` / `labeled` / `assigned` 三者之一 | 建卡；该编号已有 open 卡则把这次事件追加成那张卡的 comment |
| PR 返工 | ① 该编号已有 open 卡 | 把评论正文追加到那张卡。**这一条不看标签**：cody 开工第一件事就是摘掉 `weka-reviewed`，返工进行中的留言不能被标签挡住 |
| PR 返工 | ① 没有 open 卡；② PR 带 `weka-reviewed`；③ 入口是 `hizzgdev` 的提交 review（非 `approved`）或会话评论或行内评论 | 建返工卡，卡上带着评论原文 |
| PR 返工 | ① 没有 open 卡；② PR 不带 `weka-reviewed` | 不建卡，在 PR 上留一句说明（见下一节） |

`closed` 不在这张表里：它不建卡，只做标签兜底清理，见下文「关闭时的兜底清理」。

**容量不在这里判断。** 板上有没有别的卡在跑，跟"要不要接这条返工请求"无关：卡建出来就进 `ready` 排队，什么时候跑由 dispatcher 按 `max_in_progress` / `max_in_progress_per_profile` 决定（见「并发与资源」）。webhook 里曾经有一道 `busy_cards()` 门在这里挡卡，而它没有队列可排——"板上忙"在实现里就等于"丢弃"。

为什么 issue 方向要两道门：公开仓库上任何人都能给 issue 打标签，所以标签只说明"这是想交给 weka 的活"，真正决定要不要花 token 的是指派——只有仓库所有者能把 issue 指派给 bot 账号。

为什么 PR 方向要限定作者：bot 自己也会在 PR 上写评论（reed 的审查意见），限定为仓库所有者才能保证"只有人的动作触发返工卡"，不会被自己的输出喂回去。

## 拒绝与失败必须留痕

journal 只有运维能看，提要求的人只看得见 GitHub。所以保留下来的拒绝、以及建卡/追加的失败，都要在 PR 上说一句：

| 情况 | PR 上的痕迹 |
| --- | --- |
| 建返工卡失败（`hermes kanban create` 非零退出） | 说明请求没有进队列，指向 journal 和 webhook 投递记录里的 redeliver |
| 追加到已有卡的评论失败（`hermes kanban comment` 非零退出） | 同上 |
| PR 没有 `weka-reviewed`，也没有 open 卡 | 说明为什么没建卡：只有 AI 审查通过（`weka-reviewed` 在 PR 上）、等终审的阶段才接人的返工请求 |

只有两种拒绝留在 journal 里，因为它们没有可执行的下文，在 PR 上留言只会是噪音：

- **PR 上连 `weka` 标签都没有**：这张 PR 从来不在 weka 的流程里，weka 不去陌生 PR 的评论区插话。
- **PR 已经关闭**：没有可返工的代码。

两条规则：拒绝不静默；沉默必须有理由，而理由写在这里。

脚本自动发的 comment 第一行是 HTML 注释 `<!-- weka-webhook -->`。`gh` 在这台机器上用的是仓库所有者的 token，留言看起来就是人写的——脚本靠这个标记跳过自己发的 comment，否则会把自己的说明当成新的返工请求，自己喂自己。

## 标签与人工审核门

两个 SOUL 只写「做什么、按什么顺序」，状态机的理由和边界在这一节。改规则时改这里，SOUL 里只留动作。

| 标签 | 打在哪 | 谁打 | 用途 |
| --- | --- | --- | --- |
| `weka-working` | issue 卡打 issue；每张 PR 在 cody 手上时都有（开 PR 时补、返工起点补） | cody 开工时 / 开 PR 后 | 给人看：AI 正在干。PR 上的那份由 reed 通过时摘掉，issue 上的那份由 webhook 在 close 时兜底清掉 |
| `weka-reviewing` | 永远是 PR | cody 交接前 | 给人看：AI 正在审 |
| `weka-reviewed` | 永远是 PR | reed 通过时 | **唯一控制流程的标签**：只有它存在时，你在 PR 上的动作才会触发返工卡。它和 PR 转 ready 是同一刻发生的（ready 的唯一入口） |

规则只有一条：**人在 PR 上的动作（提交 review 或留言），只在 PR 带 `weka-reviewed` 时才建新卡**。cody 拿到返工卡的第一件事就是摘掉它，所以不会重复触发；摘掉之后人再留言，走的是"追加到该 PR 的 open 卡"那条路，不看标签。

副产品：`weka-working` 挂在对象上、但板上没有对应的卡在跑，就是"卡崩了"的可视信号——排查先看标签，比翻看板快。

### PR 的 draft 状态：从 cody 开工一直到 AI 审查通过

cody 手上的 PR 一律是 **draft**：开 PR 时 `--draft` 开出、返工起点 `gh pr ready --undo` 转回去。**交接时不翻 ready**——draft 一直保持到 reed 通过、加上 `weka-reviewed` 的那一刻，由 reed 跑 `scripts/weka/pass-review.sh`（它的最后一步才是 `gh pr ready`；reed 跑的是 `origin/master` 上的那份副本，不跑被审查分支里的代码，见 `SOUL.reed.md`）。draft 是 GitHub 原生状态，不能合并、页面上有徽章，不需要新标签。

命令顺序也是固定的：cody 返工起手先 `--undo` 回 draft，再摘 `weka-reviewed`、补 `weka-working`；reed 通过时由 `scripts/weka/pass-review.sh` 先摘标签、清掉 `weka-working`，`gh pr ready` 是最后一条，清理没做全就不翻（脚本带 `scripts/weka/test-pass-review.sh`，CI 会跑）。这样任何一步崩掉都停在 draft——不会停在「ready 但 AI 的结论不在」，也不会停在「ready 却还挂着 `weka-working`」。

标签操作不是原子的，所以判定按**稳态**看：返工起手退 draft 之后、摘 `weka-reviewed` 之前会短暂出现 draft + `weka-reviewed`，摘完到补回 `weka-working` 之间会短暂一个流程标签都没有。这两处是过渡，不是新加的合法状态——真停在那儿说明 worker 死在两步之间，卡还在板上。

为什么把翻转放在 `weka-reviewed` 而不是交接：draft 表达的是「还没到人该看的时候」。reed 审的时候 AI 的结论还没出来，这时把 PR 摆成 ready，人会被叫去终审一份还没过 AI 预检的东西。ready 的唯一入口就是 `weka-reviewed`，两者必须同时出现。

验收按这两条核：**PR 是 draft 时至少挂着一个「有人在场」的流程标签**（cody 手上是 `weka-working`，reed 手上是 `weka-working` + `weka-reviewing`，且不能有 `weka-reviewed`）；**PR 是 ready 时 `weka-reviewed` 必须在，且 `weka-working` / `weka-reviewing` 都不能在**，不能只剩 `weka`。draft + `weka-reviewing` 是正常状态——reed 审的时候 PR 还没到人手上。

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
| PR 合并 | `pull_request.closed`（`merged=true`） | PR 上残留的 `weka-working` / `weka-reviewing` / `weka-reviewed` |
| PR 直接关闭不合并 | `pull_request.closed`（`merged=false`） | 同上（本地分支保留，只清标签） |
| issue 手动关闭 | `issues.closed` | issue 上残留的 `weka-working` |
| 合并时被 `Closes #N` 自动关闭的 issue | `issues.closed` | 同上 |

`weka` 标签只表示归属，不在这份清理名单里——对象关掉之后留着它没有意义，但它也是人筛"哪些是 weka 管的"的依据，脚本不动它。

兜底只覆盖**部署之后**的 close 事件：在这份代码上线前就关掉的对象不会再收到 `close`，它们身上残留的标签不会自己消失。这类一次性残留要手工清一遍——用 `gh issue list --state closed --label weka-working` 找出来，对每个编号 `gh api -X DELETE repos/{owner}/{repo}/issues/<number>/labels/weka-working`。

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

守的就是上文那条不变量——让 `busy_cards()` 返回一张 `running` 卡，再模拟人留言，断言"建了卡"或"在 PR 上留了痕"，而不是**什么都没发生**。CI 的 `checks` job 里跑同一条命令（见 `.github/workflows/ci.yml`），所以这条不变量不会只靠谁记得跑。

## 并发与资源

**webhook 不判断容量。** 板上有没有卡在跑是 dispatcher 的事，webhook 只负责把人的动作用一张卡表达出来。曾经这里有一道 `busy_cards()` 门：板上只要有任何一张 `running` / `review` 的卡，就丢弃返工请求，只往 journal 写一行 `deferring`。它既不看是不是同一个 PR，也没有队列可排，于是别人在跑的时候，人在 GitHub 上看到的只是"没人理"。现在同一份查询只用来打一行 `[INFO]` 日志。

同一时刻能跑几个 worker，由两个键决定，都在 `~/.hermes/config.yaml` 的 `kanban:` 段：

```yaml
kanban:
  max_in_progress_per_profile: 1   # 每个 profile 最多一个在跑
  max_in_progress: 2               # 整机同时最多两个
```

注意位置：这两个键属于调度器，写 Hermes 的主配置；本目录的 `config.json` 只管 webhook 的端口、密钥、标签，两者不要混。

| 键 | 作用 | 取值 |
| --- | --- | --- |
| `max_in_progress_per_profile` | 按 assignee 数 `running` 卡。到上限的 profile 本轮被跳过（`skipped_per_profile_capped`），下一 tick 再试。一个 profile 不会并行干两张卡。 | `1` |
| `max_in_progress` | 整机上限，跨 board 计数，不看 assignee。 | `2` |

两个都是正整数，用 `hermes config set` 写：

```bash
hermes config set kanban.max_in_progress_per_profile 1
hermes config set kanban.max_in_progress 2
```

为什么设这两个值：

- 一个 profile 同时只推进一张卡。同一个 profile 的两张卡会抢同一个工作区和分支，串行比并行稳。
- 整机上限定成 2，正好是 Cody 一张 + Reed 一张：两个人都有位置，谁也不会把另一个饿死。
- worker 是完整的 Hermes 会话，各自要跑构建和测试；并行数直接叠加 CPU 和内存占用。放开名额不会让流程变快，只会让几个 worker 抢同一台机器，一起变慢。

`max_in_progress` 不显式设置时，调度器按内存总量推一个默认值（每 512MB 一个名额，下限 2、上限 8）。这个默认值偏向让机器跑满，建议显式写死。

两个键在 gateway 启动时读一次并缓存，改完必须重启才生效：

```bash
systemctl --user restart hermes-gateway
grep 'max_in_progress' ~/.hermes/logs/gateway.log | tail -2
```

日志会打印实际生效的值：`max_in_progress_per_profile=1`；`max_in_progress` 显式设置后，那条 `kanban.max_in_progress unset; using memory-derived default …` 就不再出现。

### 流程变慢先看这两个键

症状：卡在板上 `ready`，十几分钟不动；或者 gateway 日志里 `spawned=0` 而队列非空。

- `hermes kanban --board jsmind-v2 list --status ready` 有卡，`running` 却只有一张：`max_in_progress_per_profile=1` 挡住了第二张（同一个 profile 的前一张还没收尾）。排队是设计如此，不是故障。
- 已经两张在跑，新卡不动：`max_in_progress=2` 用满了，等其中一张收尾。
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

cp team/automations/weka/SOUL.cody.md ~/.hermes/profiles/cody/SOUL.md
cp team/automations/weka/SOUL.reed.md ~/.hermes/profiles/reed/SOUL.md
```

模型：`--clone` 会继承 default profile 的模型（本机是 `deepseek-v4.1-flash`）。两个
worker 干机械活，不要用 pro 模型；若 default 用了 pro，记得手动切 flash：

```bash
hermes -p cody config set model.default deepseek-v4.1-flash
hermes -p reed config set model.default deepseek-v4.1-flash
```

### 3. Kanban board + project

```bash
hermes kanban boards create jsmind-v2
hermes project create jsmind-v2 ~/repos/jsmind-v2 --board jsmind-v2 --use

# 调度器并发上限（见上文「并发与资源」）
hermes config set kanban.max_in_progress_per_profile 1
hermes config set kanban.max_in_progress 2
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

**改了 `github-webhook.py` 或 `config.json` 之后，主 checkout 要先拉代码再重启，否则跑的还是旧代码。** `ExecStart` 直接指向主 checkout 里那份脚本，`Restart=always` 只在进程退出时重启，不会因为文件变了就重载——和 gateway、nginx 一样，改完不重启就是静默不生效：

```bash
cd ~/repos/jsmind-v2 &&
  git switch master &&          # 主 checkout 可能停在已合并的旧分支上，那种分支远端已删，pull 会直接报错
  git pull --ff-only &&
  git log -1 --oneline &&       # 应看到刚合并的那次提交，不是旧的
  systemctl --user restart github-webhook.service
```

四步用 `&&` 串起来，任何一步失败都不会走到 `restart`——最坏的情况是停在那一步、什么都没变，而不是把旧代码重新拉起来一遍。

**`SOUL.cody.md` / `SOUL.reed.md` 也要重拷。** profile 里的 `SOUL.md` 是这两个文件的副本（§2 的 `cp`），worker 起会话时才从 profile 读它。所以改了 SOUL 同样要在 pull 之后重拷一次，否则 live 的 agent 拿到的还是旧指令：

```bash
cp team/automations/weka/SOUL.cody.md ~/.hermes/profiles/cody/SOUL.md
cp team/automations/weka/SOUL.reed.md ~/.hermes/profiles/reed/SOUL.md
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

先把四个 label 建好（`gh` 不会自动创建，加一个不存在的 label 会直接报错）：

```bash
gh label create weka           --color 0B7A3B --description "Weka flow: issue/card is owned by the automation"
gh label create weka-working   --color FBCA04 --description "weka: an AI worker is doing the work"
gh label create weka-reviewing --color FBCA04 --description "weka: an AI reviewer is reviewing the PR"
gh label create weka-reviewed  --color 0E8A16 --description "weka: AI review passed; awaiting the human"
```

`weka` 在 issue 上是开工信号（必须配指派才生效），在 PR 上只是"这个 PR 归 weka 管"的归属标记、不参与任何判断；`weka-reviewed` 才是唯一控制流程的标签（见上文「标签与人工审核门」）。

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
2. issue 上出现 `weka-working`；开 PR 后 PR 是以 draft 开出、带 `weka-working`；交接后 PR **仍是 draft**，出现 `weka-reviewing`；
3. Reed 审完（`weka-reviewed`），PR 才在这一刻变成 ready，`weka-working` / `weka-reviewing` 都已摘掉，你被加为 reviewer；
4. 你在 PR 上提一条 `changes_requested` 的 review → 出现卡片 `#<pr>: Rework 1 — ...`，`weka-reviewed` 被摘掉；
5. 你合并 PR → worktree 和本地分支被删掉，PR 上标签清空，不再有卡片；PR body 里带 `Closes #N` 时 issue 会自动关闭，issue 上的 `weka-working` 同时被清掉（手动关闭 issue 同理）。

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

任何一环卡住，按顺序看：

```bash
journalctl --user -u github-webhook.service     # webhook 侧：验签、gate、建卡、[SKIP] 事件名
hermes kanban --board jsmind-v2 list            # 卡片侧：状态、assignee
hermes kanban --board jsmind-v2 runs <task>     # 每次尝试的结果
tail -n 40 ~/.hermes/profiles/<worker>/logs/managed-worker.log   # worker 真正的报错
```

日志里出现 `[SKIP] unhandled event: xxx`，说明 GitHub 送来了这个脚本不认识的事件——多半是 Settings → Webhooks 里少勾了对应的 events，或者脚本来不及支持这个动作。出现 `[GATE]` 则是收到了但条件不满足，括号里会写清是哪一条（没有 `weka-reviewed`、不是仓库所有者、PR 不归 weka 管、PR 已关闭）。其中"没有 `weka-reviewed`"这一条会在 PR 上留一句说明（见「拒绝与失败必须留痕」），所以这类问题现在不用翻 journal 也能看见。

卡崩两次会被自动 block。先看 `weka-working` 是不是还挂在对象上——挂着但板上没卡在跑，说明 worker 起不来，直接看上面那个 `managed-worker.log`。
