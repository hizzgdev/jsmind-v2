---
name: jsmind
description: >-
  Guardrails and a checklist for drawing or editing a jsMind mind map with the
  jsmind CLI. Use when the task is to draw or edit a mind map, including when
  the user only says "draw me a picture of X" and gives no path and does not
  say BUILD or CHANGE. Not a CLI manual — do not use it to look up flags that
  --help already covers. `jsmind --help` prints every subcommand in one place,
  so when you need one, read that subcommand's section of it.
---

# jsmind — 画图禁令与检查清单

不教「怎么想结构」，也不代替 `jsmind --help`。结构由你在调用前定好。这里不帮你拆主题。它只规定三件事：什么不许做、哪几步不许跳、看图时具体看什么。

禁令和检查点是正文。末尾的命令列表不是教程，也不是可跳过的附录。那是你最容易忘的几条。不要因为「我会 CLI」就跳过它。

同一套规则的英文版是 [SKILL.md](SKILL.md)。agent 默认加载那一份。这份是中文副本，规则相同。

## 输入（缺一就先补上，再动手）

- **文件路径**：一个 `.json`，以及对应导出的 `.png`。
- **意图**：`BUILD`（空白图上建结构）或 `CHANGE`（改已有的图）。用户没说 BUILD 或 CHANGE：按情况判断——还没有图，或是让你新画一张 → `BUILD`；要改一张已有的图 → `CHANGE`。

用户指定了路径，就用用户的路径。未指定路径时，向当前系统申请临时文件（JSON 和对应的 PNG 各一个），用系统临时目录生成可用路径，例如通过 `mktemp` 或该平台的临时目录。

文件还不存在，并且意图是 `BUILD`：用 `create` 建出那个路径。`create` 不会替你建父目录，目录不存在时直接 `ENOENT`、退出码 3——先把目录建出来。不要自己写出 JSON。文件已经存在：不要 `create --force`，那是覆盖，不是编辑。

全部做完后，如果这两个文件还在临时目录，再问用户要不要把它们放到别的地方。用户给了新位置就移过去，不给就保持在临时文件。

## 结构（很短）

- 节点文字尽量短，避免长句。
- 根的直接子节点不宜过多，建议不超过 7 个。

## 禁令

- **不许直接写 JSON 文件。** 不许用编辑器、重定向、脚本或「读出来改完再写回」去改这个文件。那会绕过 `write → validate → rollback`。
- **不许绕过 `jsmind`。** 增删节点、改字、换边、折叠、改样式，全部走 `jsmind` 子命令。
- **不许在 `validate` 未通过时继续。** 退出码不是 0：停。不要 `export`，不要开始下一轮改动。先改到 `validate` 通过。
- **先分清退出码是哪一类，再决定改什么。** 非 0 不等于数据坏了，猜错方向会让你去改一个本来没毛病的文件。`1` 是数据非法：报错点名了节点，按它改。`2` 是用法错误——缺参数、未知 flag、取值越界——命令写错了，改命令，别动文件。`3` 是 IO 或运行时失败，比如文件不存在、父目录不存在：修环境，不是修脑图。

## 硬性检查点（按顺序，不许跳）

只有这一条顺序。后文没有缩写版再列一遍。

### 1. 改动前 `context`

拿到 id，并确认文件里现在是什么。你记得的树和文件里的树经常不是同一棵。

`BUILD`：`create` 之后立刻 `context`，用它给出的根 id，不要猜 id。`CHANGE`：先 `context` 再改。标签对不上就加 `--focus`；层级比默认更深就加 `--depth`。

**不能跳过：** 没有这次 `context` 的 id，后面的命令会改错节点，或改一个已经不存在的节点。

先别抄 id。下一节仍是这一检查点。

#### 抄 id 之前，先读懂这次 `context`

这是 CLI 输出怎么读，不是新的一步。跳过它，检查点 1 就不算做完。

从文本树里抠 id、抠 `folded`、抠样式，等于去解析一种给人眼看的格式——下面每一条都是这种解析会踩的坑。要的是数据而不是画面时，用 `context --json`：它给每个节点返回 `id`、`level`、`text`，根和根的直接子节点另有 `side`，折叠的节点有 `folded`，覆盖了主题的节点有 `style`。文本形态只用来看树。

- 行首是 id，同一行的文字是这个 id 的标签。行尾状态块里，`side` 只出现在根和根的直接子节点上；折叠时还有 `folded`。这只用于定位，不能代替看图。
- `--focus` 会连同祖先一起打印。要用**标签对得上的那一行**的 id，不要用输出里的第一行（那通常是祖先或根）。
- 标签被截成省略号，而你正要改这段文字：给 `context` 加上 `--full-text` 再读一次。这仍然是检查点 1。
- `validate` 通过之后（检查点 2）立刻再跑一次 `context`。子节点必须缩进在对应父节点下面。缩进错了，父子就不是你要的那一对。回到检查点 1，不要 `export`。

