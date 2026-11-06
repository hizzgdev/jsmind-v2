# jsMind v2 开发计划

> **本文件定义 v2 的实现顺序与每个 PR 的边界。** 需求与决策见 [`docs/requirements/v2-requirements.md`](../requirements/v2-requirements.md)。
>
> **状态**：规划中，PR 逐个推进。

**编号说明**：本文用 **S1 ~ S13** 表示规划步骤，**与 GitHub PR 号无关**。实际提 PR 时号码会往后顺延（例如 S1 提上去时是 PR #5 还是 #6，取决于期间有没有插别的 PR）。**认步骤，不认号码。**

---

## 1. 规划原则

**一层一层来。** 每个 PR 只做一层的事，做完可独立验证、可独立回滚。不追求"一次做完"，追求"每一步都站得住"。

**依赖必须前置。** 后面的层要用到前面的产出，不允许跳层（例如没定义样式字段就直接写渲染）。

**测试跟着 PR 走。** 每个 PR 必须交代：

1. 现有测试用例**有没有需要改的**（改了要有理由）
2. 新增了什么**单元测试**
3. 是否到了该加**端到端测试**的节点

**可以 break，但别砸资产。** v2 未发布、零存量用户，schema 和内部结构可以放心重构。但已经跑对的东西不碰：

| 对象 | 态度 | 理由 |
|---|---|---|
| v2 的 JSON 格式、类型定义 | 随便改 | 零存量，改完只重写序列化和测试 |
| `view/` 的渲染逻辑 | 可以改 | 现在只是"能画个大概"，本来就要重写 |
| **`arranger/mindmap.ts`** | **不动** | 201 行 + 644 行测试，几何是对的 |
| **`JmNode` 的 `folded` / `side` / `children`** | **谨慎** | 动了会同时波及 arranger 和 view |
| **v1 格式** | **绝对不动** | 方向性兼容的锚点 |

---

## 2. 现状盘点

| 层 | 现状 | 缺口 |
|---|---|---|
| 布局 `arranger/` | ✅ 完整（201 行 + 644 行测试） | 无 |
| 模型 `model/` | ✅ 完整（`JmNode`: id / content / parent / children / folded / side / data） | **无 `style`** |
| 序列化 `serialization/json.ts` | ✅ 可用（`nodes` 是 Record，`root` 是 id 字符串） | **无 `format` / `theme` / `style`** |
| 视图 `view/` | ⚠️ 基础（div 节点 + **SVG 直线** + CSS class） | **无曲线、无主题、无节点级样式** |
| 选项 `common/option.ts` | ⚠️ `ViewOptions.theme: string` | **只是个字符串，没有主题表** |
| CLI / 产物 / 导出 / 编辑 / skill / MCP | ❌ 全无 | 全要做 |

**测试底子**：2832 行 / 17 个文件 / 158 个用例，全绿。

**arranger 和 view 读的节点字段完全一致，只有 8 个**：

```
node.children   node.content   node.folded   node.id
node.isRoot     node.parent    node.side     node.ts
```

**这条很关键** —— 加 `style` / `theme` / `format` 对这两层是零影响，改动集中在序列化层。

---

## 3. PR 序列

```
第 1 层 ─ 数据
  S1  schema：style / theme / format
  S2  校验 + 错误码
      ↓
第 2 层 ─ 渲染
  S3  theme 系统（纯数据）
  S4  节点样式 + 重新测量        ← 最复杂
  S5  贝塞尔连线 + 线样式
  S6  Shadow DOM 隔离 + 样式内嵌
      ↓
第 3 层 ─ 产物
  S7 CLI（validate / render）
  S8 自包含 HTML 生成
  S9 导出 PNG / JSON / HTML
      ↓
第 4 层 ─ 交互
  S10 编辑
      ↓
第 5 层 ─ Agent 接入
  S11 skill
  S12 MCP
      ↓
补 ─ 兼容
  S13 v1 adapter                ← 等 schema 冻结后再做
```

**另外有一个前置 PR**：`docs/requirements/v2-data-format.md`（schema 草案），S1 的输入。

---

## 4. 每个 PR 的范围

### 第 1 层：数据

#### 前置 `docs: v2 data format specification`

**定死 schema**，是三件东西：

1. **完整 JSON 示例**（带 style / theme / edges 的真实数据）
2. **TypeScript 类型定义**（与示例严格对应）
3. **字段级规范表**（类型、必填否、默认值、取值范围、将来怎么映射到 v1）

**为什么单独一个 PR**：S1 的实现要逐条对照它，没有规范就没法判断"做对了没有"。

---

#### S1 `feat(model): add style, theme and format to v2 data`

