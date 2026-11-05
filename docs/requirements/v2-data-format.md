# jsMind v2 数据格式规范

> **本文件定义 v2 的磁盘格式。** S1 的实现逐条对照本文件；后续每个 PR 改动格式时同步更新。
>
> **状态**：草案，待确认后冻结。

---

## 1. 格式定位

### 1.1 三种表示形态

v2 的数据有**三种表示**，各自服务不同用途：

| 形态 | 用在哪 | 谁看 | 是否落地成文件 |
|---|---|---|---|
| **扁平表** | **磁盘标准格式** | 工具、git、CLI | ✅ **是唯一真相源** |
| **嵌套树** | LLM 交互 | Agent（生成/阅读） | ❌ 传输瞬间的形态 |
| **紧凑文本** | 给人/Agent 快速看结构 | 人、Agent | ❌ 终端输出 |

**磁盘上永远只有一份扁平表。** 嵌套形态只存在于「LLM 生成之后 → CLI 转扁平 → 落盘」和「要给 LLM 看 → CLI 从扁平转嵌套」这两个瞬间。

**为什么磁盘用扁平：**

| 好处 | 说明 |
|---|---|
| diff 干净 | git 里改一个节点只有一处 diff |
| 增量定位快 | `nodes[id]` 直接命中，不用走路径 |
| 与 edges 同构 | 边引用节点、节点引用父子，都是 id 引用 |
| 无深递归 | 解析是循环，不怕深嵌套 |
| 节点自包含 | 单个节点对象带齐 `id` / `parent` / `children` |

**为什么 LLM 用嵌套：** 训练数据里满是大纲和目录树，嵌套是它的天赋；扁平表要求它一边想内容一边维护 id 账本，出错面大得多。

### 1.2 版本标识

每个数据文件顶层必须带 `"format": "jsmind_v2"`。

**必填**，用于格式探测。v1 的加载器遇到不认识的 `format` 只 `console.warn` 并返回 `null`（不抛异常），所以带这个字段的 v2 文件不会被 v1 静默按 node_tree 解析。

---

## 2. 完整示例

```json
{
  "format": "jsmind_v2",
  "meta": {
    "name": "AI 工程实践",
    "author": "张同学",
    "version": "1.0"
  },
  "style": { "theme": "default" },
  "root": "root",
  "nodes": {
    "root": {
      "id": "root",
      "content": { "type": "text", "value": "AI 工程实践" },
      "parent": null,
      "children": ["jm-mw2cjf4z", "jm-mw2cjf50"],
      "folded": false,
      "side": 0,
      "data": {}
    },
    "jm-mw2cjf4z": {
      "id": "jm-mw2cjf4z",
      "content": { "type": "text", "value": "数据" },
      "parent": "root",
      "children": ["jm-mw2cjf8a"],
      "folded": false,
      "side": 1,
      "style": { "tone": "primary" },
      "data": {}
    },
    "jm-mw2cjf8a": {
      "id": "jm-mw2cjf8a",
      "content": { "type": "text", "value": "清洗" },
      "parent": "jm-mw2cjf4z",
      "children": [],
      "folded": false,
      "side": 1,
      "style": {
        "tone": "warning",
        "borderWidth": 2,
        "fontSize": 16,
        "incoming": { "style": "dashed", "width": 2 }
      },
      "data": {}
    },
    "jm-mw2cjf50": {
      "id": "jm-mw2cjf50",
      "content": { "type": "text", "value": "模型" },
      "parent": "root",
      "children": [],
      "folded": true,
      "side": -1,
      "data": { "note": "待展开" }
    }
  },
  "edges": {
    "jm-mw2cjh01": {
      "id": "jm-mw2cjh01",
      "sourceNodeId": "jm-mw2cjf8a",
      "targetNodeId": "jm-mw2cjf50",
      "type": "link",
      "label": "影响",
      "style": { "color": "#e91e63", "width": 1.5, "style": "dotted" }
    }
  }
}
```

---

## 3. 顶层结构

**对应代码：`src/serialization/json.ts` 的 `SerializedMindMap`。**

```typescript
interface SerializedMindMap {
    meta: MindMetadata;
    root: string;
    nodes: Record<string, SerializedNode>;
    edges: Record<string, SerializedEdge>;
    format?: "jsmind_v2";
    style?: JmStyle;
}
```

