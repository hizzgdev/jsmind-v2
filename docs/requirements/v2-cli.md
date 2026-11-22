# jsMind v2 CLI 设计

> **本文件定义 CLI 的命令结构与行为约定。** `src/cli/` 按本文件实现：命令已随 2.x 发布，行为与本文件不一致时，要么改代码，要么改这里，不留第二种说法。
>
> 相关文档：
> - `team/development/v2-requirements.md` 4.5 节 —— skill 与 CLI 的分工原则
> - `v2-data-format.md` 第 8 节 —— 为什么只用 id 定位
> - `v2-data-format.md` 第 9、10 节 —— 校验规则与 autofix 语义
>
> **状态**：已实现并随 2.x 发布。对外仍称预览版（见文档站的 CLI 指南），语义按 minor 演进，破坏性改动进 minor 而不是 patch。

> **版本标注约定**：未标注版本的 API 和子命令从 2.0 起可用；只有 2.1 及之后新增的功能才标 `Since:`。
>
> 标注写成 `Since: 2.<minor>.0`，`<minor>` 是引入该功能的 minor 版本号（例：2.1 新增的子命令标 `Since: 2.1.0`）。minor 版本新增 API / 子命令时补标注，patch 版本不标；已有功能始终不标 —— 不标即表示 2.0 起就有。
>
> `Since:` 标注是文档里唯一该写三段版本号的地方：它记录功能出现在哪个版本，是历史事实，不会过期。`docs/` 其余位置不写补丁号（写 `2.x`），因为写死的版本号会和下一次发版对不上。`scripts/check-version-refs.mjs`（CI 的 `version-check` 步）按这条边界实现：放行 `Since:` 标注，拦下其他三段版本号。

---

## 1. 定位

**CLI 是确定性层。凡是"结果必须一致"的操作都在这里，不进 skill。**

这条原则来自 `team/development/v2-requirements.md` 4.5：

| 事情 | 放哪 | 理由 |
|---|---|---|
| 生成 / 修改树、把对话转成结构 | **skill** | 需要模型判断，每次可以不同 |
| 格式转换（v1 ↔ v2） | **CLI** | 必须确定。LLM 现场转换可能漏、可能反，跑两次结果不一致 |
| 渲染出图 | **CLI** | 确定性 |
| 校验 | **CLI** | 确定性 |

**技能本身随文档站发布。** `skills/jsmind/` 整目录发布在站点根下，`https://hizzgdev.github.io/jsmind-v2/skills/jsmind/SKILL.md` 打开就是仓库里那份原文，与仓库内文件逐字节一致，因此取技能不必 clone 仓库。技能不进 npm 包：这个目录后面会带脚本和素材，不该混进 npm 的产物。

**CLI 的主要使用者是 AI agent，不是人。** 这个前提决定了下面所有的设计取舍：输出要稳定可解析、错误要能用代码区分、失败要能自动恢复。

---

## 2. 命令结构

```
jsmind <命令组> <子命令> [参数]
```

**每个组一层子命令，没有嵌套层。** 一个子命令就是一个词，命令行永远是 `<命令组> <子命令> <文件> [选项]`。

```
jsmind
├── context          ← 跨边界：查找
├── validate         ← 跨边界：校验
├── render           ← 跨边界：渲染
├── convert          ← 跨边界：格式转换（S13，随 adapter）
├── mind             ← 改树结构（谁的父是谁、有几个孩子）、边，以及 mind 自己的样式
│   ├── add-child
│   ├── move
│   ├── remove-node
│   ├── add-edge
│   ├── remove-edge
│   ├── edges
│   ├── find
│   └── set-style
└── node             ← 改单个节点自身的属性（文本、折叠、方向、样式）
    ├── set-text
    ├── set-folded
    ├── set-side
    └── set-style
```

### 2.1 为什么分三类

| 类型 | 特征 | 命令 |
|---|---|---|
| **跨边界** | 不是单纯的数据操作，涉及文件 IO / 渲染 / 校验，或跨越数据结构 | `context` `validate` `render` `convert` |
| **`JmMind`** | 改树结构（父子关系、边），或改 mind 自身的属性字段（`mind.style`） | `jsmind mind *` |
| **`JmNode`** | 只改某一个节点自身的属性字段，不动树结构 | `jsmind node *` |

