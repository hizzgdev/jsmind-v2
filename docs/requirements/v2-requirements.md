# jsMind v2 需求文档

> **本文件定义 v2 的目标与功能边界。** 技术实现细节见 `docs/architecture/` 与 `docs/features/`。
>
> **状态标记**：✅ 已决定 ｜ ⬜ 待决定 ｜ ❌ 已否决（附理由）

---

## 1. 定位

### 1.1 一句话

**给 AI Agent 用的思维导图内核** —— 让 AI 能可靠地生成和修改结构化的脑图数据，让人能看见它、能改它，两边共用同一份数据。

### 1.2 明确不做

- ❌ **不做"更好的全功能脑图编辑器"** —— 跟成熟竞品正面拼功能清单，人力上必输
- ❌ **不做自有长期云存储** —— 内容审核与政策风险会吞掉全部业余精力
- ❌ **不做在线服务**（含在线渲染页、在线打开器）—— 本地能做的事，不做成服务
- ❌ **不追竞品功能清单** —— 主题堆砌、富内容、协同光标这类，不列入范围
- ❌ **不在手机端做复杂编辑** —— 手势拖拽调层级在手机上天然反人性

### 1.3 配合对象

**必然是 AI Agent 产品，不是 ChatGPT / Gemini 这类聊天产品。**

理由：在别人的聊天产品里，我们连渲染权都不在自己手上 —— 无法嵌入视图、无法挂工具。只有宿主是 Agent 时，这个组件才能作为它的一块能力存在。

**推论：没有 agent 的人不是目标用户。** 他们能看图（PNG），但改不了。这是可接受的取舍。

---

## 2. 目标

1. **AI 能进能出** —— Agent 能生成一棵树、增量修改、存下来、再读回来继续改
2. **人看得见** —— 拿到一张图（发聊天、发文章、发给别人）
3. **人改得动** —— 能打开、能编辑、能存回，且**跟 AI 改的是同一份数据**
4. **老用户不受伤** —— v1 老用户拿到新东西不会崩、不会困惑
5. **自己能扩散** —— 文件传出去，接收方被引导去装 skill，每一份分享都是一次曝光

---

## 3. 使用者与场景

### 3.1 核心链路

```
用户研究某件事 → 形成想法
      ↓
让 AI 生成思维导图结构
      ↓
先给一张图片          ← 手机上看图最顺
      ↓
想改？
  ├─ 跟 AI 说（自然语言）      ← 手机上的主路径
  └─ 到电脑上打开网页改        ← 需要精细调整时
      ↓
改完导回 AI，继续迭代
      ↓
最终产物：文章 / 图片 / 分享给别人的东西
```

**关键认知：脑图是中间层，不是最终产品。** 最终产物往往是文章、汇报、分享物 —— 这决定了 v2 不该把自己做成"终点"。

### 3.2 分设备约束

| 设备 | 能做 | 不能做 |
|---|---|---|
| 手机 | 看图、跟 AI 说需求 | 打开本地 HTML、点链接改图、精细编辑 |
| 电脑 | 打开网页编辑、存文件、导出 | —— |

**推论**：手机上给图片；要改时引导到电脑。不要在手机上承诺编辑能力。

### 3.3 分发机制：文件即入口

**这是整个方案里最有价值的一块。** 它比"发布一个库等人来集成"强得多 —— 库的推广要靠开发者主动找上门，而那些人早被竞品截走了。

```
A 用 agent 生成 → 得到 PNG + 自包含 HTML
                        ↓
                   分享给别人
                        ↓
              B 双击 HTML → 看到图
                        ↓
       页面里引导："想用 AI 大改？装这个 skill"
                        ↓
              B 装了 skill → B 也成了传播者
```

- 分享物**自包含**，接收方零安装、零配置就能看
- 页面里嵌**引导安装 skill** 的说明
- **skill 让接收方的 agent 也能读写这类文件**，链条继续

**已知缺口**：这个机制解决**扩散**，没有解决**"为什么用它而不是竞品"**。后者只能靠做出来、真用起来才知道。

---

## 4. 功能需求

### 4.1 数据层（给 Agent）✅

