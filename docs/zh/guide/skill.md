# Skill

jsmind skill 位于本仓库的 `skills/jsmind/`。它是一套禁令和检查清单，用来指导 agent 通过 jsmind CLI 生成或修改思维导图。

它**不是** CLI 手册，也不能代替 `jsmind --help` 或 [CLI](./cli) 页面。当 agent 需要生成或修改思维导图时，请让它按这份 skill 的检查点做；具体的命令和参数，请查阅 CLI 帮助或本站的 CLI 页面。

## 在哪里找到它

`master` 上的文件：

- 目录：[skills/jsmind/](https://github.com/hizzgdev/jsmind-v2/tree/master/skills/jsmind)
- Skill：[skills/jsmind/SKILL.md](https://github.com/hizzgdev/jsmind-v2/blob/master/skills/jsmind/SKILL.md)
- 安装说明：[skills/jsmind/INSTALL.md](https://github.com/hizzgdev/jsmind-v2/blob/master/skills/jsmind/INSTALL.md)

在本地克隆中，同样的文件位于 `skills/jsmind/SKILL.md` 和 `skills/jsmind/INSTALL.md`。

## 怎么用

把 skill 交给 agent 即可。例如：

- 如果正在本仓库的克隆里工作，告诉 agent：生成或修改思维导图时按 `skills/jsmind/SKILL.md` 里的检查点做。
- 如果在别处工作，把整个 `skills/jsmind/` 目录复制到 agent 会加载 skill 的位置，保留 `jsmind/` 这一层。

Skill 规定了哪些事不能做、哪些步骤不能跳过，以及该如何检查导出的图片。导图的结构仍由使用者（或 agent）自己决定。

skill 只有英文版一份。它是给 agent 读的、不是给人读的，导图的文字语言由你的 prompt 决定，再存一份中文译文只会和这一份越走越远。

## 可直接复制的 prompt

你可以把下面的 prompt 直接交给自己的 agent。

### 安装 skill

```
请从 https://github.com/hizzgdev/jsmind-v2/blob/master/skills/jsmind/INSTALL.md 安装 jsMind skill：读这份文件并照做。里面同时讲 skill 目录和 jsmind CLI，后者是另一个 npm 包。

装完按文件末尾的 “Done means” 逐条核对，把每一条的结果告诉我。如果 skill 在你的 harness 里加载不了，停下来说清楚，不要绕过去。
```

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

完整的检查清单和示例见上面的 skill 文件。命令和参数请使用 `jsmind --help`，或查阅 [CLI](./cli) 页面。