**组名说的是「改哪个对象」，不是「方法还是字段」。** 两个组里都同时有方法和字段写入：`mind style` 曾想按「mind 组 = 方法、node 组 = 字段」来划，但它自己就是给 mind 的字段赋值（`mind.style`），而同组还有 `mind move` 这类方法调用；`node set-style` 也一样是字段赋值。所以正确的分界在字段本身上 —— 见 2.2，结构字段锁死、只能走方法，属性字段开放赋值，`mind.style` 和 `node.style` 都属于后者。

### 2.2 结构字段与属性字段的分界来自代码

**这条分界不是凭感觉划的，现有代码里已经存在：**

```typescript
// src/model/mind.ts:477
this.readonlyFields = new Set(['id', 'parent', 'children', 'data']);
```

| 字段 | 可写 | 怎么改 |
|---|---|---|
| `id` / `parent` / `children` | ❌ 只读 | 只能走 `JmMind` 的方法（`addChildNode` / `moveNode` / `removeNode`） |
| `content` / `folded` / `side` | ✅ 可写 | 直接赋值，经 `NodeManager.setterTrap` 触发 `_onNodeUpdated` |

**也就是说：结构字段在语言层面就锁死了，只能由 `JmMind` 维护一致性；属性字段开放赋值，由节点自己承担。** CLI 的 `mind` / `node` 两个组按对象分，组内再按这条线分：结构字段只能走方法，属性字段直接赋值。这是对现有模型的映射，不是新发明的区分。

**`JmNode` 没有任何 setter 方法**（只有 `getAllSubnodeIds` / `equals` / `isDescendant` / `isRoot` 这类查询），所以 `node` 组的命令对应的是**字段赋值**，不是方法调用。`mind` 组里大部分是方法调用，但 `mind set-style` 写的是 `mind.style`，同样是一次字段赋值 —— 差别在对象，不在方法还是字段。

---

## 3. 命令与 JS API 的对应

> **命令名已定，不再随实现调整。**
>
> **方法名与命令名不是同名映射：** JS 用 camelCase（`addChildNode`），CLI 用 kebab-case（`add-child`），两者靠**语义**对应而非字面。`add-child` 是 `addChildNode` 与 `addNode` 合并后的唯一入口，别按字面去反推一个 `add-node`。

### 3.1 `jsmind mind *` —— 对应 `JmMind` 的方法

| `JmMind` 方法 | CLI 命令 |
|---|---|
| `findNodeById(nodeId)` | `jsmind mind find <file> --node-id <id>` |
| `addChildNode(content, parentId)` | `jsmind mind add-child <file> --parent-id <id> --text <text> [--side left\|right] [--position <n>] [--folded true\|false]` |
| `addNode(content, dest, nodeOptions?)` | CLI 不单独提供：`add-child` 的 `--side` / `--position` / `--folded` 就是它的 dest 与 nodeOptions；`--data` 和自定义 `--node-id` 不在 CLI 支持范围内，也不打算支持 |
| `moveNode(nodeId, dest)` | `jsmind mind move <file> --node-id <id> --to-parent-id <id>` |
| `removeNode(nodeId)` | `jsmind mind remove-node <file> --node-id <id>` |
| `addEdge(source, target, type, options?)` | `jsmind mind add-edge <file> --source-id <id> --target-id <id> [--type <t>] [--label <text>]` |
| `removeEdge(edgeId)` | `jsmind mind remove-edge <file> --edge-id <id>` |
| `getEdges(nodeId, type?)` | `jsmind mind edges <file> --node-id <id> [--type <t>]` |

### 3.2 `jsmind node *` —— 对应 `JmNode` 的可写字段

| `JmNode` 字段 | CLI 命令 |
|---|---|
| `content` | `jsmind node set-text <file> --node-id <id> --text <text>` |
| `folded` | `jsmind node set-folded <file> --node-id <id> --folded true\|false` |
| `side` | `jsmind node set-side <file> --node-id <id> --side left\|right`（仅限根的直接子节点） |
| `style` | `jsmind node set-style <file> --node-id <id> [--tone ...] [--font-size ...] ... [--clear ...] [--reset]` |