- **结构化读写树**：创建、读取、修改节点层级与文本
- **增量修改**：只改一个节点，不重建整棵树
- **序列化 / 反序列化**：存文件、读回来，字段不丢
- **校验**：读入坏数据时给可理解的错误，而不是崩
- **与 v1 格式互通**（见 4.4）

**图的模型**：父子关系用**树**表达（`node.parent` / `node.children`），`edges` 只装树之外的额外关系。
设计理由与取舍见 [`docs/architecture/hybrid-edge-system.md`](architecture/hybrid-edge-system.md)。

> 补充三条该文档未覆盖的论点：
> 1. **兄弟节点有序** —— edge 列表没有"顺序"概念，要用就得给 edge 加 `order` 字段，排序逻辑从数据结构下沉到代码
> 2. **Agent 生成难度** —— 图模型要求 LLM 自己分配并引用 id、保证无孤儿无环，出错面积远大于"嵌套即结构"
> 3. **体积成本** —— 父 + 3 子，树约 20 字节，图约 200 字节（每个 edge 都带 id/source/target/type），差 5–10 倍

### 4.2 产物形态 ✅

**三种产物，三种用途：**

| 产物 | 给谁 | 用途 | 优先级 |
|---|---|---|---|
| **自包含 HTML**（内嵌 JSON + 渲染器） | 别人（分享） | 双击即看 + 轻改 + 导出图片 + 引导装 skill | **默认产出** |
| **纯 JSON** | 高级用户 / 真相源 | agent 读写、git 管版本、跨工具传输 | 导出给高级用户 |
| **PNG** | 所有人 | 快速看、发文章、发群 | **唯一对外导出的图片形态** |

**为什么默认产 HTML 而不是 JSON**：纯 JSON 双击是文本，自包含 HTML 双击就是图 —— **零摩擦，这个差别在分发上是生死的差别**。

#### 自包含 HTML 长什么样

一份完整产物是这样的（渲染器部分做了简化）：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>我的思维导图</title>
</head>
<body>

  <!-- ① 数据：JSON 原样躺在 script 标签里 -->
  <script type="application/json" id="jsmind-data">
  {
    "meta": { "name": "我的思维导图", "version": "2.0" },
    "format": "jsmind_v2",
    "theme": "default",
    "root": {
      "id": "root",
      "content": { "type": "text", "value": "中心主题" },
      "children": [
        { "id": "n1", "content": { "type": "text", "value": "分支一" } },
        { "id": "n2", "content": { "type": "text", "value": "分支二" } }
      ]
    },
    "edges": []
  }
  </script>

  <!-- ② 容器：渲染器往这里插 shadow root，画出来的东西全在隔离环境里 -->
  <div id="jsmind-container"></div>

  <!-- ③ 渲染器：打包后的代码整段内联（约 50 KB） -->
  <script>
  (function(){ /* rollup 打包产物 */ })();
  </script>

