# jsMind v2 开发计划

> **本文件定义 v2 的实现顺序与每个 PR 的边界。** 需求与决策见 [`docs/requirements/v2-requirements.md`](../requirements/v2-requirements.md)。

**编号说明**：本文用 **S1 ~ S14** 表示规划步骤，**与 GitHub PR 号无关**。认步骤，不认号码。

---

## 1. 规划原则

**一层一层来。** 每个 PR 只做一层的事，做完可独立验证、可独立回滚。

**依赖必须前置。** 后面的层要用到前面的产出，不允许跳层。

**测试跟着 PR 走。** 每个 PR 必须交代：现有用例有没有需要改的、新增了什么单元测试、是否到了该加端到端测试的节点。

**可以 break，但别砸资产。** v2 未发布、零存量用户，schema 和内部结构可以放心重构。但已经跑对的东西不碰：

| 对象 | 态度 | 理由 |
|---|---|---|
| v2 的 JSON 格式、类型定义 | 随便改 | 零存量 |
| **`arranger/mindmap.ts`** | **不动** | 几何是对的，644 行测试 |
| **`JmNode` 的 `folded` / `side` / `children`** | **谨慎** | 动了会波及 arranger 和 view |
| **v1 格式** | **绝对不动** | 方向性兼容的锚点 |

---

## 2. 现状盘点

| 层 | 现状 | 缺口 |
|---|---|---|
| 布局 `arranger/` | ✅ 完整（644 行测试） | 无 |
| 模型 `model/` | ✅ 完整，含 `style` / `shadow` / `folded` / `side` / `data`；observer 事件体系完整 | **`onNodeUpdated` / `onNodeMoved` 是空实现** |
| 序列化 `serialization/` | ✅ `format` / `theme` / `style` 全字段；37 个错误码 | 无 |
| 视图 `view/` | ✅ Shadow DOM、主题变量、贝塞尔连线、节点级样式、PNG 导出 | **无平移缩放、无交互事件** |
| 应用 `application/` | ✅ `JsMind` 门面 + `JmMindChangeCoordinator` + `JmCommander` | 无 |
| CLI | ✅ 14 个子命令，含 `export` | **无 `node set-style`** |
| 产物 / 编辑 / skill / MCP / v1 adapter | ❌ 未开始 | S8 / S10 / S11 / S12 / S13 |

**测试底子**：300 个单元用例 + 23 个 UI 用例。

**应用层的两条通道**（判断标准是「这个操作改不改模型」）：

```
调用方 → JmCommander → JmViewHandle → JmView      （命令：导出、将来 pan/zoom）
模型变更 → JmMindChangeCoordinator → JmView        （反应：节点增删改、将来拖拽）
```

改模型的（折叠、移动、改文字、改样式）走第二条，不改模型的（平移、缩放、导出）走第一条。

---

## 3. PR 序列

```
第 1 层 ─ 数据
  S1  schema：style / theme / format              ✅
  S2  校验 + 错误码                                ✅
      ↓
第 2 层 ─ 渲染
  S3  theme 系统（已并入 S1）                       ✅
  S4  节点样式 + 重新测量                          ⚠️ 部分完成
  S5  贝塞尔连线 + 线样式                           ✅
  S6  Shadow DOM 隔离 + 样式内嵌                    ✅
      ↓
第 3 层 ─ 产物
  S7a CLI：context, validate, mind/node, create     ✅
  S7b CLI：export                                   ✅
  S7c CLI：node set-style                          ⏳
  S8  自包含 HTML 生成                             ❌
  S9  导出 PNG / JSON / HTML                       ⚠️ PNG 完成，JSON/HTML 待做
      ↓
第 4 层 ─ 交互
  S10 编辑                                        ❌
  S14 查看器：平移 / 缩放 / 居中                    ❌
      ↓
第 5 层 ─ Agent 接入
  S11 skill                                       ❌
  S12 MCP                                         ❌
      ↓
补 ─ 兼容
  S13 v1 adapter                                  ❌
```

---

## 4. 每个 PR 的范围

### 第 1 层：数据

#### S1 `feat(model): add style, theme and format to v2 data` ✅

