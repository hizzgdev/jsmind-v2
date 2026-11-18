# Weka — 基于 webhook + kanban 的 jsMind-V2 开发流程

weka 是 jsMind-V2 的一套自动化开发流程：GitHub 上带 `weka` 标签的 Issue 会触发 webhook，转成 Kanban 卡片，由调度器拉起 Cody（开发）和 Reed（审查）两个 profile 干活，仓库所有者做终审。你在 PR 上要求修改时，webhook 会再建一张返工卡。

名字是 we(webhook) + ka(kanban) 拼出来的。

三条基本约定，后文展开：

- **卡只是触发器**，事实来源是 GitHub 上的 issue/PR。卡里只有对象 URL 和触发快照。
- **卡标题以编号开头**（`#85: …`），编号是查卡的唯一键。
- **看板上没有"等人审核"这个状态**：人审的门在 GitHub（reviewer 请求 + `weka-reviewed` 标签）。

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
  → Cody: 打 weka-working → 开发 → 自测 → 开 PR → 打 weka-reviewing → request_review(reed)
  → dispatcher 拉起 reed
  → Reed: 按 sdlc-review 流程审 → 意见写在 PR 上
       ├─ 有必须改 → request_changes（卡回 cody，可无限轮，不计任何计数）
       └─ 通过 → 摘 weka-reviewing/working、加 weka-reviewed、加 reviewer hizzgdev、complete
  → 你在 GitHub 上终审
       ├─ 合并 → webhook 删 worktree + 本地分支 + 摘标签（不建卡）
       └─ 要求修改 → webhook 见 weka-reviewed → 建 "#86: Rework N — ..." 卡给 cody
```

关键设计：

- 人类只跟 GitHub 打交道，bot 之间只跟看板打交道；webhook 是两者之间的桥，不跑任何 LLM。
- **卡只是触发器，GitHub 才是事实来源。** 卡上只有对象 URL 和触发快照，细节由 cody/reed 自己去 GitHub 查。
- 看板上没有"等人审核"这个状态。人审的门在 GitHub 上：reviewer 请求 + `weka-reviewed` 标签。所以卡不会被 block 也不会有 triage，`block/triage/specify` 那一整套都不涉及。

## 卡片与编号

所有卡的标题以编号开头：

```
#85: <issue 标题>                  从 issue 建的卡
#86: Rework 2 — <PR 标题>          从 PR 建的卡（返工）
```

- 编号是唯一键，查卡用前缀匹配：`title LIKE '#86:%' AND status NOT IN ('done','archived')`。
- 前缀锚定是关键：标题中段出现 `#86:` 不会误伤，`#860…` 也不会命中 `#86:`。
- 同一个编号最多一张 open 卡。webhook 建卡前先查，命中就把这次事件追加成那张卡的 comment，不建新卡。
- 编号只标识"建卡的那个对象"，issue 和 PR 之间不做映射。要串起来让 agent 自己看 PR body 里的 `Closes #N`。

## 标签与人工审核门

| 标签 | 打在哪 | 谁打 | 用途 |
| --- | --- | --- | --- |
| `weka-working` | issue 卡打 issue，PR 卡打 PR | cody 开工时 | 给人看：AI 正在干。卡完成时由 reed 摘掉 |
| `weka-reviewing` | 永远是 PR | cody 交接前 | 给人看：AI 正在审 |
| `weka-reviewed` | 永远是 PR | reed 通过时 | **唯一控制流程的标签**：只有它存在时，你在 PR 上的动作才会触发返工卡 |

规则只有一条：**人在 PR 上的动作（提交 review 或留言），只在 PR 带 `weka-reviewed` 时才建卡**。cody 拿到返工卡的第一件事就是摘掉它，所以不会重复触发。

副产品：`weka-working` 挂在对象上、但板上没有对应的卡在跑，就是"卡崩了"的可视信号——排查先看标签，比翻看板快。

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

`weka` 是 issue 的开工信号；`weka-reviewed` 是唯一控制流程的标签（见上文「标签与人工审核门」）。

再配 webhook：Settings → Webhooks → Add webhook：

- Payload URL：`http://<public-ip>:<webhook-port>`
- Content type：`application/json`
- Secret：第 4 步生成的 secret
- Events：**Issues、Issue comments、Pull requests、Pull request reviews**

（是 "Pull request reviews"，不是 "Pull request review comments"——触发返工卡的是你提交的 review，不是行内评论。）

云控制台放通 <webhook-port> 入站（安全组）——只放 <webhook-port>，不放 9180。

### 6. 端到端自检

建一个打 `weka` 标签、指派给 `zzgbot` 的 Issue，观察这条链：

1. 卡片 `#<issue>: <标题>` 被创建并跑起来；
2. issue 上出现 `weka-working`，开 PR 后 PR 上出现 `weka-reviewing`；
3. Reed 审完，PR 上变成 `weka-reviewed`，你被加为 reviewer；
4. 你在 PR 上提一条 `changes_requested` 的 review → 出现卡片 `#<pr>: Rework 1 — ...`，`weka-reviewed` 被摘掉；
5. 你合并 PR → worktree 和本地分支被删掉，标签清空，不再有卡片。

任何一环卡住，按顺序看：

```bash
journalctl --user -u github-webhook.service     # webhook 侧：验签、gate、建卡
hermes kanban --board jsmind-v2 list            # 卡片侧：状态、assignee
hermes kanban --board jsmind-v2 runs <task>     # 每次尝试的结果
tail -n 40 ~/.hermes/profiles/<worker>/logs/managed-worker.log   # worker 真正的报错
```

卡崩两次会被自动 block。先看 `weka-working` 是不是还挂在对象上——挂着但板上没卡在跑，说明 worker 起不来，直接看上面那个 `managed-worker.log`。