</body>
</html>
```

**三个部分各自的角色：**

| 部分 | 谁用 | 怎么用 |
|---|---|---|
| ① `<script type="application/json">` | **agent / 人 / 工具** | 纯文本，任何工具都能读；agent 用 `read_file` 或 HTML 解析就能拿到整个结构 |
| ② `<div id="jsmind-container">` | 渲染器 | 挂载点，隔离由它内部的 shadow root 提供 |
| ③ 内联 `<script>` | 浏览器 | 打开时执行，读 ① 的数据、画进 ② |

**关键在 ① 的写法**：数据是 **JSON 文本**，不是 `window.__DATA__ = {...}` 这样的 JS 代码。区别是：

- **JSON 文本** → agent **静态读取**即可，不需要执行 JS
- **JS 赋值** → 必须跑一遍脚本才能拿到数据

**这条直接决定「agent 能不能读回这个文件」。**

#### 渲染器内部为什么用 SVG

打开 HTML 后，渲染器把 ① 里的 JSON 变成图。**画图用什么技术？** 三个候选：

| 方案 | 问题 |
|---|---|
| **Canvas** | 光栅化后缩放糊；文字排版要自己量；v2 明确不支持 canvas（性能没有明显优势） |
| **HTML 绝对定位** | 连线要靠 CSS 画，贝塞尔曲线几乎没法做 |
| **SVG** | 矢量、缩放不糊、贝塞尔路径天然支持、便于光栅化成图片 |

**选 SVG。** 但要同时定死它的定位：

> **SVG 只是渲染期间的内部载体，不对外导出。** 用户看不到也拿不到 SVG 文件 —— 内部怎么画是渲染器自己的事。对外只有 PNG。

**为什么不做独立 SVG 导出**：静态 SVG 里装 HTML 节点（`foreignObject`）是「盒子尺寸冻结、文字是活的」—— 换台机器字体不同，文字就溢出盒子。运行时生成的 SVG 没这个问题（测量和渲染在同一浏览器、同一时刻），但它一旦序列化成文件，就退化成前一种了。

#### 渲染器必须内联

**体积代价可以忽略** —— v1 打包后 50 KB（gzip 14 KB），比一张 3 倍图 PNG 的 268 KB 还小。换来的是断网、企业内网、邮件客户端里都能打开。

引用 `unpkg` / `jsdelivr` 之类的链接，等于把「本地能渲染」这个核心价值交出去 —— 那和已否决的在线打开页是同一件事的另一种写法。

**内联是构建时的事，不是手工拷代码。** 打包产物套进 HTML 模板，以后每次生成只换 ① 那一段 JSON。

#### 另外两条技术要求

1. **HTML ↔ JSON 必须双向可转** —— 否则会分叉（HTML 里改了两笔，手上还有旧 JSON）
2. **`.html` 附件的分发障碍要记住** —— 有安全顾虑、邮件系统常拦、即时通讯工具可能限制。所以 HTML 适合发给信任的人，**纯 JSON 适合跨系统传输**

**可选兜底：`opener.html`** —— 下载一次的本地网页，把 `.json` 拖进去就能看。**只服务「手上只有 JSON、又没有 agent」的人，不是主路径。**

### 4.3 人的编辑与导出 ✅

**最小交互集**（够用即可，不求完整）：点选 / 多选、双击改文字、拖拽移动、增删、折叠展开、撤销重做。

**核心架构原则**：**人的修改和 AI 的修改必须走同一套数据 API。** 否则两条路径各自演化、互相不认识，数据会分叉。

#### 改完之后：三种导出

| 导出 | 给谁 | 说明 |
|---|---|---|
| **PNG** | 发群 / 发文章 / 给人快速看 | 图片，AI 读不了结构 |
| **纯 JSON** | **导回 AI 继续迭代** / 版本管理 | agent 直接读，改结构 |
| **自包含 HTML** | **再分享给别人** | 更新后的可打开文件 |

**导回 AI 用 JSON，不用 PNG 或 HTML** —— 后两者对 agent 都是噪音。

**「导出自包含 HTML」让分发形成真正的闭环：**

```
收到 HTML → 打开改 → 导出新 HTML → 再分享
              ↑ 不依赖 AI，也不依赖命令行
```

**没有这一步，改完的文件就「断」在一台电脑上，想给别人只能回头找 AI 重新生成。**

#### 导出自包含 HTML 怎么实现

**核心限制：在 `file://` 打开的页面里读不到自己** —— `fetch(location.href)` 和 `XHR` 都被同源策略挡死，不能「读自己再重写」。

**做法是初始化时拍快照：**

```js
// ① 页面里第一个执行的脚本，在渲染器动手之前抓原始 DOM
const TEMPLATE = document.documentElement.outerHTML;

// ② 导出时：换掉数据块，重新序列化
function exportHTML(currentData) {
    const doc = new DOMParser().parseFromString(TEMPLATE, 'text/html');
    doc.getElementById('jsmind-data').textContent = JSON.stringify(currentData, null, 2);
    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}
```

**实现约束：**

- **快照必须在渲染器插入 shadow root、改动 DOM 之前抓** —— 否则快照里混进渲染后的残留结构。放在第一个 `<script>` 里，或用 `DOMContentLoaded` 之前的同步脚本
- **替换点靠固定 id**（`id="jsmind-data"`），不能靠字段猜
- **导出的文件大小跟原始文件基本一致**（模板 + 新数据，数据只占几 KB）