- 类型：`JmTone` / `JmLinePattern` / `JmTonePalette` / `JmStyle` / `JmTheme` / `JmNodeStyle` / `JmLineStyle` / `JSMIND_THEME_DEFAULT`
- `JmNode` 加 `style?: JmNodeStyle`，`JmEdge` 加 `style?: JmLineStyle`
- `JmMind` 加 `style?: JmStyle`
- `NodeCreationOptions` / `EdgeCreationOptions` 接受 `style`
- 序列化顶层加 `format` / `style`
- `SerializedNode` 加 `style`，`SerializedEdge` 加 `style`
- **只存不画** —— 渲染层完全不动

**测试**：序列化往返不丢字段；现有 13 个序列化用例必须全绿（加的是可选字段，不该破坏任何现有行为）

**验收**：一个带样式和主题的 JSON，读进来再写出去，逐字节等价

---

#### S2 `feat(serialization): validate v2 data with error codes`

- 校验器：必填字段、id 引用完整性、`tone` 是否在名单内、`theme` 引用是否可解析
- 错误带 `err.code`（与预期的 v1 guard 对齐）
- 坏数据给一句人话，不抛 `TypeError`

**测试**：每类错误一个用例，断言 `err.code`；合法数据零误报

**E2E 起点**：本 PR 建立 E2E 框架（见第 5 节）

---

### 第 2 层：渲染

#### ~~S3 `feat(view): theme system`~~ —— 已并入 S1

**原计划的四条全部由 S1（PR #9）完成：**

| 原计划 | 实际落点 |
|---|---|
| 三种引用形态的解析 | **只剩一种**：`style: { theme, ...覆盖 }`。`{ name, ... }` 与"完整定义"两种形态在评审中判定为语义含糊，已合并 |
| 深度合并 | `mergeJmTheme`，`tones` 逐字段合并，浅合并会让节点变黑底黑字，有专门回归测试 |
| 内置 `default` 主题（六色 tone） | `JSMIND_THEME_DEFAULT` |
| `resolveTheme(ref): JmTheme` | `resolveJmStyle(style?)`，产出完整 `JmTheme`，不返回半截 |

**渲染层不需要再单独做一遍主题解析。** S4 直接消费 `resolveJmStyle()` 的产出。

---

#### S4 `feat(view): apply node styles with re-measurement`

**最复杂的一个**，因为有一条连锁反应：

```
node.style.fontSize = 18
  → 节点 DOM 尺寸变化
  → measureNodeSizes 结果变化
  → arranger.calculate 布局变化
  → 连线起止点全变
```

- 应用 `theme.tones[tone]` 和 `node.style` 覆盖
- **样式变了必须重新测量**
- 三档覆盖链：`node.style` → `theme.tones[tone]` → 兜底

**测试**：改字号后，节点尺寸和布局坐标都要跟着变（不能只断言 CSS 应用了）

**风险**：如果做下来发现还是太大，拆成「先颜色边框」+「再字号粗细（涉及重测）」

---

#### S5 `feat(view): curved edges`

- 直线 → 贝塞尔曲线
- 线宽 / 虚线 / 颜色
- 线颜色默认取父节点 tone（"从警告节点长出去的分支是橙色"）

**测试**：路径数据断言 + 看图

---

#### S6 `feat(view): shadow DOM isolation and embedded styles`

- 框架启动时往容器插 shadow root
- **样式必须放进 SVG 内部的 `<style>`**（导出时只有它会随序列化走）

**测试**：宿主页面的 `div{font-size:30px}` 穿透不进来

**为什么单独一个 PR**：这是容器级架构决定，插了 shadow root 之后所有渲染都活在里面；而且与导出强耦合（样式放错位置，导出的图就是裸的）。跟样式计算混在一起，出问题时难判断是"算错了"还是"没隔离好"。

---

### 第 3 层：产物

#### S7a `feat(cli): context, validate and mind/node data commands` —— 已完成
#### S7b `feat(cli): render command` —— 待渲染层就绪

**完整设计见 `docs/requirements/v2-cli.md`。**

- CLI 骨架（参数解析、退出码三分：数据无效 / 用法错误 / IO 错误）
- `context`（agent 的发现步骤，唯一允许模糊匹配的命令）
- `validate`（调 S2）
- `render`（先输出调试信息，真正的出图在 S8 之后）
- `mind` 数据命令组：`find` / `add-child` / `add-node` / `move` / `remove-node` / `add-edge` / `remove-edge` / `edges`
  —— 对 `JmMind` 方法的薄封装，定位参数一律用 id
