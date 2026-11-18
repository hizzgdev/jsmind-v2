# jsMind v2 的 npm 发布方案

> 这份文档回答「v2 怎么发到 npm，以及为什么这样发」。
> `milestones.md` 回答先做什么，`roadmap.md` 回答每一层怎么做，本文只回答发布。
>
> 结论在第 1 节，可以直接照着执行。取舍在第 2 节，否决过的方案在附录。

## 0. 背景与目标

v2 目前只完成了 agent 这一侧：CLI、模型、渲染、导出、skill 都跑通了，但它还不是 v1 的替代品——API 变了、产物结构变了、engines 变了。

所以这次发布的目标不是「让老用户升级」，而是**让 agent 这边的用户先用起来，收一批种子用户**。

这个目标决定了后面所有取舍的总方向：**v1 的既有用户是必须保护的，v2 的增长可以慢。**

## 1. 结论

### 1.1 包名

**沿用 `jsmind`，不新建 `jsmind-v2`。**

| 项 | 取值 |
|---|---|
| 包名 | `jsmind`（不变） |
| latest | 保持 `0.9.x`，至少一年不翻 |
| v2 的 tag | `v2-preview` |
| v2 版本号 | 普通版本号 `2.0.x`、`2.1.x`，不加预发布后缀 |
| 文档里的安装命令 | `npm i jsmind@2` |

### 1.2 发布纪律

**v1 和 v2 的发布命令不一样，这是整套方案里唯一一个会出事的地方。**

```bash
# v1 维护版本：裸发。npm 会把 latest 指到这个版本，这正是想要的
npm publish

# v2 任何版本：只通过 staged publishing，永远不要直接执行 npm publish
npm stage publish --tag v2-preview
# 或
npm run publish:preview
```

Trusted Publisher 要在 npmjs.com 上登记工作流文件名 `npm-publish.yml`，并且只授权 stage，不要授权直接 `npm publish`。CI 作业里也不能出现裸的或直接的 `npm publish`。

分步发布后版本不会立刻公开。维护者再用 2FA 批准：

```bash
npm stage approve
```

批准后必须确认一次：

```bash
npm dist-tag ls jsmind
# 期望：latest: 0.9.x，v2-preview: 2.0.x
```

staging 之后、批准之前，也可以先确认 `latest` 仍是 `0.9.x`。

`npm publish` 在没带 `--tag` 时会把 latest 指向新版本（npm 源码 `lib/commands/publish.js`）。所以 v2 **不能直接执行 `npm publish`**——一旦走直接发布且忘了 `--tag`，所有执行 `npm i jsmind` 的人会立刻装到 v2。这是本方案唯一的致命故障点，要把它固化进脚本和工作流，不靠人记。

### 1.3 v2 内部的版本规则

| 变更类型 | 版本号 | 例子 |
|---|---|---|
| 只修 bug，不动 API | patch | `2.0.1` → `2.0.2` |
| 有破坏性变更 | minor | `2.0.9` → `2.1.0` |
| 一年后翻成默认 | 不额外发版，只改 tag | `npm dist-tag add jsmind@2.x.y latest` |

破坏性变更走 minor、不走 patch，是为了让 `^2.0.0` 在预览期内也是安全的。翻成默认之后恢复标准 semver 承诺。

### 1.4 用户怎么装

| 诉求 | 写法 |
|---|---|
| 想一直跟预览线 | `npm i jsmind@2` |
| 想跟一条会自动更新的线 | package.json 里写 `"jsmind": "v2-preview"`（依赖值可以直接写 tag） |
| 想要稳定、只收 bug 修复 | `"jsmind": "~2.0.1"` |
| 想钉死某一版 | `"jsmind": "2.0.1"` |
| 想继续用 v1 | `npm i jsmind`（不变） |

**不要建议用户写 `^2.0.1`**：按 1.3 的规则，它会自动接到 `2.1.0` 的破坏性变更。

注意一个行为：`npm i jsmind@2` 写进 package.json 的是解析出来的版本（`^2.0.1`），不是 tag。想长期跟通道，必须手写 `"jsmind": "v2-preview"`。

### 1.5 文档怎么写

安装命令用 `@2`，tag 只作附注：

```markdown
## Install (2.x preview line)

npm i jsmind@2

This is the 2.x line (npm tag `v2-preview`), a rewrite. It is not a drop-in
replacement for v1 yet. `npm i jsmind` still installs v1 (0.9.x).
```

