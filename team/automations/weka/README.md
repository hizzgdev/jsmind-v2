# Weka — 基于 webhook + kanban 的 jsMind-V2 开发流程

weka 是 jsMind-V2 的一套自动化开发流程：GitHub 上带 `weka` 标签的 Issue 会触发 webhook，转成 Kanban 卡片，由调度器拉起 Cody（开发）和 Reed（审查）两个 profile 干活，仓库所有者做终审。

名字是 we(webhook) + ka(kanban) 拼出来的。

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
GitHub Issue（打 weka 标签）
  → webhook: issues.opened/labeled
  → hermes kanban create --assignee cody（board: jsmind-v2）
  → dispatcher（60s tick）拉起 cody
  → Cody: worktree 开发 + 自测 + 开 PR + PR URL 写卡 comment + request-review reed
  → dispatcher 拉起 reed
  → Reed: 按 jsmind-review skill 审查，意见写 PR
       ├─ 有必须改的问题 → request-changes，打回 cody 循环
       └─ 没有 → add-reviewer hizzgdev + 清空自己 assignee，等人类终审
  → 人类合并 PR
  → webhook: pull_request.closed(merged) → assign cody 收尾
  → Cody: 删 worktree + 删分支 + complete
```

关键设计：

- 人类只跟 GitHub 打交道；bot 之间只跟看板打交道。webhook 脚本是两者之间的桥。
- PR URL 是卡片和 PR 之间的对应键：Cody 开 PR 后把 URL 写进卡 comment，webhook 收到 PR 事件后靠查 `task_comments` 表反查卡片。
- webhook 脚本不跑任何 LLM，只做验签 + 调 CLI，不烧 token。

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

```bash
mkdir -p ~/.hermes/profiles/reed/skills/jsmind-review
cp team/automations/skills/jsmind-review/SKILL.md \
   ~/.hermes/profiles/reed/skills/jsmind-review/SKILL.md
```

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

- 仓库建 label `weka`（本流程的开工信号）。
- Settings → Webhooks → Add webhook：
  - Payload URL：`http://<public-ip>:<webhook-port>`
  - Content type：`application/json`
  - Secret：第 4 步生成的 secret
  - Events：Issues、Issue comments、Pull requests、Pull request review comments
- 云控制台放通 <webhook-port> 入站（安全组）——只放 <webhook-port>，不放 9180。

### 6. 端到端自检

建一个打 `weka` 标签的 Issue，观察：卡片创建 → Cody 开发并开 PR → Reed 审查 →
你被加为 reviewer → 你合并 → Cody 清理 → 卡片 done。任何一环卡住，先看
`journalctl --user -u github-webhook.service`（webhook 侧）和
`hermes kanban --board jsmind-v2 list`（卡片侧）。