**文件名规则**：浏览器不允许覆盖原文件，导出必然是新文件。用**时间戳后缀**（`思维导图-20261104-1730.html`）—— 导出动作本身就是「存档」，天然形成版本链，用户不用纠结重名。

**连带的好处**：文件系统就是版本系统。每次导出都是完整的可打开文件，不依赖任何外部状态，也不需要我们做版本管理。

### 4.4 与 v1 兼容 ✅

**先澄清一个最容易误解的点：`v1 ⊂ v2` 说的是「能力」，不是「数据结构」。**

**两边的数据格式完全不同，不能直接互通：**

| | v1 | v2 |
|---|---|---|
| 树的形状 | **嵌套**（`children` 里套完整节点对象） | **扁平**（`nodes` 数组 + `parent` / `children` 存 id 引用） |
| 文本 | `topic: "文字"` | `content: { type: "text", value: "文字" }` |
| 折叠 | `expanded: true/false` | `folded: false/true`（**语义相反**） |
| 左右分布 | `direction: "left"/"right"` | `side: "left"/"right"` |
| 额外关系 | 无 | `edges` 数组 |
| 节点样式 | 无（靠外部 CSS 类） | `style` 对象 |

**所以：v1 文件不能直接喂给 v2，v2 文件也不能直接喂给 v1 —— 中间必须有一次转换。** 这决定了三件事：

- **CLI 必须提供 `convert --to v1` / `convert --to v2`**，而且转换是确定性的代码，不是 skill 的职责
- **skill 里不能教模型「改改字段名就行」** —— 嵌套↔扁平、`expanded`↔`folded` 取反这些都不是改字段名能解决的
- **渲染器读文件时先判断格式，再决定走哪条代码路径** —— 不能先假定一种格式再补救

**「超集」指的是能力**：v1 能表达的东西 v2 都能表达（且更细），反过来不成立。

**总原则：v1 格式冻结，能力上 v2 覆盖 v1。** 写成判据是 **`v1 ⊂ v2`（能力层面）**：

- v1 格式（`node_tree`）的**表达能力**冻结，永不扩展。新表达能力只加在 v2 格式里
- v1 的每一项表达能力 v2 都有 → **v1 → v2 永远无损**
- v2 有超出 v1 的部分 → **v2 → v1 可能丢东西**
- **丢弃只发生在「导出 v1」这一个动作里**；读 v1 文件不存在丢弃问题，读 v2 文件全部保留
- **v1 格式永不扩展** —— 否则子集关系就破了，两边互相污染

**两种差异，两种处理：**

| 差异类型 | 例子 | 处理 |
|---|---|---|
| **表达差异** | 嵌套树 ↔ 扁平表、`topic` ↔ `content`、`expanded` ↔ `folded`、`direction` ↔ `side` | adapter **双向无损转换** |
| **能力差异** | `edges`（额外关联关系），及未来的更多关联类型 | 导出 v1 时**降级丢弃 + 显式报告** |

**细则：**

- **丢弃必须报告，但不写进文件** —— 导出时返回"损失清单"（丢了 3 条连线），文件本身保持纯 v1 的干净。**静默丢弃是最危险的做法**
- **转换时 `expanded` ↔ `folded` 要取反** —— 忘了会导致整棵树的折叠状态全反，而且图看起来"正常"，极难发现

**v1 侧的动作（格式不改，只加检测）：**

v1 现在拿到纯 v2 数据会直接崩：`TypeError: Cannot read properties of undefined (reading 'id')`，白屏零信息。根因在 `load()` 的 `e.format ? e.format : "node_tree"` —— **没有 `format` 就默认按 node_tree 解析**。

好消息：未知 `format` 只走 `console.warn` 并返回 `null`，**不抛异常**。所以**只要 v2 文件带 `format` 标识，v1 就不会崩**。