**`JmNode` 没有 setter 方法**，所以这一组对应的是**字段赋值**（经 `NodeManager.setterTrap`），跟 `mind` 组的方法调用不同。

**`side` 只对根的直接子节点有意义**：侧向是根的直接子节点的位置，它下面整棵子树继承这个侧向。所以 `set-side` 打在根节点或更深的节点上是用例错误（退出码 2），报错点名该节点所属的一级分支 —— 只有根节点是 center，CLI 因此不接受 `--side center`。写入磁盘时转成 `JmNodeSide` 的数字（`-1` / `0` / `1`）。磁盘格式的可读性让给 JSON，命令行的可读性留给人 —— 详见 `v2-data-format.md` 4.2。

### 3.3 `jsmind node set-style` —— 覆盖主题

节点的 `style` 块**只记录与主题不同的部分**。所以「设成什么」和「改回主题」是两类操作，命令也分成两类写法。

**字段的写法：点号分层级，连字符分词。**

```bash
--font-size             → style.fontSize          （连字符只是把两个词连起来）
--incoming.color        → style.incoming.color    （点号 = 进一层）
--incoming.pattern      → style.incoming.pattern
```

路径不手写，从 flag 名推导。所以「命令行怎么写」和「写进文件哪个字段」只有一处定义，不会漂。

**设置字段**（可任意组合，一次写入）：

| flag | 字段 | 取值 |
|---|---|---|
| `--tone` | `tone` | `default` / `primary` / `success` / `warning` / `danger` / `info` / `accent` |
| `--background` | `background` | 任意 CSS 颜色 |
| `--color` | `color` | 任意 CSS 颜色 |
| `--border-color` | `borderColor` | 任意 CSS 颜色 |
| `--border-width` | `borderWidth` | 正数 |
| `--border-style` | `borderStyle` | `solid` / `dashed` / `dotted` |
| `--font-size` | `fontSize` | 正数 |
| `--font-weight` | `fontWeight` | `normal` / `bold` |
| `--incoming.color` | `incoming.color` | 任意 CSS 颜色 |
| `--incoming.width` | `incoming.width` | 正数 |
| `--incoming.pattern` | `incoming.pattern` | `solid` / `dashed` / `dotted` |
| `--incoming.curve` | `incoming.curve` | `straight` / `bezier` |

**清除字段**：

```bash
--clear <字段列表>   # 逗号分隔，写法同上：incoming.color、font-size（也认 fontSize）
--reset              # 清掉这个节点的全部覆盖
```

**为什么清除不能靠设值**：`fontSize` 没有「默认值」可设回主题，只能删键。整个 `style` 块本身就是「覆盖的集合」，键不存在 = 没有覆盖。所以 `--clear` 是独立操作，不是某个特殊值。同理 `--clear` 掉最后一个字段后，`style` 块整个从文件里消失，而不是留一个 `{}`。

**`--reset` 不能与字段或 `--clear` 同时出现** —— 它说的是「这个节点不要任何覆盖」，和「设成某个值」互相矛盾，同时给会直接报用法错误而不是猜意图。

**参数校验发生在读文件之前**：非法 tone、非正数、未知的 `--clear` 字段都在打开文件前就报 `Usage`（退出码 2），不会因为文件恰好不存在而变成别的错误。颜色只检查是不是字符串 —— 主题接受任意 CSS 颜色，枚举值才在 CLI 层拦（为了报错时点名是哪个 flag，而不是给一个 JSON 路径）。

### 3.4 `jsmind mind set-style` —— 文档级样式（`Since: 2.1.0`）

`mind` 组里唯一给属性字段赋值的子命令：它写 `mind.style`，不碰树结构。`node set-style` 写 `node.style`，两者是对称的两个命令，作用域靠组名区分 —— help 里也各自写明了这一点。

| 字段 | CLI 命令 | 版本 |
|---|---|---|
| `mind.style` | `jsmind mind set-style <file> --default-tone <tone>` | `Since: 2.1.0` |

字段写法与 3.3 相同：点号分层（`--node.font-size`、`--line.color`）、连字符分词，配 `--clear <字段列表>` 与 `--reset`。目前只有 `--default-tone` 有写入器；`mind.style` 的其余分节（`tones` / `background` / `node` / `line` / `expander`）暂时只能通过 `context` 读，拿到写入器时按同一张 flag 表加进这个命令，不再开新的子命令。