#### 这一轮的 `mind` / `node`

在检查点 1 之后、检查点 2 之前。一轮可以含多条命令。结束的标志是你准备看图，或准备做下一类改动。然后进入检查点 2。

### 2. 改动后 `validate`

**不能跳过：** 文件坏了，你读命令回显看不出来。退出码不是 0 就停，见禁令。

`validate` 通过只说明文件合法，不说明父子关系是你要的那一对。通过后立刻再跑一次 `context`，按上一节最后一条核对缩进。缩进错了就回到检查点 1，不要 `export`。

失败时每个问题打一块：错误码、文档里的路径、一句说明那里错在哪。`validate` 会把所有问题一次报完，不是只报第一个，所以第一行那个数字就是你要逐个处理掉的块数：

```
$ jsmind validate bad.json
bad.json: 4 problem(s)

  E_FORMAT  format
    Expected format "jsmind_v2", got "jsmind".
  E_META  meta
    Missing "meta" object.
  E_NODES_MISSING  nodes
    Missing "nodes" object.
  E_EDGES_MISSING  edges
    Missing "edges" object.
```

按每一块给的路径去改，改完整份再跑一次 `validate`。以第二次为准：一次修改可能消掉一个问题，把剩下的留着。

### 3. 改完结构后 `export` 看图

这一轮动过结构（增删节点、换父、换边、折叠），并且 `validate` 已通过：再 `export` 出 png，并打开看。

**不能跳过：** `validate` 通过只说明数据合法，不说明看起来对。

只改了样式、没有动结构：也要 `export` 一次，确认颜色或字号真的出现在图上。

### 4. 看图有问题 → 回到检查点 1

下面任何一项没过：回到 `context` 重新定位，再改，再 `validate`，再 `export`。不要凭上一轮的 id 记忆继续改。

## 怎么看图

打开 png，下面四项都要给出「过 / 不过」。不许用「看起来还行」「整体没问题」交差。

1. **文字被挤压** — 不过：字与字重叠，或字画出节点框外。处理：用 `node set-style` 把该节点 `--font-size` 改小，或把这条长标签拆成多个更短的节点（改字、删掉、再加，都走 CLI）。
2. **一侧过重** — 不过：一侧又多又深，另一侧几乎是空的。处理：`node set-side` 把一部分节点换到轻的一侧（`left` 或 `right`）。
3. **不该折叠却折叠着** — 不过：这次任务要看见的分支是收起的（图上只有父节点，或 `context` 行尾带 `folded`）。处理：`node set-folded --folded false`。
4. **连线交叉异常** — 不过：连线互相穿过、打结，而不是从父节点分开走向子节点。处理：只有根的直接子节点有「侧」可换，所以先找到这条交叉支路所挂的**根级子节点**，用 `node set-side` 把它换到另一侧。对更深的节点跑 `set-side` 会退出 0 并回一句确认，但图上不会有任何变化。还不行就用 `mind move` 改父子关系。不要改坐标。

四项都过，这一轮看图才算做完。

## 你最容易忘的命令

不是 `jsmind --help`，不是教程。一份列表，常用的在前。每一行都要读。`export` 后面的几行是看图不过时才用得上的——不要读到 `export` 就停。

```
context <file> [--focus <text>] [--depth <n>] [--full-text]
mind find <file> --node-id <id>
mind add-child <file> --parent-id <id> --text <label>
node set-style <file> --node-id <id> --tone <name>
node set-folded <file> --node-id <id> --folded true|false
validate <file>
export <file> <out.png>
create <file> --title <title>
node set-side <file> --node-id <id> --side left|right
node set-style <file> --node-id <id> --font-size <n>
node set-text <file> --node-id <id> --text <label>
mind remove-node <file> --node-id <id>
mind move <file> --node-id <id> --parent-id <id>
```

`side` 只对根的直接子节点有意义。新的根子节点默认在右侧。若要换边，先添加节点，再用 `node set-side`。不要给 `add-child` 加 `--side`：这个参数会被接受并静默忽略，命令退出 0，节点照样落在右侧。`add-child --side` 正是禁令里说的那种情况——回显什么也看不出来，只有 `context` 行尾的 `side=` 才能说明侧到底有没有变（只出现在根和根的直接子节点上）。

