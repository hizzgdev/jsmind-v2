# Skill

jsmind skill 位于本仓库的 `skills/jsmind/`。它是一套禁令和检查清单，用来指导 agent 通过 jsmind CLI 生成或修改思维导图。

它**不是** CLI 手册，也不能代替 `jsmind --help` 或 [CLI](./cli) 页面。当 agent 需要生成或修改思维导图时，请让它按这份 skill 的检查点做；具体的命令和参数，请查阅 CLI 帮助或本站的 CLI 页面。

技能目录也随本站发布，不克隆仓库也能读：[skills/jsmind/SKILL.md](https://hizzgdev.github.io/jsmind-v2/skills/jsmind/SKILL.md) 与仓库里的那份是同一个文件，`skills/jsmind/` 的其余内容就在它旁边。

## 安装

以下两种方式任选其一，不是先后步骤。

本页每个仓库链接都给两次：先 GitHub，后同一路径的 Gitee 镜像。GitHub 访问不了时用镜像。镜像跟踪 `master`，但它是周期性同步，不是推送即到，可能落后几个提交——所以下面的版本核对属于安装的一部分，不是可有可无的收尾。

### 自动安装

你可以把下面的 prompt 直接交给自己的 agent。

```
请从 https://raw.githubusercontent.com/hizzgdev/jsmind-v2/master/skills/jsmind/INSTALL.md 安装 jsMind skill：读这份文件并照做。里面同时讲 skill 目录和 jsmind CLI，后者是另一个 npm 包。

GitHub 访问不了时，同一份文件的镜像在 https://gitee.com/hizzgdev/jsmind-v2/raw/master/skills/jsmind/INSTALL.md

取这些文件请用上面的 raw 直链，不要用仓库的 blob 页面：blob 是网页，抓到的是 HTML，不是原文。

装完先核对版本再报告成功：`jsmind --version` 输出 CLI 的版本号；如果装的版本还没有这个参数，它会答 `Unknown option`，这时用 `npm ls jsmind` 拿到同一个号。两种情况都要让这个版本号落在 `SKILL.md` frontmatter 中 `metadata.jsmind.cli` 的区间内；旁边的 `version` 是 skill 自身的版本。对不上说明你手里这份 `SKILL.md` 是旧的——镜像允许落后——重新取一次，不要去放宽区间。

然后按 `INSTALL.md` 末尾的 “Done means” 逐条核对，把每一条的结果告诉我。如果 skill 在你的 harness 里加载不了，停下来说清楚，不要绕过去。
```

### 手动安装

把 skill 交给 agent 即可。例如：

- 如果正在本仓库的克隆里工作，告诉 agent：生成或修改思维导图时按 `skills/jsmind/SKILL.md` 里的检查点做。
- 如果在别处工作，把整个 `skills/jsmind/` 目录复制到 agent 会加载 skill 的位置，保留 `jsmind/` 这一层。

### 两个文件各管什么

`INSTALL.md` 面向安装者，就是上面的安装流程。`SKILL.md` 是 agent 生成或修改导图时读的那份。两者在同一目录，但没有任何 harness 会注入 `INSTALL.md`——所谓“装上 skill”，是 harness 读 `SKILL.md`，到此为止。改 `INSTALL.md`、把它翻成别的语言，都不影响运行期。

## 使用

Skill 规定了哪些事不能做、哪些步骤不能跳过，以及该如何检查导出的图片。导图的结构仍由使用者（或 agent）自己决定。

skill 只有英文版一份。它是给 agent 读的、不是给人读的，导图的文字语言由你的 prompt 决定，再存一份中文译文只会和这一份越走越远。

你可以把下面的 prompt 直接交给自己的 agent。

### 示例：生成一张导图并导出 PNG

```
请使用 jsMind skill，围绕「太阳系」生成一张思维导图，导出为 PNG。

- 如果本会话已经加载过 jsMind skill，不要重复加载，直接用。
- 输出到当前工作目录，文件名按主题取（solar-system.json / solar-system.png）。不要用系统临时目录，也不要先问要不要移动。
- 如果同名文件已存在，换个名字，不要覆盖。
- 内容：太阳作为根节点，八大行星各一个一级分支，每个行星下至少两个二级分支。
- 完成的标准：两个文件都在；PNG 里层级分得清、左右不一边倒；完成后给出两个文件的绝对路径。
```

## 它覆盖什么

以下是简要概括，不能代替 skill 原文：

- **输入。** 一个 JSON 路径和对应的 PNG 路径，再加上意图：新建用 `BUILD`，修改已有导图用 `CHANGE`。
- **禁令。** 不要手写 JSON 文件；不要绕过 `jsmind` CLI；`validate` 不通过就必须停，不要继续改、也不要导出。
- **检查点（按顺序）。** 改动前先运行 `context` 并读懂其中的 id；一轮修改之后运行 `validate`，再检查一次树结构；结构完成后 `export` 出图并查看。

完整的检查清单和示例见下面的 skill 文件。命令和参数请使用 `jsmind --help`，或查阅 [CLI](./cli) 页面。

## 在哪里找到它

`master` 上的文件。每一个都给两次：先 GitHub，再同一路径的 Gitee 镜像。

| | GitHub | Gitee 镜像 |
|---|---|---|
| 目录 | [skills/jsmind/](https://github.com/hizzgdev/jsmind-v2/tree/master/skills/jsmind) | [skills/jsmind/](https://gitee.com/hizzgdev/jsmind-v2/tree/master/skills/jsmind) |
| Skill 文件 | [SKILL.md](https://raw.githubusercontent.com/hizzgdev/jsmind-v2/master/skills/jsmind/SKILL.md) | [SKILL.md](https://gitee.com/hizzgdev/jsmind-v2/raw/master/skills/jsmind/SKILL.md) |
| 安装说明 | [INSTALL.md](https://raw.githubusercontent.com/hizzgdev/jsmind-v2/master/skills/jsmind/INSTALL.md) | [INSTALL.md](https://gitee.com/hizzgdev/jsmind-v2/raw/master/skills/jsmind/INSTALL.md) |

两条目录链接是给浏览器翻看用的。四条文件链接都是 raw，交给 agent 的就是这个形式：`tree` 或 `blob` 页面返回的是 HTML，照它复制，拿到的是一张网页而不是 skill 文件。

本站也在自己的根目录下发布同一份目录，所以 [skills/jsmind/SKILL.md](https://hizzgdev.github.io/jsmind-v2/skills/jsmind/SKILL.md) 不依赖上面任何一个仓库。

在本地克隆中，同样的文件位于 `skills/jsmind/SKILL.md` 和 `skills/jsmind/INSTALL.md`。
