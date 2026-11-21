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

2.1.0 那个窗口是这条规则的度量：35 个提交里只有 6 个改了产物，而 12 个 `feat`/`fix` 里有 7 个一个 `src/` 文件都没改。那 7 个都是真活（webhook 不丢评论、文档站构建、playground 链接），但没有一个能改变 `npm i jsmind` 装到的东西。

（数 `git log --name-only` 会得到 7 个碰过 `src/` 文件的提交，多出来的是 `chore(release): 2.1.0` 本身 —— 发版 PR 把前几个 PR 的改动一起带进了那一笔。按类型过滤时它被单独摘掉，所以进说明的是 6 个。）

## 2. 表

**这张表是唯一的真源。** 别处（`AGENTS.md`、评审 skill、`SOUL.cody.md`）只写「按这张表选」，不复述内容；要改规则就只改这里。

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

## 3. 没有 CI 闸门，这是刻意的

这条规则**不由 CI 强制**，别在上面加一个「拿标题的类型对 diff 检查」的 job。

理由：一个命名约定不值得让 PR 因为和这次改动无关的理由变红；而闸门会诱导作者挑一个「能过检查」的类型，而不是说真话的那个 —— 混合改动、跨层改动尤其如此，而它们正是最需要一个诚实类型的地方。

执行方式是**评审**：`team/automations/skills/jsmind-review/SKILL.md` 要求评审者拿标题的类型对一遍 diff，对不上就打回；`SOUL.cody.md` 让写代码的 agent 先读这张表再定类型。两处都只指向本文，不复述规则。

## 4. 唯一自动化的地方：发布说明按路径生成

`scripts/release/notes.mjs` 用 `git log --name-only` 拿到每个提交碰过的文件，只留下有 `src/` 文件的那些；前缀只决定它落到 Features / Fixes / Internals 哪一组。这一处读的是 diff，不是标题 —— 标题的类型写错了，说明还是对的，所以它和「没有 CI 闸门」并不冲突。

2.1.0 的说明之所以要手改，就是因为旧版本信了前缀：`fix(weka): never drop a human comment on a PR` 和修导出图片的 `fix` 排在同一个列表里。

## 5. `chore` 没有了

它原来的用途拆开：脚本 → `tooling`，依赖 → `deps`，CI → `devops`，流程文档 → `team`，版本号 → `release`。**历史里的 `chore` / `build` / `ci` 提交不改**（不重写历史），只是新提交不要再用。

`dev` 是 repo 脚本的另一个候选名，但它读起来像「开发」、又和 `devops` 撞车；`tooling` 说的是「哪些脚本」。`devops` 和 `tooling` 必须分开：一个改仓库怎么构建，一个改仓库发布什么。

## 6. 已知缺口

- `.config/` 下的构建配置（rollup 等）确实能改变产物内容，但表里还没有它的一行，按兜底算 `team`。真要给它一行，就只改这张表 —— 没有别的地方要跟着改。
- `docs/{zh,en}/index.md`（文档站首页）和 `community/`、`design/` 不在 `docs` 的路径里。首页是给用户读的，但这条规则把它划在外面；真别扭，就改表里 `docs` 那一行，别在 PR 标题里各写各的。