`--backup` 覆写前留一份 `.bak`，`--dry-run` 只把要写入的文档打出来、不落盘。这两个只作用于写脑图文件的命令——`create`、`mind`、`node`——不作用于 `export`，它只写图片。`CHANGE` 场景是破坏性编辑，这两个正好配套：下一条命令先用 `--dry-run` 看结果，整轮动手前先 `--backup`。

## 示例会话

示例中的 id 和文件大小来自某一次真实运行。执行时必须使用当前 `context` 输出的 id，禁止照抄示例 id。

**需求：** 给我画一张 jsMind v2 的架构脑图。  
**Intent：** `BUILD`  
**文件：** `tmp/jsmind-arch.json`  
**图片：** `tmp/jsmind-arch.png`

目标结构：

```
jsMind v2 架构
├── 模型
│   ├── 节点与边
│   └── 校验
├── 视图
│   ├── 布局
│   └── 渲染
└── CLI          ← 重点，tone=primary
    ├── context
    ├── 修改命令
    ├── validate
    └── export
```

### 1. 建文件，不要手写 JSON

```
$ jsmind create tmp/jsmind-arch.json --title "jsMind v2 架构"
created tmp/jsmind-arch.json
```

### 2. Checkpoint 1：先 `context`，再拿 id

```
$ jsmind context tmp/jsmind-arch.json
root   jsMind v2 架构 {side=center}
```

根节点 id 是 `root`。不要猜 id。

### 3. 第一轮修改：搭结构

```
$ jsmind mind add-child tmp/jsmind-arch.json --parent-id root --text "模型"
added jm-mwgox48r under root

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id root --text "视图"
added jm-mwgox49y under root

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id root --text "CLI"
added jm-mwgox4b3 under root

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id jm-mwgox48r --text "节点与边"
added jm-mwgox4dx under jm-mwgox48r

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id jm-mwgox48r --text "校验"
added jm-mwgox4fb under jm-mwgox48r

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id jm-mwgox49y --text "布局"
added jm-mwgox4gk under jm-mwgox49y

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id jm-mwgox49y --text "渲染"
added jm-mwgox4hr under jm-mwgox49y

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id jm-mwgox4b3 --text "context"
added jm-mwgox4ir under jm-mwgox4b3

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id jm-mwgox4b3 --text "修改命令"
added jm-mwgox4jv under jm-mwgox4b3

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id jm-mwgox4b3 --text "validate"
added jm-mwgox4l0 under jm-mwgox4b3

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id jm-mwgox4b3 --text "export"
added jm-mwgox4m2 under jm-mwgox4b3
```

### 4. Checkpoint 2：`validate`，再 `context` 看缩进

```
$ jsmind validate tmp/jsmind-arch.json
tmp/jsmind-arch.json: valid

$ jsmind context tmp/jsmind-arch.json --depth 2
root          jsMind v2 架构 {side=center}
jm-mwgox48r     模型 {side=right}
jm-mwgox4dx       节点与边
jm-mwgox4fb       校验
jm-mwgox49y     视图 {side=right}
jm-mwgox4gk       布局
jm-mwgox4hr       渲染
jm-mwgox4b3     CLI {side=right}
jm-mwgox4ir       context
jm-mwgox4jv       修改命令
jm-mwgox4l0       validate
jm-mwgox4m2       export
```

子节点都缩进在对应父节点下面，结构正确。但所有一级分支都是 `side=right`。

### 5. Checkpoint 3：出图并查看

```
$ jsmind export tmp/jsmind-arch.json tmp/jsmind-arch.png
tmp/jsmind-arch.png: 2400x1600 (155.8 KB)
```

看图，四项逐条判断：

1. 文字挤压：通过
2. 一侧过重：失败。三个一级分支都在右侧，左侧几乎是空的
3. 不该折叠的分支：通过
4. 连线交叉：通过

有一项失败，回到 checkpoint 1，不要继续用凭记忆的旧结论。

### 6. 第二轮：调整左右，并标出重点

```
$ jsmind context tmp/jsmind-arch.json --depth 2
（同上，确认 id）

$ jsmind node set-side tmp/jsmind-arch.json --node-id jm-mwgox48r --side left
set side of jm-mwgox48r to left

$ jsmind node set-side tmp/jsmind-arch.json --node-id jm-mwgox49y --side left
set side of jm-mwgox49y to left

$ jsmind node set-style tmp/jsmind-arch.json --node-id jm-mwgox4b3 --tone primary
set style of jm-mwgox4b3: {"tone":"primary"}
```

CLI 保持右侧，并标成重点。