**v1 唯一要加的改动**：识别到 v2 结构时抛**带 `code` 的明确错误**（`err.code = 'E_V2_FORMAT'`），文案告诉用户怎么办。带 `code` 是关键 —— 宿主（trilium-jsmind、vue-jsmind 等）能 catch 到并弹自己的提示，而不是把异常吞掉变白屏。**不碰任何现有合法数据的行为，可独立发版。**

**⬜ v2 输出的版本标识值** —— 倾向 `format: "jsmind_v2"`（它标识版本，不是结构类型）。

### 4.5 skill 与 CLI 的分工 ✅

**硬原则：凡是"结果必须确定"的事情，都不许写进 skill。**

- **skill 是自然语言说明书**，教模型怎么做，结果允许有波动
- **CLI 是确定性工程**，结果必须一致，可测试

| 事情 | 放哪 | 理由 |
|---|---|---|
| 生成 / 修改树、把对话转成结构 | **skill** | 需要模型判断，每次可以不同 |
| 格式转换（v1 ↔ v2） | **CLI** | 必须确定。交给 LLM 现场转换可能漏、可能反，跑两次结果不一致 |
| 渲染出图 | **CLI** | 确定性 |
| 校验 | **CLI** | 确定性 |

**skill 的真正价值不是"能读文件"**（任何 agent 都能 `read_file`），而是：树的语义约定；**怎么把一段对话/文章变成结构化的树**（这才是 AI 生成脑图的核心难点）；增量修改的规矩；什么时候该调哪个命令。

**⬜ skill 划分** —— 倾向一个主 skill，别拆细（装三个 skill 的摩擦没人受得了）。
**⬜ 出图能力归属** —— 出图要无头浏览器（重依赖）：放 skill = 让用户自己装；放 MCP = server 自带。倾向 MCP 干重活、skill 干轻活。

### 4.6 渲染器 ✅

**视觉目标：**

| 档位 | 内容 | 第一版 |
|---|---|---|
| **① 多套主题** | 配色方案 | ✅ 做 |
| **② 节点级样式** | 单节点自定义颜色 / 边框 / 字号 | ✅ 做 |
| **③ 富内容节点** | Markdown / 图片 / 多行结构 | ❌ 不做 |
| **④ 边的多样性** | 虚线、箭头、标签、跨节点连线 | ⚠️ **只留扩展性**（数据存得下、序列化不丢，渲染器第一版不画） |

**核心形态：运行时生成，不是静态生成器。**

```
产物 = 自包含 HTML（内嵌 JSON + 渲染器）
双击打开 → JS 执行 → 读 JSON → 浏览器测量文字 → 算布局 → 动态生成 <svg>
        → 看图 / 编辑 / 导出 PNG
```

三个好处：**字体零风险**（测量和渲染在同一浏览器、同一时刻）、**文件小**（只存数据+代码）、**可编辑**（改 JSON 重渲染）。

**三步架构：**

```
① 测量：创建节点 DOM → 读 offsetWidth/Height → arranger.recordNodeSize()
② 布局：arranger.calculate(mind) → 节点坐标 + 连线端点
③ 渲染：生成 <svg>（节点 + 贝塞尔连线 + 主题配色）
```

- **布局算法不重写** —— `arranger` 已完整实现且零 DOM 依赖（`calculate` / `calculateNodePoint` / `incoming` / `outgoing` / `expanderPoint` / `calculateMindBounds` / `recordNodeSize`）
- **测量交给浏览器** —— `arranger` 通过 `recordNodeSize()` 接尺寸、自己不测，正好对应"文字尺寸必须浏览器算"
- **三步之间靠数据传递，不互相调用** —— 渲染器不反过来操纵 arranger，也不自己测量

**技术选型：SVG + `foreignObject` + Shadow DOM**

- **为什么 SVG**：矢量、缩放不失真、便于光栅化成图片
- **为什么节点用 `<foreignObject>` 包 HTML**：SVG 的 `<text>` 不会自动折行、中文没有避头尾。折行必须交给浏览器
- **为什么 Shadow DOM（无条件启用）**：框架启动时往容器插入 shadow root，渲染结果永远与宿主页面隔离。不依赖"我们自己的页面没有污染源"这个假设 —— 这个 HTML 可能被嵌进别人的网页