### 1.6 两份 README 要各自完整

npm 每个包只有**一个** README 槽，不按版本保存（见 3.2）。任何一次发布都会刷新包页面上显示的那份。所以 v1 和 v2 的 README 都必须独立成立、互相指向：

- v1 README 开头：这是 0.9.x，`npm i jsmind` 装的是它；v2 预览在 `npm i jsmind@2`，还不是替代品。
- v2 README 开头：这是 2.x 预览线，`npm i jsmind` 仍然装 v1；安装用 `npm i jsmind@2`。

这样无论页面显示哪一份，读的人都拿到了完整信息。

### 1.7 坏版本怎么处理

已发布的版本不能改。72 小时之内、且没有别的包依赖它，可以 `npm unpublish`；超过 72 小时还要满足「周下载量小于 300」和「单一维护者」——jsmind 目前周下载 2862，这两个条件永远不满足。

所以发布之后的唯一工具是：

```bash
npm deprecate jsmind@2.0.3 "Broken release, use 2.0.4"
```

它不删版本，只让装到的人看到警告。出问题就 deprecate，然后立刻发修复版。

### 1.8 发布前检查清单

1. `npm pack --dry-run`，确认 tarball 只含 `dist/` 下 9 个文件加 README / LICENSE / package.json
2. README 里不能有「has not been published to npm yet」这类占位说明
3. 包名、版本号、`bin`、`engines` 检查一遍
4. `package.json` 的 `version` 是 `2.x` 且不是预发布号；GitHub Release 不是 prerelease；Release 的 tag（允许 `v2.0.0` 或 `2.0.0`）与该 version 一致。任一条件不满足则不要 stage
5. 发布只用 `npm stage publish --tag v2-preview`（或 `npm run publish:preview`），不要直接执行 `npm publish`
6. Trusted Publisher 已在 npmjs.com 登记工作流文件名 `npm-publish.yml`，且只授权 stage、不要授权直接 `npm publish`
7. staging 之后确认 `latest` 仍是 `0.9.x`；用 `npm stage approve` 批准后，再执行 `npm dist-tag ls jsmind`，确认 `v2-preview` 指向本次版本、latest 没被抢
8. 去看一眼 npm 包页面显示的是哪份 README（见 3.2 的不确定性）

## 2. 主要取舍

### 2.1 沿用 `jsmind` 而不是新包名

**选择的理由**：`jsmind` 是这个项目唯一的累积性资产。

| 事实 | 数值 |
|---|---|
| npm 上的版本数 | 48 个，2017-01 首发 |
| 最新版 | 0.9.1，2025-12-15 发布 |
| 周下载 / 月下载 | 2862 / 12267 |

改名意味着这部分流量永久分成两条：搜 `jsmind` 的人继续落在 v1，而 v1 不会再长东西。

**担心一「老用户误升级」其实不成立**：v1 是 0.x，`^0.9.1` 的语义是 `>=0.9.1 <0.10.0`，永远匹配不到 `2.0.0`。锁了版本范围的项目，发 v2 它们连提示都不会有。

真正的风险在三处，都是「全新安装」而不是「升级」：

1. 不带版本号的 CDN 链接（`unpkg.com/jsmind/...` 跟着 latest 走）
2. 照旧教程 `npm i jsmind` 的新项目，装到 v2 后来提 issue
3. `engines >= 22.12.0`，装在 Node 18/20 上先装成功、再运行时报错

而这三处里，第 1 处被「不翻 latest」这一个决定直接消掉了（见 2.2）。第 2 处靠 README 状态行缓解。第 3 处待定（见 4）。

**担心二「突显不了特点」不应该由包名承担**：npm 上决定别人点不点进来的是 description、keywords 和 README 第一屏，不是包名。v2 的 package.json 里 description 现在是「TypeScript library for mindmap」，把最没意思的一点放在最前面，发布时应该改成 agent 优先的那句，keywords 补 `mind-map`、`cli`、`ai-agents`、`typescript`。

### 2.2 latest 一年不翻

**选择**：v2 全年挂在 `v2-preview` 上，latest 始终是 0.9.x。

