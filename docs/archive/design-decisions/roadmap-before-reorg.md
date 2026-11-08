# 归档：重组前的 roadmap 全文

> **这是 2026-11 文档重组之前的 roadmap 完整版本，已不再维护。**
>
> **新版在 [`development/roadmap.md`](../development/roadmap.md)** —— 结构更清楚，
> 按技术层次组织，删掉了大量已经完成的 S 项细节。
>
> **留在这里的是新版为了可读性删掉的具体内容：**
>
> - **现状盘点表**里的具体类名与状态（`JmCoordination`、`onNodeRemoved` 等）
> - **第 8.3 节**写后校验 + 逐字节回滚的完整 TypeScript 代码块
>   （`writeJsonFile` / `validateMindData` / `restoreFile` / `dataError`）
> - **第 2 层渲染**那张「原计划 vs 实际落点」对照表 ——
>   记录了三处方案变更：三种引用形态合并成一种、`mergeJmTheme` 深合并的
>   原因（浅合并会让节点黑底黑字）、`resolveTheme` 改成 `resolveJmStyle`
> - 每个 S 项的实现细节、测试交代
>
> **改 CI 或 CLI 写文件逻辑之前，读第 8.3 节那个代码块。**
> **想知道某个 S 项当初为什么那么设计，来这里对。**

---

# jsMind v2 开发计划

> **本文件定义 v2 的实现顺序与每个 PR 的边界。** 需求与决策见 [`docs/requirements/v2-requirements.md`](../requirements/v2-requirements.md)。
>
> **状态**：规划中，PR 逐个推进。
>
> **先看 [`milestones.md`](milestones.md) 决定做什么，本文决定怎么做。**
> milestones 按受益者排优先级（Agent → 用户 → 功能丰富）并给出验收标准；
> 本文按技术层次组织，存的是每一层怎么实现、有哪些已知的坑。
> 两者的编号对照见 milestones 附录 A。

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
| 模型 `model/` | ✅ 完整，含 `style` / `folded` / `side` / `data`；`onNodeAdded` / `onNodeRemoved` 已接通 | **`onNodeUpdated` / `onNodeMoved` 是空实现** |
| 序列化 `serialization/` | ✅ `format` / `theme` / `style` 全字段；37 个错误码 | 无 |
| 视图 `view/` | ✅ Shadow DOM、主题变量、贝塞尔连线、节点级样式、PNG 导出 | **无平移缩放、无交互事件** |
| 应用 `application/` | ✅ `JsMind` 门面 + `JmCoordination` + `JmCommander` | 无 |
| CLI | ✅ 13 个子命令，含 `export` | **无 `set-style`** |
| 产物 / 编辑 / skill / MCP / v1 adapter | ❌ 未开始 | S8 / S10 / S11 / S12 / S13 |

**测试底子**：300 个单元用例 + 23 个 UI 用例，覆盖率 95.3%。

**应用层的两条通道**（这两条决定了新功能该挂在哪，容易搞反）：

```
调用方 → JmCommander → JmViewHandle → JmView      （命令：导出、将来 pan/zoom）
模型变更 → JmCoordination → JmView                （反应：节点增删改、将来拖拽）
```

**判断标准是「这个操作改不改模型」**：改模型的（折叠、移动、改文字、改样式）必须走第二条，因为数据是真相、视图是投影；不改模型的（平移、缩放、导出）才走第一条。把模型变更塞进 Commander 会产生第二条修改入口，和 AI 走 CLI 的路径分叉。

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
  S7 CLI（validate / export）
  S8 自包含 HTML 生成
  S9 导出 PNG / JSON / HTML
      ↓
第 4 层 ─ 交互
  S10 编辑
  S14 查看器：平移 / 缩放 / 居中
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

#### S4 `feat(view): apply node styles with re-measurement` —— ⚠️ 部分完成

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


> **当前缺口**：样式能应用、能测量、能画出来。但**改样式不会触发重新测量** ——
> `node.style = {...}` 会发出 `onNodeUpdated` 事件，而 coordinator 拿到之后只打了一行
> debug 日志。所以打开一张带样式的图是对的，运行时改样式则毫无反应。
>
> 验收标准「样式变了必须重新测量」里的后半句没达成。修法在 S10 的前置任务里。