| 字段 | 类型 | 必填 | 默认 | 状态 |
|---|---|---|---|---|
| `meta` | `MindMetadata` | ✅ | — | 现有 |
| `root` | `string` | ✅ | `"root"` | 现有 |
| `nodes` | `Record<string, SerializedNode>` | ✅ | — | 现有 |
| `edges` | `Record<string, SerializedEdge>` | ✅ | `{}` | 现有 |
| `format` | `"jsmind_v2"` | ❌ | 无 | **新增** |
| `style` | `JmStyle` | ❌ | 继承 `default` | **新增** |

**关于 `root` 的取值**：现有实现里根节点 id 来自 `JsMindOptions.mind.rootNodeId`，默认是固定字符串 `"root"`，**不经过 `SimpleIdGenerator`**。所以文件里常见 `"root": "root"`。这个值不参与 id 稳定性约束（它是配置项，不是动态生成的节点 id），但**同一文件内必须唯一且指向真实存在的节点**。

### 3.1 `meta`

```typescript
interface MindMetadata {
    name: string;
    author: string;
    version: string;
}
```

三个字段都必填。`version` 是**用户自己的版本号**（如 `"1.0"`），跟 `format` 无关。

---

## 4. 节点

**对应代码：`src/serialization/json.ts` 的 `SerializedNode`。**

```typescript
interface SerializedNode {
    id: string;
    content: {
        type: JmNodeContentType;
        value: unknown;
    };
    parent: string | null;
    children: string[];
    folded: boolean;
    side: JmNodeSide;
    data: Record<string, unknown>;
    style?: JmNodeStyle;
}
```

| 字段 | 类型 | 必填 | 默认 | 状态 |
|---|---|---|---|---|
| `id` | `string` | ✅ | — | 现有，**必须等于它在 `nodes` 中的 key** |
| `content` | `{ type, value }` | ✅ | — | 现有，见 4.1 |
| `parent` | `string \| null` | ✅ | — | 现有，根节点必须是 `null` |
| `children` | `string[]` | ✅ | — | 现有，**顺序即显示顺序** |
| `folded` | `boolean` | ✅ | `false` | 现有 |
| `side` | `JmNodeSide` | ✅ | 见 4.2 | 现有，**是数字**，见 4.2 |
| `data` | `Record<string, unknown>` | ✅ | `{}` | 现有，用户自定义数据，原样保留 |
| `style` | `JmNodeStyle` | ❌ | 无 | **新增**，见第 5 节 |

### 4.1 `content`

```typescript
const JmNodeContentType = {
    Text: 'text'
} as const;
type JmNodeContentType = typeof JmNodeContentType[keyof typeof JmNodeContentType];
```

**现有实现只有 `Text: 'text'` 一个取值。** `type` 字段保留是为了将来扩展（富内容），但**遇到不认识的类型应当报错，不静默降级**。

**`value` 在类型上是 `unknown`**（因为将来可能承载非文本内容），当前 `type === 'text'` 时它是 `string`。

### 4.2 `side` 是数字，不是字符串

**对应代码：`src/model/data/node.ts` 的 `JmNodeSide`。**

```typescript
export const JmNodeSide = {
    SideB: -1,      // left
    Center: 0,      // center
    SideA: 1,       // right
} as const;
export type JmNodeSide = typeof JmNodeSide[keyof typeof JmNodeSide];
```

| 值 | 含义 |
|---|---|
| `-1` | `SideB`，左侧 |
| `0` | `Center`，居中（根节点） |
| `1` | `SideA`，右侧 |

**JSON 里就是数字**，序列化和反序列化都直接搬运（`node.side = nodeData.side`），不做名字转换。

**默认值：**
- 根节点：`0`（`Center`）
- 其他节点：继承父节点的值；父为 `0` 时取 `1`

> **注意**：数字在 JSON 里可读性差（`"side": 1` 不直观）。这是现有实现的取值方式，本规范暂按现状保留。若将来决定在序列化层转成 `"left"/"center"/"right"`，需要同时调整 `SerializedNode.side` 的类型和反序列化逻辑，属于一次独立的格式变更。

### 4.3 文本是自由文本

**节点文本可以是任意内容**：大段文字、含 `/`、含换行、含 HTML 特殊字符。

**所以：**
- **不能用文本或路径定位节点**（详见第 8 节）
- **渲染时必须转义**（`<`、`>`、`&`）
- **`context` 命令默认截断到 40 字符**（详见 8.3）

## 5. 样式与主题

### 5.1 tone：六个语义色