类型定义、`JmNode.style` / `JmEdge.style`、`JmMind.style`、`format` 字段、`SerializedNode` / `SerializedEdge` 加 `style`。**只存不画**。`JSMIND_THEME_DEFAULT` 内置唯一预设。

#### S2 `feat(serialization): validate v2 data with error codes` ✅

校验器 37 个错误码、`validateMindData`、E2E 框架建立。

### 第 2 层：渲染

#### ~~S3 `feat(view): theme system`~~ → 已并入 S1 ✅

#### S4 `feat(view): apply node styles with re-measurement` ⚠️ 部分完成

**最复杂的一个**——连锁反应：`node.style.fontSize = 18` → 尺寸变化 → 测量变化 → 布局变化 → 连线全变。

- 应用 `theme.tones[tone]` 和 `node.style` 覆盖 ✅
- 三档覆盖链：`node.style` → `theme.tones[tone]` → 兜底 ✅

> **当前缺口**：改样式不会触发重新测量。`node.style = {...}` 发出的 `onNodeUpdated` 事件，coordinator 只打了一行 debug 日志。所以打开一张带样式的图是对的，运行时改样式则毫无反应。修法在 S10 的前置任务里。

#### S5 `feat(view): curved edges` ✅

直线 → 贝塞尔曲线。线宽 / 虚线 / 颜色全部落到 theme。`JmLineCurve`（`Straight` / `Bezier`）与 `JmLinePattern`（`Solid` / `Dashed` / `Dotted`）正交。线颜色取**子节点**的 tone。控制点两端都落在水平中点，弯曲对称。

#### S6 `feat(view): shadow DOM isolation and embedded styles` ✅

框架启动时往容器插 shadow root。结构性样式（`JSMIND_VIEW_STYLES`）与外观样式分开。主题值通过 CSS 自定义属性写入 `:host`，每节点 tone 写入元素本身，继承链自动处理。

### 第 3 层：产物

#### S7a `feat(cli): context, validate and mind/node data commands` ✅

CLI 骨架、`context`（唯一允许模糊匹配）、`validate`、`mind` 命令组（`find` / `add-child` / `add-node` / `move` / `remove-node` / `add-edge` / `remove-edge` / `edges`）、`node` 命令组（`set-text` / `set-folded` / `set-side`）、`create`。

#### S7b `feat(cli): export command` ✅

`jsmind export <file> <out.png>`。通过无头 Chromium + CDP 协议驱动渲染，走公开的 `jsMind.exportImage()` API。支持 `--width` / `--height` / `--scale` / `--type`（png/jpeg/webp），CI 的 PR 预览图就是同一条路径产出。

#### S7c `feat(cli): node set-style` ⏳

少了它，agent 想改节点颜色只有一条路：整个 JSON 读出来、改内存、整个写回去——绕过 `write → validate → rollback` 的粒度。有了 `set-style`，改样式和改文字走同一条安全路径。

**前置**：`onNodeUpdated` 必须接通。

#### S8 `feat(build): self-contained HTML output` ❌

#### S9 `feat(view): export to PNG, JSON and HTML` ⚠️

- **PNG 已完成**：`jsMind.exportImage()` + `jsmind export`。SVG 序列化 → data URL → canvas → PNG
- 尚未开始：导出面板 UI、HTML 快照、JSON 入口

### 第 4 层：交互

#### S10 `feat(view): editing interactions` ❌

点选 / 多选、双击改文字、拖拽移动、增删、折叠展开、撤销重做。**必须走同一套数据 API**。

**前置**：`onNodeUpdated` 和 `onNodeMoved` 目前是空实现。

#### S14 `feat(view): pan, zoom and centring` ❌

走 Commander 通道。`JmViewHandle` 已预留 `pan` / `zoom` / `centerOn(nodeId)` / `getViewport()`。

---

## 5. 测试策略

### 端到端测试

| 节点 | 建成什么 | 验证什么 |
|---|---|---|
| **S2** | E2E 框架 + 数据层用例 | 给定 JSON，序列化往返等价；坏数据被拒 |
| **S6** | 扩充到渲染层 | 给定 JSON，测量/布局/渲染产出正确 |
| **S9** | 扩充到产物层 | CLI 写出文件 → API 读回 → 结构一致 |