| | 收益 | 代价 |
|---|---|---|
| 不翻 latest | v1 用户整年零影响；不带版本的 CDN 链接全年不坏；随时可以回滚（什么都不用做） | 放弃「默认安装即最新」的引导力，种子用户必须显式安装 |
| 翻 latest | 新用户默认拿到 v2 | 所有 `npm i jsmind` 立刻变 v2，CDN 链接断裂，且不可撤销 |

选前者，因为目标是种子用户，不是默认流量。

### 2.3 tag 叫 `v2-preview`

**tags 区是唯一一个没有解释机会的位置。** 文档里可以加一行出处，npm 页面上的 tags 列表只有 `v2-preview: 2.0.3` 这一行，旁边什么都没有。所以这个名字的第一要求是零解释，第二才是简洁。

| 候选 | 结论 |
|---|---|
| `v2-preview` | 采用。陌生人一眼懂；而且开了 `v2-*` 命名空间，以后要加 `v2-stable`、`v2-beta` 不用重新想名字 |
| `preview` | 零解释，但没给未来留位置 |
| `next` | 语义像「下一版 v1」，容易误解；而且翻 latest 之后会被指到 v3，旧文档里的命令会悄悄改变含义 |
| `rewrite` | 零解释，但它描述的是关系不是阶段 |
| 中文拼音 / 字母编号 | 需要解释，见附录 |

代价：比 `preview` 长三个字符，手抄出错概率略高（`v2-preview` 打成 `v2preview`）。缓解方式是文档主命令用 `@2`，tag 只作附注。

### 2.4 版本号用普通 `2.0.x`，不用 `2.0.0-beta.x`

| 方案 | 收益 | 代价 |
|---|---|---|
| 普通版本号 | `^2` / `@2` 能匹配到；锁文件、范围、工具链全部按常规工作 | 版本号看起来像稳定版，需要在 README 里说明这是预览线 |
| `2.0.0-beta.x` | 版本号自带「这是预览」的信号 | 范围匹配不到预发布版本，用户必须永远写 `@tag`；一年后还要再发一个 `2.0.0`，版本列表里会出现两个 `2.0.0` |

选前者，因为种子用户需要的是「能用起来」，不是「知道自己用了个 beta」。

### 2.5 文档用 `@2`，tag 只作附注

| 字符串 | 会不会随时间变味 |
|---|---|
| `npm i jsmind@2` | 不会。永远指 2.x |
| `npm i jsmind@v2-preview` | 会。翻 latest 那天这个 tag 要删掉或改指，旧文章里的命令就开始指向过时版本 |

所以用户抄的是 `@2`，tag 出现在附注、发布日志和 npm 页面的标签区。三个位置各写各的。

## 3. 已核实的事实

下面每条都当场验证过，附验证方式，方便以后复现。

### 3.1 版本解析

npm 内置 `npm-pick-manifest`，在 `latest = 0.9.1`、已存在 `2.0.0` 的假设下：

| spec | 解析结果 |
|---|---|
| `*` | `0.9.1` |
| 空 | `0.9.1` |
| `latest` | `0.9.1` |
| `2` | `2.0.0` |
| `^2.0.0` | `2.0.0` |

也就是说，连 `"jsmind": "*"` 这种放弃版本控制的写法都落在 v1，只有显式写 2 才会碰到 v2。

### 3.2 README 是包级单槽，repository 是每版独立的

- registry 返回的 packument 里，`jsmind` 顶层有一个 `readme` 字段，而每个版本对象里**没有** `readme`（长度为 0）。express 的两个版本同样如此。
- `npm view express@4.0.0 readme` 和 `npm view express@5.1.0 readme` 返回同一份内容（都是 10371 字节），进一步确认 readme 不按版本保存。
- 反过来，`repository` 是每版独立的：`npm view express@4.0.0 repository.url` 是 `visionmedia/express`，`npm view express@5.1.0` 是 `expressjs/express`。

结论：v2 的版本页能显示 v2 的仓库地址，但**不能**显示 v2 的 README。想看某个版本的 README，只能读 tarball 里的文件：

```
https://unpkg.com/jsmind@2.0.1/README.md
https://cdn.jsdelivr.net/npm/jsmind@2.0.1/README.md
```

另外，npm 页面显示哪一份 README 的规则没有定论：官方文档只说「发布新版本才会更新页面上的 README」，社区里两种实测结果都有。所以按 1.6 处理：两份 README 各自完整，谁被显示都正确。

### 3.3 tag 名的合法性