- `node` 数据命令组：`set-text` / `set-folded` / `set-side`
  —— 对应 `JmNode` 的可写字段（`content` / `folded` / `side`），走字段赋值不调方法

**`node set-style` 不在这个 PR** —— 它依赖 S1 的 schema 和 S4 的样式实现。

**实施时的拆分（S7a 已交付）：**

| 部分 | 状态 | 说明 |
|---|---|---|
| `validate` | ✅ | 接 S2 的校验器，四档退出码 |
| `context` | ✅ | 唯一允许模糊匹配；未命中给候选而非 not found |
| `mind` 组 | ✅ | `find` / `add-child` / `add-node` / `move` / `remove-node` / `add-edge` / `remove-edge` / `edges` |
| `node` 组 | ✅ | `set-text` / `set-folded` / `set-side` |
| `node set-style` | ⏳ | 等 S4 |
| `render` | ⏳ | 等 S4–S6；S7b 单独做 |

**为什么先做 S7a 而不是 S4：** S1+S2 把数据层做完了，CLI 是把这些能力暴露给 agent 的最短路径 —— 数据层再完整，agent 也只能靠读代码来用。渲染层（S4–S6）服务于人看图，可以后做。而且 S7a 完全不碰 DOM，纯 Node 可测。

**注意**：`convert` 命令**不在这个 PR** —— 它依赖 adapter，跟 S13 一起做

---

#### S8 `feat(build): self-contained HTML output`

- HTML 模板（数据 `<script type="application/json">` / 容器 / 内联渲染器）
- rollup 打包 → 注入模板
- **必须内联，不引用 CDN**

**测试**：生成的 HTML 用无头浏览器打开，图能画出来；断网也能打开

---

#### S9 `feat(view): export to PNG, JSON and HTML`

- 导出面板（三项）
- PNG：SVG 序列化 → **data URL**（不能用 blob）→ canvas → PNG
- HTML：**模板快照法**（渲染器动手前抓 `document.documentElement.outerHTML`）
- JSON：直接序列化

**测试**：导出的 PNG 像素扫描验证内容完整；导出的 HTML 能再次打开并再次导出

---

### 第 4 层：交互

#### S10 `feat(view): editing interactions`

- 点选 / 多选、双击改文字、拖拽移动、增删、折叠展开、撤销重做
- **必须走同一套数据 API**（与 AI 的修改路径一致）

**注意**：用户手工删除的数据，和将来 v2→v1 转换丢弃的数据是两回事，**别混在一起统计**

---

### 第 5 层：Agent 接入

#### S11 `feat: agent skill`

- skill 内容：树的语义、**怎么把对话变成结构**、增量修改规矩、什么时候调哪个命令
- **确定性的事情不许写进 skill**（格式转换、渲染、校验都在 CLI）

---

#### S12 `feat: MCP server with headless rendering`

- MCP 工具：生成 / 修改 / 渲染
- 无头 Chromium 出图（重依赖放这里，skill 保持轻）

---

### 补：兼容

#### S13 `feat(serialization): v1 adapter`

**等 schema 彻底冻结后再做。** 它是纯映射层，复杂度全在"schema 长什么样"，前期写等于拿会变的模型去写转换器。

- `v1 → v2`：嵌套转扁平、`topic` → `content`、`expanded` → `folded` **取反**、`direction` → `side`，**无损**
- `v2 → v1`：反向，`edges` / `style` 降级丢弃 + **返回损失清单**
- CLI 的 `convert` 命令一并加进来

**测试**：往返测试（v1 → v2 → v1 应完全一致）

---

## 5. 测试策略

### 每个 PR 的测试交代

推进每个 PR 时必须回答三个问题：

1. **现有用例要不要改？** 改了必须在 PR 描述里说明理由（"行为有意变了" vs "测试写得不对"）
2. **新增了什么单测？** 覆盖新增逻辑的正常路径 + 边界
3. **到 E2E 节点了吗？** 见下

### 端到端测试的落点

**E2E 不是一个 PR 做完的，是分阶段长出来的。**

| 节点 | 建成什么 | 验证什么 |
|---|---|---|
| **S2** | **E2E 框架 + 数据层用例** | 给定 JSON，序列化往返等价；坏数据被拒并给出 `err.code` |
| **S6** | **扩充到渲染层** | 给定 JSON，测量/布局/渲染产出的 DOM 结构符合预期（节点数、坐标、样式隔离） |
| **S9** | **扩充到产物层** | 给定 JSON，导出 PNG 像素完整、导出 HTML 能再次打开 |

**为什么框架放 S2 而不是更晚**：