---

#### S5 `feat(view): curved edges`

- 直线 → 贝塞尔曲线
- 线宽 / 虚线 / 颜色，全部落到 theme
- 线颜色取**子节点**的 tone

  > 原计划写的是「取父节点 tone」，实现时核对 v1 源码后发现是错的：
  > v1 的 `show_lines` 取的是子节点的 `data["leading-line-color"]`。
  > 数据结构也早已如此——`incoming` 挂在子节点上，一条线只对应一个子节点。

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
#### S7b `feat(cli): export command` —— 已完成（原名 render）

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
| `create` | ✅ | 从零建图；拒绝覆盖已存在文件 |
| `node set-style` | ⏳ | 等 S4 |
| `render` | ⏳ | 等 S4–S6；S7b 单独做 |

**闭环缺口（S7a 之后）：** 数据层面的闭环在加上 `create` 后成立 ——
`create` → `context` 找 id → `mind`/`node` 改 → `validate` 查。
但「agent 改完的图要给人看」这一步还缺，在 S7b 的 `render`。
**入口有了、出口还没有。**

**为什么先做 S7a 而不是 S4：** S1+S2 把数据层做完了，CLI 是把这些能力暴露给 agent 的最短路径 —— 数据层再完整，agent 也只能靠读代码来用。渲染层（S4–S6）服务于人看图，可以后做。而且 S7a 完全不碰 DOM，纯 Node 可测。

**注意**：`convert` 命令**不在这个 PR** —— 它依赖 adapter，跟 S13 一起做

---

#### S7c `feat(cli): node set-style` —— 未开始

现有的节点子命令是 `set-text` / `set-folded` / `set-side`，**独缺 `set-style`**。

这不是补一个便利命令那么简单。少了它，agent 想改一个节点的颜色就只有一条路：把整个 JSON 读出来、改内存、整个写回去。而"整个写回去"会绕过 `write → validate → rollback` 那条链的粒度 —— 校验能拦，但一旦失败回滚的是整个文件，不是刚才那一步。

有了 `set-style`，改样式和改文字走的是同一条安全路径。

**前置**：`onNodeUpdated` 必须接通（见 S10 的前置说明）。命令能改数据，但图不会重画。

**参数**：`--node-id <id>`，样式字段复用 `JmNodeStyle`（`fill` / `text` / `border` / `radius` / `font` 等），`--reset` 清除节点级样式回落到主题。

**测试**：设置后序列化结果里出现该字段；`--reset` 之后字段消失而不是置为默认值（两者序列化结果不同）；校验失败时文件逐字节还原。

---

#### S8 `feat(build): self-contained HTML output`

- HTML 模板（数据 `<script type="application/json">` / 容器 / 内联渲染器）
- rollup 打包 → 注入模板
- **必须内联，不引用 CDN**

**测试**：生成的 HTML 用无头浏览器打开，图能画出来；断网也能打开

---

#### S9 `feat(view): export to PNG, JSON and HTML`

- **PNG 已完成**：`jsMind.exportImage()` + `jsmind export`，见 `docs/features/image-export.md`
  - SVG 序列化 → **data URL**（blob 会污染 canvas）→ canvas → PNG，与本节原计划一致
  - 尺寸取内容尺寸：小于视口保留空白，大于视口撑开不裁
  - 出图需要 Chromium，CLI 侧封装在 `src/cli/browser.ts`
- **已实现但未记录**：`--type jpeg|webp` 与 `quality`（0–1），仅对这两个有损格式生效
- 尚未开始：导出面板 UI、HTML 快照、JSON 入口（JSON 已有 `serialize()`，缺的是面板）
- HTML：**模板快照法**（渲染器动手前抓 `document.documentElement.outerHTML`）

**测试**：PNG 走 UI 测试，校验容器魔数（真的是 PNG）、尺寸等于内容尺寸 × scale、小视口不裁、格式切换生效；HTML 能再次打开并再次导出（待做）

---

### 第 4 层：交互

#### S10 `feat(view): editing interactions`

