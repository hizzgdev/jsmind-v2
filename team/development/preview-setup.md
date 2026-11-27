# 预览：现在的做法、原理、走过的弯路

结论先行：第 1 节就是今天跑在 CI 里的东西，第 4 节才是试错史。

## 0. 三份文档的分工

| 文档 | 管什么 |
|---|---|
| [ci-verification.md](ci-verification.md) | 为什么要有这些层、每层证明什么、在线 e2e 什么时候做 |
| 本文 | 现在的做法、原理、为什么是它、走过的弯路；供别的项目照抄 |
| `ci.yml` 里的注释 | 已经配好之后，这一步为什么这么写 |

## 1. 今天的形态

```
                 example/v2-features.json
                          │  scripts/prepare-preview.ts
                          ▼
                  tmp/preview-data.json          ← 图和页面共用这一份
                  ┌───────┴────────┐
       export image                 export html
                  ▼                ▼
          tmp/preview.png    tmp/preview.html     （单文件、零外链）
                  │                │
  POST uploads... │                │ npx surge ... --preview
                  ▼                ▼
  github.com/user-attachments/…   <ts>--jsmind-v2-pr-preview.surge.sh
                  └───────┬────────┘
                          ▼
             一条 comment（隐藏 marker: jsmind-render-preview）
```

| | 图片 | 页面 |
|---|---|---|
| 产物 | `tmp/preview.png` | `tmp/preview.html` |
| 谁生成 | `./.github/actions/render-map` → `scripts/render-preview.ts` → `jsmind export image` | `jsmind export html` |
| 存在哪 | GitHub 的附件存储（`uploads.github.com`） | surge.sh 的一个 revision |
| 拿到什么 | `https://github.com/user-attachments/assets/<uuid>` | `https://<ts>--jsmind-v2-pr-preview.surge.sh` |
| 读者要做什么 | 什么都不用做，图直接显示在 comment 里 | 点一下 |
| 什么时候失效 | 随 comment 存在 | 该域名又发了 100 个 revision 之后被挤出 |

需要的外部东西：

| 预览 | 需要 | 谁提供 | 放在哪 |
|---|---|---|---|
| 图片 | 一个**用户**身份的 token，对仓库有写权限 | 维护者 | secret `PR_PREVIEW_TOKEN` |
| 图片 | 仓库的数字 id | Actions 自动 | `gh api repos/$REPO --jq .id` |
| 页面 | surge 账号 + token | 维护者 | secret `SURGE_TOKEN` |
| 页面 | 一个 `*.surge.sh` 域名 | 首次发布即占用 | 写死在 workflow 里 |

两个 secret 都只用于**发布**，不参与测试；缺了它们 job 要警告并跳过，不能红。

---

## 2. 图片这条路

### 2.1 流程

```
node scripts/prepare-preview.ts example/v2-features.json tmp/preview-data.json
./.github/actions/render-map   (data-file, output, transparent: true)
POST https://uploads.github.com/user-attachments/assets?…   → .url
gh pr comment                  (先删掉带 marker 的旧评论，再贴新的)
```

关键是 `--data-binary`、content type 走 query string、`repository_id` 要数字 id：

```bash
curl -sS -X POST \
  "https://uploads.github.com/user-attachments/assets?content_type=image%2Fpng&name=preview.png&repository_id=$repo_id" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @tmp/preview.png
```

成功返回 `.url`；**失败也可能返回 200 但没有 `url`**，所以要用 `jq -r '.url // empty'` 判空，空就把整个响应打出来——否则现场只留下"图没出来"。

### 2.2 原理：这个端点是什么

它是 GitHub 网页端拖拽附件用的那块存储，`gh --attach` 打的也是它。三个性质决定了它好用：

- **文件名和 content type 在 query string 里**，body 是原始字节。它不是一个 multipart 接口，按 multipart 写会得到一个解析不了的请求。
- **返回的 URL 指向一个 blob，不是一次 commit。** rebase、force-push、改分支名都不影响已经贴出去的图——这一点是它取代"提交到分支再引用 raw"的根本原因（见 4.1）。
- **它归属于仓库下的一个附件，不归属于某次运行。** 所以评论删了图还在，重跑不会留下孤儿文件。

### 2.3 为什么要两个 token

这个端点**拒绝 Actions 内置的 token**，报错原文：

```
attaching files requires write access to the repository
```