```typescript
export const JmTone = {
    Default: 'default',
    Primary: 'primary',
    Success: 'success',
    Warning: 'warning',
    Danger:  'danger',
    Info:    'info',
} as const;

export type JmTone = typeof JmTone[keyof typeof JmTone];
```

**tone 只表达颜色，不表达几何。** 语义角色的本质就是颜色；几何应该正交（一个节点可以同时是「warning 色 + 粗边框 + 大字号」）；对 Agent 友好（副作用越小，生成越可控）。

### 5.2 `JmNodeStyle`

```typescript
export const JmLinePattern = {
    Solid:  'solid',
    Dashed: 'dashed',
    Dotted: 'dotted',
} as const;

export type JmLinePattern = typeof JmLinePattern[keyof typeof JmLinePattern];

interface JmLineStyle {
    color?: string;
    width?: number;
    pattern?: JmLinePattern;
}

interface JmNodeStyle {
    tone?: JmTone;
    background?: string;
    color?: string;
    borderColor?: string;
    borderWidth?: number;
    borderStyle?: JmLinePattern;
    fontSize?: number;                    // px
    fontWeight?: "normal" | "bold";
    incoming?: JmLineStyle;               // the line connecting this node to its parent
}
```

**`incoming` 挂在子节点上** —— 一条线唯一对应一个子节点，这是最自然的归属。字段名与布局层对齐（`calculateNodeIncomingPoint` / `calculateNodeOutgoingPoint`）。

**跨节点的 `edge` 用同一个 `JmLineStyle`**，避免两套字段名不一的体系。

### 5.3 `JmTheme`

```typescript
interface JmTonePalette {
    fillColor: string;
    textColor: string;
    borderColor: string;
    lineColor: string;
}

interface JmStyle {
    theme?: string;
    background?: string;
    tones?: Partial<Record<JmTone, Partial<JmTonePalette>>>;
    node?: Partial<{
        radius: number;
        padding: number;
        fontSize: number;
        fontFamily: string;
        borderWidth: number;
    }>;
    line?: Partial<{
        width: number;
        pattern: JmLinePattern;
    }>;
    expander?: Partial<{ size: number }>;
}
```

**读法只有一种：** `style` 是「这个 mindmap 的样式声明」—— 它**继承 `style.theme` 指向的预设**（不写就继承 `default`），然后**应用声明的其余字段**。

```json
"style": { "theme": "default", "background": "#fafafa" }
```
= 继承 `default`，把背景改成 `#fafafa`。

```json
"style": { "background": "#101010", "node": { "radius": 8 } }
```
= 同样继承 `default`（`theme` 隐含），只改这两处。

**必须深度合并，不能用浅合并** —— `tones: { primary: { fillColor: "#f00" } }` 做浅合并会把整个 `primary` 替换掉，`textColor`/`borderColor`/`lineColor` 全丢，节点变黑底黑字。

**第一版只内置 `default` 一个预设。** 暗色是另一个预设，不是「同一主题的 dark 变体」。

### 5.4 覆盖链

```
颜色：  node.style.<显式>          ??  theme.tones[有效 tone].<对应色>
几何：  node.style.<显式>          ??  theme.node.<默认>
线色：  node.style.incoming.color  ??  theme.tones[父节点 tone].line  ??  theme.line.<兜底>
```

**线的颜色默认取父节点的 tone** —— 「从 warning 节点长出去的分支是橙色」符合直觉，一条分支天然同色。

---

## 6. 边

```typescript
interface SerializedEdge {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    type: JmEdgeType;
    label: string | null;
    style?: JmLineStyle;
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✅ | 必须等于它在 `edges` 中的 key |
| `sourceNodeId` | ✅ | 起点节点 id，必须存在 |
| `targetNodeId` | ✅ | 终点节点 id，必须存在 |
| `type` | ✅ | 关系类型，当前代码只有 `JmEdgeType.Link = 'link'` |
| `label` | ✅ | 标签文字，无标签写 `null` |
| `style` | ❌ | 线样式，同 `JmLineStyle` |

**`edges` 只表达树之外的额外关系。** 父子关系**永远**由 `node.parent` / `node.children` 表达，**不写进 `edges`**。

**第一版渲染器不画边**（只校验不渲染），但数据要能存、能往返。这是为将来留扩展性。

---

## 7. id 稳定性（硬约束）

### 7.1 规则

> **id 一旦分配，永久不变。删除节点不重排，新增节点取新号。**

**因此 `jm-a1, jm-a2, jm-a7` 中间的空号是正常且正确的。**

**为什么这条是硬约束：** `id` 是**唯一的节点定位方式**（见 8.1）。一旦重排，Agent 记下的 id 就会指向错误的节点——**改了不该改的地方，且无人察觉。**

### 7.2 生成规则（现状）

```typescript
// src/generation/index.ts
class SimpleIdGenerator {
    seed = new Date().getTime();      // millisecond timestamp at instance creation
    seq  = 0;

