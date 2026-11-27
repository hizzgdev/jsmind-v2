# 预览的两条配置：怎么配起来

这份记**怎么把预览搭起来**，目的是让别的项目能照着抄。三份文档的分工：

| 文档 | 管什么 |
|---|---|
| [ci-verification.md](ci-verification.md) | 为什么要有这些层、每层证明什么、在线 e2e 什么时候做 |
| 本文 | 一次性配置：要开哪些账号、配哪些 secret、端点怎么调、有哪些坑 |
| `ci.yml` 里的注释 | 已经配好之后，这一步为什么这么写 |

配置是**会变但变得慢**的东西：换域名、换账号、token 过期重发时才看本文；日常改代码只看 workflow。

## 0. 需要的外部东西

| 预览 | 需要 | 谁提供 | 放在哪 |
|---|---|---|---|
| 图片 | 一个**用户**身份的 token，对仓库有写权限 | 维护者 | secret `PR_PREVIEW_TOKEN` |
| 图片 | 仓库的数字 id | Actions 自动 | `gh api repos/$REPO --jq .id` |
| 页面 | surge 账号 + token | 维护者 | secret `SURGE_TOKEN` |
| 页面 | 一个 `*.surge.sh` 域名 | 首次发布即占用 | 写死在 workflow 里 |

两个 secret 都只用于**发布**，不参与测试；缺了它们 job 要警告并跳过，不能红。

---

## 1. 图片：把 PNG 挂到 comment 上

### 1.1 不要提交到分支再引用

早期做法是把图提交到一个 `render-preview` 分支，comment 里引用 raw 地址。每次 push 文件名都变，于是**每张旧 comment 的图都变成 404**。

`uploads.github.com/user-attachments/assets` 返回的是 `https://github.com/user-attachments/assets/<uuid>`——它指向一个 **blob，不是 commit**，所以 rebase、force-push、改分支名都不影响已经贴出去的图。

### 1.2 端点

```bash
curl -sS -X POST \
  "https://uploads.github.com/user-attachments/assets?content_type=image%2Fpng&name=preview.png&repository_id=$repo_id" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @tmp/preview.png
```

四个坑，每一个都会花掉半小时：

- **`--data-binary`，不是 `--data`。** 后者会改写 payload，传上去的图是坏的。
- **content type 和文件名在 query string 里**，不在 header 里。所以 URL 必须原样保留，`%2F` 不能提前解码。
- **`repository_id` 要的是数字 id**，不是 `owner/repo`。
- **成功返回 `.url`，失败也可能返回 200。** 用 `jq -r '.url // empty'` 判空，空就把整个响应打出来——否则你只会看到"图没出来"。

### 1.3 为什么需要两个 token

这个端点**拒绝 Actions 内置的 token**，报错原文：

```
attaching files requires write access to the repository
```

说的不是权限块，是**凭证种类**——installation token 不被接受，必须是用户 token。而 comment 又希望归到 `github-actions[bot]` 名下，于是分两步：上传用维护者的 token，评论用 `github.token`。`gh ... --attach` 能一步做完，但它只接受一个凭证，说不出"用这个上传、用那个发言"。

### 1.4 缺 secret 时

fork PR 拿不到 secret。这时打一行 `::warning::` 然后 `exit 0`，不要 `exit 1`：CI 的目的是测试，图是顺手的礼物。

### 1.5 渲染侧的两个选择

- **透明背景**（`transparent: true`，PNG / WebP 才有意义，JPEG 没有 alpha）。贴进 comment 后透明区显示阅读者自己的主题底色，浅色深色都能看。不要为了"好看"填一块棋格或背景色——那会掩盖导出到底是不是透明的。
- **只对"浏览器启动失败"重试一次**。同一个镜像上，Chrome 启动耗时在连续两次运行里可以是 3 秒也可以是 10 秒；这是 runner 的问题，不是代码的问题。其它失败一律只跑一次。

---

## 2. 页面：把 HTML 发到一个能点的链接

### 2.1 surge 侧的一次性配置

```bash
npm i -g surge
surge login                       # 首次会创建账号，要填邮箱和密码
surge tokens add --domain jsmind-v2-pr-preview.surge.sh -m "ci"
```