- schema（S1）刚定，数据层已经有稳定的输入输出，**这是第一个值得做 E2E 的时刻**
- 有了框架，后面每个 PR 都能往里加用例，而不是各写各的
- **S2 正好有"坏数据要被拒绝"这个横切能力**，是最自然的第一个 E2E 场景

**为什么"完整 E2E"要等到 S6**：渲染层没做完之前，"JSON → 图"这条链是断的，E2E 只能测到序列化，不构成端到端。

### 测试的硬要求

- **几何判断用像素扫描，不问视觉模型** —— 实测视觉模型两次报"内容被截断"，像素扫描证明都是误判
- **样式是否生效，要断言尺寸/坐标，不能只断言 CSS 属性** —— 样式影响布局才是真生效
- **`arranger` 的 644 行测试不许删**，它是对的

---

## 6. 每层完成后的可验证状态

| 层 | 做完之后能干什么 |
|---|---|
| 第 1 层 | 带样式和主题的 JSON 能存能读能校验，字段不丢不坏 |
| 第 2 层 | 能看到一张**带主题配色、曲线连线、节点级样式**的图 |
| 第 3 层 | 能生成**可分享的自包含 HTML**，能导出 PNG / JSON |
| 第 4 层 | 能在浏览器里**手工改图** |
| 第 5 层 | **AI 能读写这类文件**，闭环成立 |

---

## 7. 已知的尾巴

**adapter 之后可能还有一轮 schema 调整。** 等真做 S13 时，很可能发现"这个字段当初应该那么设计"。所以 S13 做完之后，可能还需要一个**收尾 PR** 处理 schema 收敛，或者引入版本化策略（`format: "jsmind_v2"` 之外，将来要不要 `"jsmind_v2.1"`）。

现在不用决定，知道有这条尾巴就行。

---

## 8. 待办：agent skill 与产出校验机制

> **状态：未开始，等 S4 做完、CLI 命令面稳定之后再动。**
> 记在这里是因为它来自 #11 的 review 讨论，不写下来会丢。

### 8.1 要解决的问题

**「AI 不会输出异常文件」不能靠 AI 记得检查。**

写 skill 时最容易做的事是加一句「改完记得验证一下」。这没用 —— 它把正确性押在模型的自律上，而模型会跳过、会觉得自己改得对、会在上下文压缩后忘掉这条要求。

**要的是机制：AI 想跳过也跳不过，因为下一步依赖检查器的输出。**

### 8.2 三档强度

| 档 | 做法 | 为什么不够 |
|---|---|---|
| ① 弱 | skill 里写「要验证」 | 全靠自觉，压缩后可能整个忘掉 |
| ② 中 | skill 规定「产出后跑 `jsmind validate`，非 0 就回滚」 | 有明确动作，但仍靠模型执行 |
| ③ 强 | 产出本身经过会失败的检查器，不过就拿不到下一步要的东西 | 这一步才算机制 |

**目标是 ③，退而求其次 ②。**

### 8.3 jsmind 上怎么落地

CLI 已经把 ③ 需要的东西准备好了 —— **写后校验 + 逐字节回滚是命令内置的，不是 skill 要提醒的事**：

```typescript
writeJsonFile(next, target, options);
const after = validateMindData(next);
if (!after.valid) {
    restoreFile(target, previous);          // 逐字节还原
    throw dataError('Validation failed after write, rolled back: ...');
}
```

所以 skill 要做的是**别绕过它**：

- **禁止** skill 里教 AI 直接写 JSON 文件（那就绕过了校验）
- **要求**所有改动走 `jsmind mind` / `jsmind node`，让校验发生在命令内部
- 批量改动的场景，先 `jsmind validate` 探底，改完再 `jsmind validate` 复查
- `--dry-run` 用于「先看看会变成什么样」

**关键的一点**：这条跟另一条既有约束是同一个思路 ——
> 凡是结果必须确定的事情，都不许写进 skill

确定性的东西（校验、回滚、id 生成、序列化）全部下沉到 CLI；skill 只描述**意图和顺序**，不描述**如何正确**。

### 8.4 通用性

不限于 jsmind。任何「AI 产出文件」的 skill 都适用：

- 产出前：有没有一个检查器能判断结果对不对？
- 产出后：检查失败会不会**挡住**下一步，还是只是打印一行警告？
- 如果检查器不存在，**那就先做检查器，别写 skill** —— 这次 S2 的校验器就是这个检查器

### 8.5 触发时机

- S4（渲染层的样式与重测）做完
- S7b（`render`）做完，`node set-style` 补上
- 命令面稳定、不再改名之后

到那时 skill 要覆盖的完整闭环是：`context` 找 id → `mind`/`node` 改 → `validate` 查 → `render` 出图。