- 点选 / 多选、双击改文字、拖拽移动、增删、折叠展开、撤销重做
- **必须走同一套数据 API**（与 AI 的修改路径一致）

**注意**：用户手工删除的数据，和将来 v2→v1 转换丢弃的数据是两回事，**别混在一起统计**

**前置**：`onNodeUpdated` 和 `onNodeMoved` 目前是空实现（只有 debug 日志）。折叠、拖拽、改文字都依赖它们把模型变更推回视图。这是 S10 的第一个任务，不是它的收尾。

---

#### S14 `feat(view): pan, zoom and centring`

- 平移、缩放（滚轮 / 手势 / 按钮）、居中到指定节点、读取当前视口
- **走 Commander 通道**，不走模型：这些操作不改变任何节点，只改变观察方式
- `JmViewHandle` 的注释里已经预留了形状：`pan` / `zoom` / `centerOn(nodeId)` / `getViewport()`

**为什么单独列，不并进 S10**：S10 是编辑，改的是模型；这里是查看，改的是视口。两者的数据路径不同（一条走 Coordination，一条走 Commander），混在一个 S 里会诱导把 pan/zoom 也做成模型操作。

**测试**：缩放后节点屏幕坐标按比例变化；平移不改变节点逻辑坐标；`centerOn` 之后目标节点落在视口中心（断言坐标，不断言 CSS）。

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

### E2E：CLI 与 API 的一致性

`__tests__/e2e/cli-workflow.test.ts` 走真实子进程，从零建一张 21 节点的图，再用公开 API
读回来验证结构。**它验的不是命令各自对不对（那些有单元测试），是两件事：**

1. **CLI 写出来的文件，API 能不能按预期读回来。** 两边各有一套对数据形状的理解，
   任何一边漂了，单元测试都发现不了 —— 它们各自用自己的假设。
2. **退出码跨进程边界是否成立。** 函数级测试断言返回值，这里断言真实的 `process.exit`。

**为什么不用 `dist/`**：CI 里 test 跑在 build 之前，依赖产物就得改流水线顺序。项目开了
`erasableSyntaxOnly`，Node 能直接跑 `.ts`，所以测试 spawn 的是源码 —— 附带好处是比 `tsx`
快四倍（348ms vs 1400ms 每次启动）。

**代价**：整套约 30 次进程启动，这个文件自己占约 12 秒。慢，但这是真集成测试的价格。

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

### 7.1 schema 可能还要再收一轮

**adapter 之后可能还有一轮 schema 调整。** 等真做 S13 时，很可能发现"这个字段当初应该那么设计"。所以 S13 做完之后，可能还需要一个**收尾 PR** 处理 schema 收敛，或者引入版本化策略（`format: "jsmind_v2"` 之外，将来要不要 `"jsmind_v2.1"`）。

现在不用决定，知道有这条尾巴就行。

### 7.2 Canvas 面积上限决定导出尺寸的天花板

**这是填在中间的 canvas 带来的硬限制，不是实现缺陷。** PNG 导出必须经过 canvas 转码（DOM 没有直接出像素的接口），而 canvas 有面积上限：超过之后整个 canvas 不可用，绘制命令不生效，`toBlob` 返回 `null`。

本机实测（Chromium）：

| 输出尺寸 | 面积 | 结果 |
|---|---|---|
| 16000 × 12000 | 192M px² | 成功 |
| 20000 × 15000 | 300M px² | `toBlob` 返回 null，抛错，exit 3 |

阈值落在两者之间，与 Chrome 的 268,435,456 px²（16384²）对得上。**别的引擎不同，而且会随硬件变**：MDN 只说"多数情况超过 10000×10000"，iOS 只有 4096×4096。

**现在的行为是失败，不是出残缺图**，这点比预想的好。但有两个问题：

- **报错没有指向性** —— 用户看到的是 `Failed to encode the image as image/png`，看不出真正原因是"图太大"。应该在上限之前先算出输出像素数，超了就直接说"内容 20000×15000 超过浏览器 canvas 上限，请降低 scale 或拆分"。
- **大图极慢** —— 16000×12000 那一档单次要几十秒，期间没有任何进度反馈。