    newId() {
        this.seq++;                                           // monotonically increasing
        return this.prefix + (this.seed + this.seq).toString(36);
    }
}
// JmMind creates new SimpleIdGenerator('jm-')
```

**稳定性的来源：**
- `seq` 只递增，删除不回收
- id 不参与排序或位置计算
- 代码库中**没有**任何重新编号的逻辑

### 7.3 去重

**`addNode` 时检查生成的 id 是否已存在于 `nodes` 中，冲突则重新生成。** 不需要在 seed 层面做文章——id 的具体值无人关心，唯一性才是要求。

**加载文件后 seed 会变**（新实例的当前时间戳），导致新增 id 与既有 id 前缀不同。**这不影响正确性**，只是看起来不连续。

---

## 8. 节点定位

### 8.1 只用 id，不用路径或文本

**这是本规范里最重要的一条设计决定。**

**节点文本是自由文本**（见 4.3），所以：

| 定位方式 | 为什么不可行 |
|---|---|
| **路径**（`根/数据/清洗`） | 文本含 `/` 就无法无歧义表示层级；大段文字让路径长得离谱；同层重名直接撞车；节点改名即失效 |
| **文本匹配**（`--parent "清洗"`） | 只能严格匹配；不匹配时调用方还得回退去查，**失败路径比直接查更贵** |

**所以：修改类命令只接受 `--node-id` / `--parent-id` 这类精确参数。**

### 8.2 查可以模糊，改必须精确

**两件事的精确度要求分开：**

```
查（context）：可以模糊 —— 猜错了只影响看到什么，不影响改什么
改（mind *）：必须精确 —— 只用 id
```

**标准工作流：**

```
① 模糊查：  jsmind context mind.json --focus "清洗"
   ← n4  数据清洗
     n5  清洗规则（Q3）
     n18 供应商清洗成本

② 精确改：  jsmind mind add-child mind.json --parent-id n4 --text "去重"
   ← ✓ added "去重" under 数据清洗 (id: n47)
```

**`--focus` 匹配不到时给候选：**

```
No node matches "粗暴". Closest:
  n4   数据清洗
  n20  数据准备
