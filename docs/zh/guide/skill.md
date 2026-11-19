# Skill

jsmind skill 位于本仓库的 `skills/jsmind/`。它是一套禁令和检查清单，用来指导 agent 通过 jsmind CLI 生成或修改思维导图。

它**不是** CLI 手册，也不能代替 `jsmind --help` 或 [CLI](./cli) 页面。当 agent 需要生成或修改思维导图时，请让它按这份 skill 的检查点做；具体的命令和参数，请查阅 CLI 帮助或本站的 CLI 页面。

## 在哪里找到它

`master` 上的副本：

- 目录：[skills/jsmind/](https://github.com/hizzgdev/jsmind-v2/tree/master/skills/jsmind)
- 中文：[skills/jsmind/SKILL.zh.md](https://github.com/hizzgdev/jsmind-v2/blob/master/skills/jsmind/SKILL.zh.md)
- 英文：[skills/jsmind/SKILL.md](https://github.com/hizzgdev/jsmind-v2/blob/master/skills/jsmind/SKILL.md)

在本地克隆中，同样的文件位于 `skills/jsmind/SKILL.zh.md` 和 `skills/jsmind/SKILL.md`。

## 怎么用

把这些文件提供给 agent 即可。例如：

- 如果正在本仓库的克隆里工作，告诉 agent：生成或修改思维导图时按 `skills/jsmind/SKILL.zh.md`（或英文版）里的检查点做。
- 如果在别处工作，把整个 `skills/jsmind/` 目录复制到 agent 会加载 skill 的位置，保留 `jsmind/` 这一层。

Skill 规定了哪些事不能做、哪些步骤不能跳过，以及该如何检查导出的图片。导图的结构仍由使用者（或 agent）自己决定。

## 可直接复制的 prompt

你可以把下面的 prompt 直接交给自己的 agent。

### 安装 skill

```
请从 jsmind-v2 仓库（https://github.com/hizzgdev/jsmind-v2）安装 jsMind skill，并把 jsmind CLI 装到能直接调用的位置。

skill 只是说明文件，本身不带命令。生成或修改导图要走 jsmind CLI，那是另一个 npm 包，需要单独安装。skill 位于仓库的 `skills/jsmind/`，取整个目录，不要只下那两个 md：
- 目录：https://github.com/hizzgdev/jsmind-v2/tree/master/skills/jsmind
- 中文：https://github.com/hizzgdev/jsmind-v2/blob/master/skills/jsmind/SKILL.zh.md
- 英文：https://github.com/hizzgdev/jsmind-v2/blob/master/skills/jsmind/SKILL.md

先装 CLI。2.x 还在预览通道上（npm 上的 tag 是 `v2-preview`），`latest` 仍然是 0.9.1（v1，没有 CLI）：用 `npm i -g jsmind@2`，或者不装全局、每次 `npx jsmind@2`。不要写 `npm i jsmind` 或裸的 `npx jsmind`：那会解析到 0.9.1，`jsmind` 命令不存在，报错看着像 skill 坏了，其实是版本装错了。

环境：Node.js >= 22.12。`export` 需要本机有 Chromium；没有时 jsmind 报 `No Chromium found. Image export needs a browser`。这是缺浏览器，不是缺 skill 文件。

然后放 skill，三步：
1. 先确认当前 harness 从哪个目录加载 skill。
2. 把 `skills/jsmind/` 放成 `<skills>/jsmind/`，保留 `jsmind/` 这一层；不要把 md 直接丢进 `skills/`。
3. 放完回报一次能否被加载；加载不了就停下来说清楚，不要继续往下做。

如果你已经在该仓库的克隆里工作，直接从 `skills/jsmind/` 原地加载，不用复制。

最小验收，三项都过才算装好：
- `jsmind --help` 打印用法（0.9.1 没有这个命令，能出用法就说明装的是 2.x）；
- `jsmind create` 建出的文件能通过 `jsmind validate`；
- `jsmind export` 写出一张能打开的 PNG。

装好之后，agent 生成或修改导图时会先 `context` 拿到节点 id，改完跑 `validate`，
最后 `export` 出图。这些检查只有在走 CLI 时才存在：手写 JSON 也能画出图，
但 id、分支方向、配色出错时没人拦。

规则放在 skill 目录里就够了。不要把 skill 的规则抄进长期记忆（MEMORY.md 之类）：skill 有版本，记忆是死的，两边会打架。
```

### 示例：生成一张导图并导出 PNG

```
请使用 jsMind skill，围绕「太阳系」生成一张思维导图，导出为 PNG。

- 如果本会话已经加载过 jsMind skill，不要重复加载，直接用。
- 输出到当前工作目录，文件名按主题取（solar-system.json / solar-system.png）。
  不要用系统临时目录，也不要先问要不要移动。
- 如果同名文件已存在，换个名字，不要覆盖。
- 规模：太阳作为根节点，八大行星各一个一级分支，每个行星下至少两个二级分支。
- 按 skill 的检查点顺序做：先 `jsmind context` 拿 id，改完 `jsmind validate`，通过后重新 `jsmind context` 核对父子缩进，最后 `jsmind export`。
- 导出之后打开 PNG 看一眼：层级清楚、左右不要一边倒。
- 完成后给出两个文件的绝对路径。
```

## 它覆盖什么

以下是简要概括，不能代替 skill 原文：

- **输入。** 一个 JSON 路径和对应的 PNG 路径，再加上意图：新建用 `BUILD`，修改已有导图用 `CHANGE`。
- **禁令。** 不要手写 JSON 文件；不要绕过 `jsmind` CLI；`validate` 不通过就必须停，不要继续改、也不要导出。
- **检查点（按顺序）。** 改动前先运行 `context` 并读懂其中的 id；一轮修改之后运行 `validate`，再检查一次树结构；结构完成后 `export` 出图并查看。

完整的检查清单和示例见上面的 skill 文件。命令和参数请使用 `jsmind --help`，或查阅 [CLI](./cli) 页面。