说的不是权限块，是**凭证种类**：附件归属于"一个用户"，而 installation token 代表的是"某个 app 装在某个仓库上"，后者不被接受。必须是维护者的用户 token。

于是出现了取舍：`gh pr comment --attach` 能一步做完上传和评论，但它只接受一个凭证，说不出"用这个上传、用那个发言"。最后选两步——上传用维护者的 token，评论用 `github.token`（归到 `github-actions[bot]`，和这个仓库其它 CI 评论一致）。

换来两件事：评论署名一致；上传失败不连带评论失败（第 6 节排错表第一行就是靠这个分开定位的）。

代价是一个额外的 secret。它只在 fork 之外存在——fork PR 拿不到 secret，所以缺 token 时打一行 `::warning::` 然后 `exit 0`。

### 2.4 渲染侧的两个决定

- **透明背景**（`transparent: true`；PNG / WebP 才有意义，JPEG 没有 alpha）。贴进 comment 后透明区显示读者自己的主题底色，浅色深色都能看。**不要为了"好看"填一块棋格或背景色**——那会掩盖导出到底是不是透明的，把预览从证据变成装饰。
- **只对"浏览器启动失败"重试一次**。同一个镜像上，Chrome 启动耗时在连续两次运行里可以是 3 秒也可以是 10 秒，这是 runner 的问题不是代码的问题；其它失败一律只跑一次，该红就红。

---

## 3. 页面这条路

### 3.1 一次性配置

```bash
npm i -g surge
surge login                       # 首次会创建账号，要填邮箱和密码
surge tokens add --domain jsmind-v2-pr-preview.surge.sh -m "ci"
```

上一条输出的 token 存成仓库 secret **`SURGE_TOKEN`**。

- **验证邮箱**：未验证的账号发布速率减半。
- **域名**：`*.surge.sh` 免费，第一次发布到哪里就占用哪个。
- **token 尽量按域名限定**：能绑一个就绑，减少泄露后的影响面。我们每个 PR 都发到同一个域名，绑一个就够。

### 3.2 每次构建做什么

```bash
npx --yes surge tmp/preview.html jsmind-v2-pr-preview.surge.sh --preview
```

四个细节，每个都踩过：

- **单文件会被当成 `index.html`**，不用建目录、不用改名。
- **`--yes` 不能省。** CI 里没有 tty，`npx` 会停在 "Ok to proceed? (y)" 上直到超时。
- **token 走环境变量 `SURGE_TOKEN`**，不要 `--token "$SURGE_TOKEN"`：命令行参数会进日志。
- **输出带 ANSI 颜色码**，匹配前先剥：

```bash
plain=$(printf '%s' "$out" | sed -r 's/\x1B\[[0-9;]*[mK]//g')
host=$(printf '%s' "$plain" | grep -oE '[0-9]+--jsmind-v2-pr-preview\.surge\.sh' | tail -1)
```

### 3.3 原理：surge 的 revision 模型

一个域名下面挂着一串 **revision**。`surge <file> <domain>` 发布一个 revision 并让它成为 production；加 `--preview` 就只加 revision、不动 production。每个 revision 有自己的地址：

```
1785787164375--jsmind-v2-pr-preview.surge.sh     ← 这一版
latest--jsmind-v2-pr-preview.surge.sh            ← 永远是"最新那一版"
```

**别用 `latest--` 别名**：它永远指向该域名最新的 revision，几个 PR 同时开着就会互相串——A 的 comment 点开看到 B 的产物。我们用的是每次构建自己的 revision 地址。

而 revision 的保留是**数量边界**：

| 限制 | 值 | 对我们的意义 |
|---|---|---|
| 每域名保留 revision | 最近 100 个 | 旧预览自动消失 |
| 项目体积 | 450 MB / 10,100 文件 | 我们是 1 个文件、约 55 KB |
| 免费计划域名数 | 不限 | 不需要回收域名 |
| 发布速率 | 每域名 30 次/15 分钟、200 次/天；每账号 60 次/15 分钟、500 次/天 | 只有高频推送才可能撞上 |

### 3.4 为什么是"单域名 + 每版一个 revision"

讨论到最后收敛成这个形态，是因为比较下来它只放弃了一项——URL 的可读性：

| | 每 PR 一个域名 | 单域名 + `--preview` |
|---|---|---|
| 要不要 teardown | **要**，否则域名永久积累 | 不要 |
| 域名数量 | 随 PR 线性增长 | 固定 1 个 |
| 旧预览 | 永久对外可访问 | 满 100 个被挤出 |
| URL | `jsmind-v2-pr-228.surge.sh`，可读 | `<时间戳>--…`，不可读 |
| 与生产的关系 | 各自独立 | preview 不碰 production |

