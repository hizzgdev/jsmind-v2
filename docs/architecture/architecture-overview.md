# 架构总览

jsMind v2 分六层，自底向上：model → serialization → arranger → view → application → CLI。

---

## 1. 分层

```
CLI         jsMind 命令入口，参数解析、退出码、无头浏览器封装
application JsMind 门面、JmMindChangeCoordinator（被动观察）、JmCommander（主动指令）
view        渲染：Shadow DOM 隔离、节点/连线/展开器、主题变量、导出图片
arranger    纯计算布局：喂入节点尺寸 → 算出坐标。零 DOM 依赖
serialization JSON/FreeMind 读写、校验器（37 个错误码）
model       JmMind / JmNode / JmEdge / JmNodeContent / style / theme 类型体系
```

---

## 2. 数据流

### Agent 路径（文件 → 命令行）

```
JSON 文件 → serialization.deserialize → JmMind
    → CLI 命令 (add-child / set-text / ...) 直接操作 JmMind API
    → serialization.serialize → JSON 文件
    → validate → 校验失败则回滚
```

### 人交互路径（浏览器）

```
用户操作 → JmMind API (moveNode / addChildNode / ...)
    → JmMindChangeCoordinator.onNodeMoved / onNodeAdded / ...
    → view.settle（重排 + 重绘）
```

### 导出路径

```
JmCommander.exportImage() → JmViewHandle.capture()
    → captureShadowContent: 克隆 DOM → SVG foreignObject → canvas → Blob
```

---

## 3. 双通道

应用层有两条通往视图的通道，判断标准是「这个操作改不改模型」：

```
调用方 → JmCommander → JmViewHandle → JmView      （命令：导出、pan/zoom）
模型变更 → JmMindChangeCoordinator → JmView        （反应：节点增删改）
```

**改模型的必须走第二条。** 折叠、移动、改文字、改样式——数据是真相，视图是投影。把模型变更塞进 Commander 会产生第二条修改入口，和 AI 走 CLI 的路径分叉。

**不改模型的走第一条。** 平移、缩放、导出——只改变观察方式，不改变任何节点。`JmViewHandle` 是视图向应用层暴露的窄接口（当前只有 `capture()`，未来加 `pan/zoom/centerOn`）。

---

## 4. 关键决策

| 决策 | 理由 |
|------|------|
| 磁盘格式用扁平表 | diff 干净，增量定位 O(1)，与 edges 同构，无深递归 |
| LLM 交互用嵌套树 | 大纲和目录树是 LLM 训练数据的天然形式 |
| 渲染用 SVG + foreignObject | 矢量无损缩放、贝塞尔天然支持、文字排版交给浏览器 |
| Shadow DOM 无条件启用 | 样式隔离是硬需求：自包含 HTML 可能被嵌进任何网页 |
| 样式用 CSS 自定义属性 | 几何继承给宿主一次搞定，颜色继承给单节点单独覆盖 |
| arranger 零 DOM 依赖 | 布局测试在 Node 里跑，不需要浏览器 |
| 校验器独立于序列化器 | CLI 不需要加载完整 mind 就能 validate |
| v1 adapter 排最后 | 等 schema 冻结，前期写等于拿会变的模型写转换器 |

---

## 5. 文件索引

| 层 | 核心文件 |
|---|---|
| model | `src/model/mind.ts`, `src/model/data/node.ts`, `src/model/data/edge.ts`, `src/model/data/node-content.ts`, `src/model/data/style.ts` |
| serialization | `src/serialization/json.ts`, `src/serialization/freemind.ts`, `src/serialization/serializer.ts`, `src/serialization/validation.ts`, `src/serialization/serializer-factory.ts` |
| arranger | `src/arranger/mindmap.ts` |
| view | `src/view/index.ts`, `src/view/node.ts`, `src/view/edge.ts`, `src/view/shadow.ts`, `src/view/export.ts`, `src/view/handle.ts` |
| application | `src/application/jsmind.ts`, `src/application/mind-change-coordinator.ts`, `src/application/commander.ts` |
| CLI | `src/cli/index.ts`, `src/cli/io.ts`, `src/cli/browser.ts`, `src/cli/commands/*.ts` |