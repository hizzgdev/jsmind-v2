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

**三层，两类：**

```
jsmind
├── context          ← 跨边界：查找
├── validate         ← 跨边界：校验
├── render           ← 跨边界：渲染
├── convert          ← 跨边界：格式转换（S13，随 adapter）
└── mind             ← 数据命令组
    ├── add-child
    ├── add-node
    ├── move
    ├── remove-node
    ├── add-edge
    ├── remove-edge
    ├── find
    ├── edges
    ├── set-text
    └── set-style
```

### 2.1 为什么分两类

| 类型 | 特征 | 命令 |
|---|---|---|
| **跨边界** | 不是单纯的数据操作，涉及文件 IO / 渲染 / 校验，或跨越数据结构 | `context` `validate` `render` `convert` |
| **数据操作** | 一一对应 `JmMind` 的某个方法 | `jsmind mind *` |

**数据命令收进 `mind` 子命令组的理由：** `JmMind` 是唯一的写入口，把它提供的能力集中在一个命名空间下，两边能一一对照。CLI 有但 JS API 没有的东西（`set-text` / `set-style`）也放这里，因为它们改的是同一份数据。

---

## 3. 数据命令：镜像 JS API

**原则：JS API 提供什么能力，CLI 就有什么命令。**

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
| （无对应方法） | `jsmind mind set-text <file> --node-id <id> --text <text>` |
| （无对应方法） | `jsmind mind set-style <file> --node-id <id> [--tone ...] [--font-size ...] ...` |

**`set-text` / `set-style` 没有对应的 JS 方法** —— 那是 CLI 层为了 agent 好用以组合出来的，实现上走 `node` 的 setter。

### 3.1 定位参数一律用 id

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

## 4. 跨边界命令

### 4.1 `context` —— agent 的发现步骤

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
n1    AI 工程实践
n4      数据
n5        清洗
n7        清洗规则（Q3）
n12     模型
n18     供应商清洗成本
```

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

### 4.2 `validate`

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

### 4.3 `render`

```bash
jsmind render <file> [--output <path>] [--width N] [--json]
```

**S7 只输出调试信息**（布局尺寸、节点数等），真正出图在 S8/S9 之后（需要无头浏览器）。

**渲染细节见 `v2-requirements.md` 4.6、4.7 节。**

### 4.4 `convert`

```bash
jsmind convert <input> --from v1 --to v2 [--output <path>]
```

**不在 S7 实现，随 S13（v1 adapter）一起做。** 它必须和 adapter 同时出现，否则命令有了但没有转换能力。

---

## 5. 输出约定

**agent 要解析输出，所以输出契约必须稳定。**

### 5.1 stdout 与 stderr 分离

| 流 | 内容 | 谁看 |
|---|---|---|
| **stdout** | 结果数据（树、id 列表、JSON、改动后的确认信息） | agent / 管道 |
| **stderr** | 诊断、进度、警告 | 人 |

**道理很简单：`jsmind context x.json | jq` 必须能用。** 任何诊断信息混进 stdout 都会破坏管道。

### 5.2 `--json` 开关

**所有命令都支持 `--json`，输出机器可读格式。**

对人友好的是默认格式（表格 / 树），对 agent 友好的是 `--json`。**两者都存在，但不能只有一种** —— 人看 JSON 累，机器解析表格脆。

### 5.3 退出码

**必须让调用方用退出码区分类别，而不是去正则匹配错误文案。**

| 退出码 | 含义 | agent 该做什么 |
|---|---|---|
| `0` | 成功 | 继续 |
| `1` | **数据无效**（validate 失败、引用的 id 不存在） | 检查数据或先跑 `context` 确认 id |
| `2` | **用法错误**（参数缺失、命令拼错、互斥参数同时给） | 改命令行，不要重试 |
| `3` | **IO / 运行时错误**（文件不存在、无写权限、渲染器崩溃） | 环境问题，可能需要人工 |

**这三类必须分开** —— agent 遇到 `1` 会去改数据，遇到 `2` 会去改命令，遇到 `3` 会停下来报告。混成一个退出码，agent 就只能猜。

---

## 6. 文件写入策略

### 6.1 默认原地修改

```bash
jsmind mind add-child mind.json --parent-id n4 --text "去重"
# → 直接改 mind.json
```

**理由：agent 的工作流是"读一个文件、改它、再读它"，把结果打到 stdout 会逼它重定向，多一次出错机会。**

### 6.2 三个保护

| 选项 | 作用 |
|---|---|
| `--dry-run` | 只打印会做什么，不写文件 |
| `--output <path>` | 写到别处，不动原文件 |
| `--backup` | 写入前留 `<file>.bak` |

### 6.3 写后必须校验

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

## 7. 未定项

| 项 | 当前倾向 |
|---|---|
| 命令名用 `add-child` 还是 `addChild` | 倾向 `add-child`（CLI 惯例是 kebab-case，但跟 JS API 的对应关系会变模糊） |
| `set-style` 的参数怎么展开 | 倾向 `--tone` / `--font-size` / `--border-width` 直接映射字段名，不做缩写 |
| `context --focus` 的匹配算法 | 子串 + 简单模糊（编辑距离），具体算法待实现时定 |
| 是否要 `jsmind mind list` 之类只读命令 | 倾向不加，`context` 已经覆盖 |
| 退出码 `3` 是否再细分 | 暂不细分，先观察实际需要 |