---

## 4. 定位参数（两类命令共用）

### 4.1 定位参数一律用 id

**详见 `v2-data-format.md` 第 8 节。这里是结论：**

```bash
--parent-id <id>      # 父节点
--node-id <id>        # 目标节点
--to-parent-id <id>   # 移动目标父节点
--edge-id <id>        # 边
--source-id <id>      # 边起点
--target-id <id>      # 边终点
```

**不接受路径（`根/数据/清洗`），不接受文本匹配（`--parent "清洗"`）。**

理由（引用原文）：

- **路径**：节点文本可能含 `/`，无法无歧义表示层级；大段文字让路径长得离谱；同层重名直接撞车；改名即失效
- **文本匹配**：只能严格匹配；不匹配时调用方还得回退去查，**失败路径比直接查更贵**

**所以 agent 的操作序列固定为两段：**

```
① 定位：jsmind context mind.json --highlight "清洗规则"   ← 只回答 id，没命中就明说没命中
② 精确改：jsmind mind add-child ... --parent-id n4   ← 零歧义
```

---

## 5. 跨边界命令

### 5.0 `create`

**从零产生一个图文件。** 其余所有命令都假设文件已经存在，这是唯一产出文件的地方 ——
没有它，agent 想新建一张图只能手写 JSON，而那正是这套 CLI 要消灭的东西。

```bash
jsmind create <file> --title <title> [options]
```

| 选项 | 必填 | 说明 |
|---|---|---|
| `--title` | 是 | 根节点文字，同时作为 `meta.name` 的默认值 |
| `--name` | 否 | 单独指定 `meta.name`，用于文档名和根节点标题不一致的情况 |
| `--author` | 否 | 记录进 `meta.author`，不传则用模型默认值 |
| `--force` | 否 | 覆盖已存在的文件 |
| `--backup` | 否 | 覆盖前把原文件复制成 `.bak` |
| `--dry-run` | 否 | 只打印生成的文档，不写盘 |

**`--title` 而不是 `--text`**：这一层面对的是「这张图叫什么」，不是「某个节点的文字」，
所以用标题的词。`--name` 不传时自动取 `--title` 的值 —— 一张图通常就以根节点命名，
这样一个参数就能覆盖常见场景；想让文档名和根节点不同时才需要显式 `--name`。

**`--backup` 只在真的覆盖时生效**：文件本来不存在，就没有东西需要备份。

**默认拒绝覆盖。** 跟所有改动命令拒绝修改非法文件是同一个原则：不要悄悄毁掉已有的东西。

**文件已存在时退出码是 `2`（用法错误），不是 `1`。** 数据没坏，是这一步不该做 ——
调用方该换个路径，或者显式加 `--force`。

**生成方式**：走 `new JmMind()` + `serialize()`，不手工拼 JSON 字面量。这样新文件的结构
和其它任何文件一样，都由序列化器产生。写盘前先 `validate` 自己产出的文档 —— 如果不合法，
那是本项目的问题，错误信息会明说。

---

### 5.1 `context` —— agent 的发现步骤

**这是唯一允许模糊匹配的地方。** 它是 agent 在动手前的侦察工具。

```bash
jsmind context <file> [选项]
```

| 选项 | 默认 | 说明 |
|---|---|---|
| `--focus <text>` | 无 | **已废弃**，改用 `--highlight`。模糊匹配节点文本，只显示命中的及其周边 |
| `--highlight <text>` | 无 | 按节点文本匹配（忽略大小写），给出它的 id 路径；可重复传参、在整份文档里查找（`Since: 2.2.0`） |
| `--depth <n>` | `2` | 从根往下展示几层 |
| `--max-text <n>` | `40` | 节点文本截断长度 |
| `--full-text` | 关 | 不截断 |
| `--ids-only` | 关 | 只输出 id 列表，不带文本；文本模式下与 `--highlight` 互斥 |
| `--json` | 关 | 输出 JSON |

**输出格式：id 在行首、左对齐成列，文本缩进跟随层级。**

```
n1    AI 工程实践 {tone=primary fontSize=22}
n4      数据
n5        清洗
n7        清洗规则（Q3） {tone=warning incoming.pattern=dashed}
n12     模型
n18     供应商清洗成本
```

