# Skill

jsmind skill 位于本仓库的 `skills/jsmind/`。它是一套禁令和检查清单，用来指导 agent 通过 jsmind CLI 画图或改图。

它**不是** CLI 手册，也不能代替 `jsmind --help` 或 [CLI 参考](/zh/reference/cli)。当 agent 需要画图或改图时，请让它遵循这份 skill；具体的命令和参数，请查阅 CLI 帮助或本站的 CLI 页面。

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

## 它覆盖什么

以下是简要概括，不能代替 skill 原文：

- **输入。** 一个 JSON 路径和对应的 PNG 路径，再加上意图：新建用 `BUILD`，修改已有导图用 `CHANGE`。
- **禁令。** 不要手写 JSON 文件；不要绕过 `jsmind` CLI；在 `validate` 失败时不要继续修改或导出。
- **检查点（按顺序）。** 改动前先运行 `context` 并读懂其中的 id；一轮修改之后运行 `validate`，再检查一次树结构；结构完成后 `export` 出图并查看。

完整的检查清单和示例见上面的 skill 文件。命令和参数请使用 `jsmind --help`，或查阅 [CLI](/zh/reference/cli) 页面。