```
$ jsmind validate tmp/jsmind-arch.json
tmp/jsmind-arch.json: valid

$ jsmind context tmp/jsmind-arch.json --depth 2
root          jsMind v2 架构 {side=center}
jm-mwgox48r     模型 {side=left}
jm-mwgox4dx       节点与边
jm-mwgox4fb       校验
jm-mwgox49y     视图 {side=left}
jm-mwgox4gk       布局
jm-mwgox4hr       渲染
jm-mwgox4b3     CLI {side=right tone=primary}
jm-mwgox4ir       context
jm-mwgox4jv       修改命令
jm-mwgox4l0       validate
jm-mwgox4m2       export
```

### 7. 再次出图

```
$ jsmind export tmp/jsmind-arch.json tmp/jsmind-arch.png
tmp/jsmind-arch.png: 2400x1600 (145.2 KB)
```

四项全部通过：文字不挤压，左右都有内容，没有不该折叠的分支，连线无交叉。最终产物是 `tmp/jsmind-arch.json` 和 `tmp/jsmind-arch.png`。

## 示例会话（CHANGE）

这里的 id 和文件大小同样来自某一次真实运行。执行时必须使用当前 `context` 输出的 id，禁止照抄示例 id。删掉节点后，不得再使用旧 id。

**需求：** 在「模型」下增加「事件」，把「渲染」改成「绘制」，删除「校验」，然后重新导出。  
**Intent：** `CHANGE`  
**文件：** `tmp/jsmind-arch.json`（已完成的 BUILD 示例：模型、视图在左，CLI 在右且 `tone=primary`）  
**图片：** `tmp/jsmind-arch.png`

目标结构：

```
jsMind v2 架构
├── 模型
│   ├── 节点与边
│   └── 事件
├── 视图
│   ├── 布局
│   └── 绘制
└── CLI          ← 重点，tone=primary
    ├── context
    ├── 修改命令
    ├── validate
    └── export
```

### 1. 不要对已有文件使用 `create --force`

Checkpoint 1：先 `context`，再拿 id。

```
$ jsmind context tmp/jsmind-arch.json --depth 2
root          jsMind v2 架构 {side=center}
jm-mwgox48r     模型 {side=left}
jm-mwgox4dx       节点与边
jm-mwgox4fb       校验
jm-mwgox49y     视图 {side=left}
jm-mwgox4gk       布局
jm-mwgox4hr       渲染
jm-mwgox4b3     CLI {side=right tone=primary}
jm-mwgox4ir       context
jm-mwgox4jv       修改命令
jm-mwgox4l0       validate
jm-mwgox4m2       export
```

### 2. 这一轮修改

```
$ jsmind mind add-child tmp/jsmind-arch.json --parent-id jm-mwgox48r --text "事件"
added jm-mwgox63h under jm-mwgox48r

$ jsmind node set-text tmp/jsmind-arch.json --node-id jm-mwgox4hr --text "绘制"
set text of jm-mwgox4hr

$ jsmind mind remove-node tmp/jsmind-arch.json --node-id jm-mwgox4fb
removed jm-mwgox4fb
```

### 3. Checkpoint 2：`validate`，再 `context` 看缩进

```
$ jsmind validate tmp/jsmind-arch.json
tmp/jsmind-arch.json: valid

$ jsmind context tmp/jsmind-arch.json --depth 2
root          jsMind v2 架构 {side=center}
jm-mwgox48r     模型 {side=left}
jm-mwgox4dx       节点与边
jm-mwgox63h       事件
jm-mwgox49y     视图 {side=left}
jm-mwgox4gk       布局
jm-mwgox4hr       绘制
jm-mwgox4b3     CLI {side=right tone=primary}
jm-mwgox4ir       context
jm-mwgox4jv       修改命令
jm-mwgox4l0       validate
jm-mwgox4m2       export
```

子节点都缩进在对应父节点下面。改完后的树是：模型（节点与边、事件）、视图（布局、绘制）、CLI（context、修改命令、validate、export）。已删除节点的旧 id 不再使用。

### 4. Checkpoint 3：出图并查看

```
$ jsmind export tmp/jsmind-arch.json tmp/jsmind-arch.png
tmp/jsmind-arch.png: 2400x1600 (143.8 KB)
```

看图，四项逐条判断：

1. 文字挤压：通过
2. 一侧过重：通过。模型、视图仍在左侧，CLI 在右侧
3. 不该折叠的分支：通过
4. 连线交叉：通过

四项全部通过：文字不挤压，左右都有内容，没有不该折叠的分支，连线无交叉。最终产物是 `tmp/jsmind-arch.json` 和 `tmp/jsmind-arch.png`。