**样式必须放在 SVG 内部的 `<style>`** —— 导出图片要序列化 SVG，只有 SVG 内部的样式会随序列化带走。写在 shadow root 或外层 HTML 里，导出的图会变成裸的。

**导出图片的技术路径：**

```
XMLSerializer 序列化 SVG
  → data:image/svg+xml;charset=utf-8,{encodeURIComponent}
  → new Image() → drawImage 到 canvas
  → canvas.toDataURL('image/png') → 下载
```

**必须用 data URL，不能用 blob URL** —— `blob:` 会让 canvas 被 taint，`toDataURL` 抛 `SecurityError`。

**第一版明确不做**：不画跨节点边、不做富内容节点、不做快捷键/手势/协同/拖拽自由布局、不做节点内嵌图片、**不导出 SVG 文件**。

**硬约束（无论怎么实现都成立）：**

- 文字尺寸与折行必须交给浏览器算
- 导出必须用 data URL，不能用 blob URL
- 样式要放进 SVG 内部，否则导出时丢失
- DPR 3 时输出像素数别超过约 750 万（1.8G 内存到 1000 万像素会让 chromium 段错误）
- 画布尺寸必须 ≥ 渲染容器尺寸
- **几何判断用像素扫描，不要问视觉模型**

### 4.7 样式与主题 ✅

**分工原则：颜色跟语义走，几何跟元素走。**

- **颜色** → 全部定义在 `theme.tones`，节点通过 `tone` 取用
- **几何与排版** → `theme.node` / `theme.line` / `theme.expander`
- **节点例外** → 用 `node.style` 显式覆盖

**tone：六个值，只表达颜色**

```
default | primary | success | warning | danger | info
```

与 v1 的 CSS 类名对齐，学习成本为零，adapter 转换也直接。每个 tone 四项颜色：`fillColor`（背景）/ `textColor`（文字）/ `borderColor`（边框）/ `lineColor`（从这里发出去的线的颜色）。

**tone 只管颜色，不管几何** —— 语义角色的本质就是颜色；几何应该正交（一个节点可以同时是"warning 色 + 粗边框 + 大字号"）；对 Agent 友好（副作用越小，生成结果越可控）。

**theme 是内嵌 JSON，不是外部 CSS 文件** —— 外部 CSS 破坏自包含、Agent 难生成、写错了浏览器静默忽略。

```ts
interface JmTonePalette { fillColor: string; textColor: string; borderColor: string; lineColor: string; }

interface JmStyle {
    theme?: string;
    background?: string;
    tones?: Partial<Record<JmTone, Partial<JmTonePalette>>>;
    node?: Partial<{ radius: number; padding: number; fontSize: number; fontFamily: string; borderWidth: number }>;
    line?: Partial<{ width: number; pattern: JmLinePattern }>;
    expander?: Partial<{ size: number }>;
}
```

**读法只有一种：** `style` 是「这个 mindmap 的样式声明」—— **继承 `style.theme` 指向的预设**（不写就继承 `default`），然后**应用声明的其余字段**，深度合并。

```json
"style": { "theme": "default", "background": "#fafafa" }
```

= 继承 `default`，改背景。不写 `theme` 也一样继承 `default`。

**必须用深度合并，绝不能用浅合并** —— `tones: { primary: { fillColor: "#f00" } }` 做浅合并会把整个 `primary` 替换掉，`textColor` / `borderColor` / `lineColor` 全丢，节点变成黑底黑字。

**第一版只内置 `default` 一个预设。** 暗色不是"内置第二套"，而是**另一个预设**（用户自己写 JSON 或社区分发）。不做"明暗双套 tone"（每个 tone 带 light/dark），那会让 schema 体积和 Agent 生成负担都翻倍。

**节点样式：**

```ts
interface JmLineStyle { color?: string; width?: number; pattern?: JmLinePattern; }

interface JmNodeStyle {
    tone?:        JmTone;
    background?:  string;
    color?:       string;
    borderColor?: string;
    borderWidth?: number;
    borderStyle?: JmLinePattern;
    fontSize?:    number;                      // px
    fontWeight?:  'normal' | 'bold';
    incoming?:    JmLineStyle;                 // the line connecting this node to its parent
}
```