**样式覆盖跟在文本后面，只在设过的时候出现。**

`set-style` 能写的字段，`context` 必须能读回来 —— 否则 agent 改完样式只能渲染成图片去看，那是每次一个视觉调用的成本，而且容易看错。没设过覆盖的节点不显示这一段，所以常规查询的输出长度不变。

键用点号写（`incoming.pattern`），和设置时用的 flag 拼写一致，读到的值可以原样拿去改或 `--clear`。

`--json` 时是同样的事实，形状是可解析的对象：

```json
{ "id": "n7", "parentId": "n5", "level": 2, "text": "清洗规则（Q3）",
  "style": { "tone": "warning", "incoming": { "pattern": "dashed" } } }
```

没有覆盖的节点**不带 `style` 键**，而不是带一个 `{}`。

**每个节点都带 `parentId`，根节点为 `null`**（`Since: 2.2.0`）。展平的数组只有 `level`，父子关系得靠“level 2 紧跟 level 1 后面”的位置去推，每个消费方都要重造一遍；直接给出父节点 id 就消除这笔隐性成本。它和 `level` 并列，随节点一起出现，不设覆盖的节点同样有。

**文档级样式摘要是另一层，`--json` 里与 `nodes` 平级**（`Since: 2.1.0`）。文件声明了 `mind.style` 时，文本输出在树的上方多一行：

```
style: theme=default defaultTone=primary overrides=defaultTone,tones,node
```

`--json` 时是同一个事实，放在顶层 `style` 上：

```json
{
  "nodes": [ { "id": "n1", "parentId": null, "level": 0, "text": "根" } ],
  "style": {
    "theme": "default",
    "defaultTone": "primary",
    "overrides": ["defaultTone", "tones", "node"]
  }
}
```

三个键都是解析后的值：`theme` 未写时为 `default`，`defaultTone` 未写时为 `default`，`overrides` 列出文件实际覆盖的分节（`defaultTone` / `background` / `tones` / `node` / `line` / `expander`，按类型声明顺序），没有覆盖任何分节时为空数组；文本行里空数组写成 `none`。文件没有 `mind.style` 时两样都不出现，`--ids-only` 下文本那一行也省略。

**约束：**

- **多行文本压成一行**（换行替换为空格），否则树形结构被打断
- **截断以 `…` 结尾**，默认 40 字符
- **id 必须醒目可复制**，因为它就是下一步的参数

**`--focus`（已废弃）匹配不到时，必须给候选，不能只说 not found：**

```
No node matches "粗暴". Closest:
  n4   数据清洗
  n20  数据准备
```

**`--highlight` 把已知文本换成 id**（`Since: 2.2.0`）。agent 天然掌握的是节点文本，而所有改动命令都以 id 定位；两者之间隔着一个无规律的随机串。这个参数就是那座桥：

```bash
jsmind context mind.json --highlight 地球 --highlight 清洗规则
```

```
highlighted:
  "地球"     -> "root"/"jm-a1"
  "清洗规则" -> "root"/"jm-a4"/"jm-c2" (+1 more)

fullmap:
...
```

- **重复传参，不用逗号分隔**：每个值一个 flag，值本身含逗号时没有转义歧义，调用方拼参数也不必先 join。大小写折叠后相同的值只算一次（`earth` 与 `EARTH` 是同一个问题，不打印两遍）。
- **整条匹配、忽略大小写**：按打印出来的文本（已压平空白）比较整条标签，大小写折叠的方式与 `--focus` 一致，但比较范围不同——`--focus` 是**子串**查找，`--highlight` 比的是整条标签（`--highlight "customer serv"` 对 `Customer Service` 是 `(no match)`）。不做模糊、不比对截断后的文本。
- **查整份文档**，不受 `--depth` 限制：命中目标往往比一次可读的树更深，这正是它的用处。
- **结果放最前面**（`--json` 里是顶层 `highlighted`，在 `nodes` 之前），值是**与 `nodes` 同构的节点对象**（同样带 `parentId`），拿到就不必二次查找。同构不等于同一条：比 `--depth` 更深的命中不会出现在 `nodes` 里，共享标签的命中还多一个 `matches`。
- **无命中写 `(no match)`**：`--json` 里保留键并置 `null`——“查了没命中”和“压根没查”是两种状态。不给候选、不猜。
- **同一文本被多个节点共用**时取文档顺序里的第一个，并标注还有几个（文本 `(+N more)`，`--json` 里是 `matches`）。这不是替 agent 消歧，是告诉它该换一个更具体的标签。
- **只定位，不改变操作目标**：后续命令照旧走 `--node-id` / `--parent-id`。`--focus` 已废弃——模糊匹配加祖先视图加候选列表只回答“可能在哪儿”，给不出能直接执行的 id；它仍能运行，也不再与 `--highlight` 互斥，同时给出时高亮块在前、focus 视图在后。文本模式下 `--ids-only` 与它仍然互斥（一行一个裸 id 与每个标签一行 id 路径没法共存），要只拿 id 就加 `--json`。

