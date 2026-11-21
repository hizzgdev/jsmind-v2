# 提交类型

> **本文是提交类型（commit type，也就是 PR 标题和 commit message 里冒号前面那个词）的唯一约定。**
> 别处只指向这里，不复制这张表 —— 这个仓库已经为「同一条规则写在三个文件里、其中两个漂了」付过一次学费（worktree 清理规则）。

## 1. 规则

**一个类型说的是它对「发布出去的东西」做了什么，不是「作者开了个 PR、挑了个前缀」。**

发布出去的东西 = `package.json` 的 `files` 列出来的这些：

```
dist/jsmind.js  dist/jsmind.cjs  dist/jsmind.umd.js  dist/cli.js  (+ .map, + .d.ts)
```

它们全部由 rollup 从 `src/` 编译出来。`dependencies` 是空的，所以也没有哪一项依赖变动能碰到产物。

- **只有改了 `src/` 的文件，才能用 `feat` / `fix` / `refactor`。** 一个 PR 同时改了 `src/`、文档和测试，保留它的功能类型 —— 类型说的是生产改动，文档和测试是它的附属。
- **`docs` 只指用户读的 API / CLI 文档**：`docs/{zh,en}/guide`、`docs/{zh,en}/reference`。需求、设计笔记、约定、团队流程不是 `docs`。
- **混合、无法归类的落到 `team`**，不要默认借 `feat`。

2.1.0 那个窗口是这条规则的度量：35 个提交里只有 6 个碰了 `src/`，而 12 个 `feat`/`fix` 里有 7 个一个 `src/` 文件都没改。那 7 个都是真活（webhook 不丢评论、文档站构建、playground 链接），但没有一个能改变 `npm i jsmind` 装到的东西。

## 2. 表

这张表是唯一的真源，`scripts/check-commit-type.mjs` 在 CI 里直接读它。类型名在反引号里、路径也写在反引号里 —— 那不是排版，是这台机器要读的格式。

| type | 含义 | 路径 |
|---|---|---|
| `feat` | 产物里的新行为 | `src/**` |
| `fix` | 产物里的行为被修正 | `src/**` |
| `refactor` | 产物内部搬动，行为不变 | `src/**` |
| `docs` | 用户读的 API / CLI 文档 | `docs/{zh,en}/guide`, `docs/{zh,en}/reference` |
| `test` | 只有测试 | `__tests__/**` |
| `devops` | CI、GitHub Actions、部署、发版的 workflow | `.github/**` |
| `deps` | 依赖升级 | `package-lock.json`, `package.json` |
| `tooling` | 不是 CI 的仓库脚本（发版、清理、探测） | `scripts/**` |
| `team` | 团队流程、agent 指令、规格、约定 | `team/**`, `docs/requirements/**`, `AGENTS.md` |
| `skill` | 对外发布的 agent skill | `skills/**` |
| `release` | 版本号那一笔提交本身 | `package.json`, `package-lock.json`, `releases/**` |

`release` 那一行比只改版本号多说一句 `releases/**`：自 #168 起发布说明作为文件跟版本号一起进树，发版 PR 带的正是这两样。`npm run release:prepare` 写的就是 `release: <version>`，分支 `release/<version>`。

**scope 是可选的，不在这张表的管辖内。** 它说的是「改动落在哪个子系统」（`cli`、`view`、`model`、`weka` …），审查时用来核对 diff；拿不准就写清楚的那个，别为了凑格式生造。

## 3. 机器怎么守

两处，都很便宜。

**一、CI 拿标题的类型对 diff 检查。** `scripts/check-commit-type.mjs` 挂在 `ci.yml` 的 `changes` job 上，只对 pull request 生效（push 到 master 没有标题）：

- 标题用了 `feat`/`fix`/`refactor`，diff 里没有 `src/` 文件 → 红。
- 标题用了 `docs`，diff 里没有 `docs/{zh,en}/guide`、`docs/{zh,en}/reference` 下的文件 → 红。
- 其余类型不做路径检查。这是刻意的：兜底的 `team` 必须能装下任何混合改动，一旦它也要求路径，混合 PR 就没有合法类型可用了。
- 表里没有的类型（历史的 `build`、`ci`，以及依赖机器人写的前缀）只警告、不拦 —— 让它们为了一个和这次检查无关的理由变红，是把闸门装错了地方。想让依赖升级合规，把那边的前缀改成 `deps`。
- 脚本读不出表（缺了这四行里的任何一行、或者表改了形状）就直接失败，不会静默放行 —— 表是唯一真源，它坏了要让 CI 说，而不是让闸门悄悄失效。

**二、发布说明按路径生成，不认前缀。** `scripts/release/notes.mjs` 用 `git log --name-only` 拿到每个提交碰过的文件，只留下有 `src/` 文件的那些，前缀只决定它落到 Features / Fixes / Internals 哪一组。2.1.0 的说明之所以要手改，就是因为旧版本信了前缀：`fix(weka): never drop a human comment on a PR` 和修导出图片的 `fix` 排在同一个列表里。

## 4. `chore` 没有了

它原来的用途拆开：脚本 → `tooling`，依赖 → `deps`，CI → `devops`，流程文档 → `team`，版本号 → `release`。**历史里的 `chore` / `build` / `ci` 提交不改**（不重写历史），只是新提交不要再用。

`dev` 是 repo 脚本的另一个候选名，但它读起来像「开发」、又和 `devops` 撞车；`tooling` 说的是「哪些脚本」。`devops` 和 `tooling` 必须分开：一个改仓库怎么构建，一个改仓库发布什么。

## 5. 已知缺口

- `.config/` 下的构建配置（rollup 等）确实能改变产物内容，但表里还没有它的一行，按兜底算 `team`。真要给它一行，得同时决定 CI 要不要按路径检查它 —— 那是下一次的事，不是现在偷偷补一条。
- `docs/{zh,en}/index.md`（文档站首页）和 `community/`、`design/` 不在 `docs` 的路径里。首页是给用户读的，但这条规则把它划在外面；真别扭，就改表里 `docs` 那一行，别在 PR 标题里各写各的。