**连线样式挂子节点的 `incoming`** —— 一条线唯一对应一个子节点。**类型与跨节点边共用 `JmLineStyle`**，避免两套字段名不一的体系。字段名用 `incoming` 是与布局层对齐（arranger 里已有 `calculateNodeIncomingPoint` / `calculateNodeOutgoingPoint`）。

**父子线不需要 edge 对象** —— `edges` 只装额外关系，父子关系由 `node.parent` 表达，`incoming` 的语义由 `parent` 唯一确定。要"整条分支同色"就让 Agent 批量设相同值，**数据层面解决，不让渲染器做继承猜测**。

**覆盖链（三档，写死）：**

```
颜色：  node.style.<显式>          ??  theme.tones[有效 tone].<对应色>
几何：  node.style.<显式>          ??  theme.node.<默认>
线颜色：node.style.incoming.color  ??  theme.tones[父节点 tone].lineColor  ??  theme.line.<兜底>
```

`css` 字段永远最后应用（最具体）。**线的颜色默认取父节点的 tone** —— "从 warning 节点长出去的分支是橙色"很自然，一条分支天然同色。

**已记录但未实现：`emphasis`（强调级别）** —— 需要"版式按语义分档"时（如 warning 自动加粗）可加一条轴：`emphasis?: 'normal' | 'strong' | 'muted'`。届时覆盖链与 tone 同构，**加可选字段向后兼容，晚加不亏**。

---

## 5. 非功能需求

- **老用户不能崩** —— 拿到不认识的数据时给一句人话，不要白屏加 TypeError
- **文件要人能读懂** —— 不能被机器专用的表示污染（这条否决了"一份文件塞两套格式"）
- **维护面要小** —— 一个人业余维护，任何"每次都要照顾"的设计都要砍掉
- **不背合规负担** —— 不存用户内容、不做审核、不运营服务
- **手机端不做承诺** —— 宁可说"这个在电脑上改"，也不做一个手机上难用的编辑器
- **不接 KPI** —— 项目的价值是体面地活下去，不是增长

---

## 6. 待决定

**数据格式（唯一真正卡住进度的）**

- ⬜ 完整 schema 成文：节点基础字段、顶层结构、`edges`、版本标识
- ⬜ 版本标识的最终确认 —— 4.2 的示例里已按 `format: "jsmind_v2"` 写，除非有更好选择就用它
- ⬜ "导出 v1 时丢弃了什么"的报告形态（API 返回值 / 日志 / 两者）

**交付形态**

- ⬜ skill 分几个（倾向一个主 skill）
- ⬜ 出图能力放 skill 还是 MCP
- ⬜ CLI 命令集（大致 `convert` / `render` / `validate` / `extract`）

**随时能定**

- ⬜ v1 格式检测补丁什么时候发（不依赖任何决定，纯收益）
- ⬜ 自包含 HTML 里"复制给 AI 的话"按钮的文案与交互
- ⬜ 导出面板的 UI 形态（三个按钮 / 下拉菜单）
- ⬜ 发布策略：v1 老仓库怎么挂维护通知、v2 首发怎么定位

**尚未讨论**

- 具体技术实现：数据模型代码结构、API 形状、adapter 实现
- skill 的具体内容与提示词
- **"为什么用它而不是竞品"** —— 只能靠做出来验证

---

## 附录 A：已否决的方案（含理由）

