# 布局系统

jsMind v2 的布局算法在 `src/arranger/mindmap.ts`（`MindmapArranger`）中。它是**纯计算**，不接受 DOM 依赖——节点尺寸由外部喂入（`recordNodeSize`），几何由内部计算。这就是为什么布局测试可以在 Node 里跑（644 行测试），不需要浏览器。

---

## 1. 坐标系统

布局里定义了三类坐标点，搞混会导致连线飘移：

| 方法 | 含义 | 示例（Child A，size 60×28，side=1） |
|---|---|---|
| `calculateNodeIncomingPoint` | **锚点**：父锚点 + `offsetToParent` 累加。根节点恒为 `(0,0)`，即坐标原点 | `(70, -24)` |
| `calculateNodePoint` | **节点左上角**：锚点再按 `side` 和自身尺寸调整 | `(70, -38)` |
| `calculateNodeOutgoingPoint` | **出线点**：锚点 + `(size.width + expanderSize) × side` | `(143, -24)` |

![坐标关系](./images/layout/coordinates.png)

**`outgoing.x` 不在节点右边界上，比它多出一个 `expanderSize`（折叠按钮宽度，13px）。** 写断言时别拿 `outgoing` 去比节点边缘，会差这 13px。

![节点坐标](./images/layout/coordinates-node.png)

---

## 2. 盒模型

每个节点由三层尺寸构成：

![盒模型](./images/layout/box-model.png)

| 层 | 内容 |
|---|---|
| **内容区** | 文字 + padding |
| **节点盒** | 内容区 + 边框 |
| **展开器** | 折叠按钮，在节点右侧（左侧节点则在左边），13px |

![节点盒模型](./images/layout/box-model-node.png)

展开器不参与节点的宽度计算——节点宽度由内容决定，展开器单独追加在边上。

![组合示意](./images/layout/box-model-compose.png)

---

## 3. 布局流程

```
① 测量：创建节点 DOM → 读 offsetWidth/Height → arranger.recordNodeSize()
② 布局：arranger.calculate(mind) → 每个节点得到 point / incoming / outgoing
③ 渲染：view.settle(mind) → 放置节点 DOM + 画 SVG 连线
```

三步之间通过数据传递，渲染器不反过来操纵 arranger，也不自己测量。尺寸是输入，坐标是输出。

---

## 4. 间距规则

布局里有两个关键间距参数（在 `LayoutOptions` 中）：

| 参数 | 默认 | 含义 |
|---|---|---|
| `parentChildSpace` | 30 | 父节点边界到子节点边界的水平距离 |
| `siblingSpace` | 20 | 兄弟节点之间的垂直间隙 |
| `cousinSpace` | 15 | 堂兄弟节点（不同父）之间的垂直间隙 |
| `expanderSize` | 13 | 折叠按钮宽度 |

**注意：兄弟节点之间的间距不是固定等于 `siblingSpace = 20`。** 一个节点占的垂直空间是它整个子树块的高度。叶子兄弟之间的间隙 = siblingSpace（20px），但带子树的兄弟之间远大于此——这不是 bug，是子树高度决定的。

---

## 5. 方向

`JmNodeSide` 决定节点往哪边铺：

| 值 | 含义 |
|---|---|
| `-1` (SideB) | 左侧 |
| `0` (Center) | 居中——仅根节点允许 |
| `1` (SideA) | 右侧 |

子节点默认继承父节点的方向。`side: 0` 不是「中间」，是「没有方向」——布局要靠它确定从哪一点向两边铺开。子节点带 `0` 时布局找不到落点，结果是不画。校验器（`E_NON_ROOT_SIDE_CENTER`）会拦截这种情况。

---

## 6. Canvas 面积上限

PNG 导出必须经过 canvas 转码，canvas 有面积上限。实测（Chromium）：

| 输出尺寸 | 面积 | 结果 |
|---|---|---|
| 16000 × 12000 | 192M px² | 成功 |
| 20000 × 15000 | 300M px² | `toBlob` 返回 null |

阈值约 268M px²（16384²），与 Chrome 的 canvas 面积上限吻合。超越此限时当前的失败方式是抛错——不会出残缺图。真要支持巨型脑图需要分块渲染再拼接，或输出 SVG。