### 5.2 `validate`

```bash
jsmind validate <file> [--json] [--autofix]
```

**校验规则与错误码定义在 `v2-data-format.md` 第 9 节**，本文件不重复。

**`--autofix` 的语义定义在 `v2-data-format.md` 第 10 节**：默认只报不改，`--autofix` 才写文件，且**必须输出改动清单**。

```
$ jsmind validate mind.json --autofix
Fixed 3 integrity problems:
  1. jm-a1: parent "jm-nonexistent" does not exist → attached to root
  2. jm-b2: children contained "jm-gone" → reference removed
  3. jm-c3: parent said "jm-d4" but jm-d4.children did not include it → attached to root
Wrote mind.json
```

### 5.3 `export`

```bash
jsmind export <file> <out.png> [--width N] [--height N] [--scale N] [--type F] [--json]
```

**出图需要浏览器，所以它不再是纯数据命令。** 早期设计里这个位置留给 `render`，只打印布局调试信息；真要出图就得有渲染引擎，改名成 `export` 以对齐它的实际职责，也和 JS API 的 `exportImage()` 一致。

**图片尺寸就是内容尺寸**：内容比视口小就保留空白，比视口大就撑开，不按视口裁剪。

**需要 Chromium**，找不到会明确报错而不是导出空白图。