把上一条输出的 token 存成仓库 secret **`SURGE_TOKEN`**。

- **验证邮箱**：未验证的账号发布速率减半。
- **域名**：`*.surge.sh` 免费，第一次发布到哪里就占用哪个；自有域名可以后绑，本文不涉及。
- **token 按域名限定**：能绑一个域名就绑，减少泄露后的影响面；我们是"每个 PR 都发到同一个域名"，所以绑一个就够。

### 2.2 发一次

```bash
npx --yes surge tmp/preview.html jsmind-v2-pr-preview.surge.sh --preview
```

- **单文件会被当成 `index.html`**，不用建目录、不用改名。
- **`--yes` 不能省。** CI 里没有 tty，`npx` 会停在 "Ok to proceed? (y)" 上直到超时。
- **token 走环境变量 `SURGE_TOKEN`**，不要 `--token "$SURGE_TOKEN"`：命令行参数会进日志。
- **`--preview` 不动 production**，只加一个 revision。
- 输出里有一行 `Preview available at <timestamp>--<domain>`，**带 ANSI 颜色码**，匹配前先剥：

```bash
plain=$(printf '%s' "$out" | sed -r 's/\x1B\[[0-9;]*[mK]//g')
host=$(printf '%s' "$plain" | grep -oE '[0-9]+--jsmind-v2-pr-preview\.surge\.sh' | tail -1)
```

别用 `latest--<domain>` 那个别名：它永远指向该域名最新的 revision，几个 PR 同时开着就会互相串。我们用的是**每次构建专属的 revision URL**。

### 2.3 为什么不需要 teardown

surge 没有"到期自动删除"，但它有**数量边界**：

| 限制 | 值 | 对我们的意义 |
|---|---|---|
| 每域名保留 revision | 最近 100 个 | 旧预览自动消失，替代了 teardown |
| 项目体积 | 450 MB / 10,100 文件 | 我们是 1 个文件、约 55 KB |
| 免费计划域名数 | 不限 | 不需要"回收域名" |
| 发布速率 | 每域名 30 次/15 分钟、200 次/天；每账号 60 次/15 分钟、500 次/天 | 只有高频推送才可能撞上 |

结论：**"定期删除"这个问题在单域名 + revision 的形态下不存在**。反过来说，**每个 PR 一个域名**就必须自己 teardown，否则域名永久积累、旧预览永久对外可访问——那是另一个方案的代价，我们没选它。

### 2.4 没有更好的替代品

- **comment 附件**：html 要么被拒，要么退化成"登录后下载"，一句"点开看看"变成四道关。
- **仓库自己的 Pages**：一个仓库只能有一份 Pages 部署；把 preview 塞进生产产物里，每次合并都要重算，旧 preview 还得自己清理。
- **用别人的 action**（如 `surge-preview`）：它会自己发一条带二维码的富卡片，二维码写死在源码里、没有关闭的输入，也塞不进我们已有的那条 comment。

---

## 3. 抄到别的项目上，改哪几处

1. 域名字符串（workflow 里一处，`grep` 一下全项目）
2. job 的 `if:` 条件——决定哪些 PR 需要预览（我们按"改了渲染器读的文件"过滤）
3. 预览数据从哪来（我们是 `scripts/prepare-preview.ts` 从 `example/v2-features.json` 造一份 `tmp/preview-data.json`，**图和页面共用这一份**）
4. 两个 secret 名
5. `file://` 的 e2e 与在线预览不冲突：前者证明构建产物可用，后者证明发布出去的那份可用

---

## 4. 排错

| 现象 | 先查 |
|---|---|
| 图不出来 | `PR_PREVIEW_TOKEN` 配了没；返回体里是不是那句 "requires write access" |
| 图出来了但 comment 没有 | comment 步骤的 `if:` 是不是只认了图片的 url（加了链接之后要改成两者任一） |
| 链接 404 | `--preview` 是否生效（生效时 URL 里带 `<timestamp>--` 前缀） |
| 链接打开是旧内容 | 用的是不是 `latest--` 别名 |
| 部署步骤超时 | `npx --yes` 漏了，卡在安装确认 |
| 整个 job 变红 | 预览步骤应该是 `continue-on-error: true`；预览不该有阻塞合并的权力 |
