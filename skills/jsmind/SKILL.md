---
name: jsmind
description: >-
  Guardrails and a checklist for drawing or editing a jsMind mind map with the
  jsmind CLI. Use when the task gives a .json path and an intent of BUILD
  (new structure on an empty map) or CHANGE (edit an existing map). Not a CLI
  manual — do not use it to look up flags that --help already covers.
---

# jsmind — 画图禁令与检查清单

你已经会用 CLI。这份文档不教「怎么想结构」，也不代替 `jsmind --help`。它只规定三件事：什么不许做、哪几步不许跳、看图时具体看什么。

结构由你在调用前定好。这里不帮你拆主题。

## 输入（缺一就先补上，再动手）

- **文件路径**：一个 `.json`。
- **意图**：`BUILD`（空白图上建结构）或 `CHANGE`（改已有的图）。

文件还不存在，并且意图是 `BUILD`：用 `create` 建出那个路径。不要自己写出 JSON。文件已经存在：不要 `create --force`，那是覆盖，不是编辑。

## 禁令

- **不许直接写 JSON 文件。** 不许用编辑器、重定向、脚本或「读出来改完再写回」去改这个文件。那会绕过 `write → validate → rollback`。
- **不许绕过 `jsmind`。** 增删节点、改字、换边、折叠、改样式，全部走 `jsmind` 子命令。
- **不许在 `validate` 未通过时继续。** 退出码不是 0：停。不要 `export`，不要开始下一轮改动。先改到 `validate` 通过。

## 硬性检查点（按顺序，不许跳）

### 1. 改动前 `context`

拿到 id，并确认文件里现在是什么。你记得的树和文件里的树经常不是同一棵。

`BUILD`：`create` 之后立刻 `context`，用它给出的根 id，不要猜 id。`CHANGE`：先 `context` 再改。标签对不上就加 `--focus`；层级比默认更深就加 `--depth`。

行首是 id，同一行的文字是这个 id 的标签。行尾状态块里有 `side`，折叠时还有 `folded`。这只用于定位，不能代替看图。

`--focus` 会连同祖先一起打印。要用**标签对得上的那一行**的 id，不要用输出里的第一行（那通常是祖先或根）。标签被截成省略号、而你正要改这段文字时，给 `context` 加上 `--full-text` 再读一次。这仍然是检查点 1。

**不能跳过：** 没有这次 `context` 的 id，后面的命令会改错节点，或改一个已经不存在的节点。

### 2. 改动后 `validate`

一轮改动结束就跑 `validate`。一轮可以含多条 `mind` / `node` 命令；结束的标志是你准备看图，或准备做下一类改动。

**不能跳过：** 文件坏了，你读命令回显看不出来。不过就停，见禁令。

`validate` 通过只说明文件合法，不说明父子关系是你要的那一对。通过后立刻再跑一次 `context`：子节点必须缩进在对应父节点下面。缩进错了就回到步骤 1，不要进入 `export`。

### 3. 改完结构后 `export` 看图

这一轮动过结构（增删节点、换父、换边、折叠）之后，`validate` 已通过，再 `export` 出 png，并打开看。

**不能跳过：** `validate` 通过只说明数据合法，不说明看起来对。

只改了样式、没有动结构：也要 `export` 一次，确认颜色或字号真的出现在图上。

### 4. 看图有问题 → 回到步骤 1

任何一项检查没过：回到 `context` 重新定位，再改，再 `validate`，再 `export`。不要凭上一轮的 id 记忆继续改。

## 怎么看图

打开 png，下面四项都要给出「过 / 不过」。不许用「看起来还行」「整体没问题」交差。

1. **文字被挤压** — 不过：字与字重叠，或字画出节点框外。处理：用 `node set-style` 把该节点 `--font-size` 改小，或把这条长标签拆成多个更短的节点（改字、删掉、再加，都走 CLI）。
2. **层级失衡** — 不过：一侧又多又深，另一侧几乎是空的。处理：`node set-side` 把一部分节点换到轻的一侧（`left` 或 `right`）。
3. **不该折叠却折叠着** — 不过：这次任务要看见的分支是收起的（图上只有父节点，或 `context` 行尾带 `folded`）。处理：`node set-folded --folded false`。
4. **连线交叉异常** — 不过：连线互相穿过、打结，而不是从父节点分开走向子节点。处理：换这些节点的侧，或用 `mind move` 调整父子，直到交叉消失。不要改坐标。

四项都过，这一轮看图才算做完。

## 工具速查

不是完整 help。最常忘的是这些：

```
context <file> [--focus <text>] [--depth <n>]
mind find <file> --node-id <id>
mind add-child <file> --parent-id <id> [--text <label>] [--side left|right]
node set-style <file> --node-id <id> --tone <name>
node set-folded <file> --node-id <id> --folded true|false
validate <file>
export <file> <out.png>
```

看图四项还会用到、上面没有写全的：

```
create <file> --title <title>
node set-side <file> --node-id <id> --side left|right
node set-style <file> --node-id <id> --font-size <n>
node set-text <file> --node-id <id> --text <label>
mind move <file> --node-id <id> --parent-id <id>
```

换边以 `node set-side` 为准。速查里 `add-child` 那一行的 `--side` 不要当成已经换边；换边后用 `context` 行尾的 `side=` 核对。

## 顺序

`BUILD` 与 `CHANGE` 共用：

1. 写明路径和意图。`BUILD` 且文件不存在 → `create`。
2. `context`。
3. 用 `mind` / `node` 做完这一轮改动。
4. `validate`。不是 0 就停。
5. `export`，按「怎么看图」四项各判一次。
6. 有一项不过 → 回到 2。