| 方案 | 否决理由 |
|---|---|
| **一份文件塞两套格式**（`data` + `nodes` 并存） | 文件混乱：同一棵树写两遍，打开会看到 `expanded` 和 `folded` 同时存在。**兼容不该以牺牲文件可读性为代价** |
| **在线打开页 / 在线渲染页** | 本地已能渲染，在线页纯属多余；且违反"不做在线服务" |
| **每次只发纯 JSON** | 双击是文本，接收方零门槛看不到东西 |
| **引用 CDN 加载渲染器**（`<script src="https://unpkg.com/...">`） | 表面是本地文件，渲染器却在别人服务器上：断网 / 企业内网 / 邮件客户端一律白屏。CDN 版本漂移会让去年分享的文件打不开，而锁死版本又违背了「引用 CDN 求最新」的初衷 —— 两个诉求互斥。内联成本仅 50–100 KB |
| **把「瘦身版」（引用 CDN）作为默认产物** | 默认给一个依赖外网的东西，等于把「双击就能看」这个唯一优势送掉。分享出去的文件，我们控制不了对方的网络环境。真有人抱怨文件大再考虑 |
| **格式转换做成 skill** | 转换结果必须确定，不能交给 LLM 现场发挥 |
| **自己算文字折行 + 字宽表** | 字体一换整张表全废；中文字宽还要自己维护 |
| **用 v1 自带的 screenshot 插件出图** | 硬依赖 `dom-to-image`、默认打水印、只能触发浏览器下载 |
| **静态生成 SVG / 交付独立 `.svg` 文件** | 静态 `foreignObject` 是"盒子冻结 + 文字活的"，用户机器缺字体就溢出；且通用 SVG 工具不支持 `foreignObject` |
| **纯 SVG `<text>` 画节点** | 不会自动折行，中文没有避头尾。等于把被否掉的路重挖一遍 |
| **样式存 CSS 字符串** | 主题合并、样式比较、diff 都需要解析器或浏览器规范化，会把数据层拖回 DOM 依赖 |
| **用 blob URL 导出图片** | 会让 canvas 被 taint，`toDataURL` 抛 `SecurityError` |
| **继续把 v2 补完成全功能脑图编辑器** | 已经撞墙 9 个月：主题、连线算法、快捷键、移动端手势，每项都在跟成熟竞品正面拼刺刀，而这边没有 KPI 和排期 |
| **让 v1 去兼容 v2** | v1 有存量、v2 零存量，方向必然反过来 |

---

## 附录 B：实测依据

**关于 v1**

- v1 在 Node 里加载直接崩：`ReferenceError: window is not defined`（`es6/jsmind.js:8:1622`）
- v1 渲染性能：500 节点全量渲染 248ms
- v1 对不认识的字段 **100% 宽容**：读进来塞进 `node.data`，导出时原样写回，往返稳定
- v1 拿到纯 v2 数据 → `TypeError` 白屏；根因是 `load()` 的 `e.format ? e.format : "node_tree"`
- v1 拿到"双格式"文件能渲染，但导出时只剩 `meta, format, data` —— v2 部分全丢

**关于 v2**

- `mind.ts` / `arranger/mindmap.ts` / `serialization/json.ts` 三个核心模块**零 DOM 依赖**
- 节点内容类型只有 `text` 一种，与 v1 的 `topic` 等价
- `JmNode` 字段：`id` / `content` / `parent` / `children` / `folded` / `side` / `data`，**无任何视觉样式字段**
- `arranger` 有 644 行测试覆盖（`__tests__/arranger/mindmap.test.ts`）
- `src/view/` 已有实现：`measureNodeSizes` → `settle`（算尺寸 → 摆节点 → 画线）

**关于样式隔离**

| 测项 | 普通 `foreignObject` | 包 Shadow DOM |
|---|---|---|
| 外部 `div { font-size: 30px }` | **命中** ❌ | 未命中 ✅ |
| 外部 `* { margin-top: 7px }` | **命中** ❌ | 未命中 ✅ |
| SVG 内 `<style>` 泄漏到外部 | **不泄漏** ✅ | — |

**关于 SVG 导出图片**

| 路径 | 结果 |
|---|---|
| **blob URL** + `foreignObject` | ❌ `SecurityError: Tainted canvases` |
| **data URL** + `foreignObject` | ✅ OK |
| data URL + 纯图元 SVG | ✅ OK |
| canvas 直接绘制 | ✅ OK |

**关于方法论**

- **几何判断（有没有被切、留白多少）必须用像素扫描，不能问视觉模型** —— 实测两次视觉模型报"内容被截断"，像素扫描证明都是误判
- **不要为抓测量值覆盖 `document.body.innerHTML`** —— 会把要截图的容器一起删掉
- **内存是硬约束** —— 1.8G 的机器，chromium 截 1000 万像素会段错误