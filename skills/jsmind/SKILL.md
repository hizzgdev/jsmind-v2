---
name: jsmind
description: >-
  Guardrails and a mandatory checklist for drawing or editing a jsMind map
  with the jsmind CLI. Use when the task gives a .json path and an intent of
  BUILD (structure on a blank map) or CHANGE (edit an existing map). Does not
  teach the CLI and does not decide the map's structure.
---

# jsmind

这份 skill 只负责把已经定好的结构画出来。它不是 CLI 手册，也不负责想结构。

调用前必须已经明确两样东西，缺一不可：

- **文件路径**：一个 `.json`。文件还不存在、且意图是 BUILD 时，只用 `jsmind create <file> --title <根节点文字>` 创建。不要自己落盘一份 JSON。
- **意图**：`BUILD`（空白图上建结构）或 `CHANGE`（改已有图）。

结构在调用前定好，再传进来。画的过程中不要改结构方案。

flag 没写在下面的，查 `jsmind --help` 或 `jsmind <subcommand> --help`。不要猜。

## 禁令

- **不许直接写 JSON 文件。** 手改、重定向覆盖、脚本生成文件，都会绕过 `write → validate → rollback`。
- **不许绕过 `jsmind` 命令。** 增删节点、改文字、改边、改样式、折叠、换边，全部走 CLI。
- **不许在 `validate` 不过的情况下继续。** 不过就停。用 CLI 改到通过，再做任何下一步。此时不要 `export`，不要再加节点，不要改样式。

## 硬性检查点

按顺序做。跳过任何一步，后面的判断都不可信。

1. **改动前先 `context`。** 拿到 id，并确认当前状态。每一行最左边是 id，原样复制，不要猜，也不要打开 JSON 去找。行末 `{...}` 里有 `side`、是否 `folded`、以及相对主题的样式覆盖。要改的节点这次没出现，就加大 `--depth` 或加上 `--focus` 再跑一次；标签以省略号结尾、而你正要改这段文字时，加上 `--full-text` 再跑一次。这仍然是第 1 步。下一步还要引用刚建出来的节点时，先回到这一步再改。BUILD 且文件刚 `create` 完，同样先 `context` 再往下加。
   - 为什么不能跳过：不看当前状态就会改错节点，或者用一个并不存在的 id。

2. **改动后立刻 `validate`。**
   - 为什么不能跳过：文件写坏了，你从「上一条命令跑完了」看不出来。不过就回到第 1 步，不要往下走。

3. **每次改完结构后 `export <file> <out.png>`，再按下一节看图。** 只改了样式、折叠或 side，同样要出图再看。
   - 为什么不能跳过：`validate` 通过只说明文件合法，不说明字没挤、左右没歪、该展开的展开了、线没缠在一起。

4. **看图有任何一项不通过 → 回到第 1 步。** 用新的 `context` 重新定位，再改，再 `validate`，再 `export`。不要拿上一轮记住的 id 继续改。
   - 为什么不能跳过：上一轮的 id 和布局，对不上你现在要修的那个点。

## 怎么看图

对着导出的 png 逐项判断。每一项只有通过或不通过，没有「大概还行」。

| 看什么 | 不通过 | 然后做什么 |
|---|---|---|
| 文字是否被挤压 | 字与字重叠；或文字溢出节点框（被裁切、画出框外、变成省略号）；或一个节点塞进一整段话，折成很多行，盖过旁边的节点 | `node set-style --font-size` 改小，或把该节点拆成更短的子节点 |
| 层级是否失衡 | 根的一侧，分支个数或纵向长度明显大于另一侧 | `node set-side`，把过重一侧的节点改到较轻的一侧 |
| 折叠是否该展开 | 任务要求展示的子节点没有出现在图上，且 `context` 里该节点或其祖先带 `folded` | `node set-folded --folded false` |
| 连线是否交叉异常 | 连线穿过无关节点，或两条连线拧成看不出父子的结 | `node set-side` 或 `mind move` 调整该节点的位置。不要改坐标 |

四项都通过才算看完。有任何一项不通过，回到检查点 1。

## 工具速查

最容易忘的命令，不是 help：

```
context <file> [--focus <text>] [--depth <n>]
mind find <file> --node-id <id>
mind add-child <file> --parent-id <id> [--text <label>] [--side left|right]
node set-style <file> --node-id <id> --tone <name>
node set-folded <file> --node-id <id> --folded true|false
validate <file>
export <file> <out.png>
```

建图和看图后的修正还会用到这些，同样一行，flag 以 help 为准：`create`、`node set-side`、`node set-style --font-size`、`node set-text`、`mind move`。