**如果 surge 有 TTL，这个比较就不成立**——我们会直接选每 PR 一个域名。查证的结果是没有：CLI 源码里 `expire` / `ttl` 零命中，`teardown` 是独立子命令，需要 owner 的 token 手动删。`afc163/surge-preview` 那个 action 自己实现 teardown，原因就是这个。

于是在"必须自己清"的前提下，两条路各有代价：一条要写八行 teardown job，另一条只放弃 URL 可读性。后来发现 surge 的 revision 保留是 100 个上限，天平彻底歪了——**数量边界替代了时间边界，teardown 这个需求直接消失**。这是整个讨论里唯一一次"某个选项的成本被证明为零"，其余都在权衡。

---

## 4. 走过的弯路

### 4.1 把图提交到 `render-preview` 分支再引用 raw

**想解决**：不引第三方托管，图跟着仓库走。

**结果**：每次 push 都改文件名，于是**每张旧 comment 的图都变成 404**。读者看到的是一列历史上已经不对、而且打不开的画。

**为什么放弃**：comment 是长期存在的东西，它引用的地址必须和 commit 脱钩。附件端点返回的是 blob 地址，正好满足。

### 4.2 把 html 用 `actions/upload-artifact` 挂上去（PR #228）

**想解决**：不引第三方托管，让产物可下载。

**结果**：实测下来，从 comment 到真的看到页面要过四道关——点链接、**登录 GitHub**、进 artifacts 页、下载、双击。未登录点开是 "Page not found"。artifact 还有 30 天过期。

**为什么放弃**：一句"点开看看"变成一项作业，这个 comment 就失去了存在意义。

### 4.3 直接用 `afc163/surge-preview`

**想解决**：评论生命周期（发链接、重跑替换、PR 关闭 teardown）已经有人做好了，何必自己写。

**结果**：读它的源码发现两处硬伤——`getCommentBody()` 里二维码是 `if (status === 'success')` 无条件加的，**没有开关**；也没有"别发评论"的输入，它发的是一整张富卡片（状态徽章图、Commit、Build time、Size、Logs、二维码、页脚）。

**为什么放弃**：我们要的是"我们自己那条 comment 里的一行链接"，不是另一张卡片。而它真正的价值（评论生命周期）我们本来就有。

### 4.4 每 PR 一个域名 + teardown

**想解决**：URL 可读，PR 之间互不干扰。

**结果**：多一个 workflow、多一个失败点，而且旧预览永久对外可访问。

**为什么放弃**：见 3.4——revision 的数量边界让"清理"这个问题不存在了。

### 4.5 用仓库自己的 GitHub Pages

**想解决**：不引任何第三方。

**结果**：一个仓库只能有一份 Pages 部署。要把 preview 挂在 `/preview/pr-228/` 下，就得把它混进生产产物，每次合并都要重算，旧 preview 还得自己清。

**为什么放弃**：为了一个预览，把生产发布流程搞成一团。

---

## 5. 抄到别的项目，改哪五处

1. 域名字符串（workflow 里一处，`grep` 全项目）
2. job 的 `if:` 条件——决定哪些 PR 需要预览（我们按"改了渲染器读的文件"过滤）
3. 预览数据从哪来（我们由 `scripts/prepare-preview.ts` 从 `example/v2-features.json` 造一份 `tmp/preview-data.json`，**图和页面共用这一份**）
4. 两个 secret 名
5. `file://` 的 e2e 与在线预览不冲突：前者证明构建产物可用，后者证明发布出去的那份可用

---

## 6. 排错

| 现象 | 先查 |
|---|---|
| 图不出来 | `PR_PREVIEW_TOKEN` 配了没；响应体里是不是那句 "requires write access" |
| 图出来了但 comment 没有 | comment 步骤的 `if:` 是不是只认了图片的 url（加了链接之后要改成两者任一） |
| 链接 404 | `--preview` 是否生效（生效时 URL 里带 `<timestamp>--` 前缀） |
| 链接打开是旧内容 | 用的是不是 `latest--` 别名 |
| 部署步骤超时 | `npx --yes` 漏了，卡在安装确认 |
| 整个 job 变红 | 预览步骤应该是 `continue-on-error: true`；预览不该有阻塞合并的权力 |
