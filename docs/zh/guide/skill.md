# Skill

jsmind skill 位于本仓库的 `skills/jsmind/`。它是一套禁令和检查清单，用来指导 agent 通过 jsmind CLI 画图或改图。

它**不是** CLI 手册，也不能代替 `jsmind --help` 或 [CLI](./cli) 页面。当 agent 需要画图或改图时，请让它遵循这份 skill；具体的命令和参数，请查阅 CLI 帮助或本站的 CLI 页面。

## 在哪里找到它

`master` 上的副本：

- 中文：[skills/jsmind/SKILL.zh.md](https://github.com/hizzgdev/jsmind-v2/blob/master/skills/jsmind/SKILL.zh.md)
- 英文：[skills/jsmind/SKILL.md](https://github.com/hizzgdev/jsmind-v2/blob/master/skills/jsmind/SKILL.md)

在本地克隆中，同样的文件位于 `skills/jsmind/SKILL.zh.md` 和 `skills/jsmind/SKILL.md`。

## 怎么用

把这些文件提供给 agent 即可。例如：

- 如果正在本仓库的克隆里工作，告诉 agent：画图或改图时请遵循 `skills/jsmind/SKILL.zh.md`（或英文版）。
- 如果在别处工作，把上面的 GitHub 链接交给 agent，或把文件复制到它已经会加载 skill 的位置。

Skill 规定了哪些事不能做、哪些步骤不能跳过，以及该如何检查导出的图片。导图的结构仍由使用者（或 agent）自己决定。

## 可直接复制的 prompt

你可以把下面的 prompt 直接交给自己的 agent。

### 安装 skill

```
请从 jsmind-v2 仓库（https://github.com/hizzgdev/jsmind-v2）安装或加载 jsMind skill。

该 skill 位于仓库的 `skills/jsmind/`：
- 中文：https://github.com/hizzgdev/jsmind-v2/blob/master/skills/jsmind/SKILL.zh.md
- 英文：https://github.com/hizzgdev/jsmind-v2/blob/master/skills/jsmind/SKILL.md

如果你已经在该仓库的克隆里工作，请从 `skills/jsmind/` 加载这些文件。否则，请把上述 skill 文件获取或复制到你已经会加载 skill 的位置。

安装完成后，之后画图或改图都必须遵循该 skill：不要手写 JSON，必须使用 jsmind CLI。
```

### 示例：生成一张导图并导出 PNG

```
请使用 jsMind skill 和 jsmind CLI，围绕「[主题]」生成一张思维导图，并导出为 PNG。

要求：
- 如果尚未安装 jsMind，请先安装 2.x 版本（`npm i jsmind@2` 或 `npx jsmind`）。
- 严格遵循 jsMind skill（仓库路径 `skills/jsmind/`，或 GitHub 上的 SKILL.md / SKILL.zh.md）。不要手写 JSON，必须使用 jsmind CLI。
- 创建导图、添加分支，并运行 `jsmind validate`。必须校验通过后再导出。
- 完成后给出 JSON 和 PNG 的文件路径。
```

## 它覆盖什么

以下是简要概括，不能代替 skill 原文：

- **输入。** 一个 JSON 路径和对应的 PNG 路径，再加上意图：新建用 `BUILD`，修改已有导图用 `CHANGE`。
- **禁令。** 不要手写 JSON 文件；不要绕过 `jsmind` CLI；在 `validate` 失败时不要继续修改或导出。
- **检查点（按顺序）。** 改动前先运行 `context` 并读懂其中的 id；一轮修改之后运行 `validate`，再检查一次树结构；结构完成后 `export` 出图并查看。

完整的检查清单和示例见上面的 skill 文件。命令和参数请使用 `jsmind --help`，或查阅 [CLI](./cli) 页面。
