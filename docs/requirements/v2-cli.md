# jsMind v2 CLI 设计

> **本文件定义 CLI 的命令结构与行为约定。** S7 依此实现。
>
> 相关文档：
> - `v2-requirements.md` 4.5 节 —— skill 与 CLI 的分工原则
> - `v2-data-format.md` 第 8 节 —— 为什么只用 id 定位
> - `v2-data-format.md` 第 9、10 节 —— 校验规则与 autofix 语义
>
> **状态**：草案，待确认后冻结。

---

## 1. 定位

**CLI 是确定性层。凡是"结果必须一致"的操作都在这里，不进 skill。**

这条原则来自 `v2-requirements.md` 4.5：

| 事情 | 放哪 | 理由 |
|---|---|---|
| 生成 / 修改树、把对话转成结构 | **skill** | 需要模型判断，每次可以不同 |
| 格式转换（v1 ↔ v2） | **CLI** | 必须确定。LLM 现场转换可能漏、可能反，跑两次结果不一致 |
| 渲染出图 | **CLI** | 确定性 |
| 校验 | **CLI** | 确定性 |

**CLI 的主要使用者是 AI agent，不是人。** 这个前提决定了下面所有的设计取舍：输出要稳定可解析、错误要能用代码区分、失败要能自动恢复。

---

## 2. 命令结构

```
jsmind <命令组> <子命令> [参数]
```

**三层结构，三类命令。**

```
jsmind
├── context          ← 跨边界：查找
├── validate         ← 跨边界：校验
├── render           ← 跨边界：渲染
├── convert          ← 跨边界：格式转换（S13，随 adapter）
├── mind             ← 改树结构（谁的父是谁、有几个孩子）和边
│   ├── add-child
│   ├── add-node
│   ├── move
│   ├── remove-node
│   ├── add-edge
│   ├── remove-edge
│   ├── edges
│   └── find
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
| **改结构** | 改变节点之间的父子关系或边；对应 `JmMind` 的方法 | `jsmind mind *` |
| **改属性** | 只改某一个节点自身的字段，不动树结构；对应 `JmNode` 的字段赋值 | `jsmind node *` |

### 2.2 `mind` 与 `node` 的分界来自代码

**这条分界不是凭感觉划的，现有代码里已经存在：**

```typescript
// src/model/mind.ts:477
this.readonlyFields = new Set(['id', 'parent', 'children', 'data']);
```

| 字段 | 可写 | 怎么改 |
|---|---|---|
| `id` / `parent` / `children` | ❌ 只读 | 只能走 `JmMind` 的方法（`addChildNode` / `moveNode` / `removeNode`） |
| `content` / `folded` / `side` | ✅ 可写 | 直接赋值，经 `NodeManager.setterTrap` 触发 `_onNodeUpdated` |

**也就是说：结构字段在语言层面就锁死了，只能由 `JmMind` 维护一致性；属性字段开放赋值，由节点自己承担。** CLI 按同一条线分成 `mind` 和 `node`，是对现有模型的映射，不是新发明的区分。

**`JmNode` 没有任何 setter 方法**（只有 `getAllSubnodeIds` / `equals` / `isDescendant` / `isRoot` 这类查询），所以 `node` 组的命令对应的是**字段赋值**，不是方法调用 —— 这一点跟 `mind` 组不同。

---

## 3. 命令与 JS API 的对应

> ⚠️ **下表是当前草案，命名在 S7 实现时可能调整。**
>
> **方法名与命令名不是同名映射：** JS 用 camelCase（`addChildNode`），CLI 用 kebab-case（`add-child`），两者靠**语义**对应而非字面。不要假设 `addChildNode` 一定叫 `add-child`，以 S7 的实现为准。

### 3.1 `jsmind mind *` —— 对应 `JmMind` 的方法

| `JmMind` 方法 | CLI 命令 |
|---|---|
| `findNodeById(nodeId)` | `jsmind mind find <file> --node-id <id>` |
| `addChildNode(content, parentId)` | `jsmind mind add-child <file> --parent-id <id> --text <text>` |
| `addNode(content, dest, nodeOptions?)` | `jsmind mind add-node <file> --parent-id <id> --text <text> [--side ...] [--folded] [--data <json>]` |
| `moveNode(nodeId, dest)` | `jsmind mind move <file> --node-id <id> --to-parent-id <id>` |
| `removeNode(nodeId)` | `jsmind mind remove-node <file> --node-id <id>` |
| `addEdge(source, target, type, options?)` | `jsmind mind add-edge <file> --source-id <id> --target-id <id> [--type <t>] [--label <text>]` |
| `removeEdge(edgeId)` | `jsmind mind remove-edge <file> --edge-id <id>` |
| `getEdges(nodeId, type?)` | `jsmind mind edges <file> --node-id <id> [--type <t>]` |

### 3.2 `jsmind node *` —— 对应 `JmNode` 的可写字段

| `JmNode` 字段 | CLI 命令 |
|---|---|
| `content` | `jsmind node set-text <file> --node-id <id> --text <text>` |
| `folded` | `jsmind node set-folded <file> --node-id <id> [--folded \| --no-folded]` |
| `side` | `jsmind node set-side <file> --node-id <id> --side left\|right\|center` |
| `style` | `jsmind node set-style <file> --node-id <id> [--tone ...] [--font-size ...] ... [--clear ...] [--reset]` |

**`JmNode` 没有 setter 方法**，所以这一组对应的是**字段赋值**（经 `NodeManager.setterTrap`），跟 `mind` 组的方法调用不同。

**`set-side` 在 CLI 层接受 `left` / `right` / `center`，写入磁盘时转成 `JmNodeSide` 的数字**（`-1` / `0` / `1`）。磁盘格式的可读性让给 JSON，命令行的可读性留给人 —— 详见 `v2-data-format.md` 4.2。

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
① 模糊查：jsmind context mind.json --focus "清洗"     ← 可以猜错，猜错只影响看到什么
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
| `--focus <text>` | 无 | 模糊匹配节点文本，只显示命中的及其周边 |
| `--depth <n>` | `2` | 从根往下展示几层 |
| `--max-text <n>` | `40` | 节点文本截断长度 |
| `--full-text` | 关 | 不截断 |
| `--ids-only` | 关 | 只输出 id 列表，不带文本 |
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
{ "id": "n7", "level": 1, "text": "清洗规则（Q3）",
  "style": { "tone": "warning", "incoming": { "pattern": "dashed" } } }
```

没有覆盖的节点**不带 `style` 键**，而不是带一个 `{}`。

**约束：**

- **多行文本压成一行**（换行替换为空格），否则树形结构被打断
- **截断以 `…` 结尾**，默认 40 字符
- **id 必须醒目可复制**，因为它就是下一步的参数

**`--focus` 匹配不到时，必须给候选，不能只说 not found：**

```
No node matches "粗暴". Closest:
  n4   数据清洗
  n20  数据准备
```

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

**实现细节见 `docs/features/image-export.md`。**

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
| 命令名用 `add-child` 还是 `addChild` | 倾向 `add-child`（CLI 惯例是 kebab-case，但跟 JS API 的对应关系会变模糊） |
| ~~`set-style` 的参数怎么展开~~ | **已定并实现**：`--tone` / `--font-size` / `--border-width` 直接映射字段名，不做缩写 |
| `context --focus` 的匹配算法 | 子串 + 简单模糊（编辑距离），具体算法待实现时定 |
| 是否要 `jsmind mind list` 之类只读命令 | 倾向不加，`context` 已经覆盖 |
| 退出码 `3` 是否再细分 | 暂不细分，先观察实际需要 |