```

### 8.3 `context` 的输出约束

- **id 放行首并左对齐**，成列排列，便于复制
- **默认截断到 40 字符**（`--max-text` 可调，`--full-text` 关闭）
- **多行文本压成一行**（换行替换为空格），否则树形结构被打断
- 截断以 `…` 结尾

---

## 9. 完整性校验

`validate` 必须逐项检查下列规则，每项有独立错误码。

### 9.1 结构完整性

| 检查 | 错误码 |
|---|---|
| `format` 存在且等于 `"jsmind_v2"` | `E_FORMAT` |
| `meta` 三个字段齐全且为字符串 | `E_META` |
| `root` 指向的节点存在于 `nodes` | `E_ROOT_MISSING` |
| `nodes` 每个 key 等于其值的 `id` | `E_NODE_KEY_MISMATCH` |
| `edges` 每个 key 等于其值的 `id` | `E_EDGE_KEY_MISMATCH` |

### 9.2 引用完整性

| 检查 | 错误码 |
|---|---|
| 每个 `node.parent` 要么是 `null`，要么存在于 `nodes` | `E_NODE_PARENT_MISSING` |
| 每个 `node.children` 的元素都存在于 `nodes` | `E_NODE_CHILD_MISSING` |
| 每个 `edge.sourceNodeId` / `targetNodeId` 都存在 | `E_EDGE_NODE_MISSING` |
| **恰好一个节点的 `parent === null`**，且它等于 `root` | `E_MULTIPLE_ROOTS` / `E_ROOT_PARENT_SET` |

### 9.3 一致性（双向引用）

| 检查 | 错误码 |
|---|---|
| `nodes[p].children` 含 `c` ⟺ `nodes[c].parent === p` | `E_PARENT_CHILD_MISMATCH` |

**这条是最容易静默出错的** —— 图上画得出来，但某个节点实际挂不上树。

### 9.4 无环

| 检查 | 错误码 |
|---|---|
| 从每个节点向上追溯 `parent`，不得回到自身 | `E_CYCLE` |

### 9.5 取值合法性

| 检查 | 错误码 |
|---|---|
| `content.type` 为 `"text"` | `E_CONTENT_TYPE` |
| `side` ∈ `{-1, 0, 1}`（JSON 里是数字，见 4.2） | `E_SIDE` |
| `style.tone` ∈ 六个 tone 值 | `E_TONE` |
| `style.borderStyle` / `incoming.pattern` ∈ `{solid,dashed,dotted}` | `E_LINE_STYLE` |
| `style.fontSize` / `borderWidth` 为正数 | `E_STYLE_RANGE` |
| `style.theme` 若是字符串，必须在内置预设表中 | `E_THEME_UNKNOWN` |

### 9.6 错误输出格式

```json
{
  "valid": false,
  "errors": [
    { "code": "E_PARENT_CHILD_MISMATCH", "path": "nodes/jm-c1", "message": "..." }
  ]
}
```

**错误必须带 `code`** —— 调用方（CLI、宿主、Agent）能据此分支处理，而不是去解析人类可读的文案。

---

## 10. autofix

### 10.1 默认不修

**`validate` 默认只报告，不改文件。** 加 `--autofix` 才写入。

### 10.2 修复规则

| 问题 | 修复动作 | 依据 |
|---|---|---|
| `parent` 指向不存在的节点 | **挂到 `root`** | 保住数据，不丢 |
| `children` 含不存在的 id | **删除该引用** | 引用本就无效 |
| `parent` 与 `children` 矛盾 | **以 `children` 为准重算 `parent`** | 见 10.3 |
| 出现环 | **断开成环处，挂到 `root`** | 破除环 |
| 根节点带 `parent` | **清为 `null`** | 根无父 |
| 多个 `parent === null` | 保留 `root` 指向的，其余挂到 `root` | 单根约束 |
| 节点 `id` 与 key 不符 | **以 key 为准，改写 `id`** | key 是容器索引 |

### 10.3 为什么以 `children` 为准

- **`children` 是有序列表**，兄弟顺序有语义，不能随便重建
- **`parent` 是单一引用**，可以从 `children` 完全推导
- **让可推导的服从权威源**，方向唯一

**例外：孤儿节点。** 某节点 `parent` 指向 A，但 A 的 `children` 不含它。按 `children` 为准它不会成为 A 的孩子，**此时挂到 `root` 并报告** —— 宁可位置不对，也不丢数据。

### 10.4 必须输出改动清单

```
$ jsmind validate mind.json --autofix
Fixed 3 integrity problems:
  1. jm-a1: parent "jm-nonexistent" does not exist → attached to root
  2. jm-b2: children contained "jm-gone" → reference removed
  3. jm-c3: parent said "jm-d4" but jm-d4.children did not include it → attached to root
Wrote mind.json
```

**绝不静默修复。** 用户必须能知道「我的数据被怎么改了」。

### 10.5 autofix 不做的事

- **不删除节点**（即使看起来是孤儿也挂到根）
- **不重建 `children` 顺序**（顺序信息无法从其他数据推导）
- **不修改 `content`**（内容永远是用户的）

---

## 11. 与 v1 的映射（供将来的 adapter 参考）

**adapter 排在 S13，此处只记录映射关系，供 S1 设计时避开「映射不回去」的坑。**

| v1 | v2 | 转换方式 |
|---|---|---|
| `node_tree` 嵌套结构 | `nodes` 扁平表 | 递归展开，分配 id |
| `topic` | `content.value` | 直接 |
| `expanded` | `folded` | **取反** |
| `direction` | `side` | `left`/`right` 直接映射 |
| `data` | `data` | 直接 |
| （无） | `style` / `style` | **导出 v1 时丢弃 + 报告** |
| （无） | `edges` | **导出 v1 时丢弃 + 报告** |

**方向性：v1 格式冻结，能力上 v2 覆盖 v1。** 但**数据结构不同，必须经 adapter 转换，不能直接互通**。

**导出 v1 时的丢弃必须报告，但不写进文件** —— 返回损失清单，文件本身保持纯 v1。

---

## 12. 待定项

| 项 | 当前倾向 |
|---|---|
| `format` 的确切值 | `"jsmind_v2"` |
| 内置主题表的具体配色 | 实现 S3 时定 |
| `edge.type` 的取值名单 | 先开放为任意字符串，将来收敛 |
| 是否支持 `content.type` 的其他值 | 第一版只 `text` |