**实现细节见[导出图片](https://hizzgdev.github.io/jsmind-v2/docs/zh/reference/image-export)。**

### 5.4 `convert`

```bash
jsmind convert <input> --from v1 --to v2 [--output <path>]
```

**不在 S7 实现，随 S13（v1 adapter）一起做。** 它必须和 adapter 同时出现，否则命令有了但没有转换能力。

---

## 6. 输出约定

**agent 要解析输出，所以输出契约必须稳定。**

### 6.1 stdout 与 stderr 分离

| 流 | 内容 | 谁看 |
|---|---|---|
| **stdout** | 结果数据（树、id 列表、JSON、改动后的确认信息） | agent / 管道 |
| **stderr** | 诊断、进度、警告 | 人 |

**道理很简单：`jsmind context x.json | jq` 必须能用。** 任何诊断信息混进 stdout 都会破坏管道。

### 6.2 `--json` 开关

**所有命令都支持 `--json`，输出机器可读格式。**

对人友好的是默认格式（表格 / 树），对 agent 友好的是 `--json`。**两者都存在，但不能只有一种** —— 人看 JSON 累，机器解析表格脆。

### 6.3 退出码

**必须让调用方用退出码区分类别，而不是去正则匹配错误文案。**

| 退出码 | 含义 | agent 该做什么 |
|---|---|---|
| `0` | 成功 | 继续 |
| `1` | **数据无效**（validate 失败、引用的 id 不存在） | 检查数据或先跑 `context` 确认 id |
| `2` | **用法错误**（参数缺失、命令拼错、互斥参数同时给） | 改命令行，不要重试 |
| `3` | **IO / 运行时错误**（文件不存在、无写权限、渲染器崩溃） | 环境问题，可能需要人工 |

**这三类必须分开** —— agent 遇到 `1` 会去改数据，遇到 `2` 会去改命令，遇到 `3` 会停下来报告。混成一个退出码，agent 就只能猜。

### 6.4 未知选项

**每个子命令声明自己的允许选项集合。全局选项（`--json`、`--dry-run`、`--output`、`--backup`、`--strict`、`--version`、`-h` / `--help`）单列，对所有子命令合法。**

未知选项（拼错的 flag，或只对另一个子命令有意义的 flag）默认**只警告**（`Since: 2.1.0`）：往 stderr 打一行，命令照常执行，退出码不变。

**为什么不是直接报错**：这类调用原本是「退出码 0 而什么都没发生」，直接收紧会把一批本来能跑的脚本打断。先让调用方看见问题，再让需要确定性失败的一方自己打开开关。

**为什么警告必须在 stderr**：见 6.1 —— stdout 是输出契约，`--json` 的消费者要能直接解析，诊断信息混进去就破坏了管道。

**已知代价：`--json` 的消费者看不到这条警告。** 只看 stdout 和退出码的调用方拿不到任何信号 —— 这是「只警告不报错」的固有成本，不是待修的 bug。要消除它就用 6.5 的 `--strict`。

**不做拼写建议，也不做模糊匹配。** 判断「这个未知选项像不像错字」只能靠猜意图；猜错会把调用方引去改一个它根本没打过的 flag，收益抵不上误判成本。

**「选项合法但位置非法」不属于本节**：`--side` 打在非根父节点上表达的是「做不到」，不是「没听懂」，必须是用法错误（退出码 `2`），不是警告。

### 6.5 `--strict` 与 `--version`

| 选项 | 行为 | 版本 |
|---|---|---|
| `--strict` | 把未知选项从警告升级为用法错误（退出码 `2`） | `Since: 2.1.0` |
| `--version` | 只打印 `package.json` 里的 version 字符串，不带其他文字，不依赖任何子命令 | `Since: 2.1.0` |

`--version` 的版本号不存第二份常量：manifest 是唯一来源，CLI 运行时读它，所以不会和发布版本脱节。

需要确定性失败的调用方（agent、CI）应该打开 `--strict`：静默忽略的选项比命令失败更糟。

---

## 7. 文件写入策略

### 7.1 默认原地修改

```bash
jsmind mind add-child mind.json --parent-id n4 --text "去重"
# → 直接改 mind.json
```

**理由：agent 的工作流是"读一个文件、改它、再读它"，把结果打到 stdout 会逼它重定向，多一次出错机会。**

### 7.2 三个保护

| 选项 | 作用 |
|---|---|
| `--dry-run` | 只打印会做什么，不写文件 |
| `--output <path>` | 写到别处，不动原文件 |
| `--backup` | 写入前留 `<file>.bak` |

### 7.3 写后必须校验

**任何修改类命令在写盘之后、返回之前，必须跑一遍完整性校验；不通过则回滚并报错。**

这条是硬要求：**CLI 不能是数据损坏的来源。** 如果 `add-child` 因为 bug 产生了 `parent` 与 `children` 不一致的数据，必须在写完之后立刻发现，而不是等用户下次打开文件发现树少了一截。

```
$ jsmind mind add-child mind.json --parent-id n4 --text "去重"
Validation failed after write, rolled back:
  E_PARENT_CHILD_MISMATCH at nodes/jm-a7
File unchanged.
```
（退出码 `1`）

---

## 8. 未定项

| 项 | 当前倾向 |
|---|---|
| ~~命令名用 `add-child` 还是 `addChild`~~ | **已定并实现**：`add-child`。`add-node` 已并入它，`--side` / `--position` / `--folded` 就是原来 `addNode` 的 dest 与 nodeOptions |
| ~~`set-style` 的参数怎么展开~~ | **已定并实现**：`--tone` / `--font-size` / `--border-width` 直接映射字段名，不做缩写 |
| ~~文档级样式命令叫什么~~ | **已定**：`mind set-style`（曾叫 `mind style set`）。一个词的子命令，与 `node set-style` 对称，不留旧名别名；CLI 里不再有嵌套层 |
| ~~`context --focus` 的匹配算法~~ | **已定并实现**：匹配是大小写不敏感的**子串**查找；模糊只出现在没匹配上时的候选提示里，按「needle 的字符按序出现在文本中的个数」排序，不是编辑距离 |
| 是否要 `jsmind mind list` 之类只读命令 | 倾向不加，`context` 已经覆盖 |
| 退出码 `3` 是否再细分 | 暂不细分，先观察实际需要 |