`__tests__/e2e/cli-workflow.test.ts` 走真实子进程，从零建 21 节点图再用 API 读回。验两件事：CLI 写出的文件 API 能读；退出码跨进程边界成立。

### 测试硬要求

- **几何判断用像素扫描，不问视觉模型**
- **样式是否生效，要断言尺寸/坐标，不能只断言 CSS 属性**
- **`arranger` 的 644 行测试不许删**

---

## 6. 每层完成后的可验证状态

| 层 | 做完之后能干什么 |
|---|---|
| 第 1 层 | 带样式和主题的 JSON 能存能读能校验 |
| 第 2 层 | 看到一张带主题配色、曲线连线、节点级样式的图 |
| 第 3 层 | 能生成自包含 HTML，能导出 PNG / JSON |
| 第 4 层 | 能在浏览器里手工改图 |
| 第 5 层 | AI 能读写这类文件，闭环成立 |

---

## 7. 已知的尾巴

### 7.1 schema 可能还要再收一轮

adapter 之后可能还有调整。S13 做完后可能需要收尾 PR 处理 schema 收敛。

### 7.2 Canvas 面积上限

PNG 导出必须经过 canvas 转码，canvas 有面积上限。Chromium 实测 16000×12000 通过，20000×15000 失败（`toBlob` 返回 null）。阈值约 268M px²（16384²）。当前行为是失败不报残缺图。真要巨型脑图需分块渲染或输出 SVG。

### 7.3 未实现的功能（从 v1 遗留）

以下功能在 v1 中存在但 v2 尚未实现。其中一部分属于规划中的后续 PR，一部分已明确不做：

| 功能 | 状态 | 说明 |
|---|---|---|
| 展开/折叠（`expand_node` / `collapse_node` / `toggle_node`） | ❌ | S10 做 |
| 批量折叠（`expand_all` / `collapse_all` / `expand_to_depth`） | ❌ | S10 做 |
| 同级节点导航（`find_node_before` / `find_node_after`） | ❌ | 低优先级 |
| `select_node` / `get_selected_node` / `select_clear` | ❌ | S10 做 |
| `begin_edit` / `end_edit` | ❌ | S10 做 |
| 快捷键系统 | ❌ | 低优先级，S10 之后 |
| 插件系统 | ❌ | 低优先级 |
| `node_array` 和 `text` 数据格式 | ❌ | 不做——需求文档已明确树用嵌套、盘用扁平表 |
| Canvas 渲染引擎 | ❌ | 不做——需求文档明确选 SVG |
| v1 的 `set_node_color` / `set_node_font_style` | ❌ | 由 `node.style` + `set-style` 覆盖 |
| `jsMind.show(options, mind)` 静态方法 | ❌ | 不做——v2 用 `create(container)` + `open(mind)` |

### 7.4 自定义节点渲染（低优先级）

留了一个口子让使用者接管「往框里画什么」（特殊标记解析、图表、框架渲染）。接口设计已想清楚：`JmNodeRenderer` 返回 Promise + cleanup 函数。前置是 `onNodeUpdated` 接通，实际起点在 S10 之后。

---

## 8. Agent skill 与产出校验

**「AI 不会输出异常文件」不能靠 AI 记得检查。** 要机制，不要提醒。

CLI 已准备好：写后校验 + 逐字节回滚是命令内置的（`write → validate → rollback`）。skill 要做的是别绕过它：禁止教 AI 直接写 JSON 文件，所有改动走 `jsmind mind` / `jsmind node`，批量改动先 `validate` 探底、改完复查。

skill 要覆盖的闭环：`context` 找 id → `mind`/`node` 改 → `validate` 查 → `export` 出图。

---

## 9. 待定项

| 项 | 当前倾向 |
|---|---|
| `format` 的确切值 | `"jsmind_v2"` |
| `edge.type` 的取值名单 | 先开放为任意字符串 |
| 是否支持 `content.type` 的其他值 | 第一版只 `text` |
| skill 分几个 | 一个主 skill |
| 出图能力放 skill 还是 MCP | MCP 干重活、skill 干轻活 |