npm 只做一条校验：tag 不能是合法的 semver 范围（`lib/commands/publish.js:81`、`lib/commands/dist-tag.js:102`，报错文案 `Tag name must not be a valid SemVer range`）。

| 名字 | 结果 | 原因 |
|---|---|---|
| `v2` | 非法 | 解析成 `>=2.0.0 <3.0.0` |
| `2` / `1.x` / `v1` | 非法 | 同上 |
| `2027` | 非法 | 解析成 `>=2027.0.0 <2028.0.0-0` |
| `v2-preview` | 合法 | 只有主版本加连字符，构不成版本号 |
| `preview` / `rewrite` / `legacy` / `xin` | 合法 | 不是范围 |

### 3.4 装 tag 之后，package.json 里写的是版本不是 tag

实测（用 react 的 `next` tag）：`npm i react@next` 之后 package.json 里是 `"react": "^19.3.0-canary-..."`，即解析出来的具体版本。想长期跟通道，必须在 package.json 里手写 tag 值（实测 `"react": "next"` 会按 tag 解析）。

### 3.5 unpublish 的门槛

- 发布 72 小时内，且没有别的包依赖：可以删。
- 超过 72 小时：还要满足「周下载量小于 300」且「单一维护者」。
- jsmind 周下载 2862，第二条永远不满足，所以 72 小时之后只能 deprecate。

## 4. 未决事项

| 事项 | 说明 |
|---|---|
| `engines >= 22.12.0` | `src/` 里没有用到 Node 22 专属 API（没有 `import.meta.dirname`、`node:sqlite` 等），`tsconfig` 的 target 是 ESNext、lib 是 ES2020。这个要求大概率来自开发工具链（`node --test` 的 glob、tsx），不是库的运行时。发布前应该实测 Node 18/20，能跑就放宽，或者只对 CLI 收紧。这是本次发布面对用户的最大变量。 |
| 是否发一个 `0.9.2` 指引版 | 只改 v1 的 README，加三行 v2 预览指引。收益是 npm 页面（无论显示哪份 README）都能指向 v2；成本是多一个 patch 版本号。 |
| GitHub 仓库名 | npm 叫 `jsmind`，仓库叫 `jsmind-v2`，长期会有割裂感。仓库改名 GitHub 会做重定向，老链接不断，不着急但越早越便宜。 |

## 附录：否决过的方案

留在这里，是为了避免半年后重新论证一遍。

| 方案 | 否决理由 |
|---|---|
| 发到新包名 `jsmind-v2` | 零事故，但永久分叉流量；而事故可以用发布机制解决，名字改不回来。`jsmind-v2` 这个名字目前在 npm 上空着，随时可用，但不采用。 |
| `jsmind2` | 已被无关包占用（2018 年的 0.1.0）。 |
| `next` / `preview` / `beta` 作 tag | 阶段名，翻 latest 之后语义作废；`next` 还会在将来被指到 v3，让旧文档里的命令变味。 |
| 中文拼音代号作 tag：`xin`、`zhuan`、`tu`、`youlai`、`huian` | tags 区没有解释机会，陌生人读不出含义。而且单音节拼音必然撞同音词，其中 `huian≈灰暗`、`yanshi≈掩饰`、`muzha≈木渣`、`lijin≈礼金`、`yeyou≈也有` 都属于负面或无关的强碰撞。中文代号可以继续用在发布命名和 release notes 里，不进 tags。 |
| 编号类：`g2`、`gs`、`gt`、`gl` | 没有语义也没有记忆点；并且与既有工具重名（Ghostscript、Graphite CLI、GitLab 系命令行、AntV G2）。 |
| 年度命名：`2027` | 技术上非法（被解析成范围），语义上是把发布日期写进名字，一旦延期就变成谎言。 |
| 发 `2.0.0-beta.x` 预发布版本 | 范围匹配不到，用户必须永远写显式 tag；一年后还要再发一个 `2.0.0`。 |
| 先裸发再 `npm dist-tag add` 改回来 | 中间有暴露窗口，且「改回来」是手工步骤；`--tag` 是原子操作，latest 一秒都不会动。 |
| 只用 `@2`、不要 tag | 不可行。`npm publish` 默认抢 latest，必须有 `--tag` 才能保住 v1。 |
| 靠轮询或看门狗监测发布状态 | 违反「不轮询」的既定约束，成本高于收益。发布后跑一次 `npm dist-tag ls` 断言就够。 |