**真要支持巨型脑图，canvas 这条路走不通**，得换思路：分块渲染再拼接（每块单独 canvas，最后合成），或者输出 SVG（无面积限制，但消费方要能打开 SVG）。这两条都不属于当前的 S9。

现在不做。等出现真实的巨型脑图需求再决定 —— 先用清醒的方式失败，比现在含糊地失败要好。

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
- S7b（`export`）已完成；S7c（`node set-style`）补上
- 命令面稳定、不再改名之后

到那时 skill 要覆盖的完整闭环是：`context` 找 id → `mind`/`node` 改 → `validate` 查 → `render` 出图。

---

## 9. 待办：自定义节点渲染（低优先级，定位为高级插件）

> **状态：不做，先记下来。** 记的原因不是忘了，是这件事已经分析清楚了，
> 不写下来下次要从头再想一遍。

### 9.1 需求

节点内容默认按纯文本渲染。希望留一个口子，让使用者接管「往框里画什么」：

- 基于文本做特殊标记解析（`# 标题`、`**强调**`、代码块、图标）
- 换成图表、进度条、头像之类的东西
- 用 React / Vue / Svelte 渲染

画完之后再测量尺寸、参与布局，和其他节点一样。

### 9.2 为什么现在不做

**它服务的是视觉定制，不是核心价值。** 这个项目的核心命题是「agent 能可靠地读、改、校验这张图」，对应 S10 / S11 / S12。自定义渲染服务的是「人希望它长得更像自己的东西」，在 S8 / S10 / S11 / S12 面前排不进优先级。

而且它一旦做进来，就得承诺维护一条「任意第三方框架都能接进来」的兼容面，成本和收益不成比例。作为插件单独发更合适。

### 9.3 已经想清楚的部分（动手时别重新踩）

**异步不是问题，地基已经在了。** `createAndMeasure` 本来就是 `Promise<JmSize>`，`measureNodeSizes` 用 `Promise.all` 并行，所以「渲染器返回 Promise」天然被支持，不需要改造测量链。

**接口该是这个形状：**

```ts
export type JmNodeRenderer = (
    context: JmNodeRenderContext
) => JmNodeRenderCleanup | Promise<JmNodeRenderCleanup>;

export type JmNodeRenderCleanup = (() => void) | void;

export interface JmNodeRenderContext {
    readonly element: HTMLElement;   // 画在这里，已挂载进文档
    readonly node: Readonly<JmNode>;
    readonly text: string;
}
```

**为什么必须由调用方返回 Promise / 清理函数**：只有调用方知道什么时候算画完。框架一多，靠 `setTimeout` 或轮询 DOM 都是自己骗自己。

**四个会出错的点：**

1. **渲染器调用点必须挪到「临时挂载之后、测量之前」。** 现在 `_createNodeElement` 是先画内容、再由 `measureElement` 临时挂载去测。`getBoundingClientRect()` 对脱离文档的元素返回全 0，所以渲染器在旧位置被调用时，内容再复杂也量不对。

2. **React 的 `render()` 不返回 Promise。** 它是并发调度，返回时 DOM 往往是空的。使用者必须用 `flushSync` 包住，或者自己造一个 Promise 在 `useEffect` 里 resolve。这条要写在文档里，不能指望对方想明白。

3. **尺寸缓存会吞掉重画。** `createAndMeasure` 现在开头是「元素存在就返回 `cachedRect`」，连内容都不重新画。所以文本一改，自定义内容和尺寸全是旧的 —— 见下面的依赖。

4. **清理函数不能省。** 每个节点一个 React root，节点删除时不 unmount 就泄漏。纯 DOM 渲染可以不返回，框架渲染必须返回。

**顺带要决定的一件事**：默认渲染器现在是 `element.innerHTML = node.content.getText()`，文本里带 `<img onerror=...>` 会执行。做这个功能时应该一起换成 `textContent`，但 v1 是 `innerHTML`，改了是不兼容变更，得单独评估。

### 9.4 依赖

**前置是 `onNodeUpdated` 接通。** 不补那个洞，这个功能只能静态看图，改一个字内容就不刷新。所以它的实际起点在 S10 之后，这也是它优先级低的原因之一 —— 挡在前面的本来就是更基础的事。
