# 渲染回归测试清单

**目标不是跨环境像素一致**（那靠不住，也没意义），是**功能上线前不会把节点搞乱、不会把尺寸算错**。

每条都标了「现在能不能跑」，因为渲染层还没接完，有些得等。

---

## 0. 前提：分层

| 层 | 需要什么 | 现在能做吗 |
|---|---|---|
| **布局不变量** | `MindmapArranger` + 喂假尺寸 | ✅ **能，纯 Node** |
| **几何精度** | 真实浏览器测量 | ⏳ 等 S4 |
| **SVG 结构** | jsdom（不需要布局引擎） | ⚠️ 等 view 接 v2 |
| **视觉快照** | 真实浏览器截图 | ⏳ 等 S7b |

**关键发现：布局算法不碰 DOM。** `MindmapArranger` 只依赖 `JmPoint` / `JmSize` 和节点上的 `_data.layout`，纯计算。喂进假尺寸就能算出完整几何：

```typescript
const arranger = new MindmapArranger(DEFAULT_OPTIONS.layout);
node._data.layout.size.width = 60;    // 假装浏览器量出来是 60x28
node._data.layout.size.height = 28;
arranger.calculate(mind);
// → 现在每个节点的 point / incoming / outgoing 都是真值
```

**这意味着大部分测试不用等渲染层。** 尺寸是输入，几何是输出，把输入钉死，输出就能断言。

---

## 1. 坐标系统（先钉死术语）

`arranger` 里有三个容易混的点，写测试前必须分清：

| 方法 | 含义 | 实测（Child A，size 60×28，side=1） |
|---|---|---|
| `calculateNodeIncomingPoint` | **锚点** = 父锚点 + `offsetToParent` 累加。根节点恒为 `(0,0)`，即坐标原点 | `(70, -24)` |
| `calculateNodePoint` | **左上角** = 锚点再按 `side` 和尺寸调整 | `(70, -38)` |
| `calculateNodeOutgoingPoint` | 出线点 = 锚点 + `(size.width + expanderSize) × side` | `(143, -24)` |

`expanderSize` 是折叠按钮的宽度，所以 **`outgoing.x` 不在节点右边界上，比它多出一个 `expanderSize`**。写断言时别拿 `outgoing` 去比节点边缘，会差这 13px。

---

## 2. 用户提出的测试点

### 2.1 连线端点 ≡ 节点位置

**要断言的**：连线的起点终点，必须和从节点几何算出来的位置一致 —— 不是"看起来接上了"，是数值相等。

```typescript
// 父子连线的两个端点
parent.outgoing 和 child.incoming 是这条线的两端
// 且 incoming 必须等于父锚点 + offsetToParent，不能是独立算出来的量
child.incoming.x === parent.incoming.x + child.offsetToParent.x
child.incoming.y === parent.incoming.y + child.offsetToParent.y
```

**为什么这条重要**：连线和节点是两套代码画的。如果 `view/edge.ts` 用 `M x1 y1 L x2 y2` 直接吃 `sourcePoint`/`targetPoint`，那它信任的是 `arranger` 给的坐标。**一旦有人改了节点偏移而没改连线取点，线就会飘** —— 而且视觉上可能只飘几像素，人眼未必发现，但数据已经错。

**额外要测的**：`outgoing` 必须比节点右边界多出恰好 `expanderSize`，不是别的数。

**现在能跑**：✅ 纯 Node。

### 2.2 不同节点之间的间距一致

**这条被我第一版写错了，实测才发现。** 记在这里，因为它是个容易掉进去的坑。

**错的说法**：「兄弟节点之间的垂直间距恒定，等于 `siblingSpace`」。

实测（`siblingSpace = 20`）：

```
R1 → R2   垂直差 77.5     ← R1 有子树
R1a → R1b 垂直差 46       ← 都是叶子
```

**这不是 bug。** 脑图里一个节点占的垂直空间是**它整个子树块**的高度，不是一个节点的高度。R1 底下挂着两个叶子，它那块就高 72，R2 是光杆，那块只有 28。所以两个兄弟的间距天然不同。

**正确的断言是这三种：**

```typescript
// ① 叶子兄弟之间的间隙 = siblingSpace
leafSibling[i+1].point.y - (leafSibling[i].point.y + leafSibling[i].size.height)
    === siblingSpace                              // 实测 20 == 20 ✅

// ② 结构相同的兄弟子树，对应层的间距必须相等
//    A 和 B 都带两个叶子：
A.child[1].y - A.child[0].y === B.child[1].y - B.child[0].y    // 实测 48 == 48 ✅

// ③ 同一父节点下，子节点的顺序按 y 单调递增
sibling[i+1].point.y > sibling[i].point.y
```

**永远不要断言「所有兄弟间距相等」** —— 那是错的假设，会让测试看起来"发现了 bug"，其实是在测一个不存在的规则。

**另一个坑**：不能直接拿 `point.y` 相减当间距，因为 `point` 是左上角，节点高度不同时差值里混进了高度差。要拿**同侧边界**（前一节点底 → 后一节点顶）算。

**水平方向**同理：`parentChildSpace` 量的是「父节点边界到子节点边界」，不是中心到中心。

**现在能跑**：✅ 纯 Node。

### 2.3 子节点与父节点左右必须有差异

**要断言的**：右子树的 `x` 严格大于父节点右边界，左子树的 `x` 严格小于父节点左边界；同侧节点不能跑到父节点另一侧。

```typescript
side === 1  → child.outgoing.x > parent.point.x + parent.size.width
side === -1 → child.incoming.x < parent.point.x
side === 0  → 只有根节点
```

**要特别测的**：`side` 的**符号**和 `offsetToParent.x` 的符号必须同向。`left` 映射到 `SideB`（`-1`），这个映射在 CLI 那一层已经踩过一次坑了，布局层再验一遍不亏。

**现在能跑**：✅ 纯 Node。

---

## 3. 补充的测试点

用户提的三条之外，布局层还有这些容易静默坏掉的地方。

### 3.1 任意两个节点不重叠

```typescript
for 任意 nodeA, nodeB:
    boundsA ∩ boundsB === ∅
```

**这是「尺寸算错」最直接的症状。** 文字变宽但节点没跟着变，或者间距算少了，都会立刻表现出重叠。这条比任何单点断言都能抓到真问题。

**现在能跑**：✅ 纯 Node。

### 3.2 层级递进单调

```typescript
depth(child) > depth(parent)  →  child 在同一侧的 x 比 parent 更远离根
```

**防的是**：某层的偏移算成绝对值、或者 `offsetToParent` 漏了累加。

**现在能跑**：✅ 纯 Node。

### 3.3 折叠节点的子树必须不可见，但不能被删除

```typescript
node.folded = true  →  子节点 visible === false
                    →  但 nodes 里仍然存在，children 数组不变
```

**`_markInvisibleNodes` 是 v1 里干这事的。** 视图状态和数据状态必须分开 —— 折叠丢数据是最难发现的 bug，因为界面上看不出来。

**现在能跑**：✅ 纯 Node（`arranger.isNodeVisible`）。

### 3.4 文字变宽时节点必须跟着变宽

```typescript
同一节点，尺寸从 (60,28) 换成 (120,28)
→ 该节点的 point 不变
→ 兄弟节点和子节点的位置必须相应调整
→ 且仍然不重叠
```

**这是 S4「改字号 → 重测 → 重排」那条链的核心断言。** 现在可以用假尺寸模拟，等真实测量接上之后换成浏览器量的真值，断言不变。

**现在能跑**：✅ 纯 Node（假尺寸）。

### 3.5 只改一个节点，其它节点的几何不能动

```typescript
记录全部节点的 point
改某一个节点的样式/文字
→ 除它自己和它依赖的子节点外，其它 point 必须逐一相等
```

**渲染测试最容易只测"该动的动了"，漏掉"不该动的没动"。** 这条是回归护栏里最有价值的一条 —— 布局算法的副作用往往就藏在这里。

**现在能跑**：✅ 纯 Node。

### 3.6 画布边界包住所有节点

```typescript
mindBounds.left  <= min(point.x)
mindBounds.right >= max(point.x + width)
```

`calculateMindBounds` 就是这个。算小了会导致右侧节点被裁掉。

**现在能跑**：✅ 纯 Node。

### 3.7 幂等性

```typescript
arranger.calculate(mind) 两次  →  几何完全相同
serialize → deserialize → 再布局  →  几何仍然相同
```

**现在能跑**：✅ 纯 Node。

---

## 4. 等渲染层就绪后才能做的

### 4.1 真实测量 → 布局

上面所有用假尺寸的测试，换成浏览器量的真值再跑一遍。**断言逻辑不变，只换输入来源。**

这就是分层的好处：假尺寸验证「给定尺寸，几何算得对不对」；真尺寸验证「尺寸量得对不对」。两者可以分开失败，报错指向明确。

### 4.2 SVG 结构

在 jsdom 里（不需要布局引擎，只看结构）：

```typescript
每个节点对应一个 <g>，且数量等于可见节点数
连线的 <path> 的 d 属性和 arranger 的端点一致
样式落在 SVG 属性/CSS 变量上，不是内联魔法字符串
```

### 4.3 视觉快照

```typescript
截图 → sha256 → 和环境内基准比
```

**实测本机和 CI 上两次截图字节完全相同**，所以不需要 pixelmatch、不需要容差。但基准图必须和比对在同一环境生成。

---

## 5. 环境备忘

| | 本机 | GitHub Actions |
|---|---|---|
| 系统 | Alibaba Cloud Linux 3 | Ubuntu 24.04 |
| Chromium | 133 | 156 |
| 中文字体 | 有 | **无** |
| 中文 14px 宽度 | 84（≈14px/字，正确） | 63（10.5px/字，回退字体） |

**测试用英文内容**，绕开字体差异。中文只在专门的字体测试里出现，而且那种测试要显式装字体。

**看到「中文字宽比英文还窄」先查字体，别查度量代码。**

---

## 6. 结论

**用户提的三条（连线端点、节点间距、父子左右差异）全部现在就能测，不用等渲染层** —— 因为布局算法是纯计算，尺寸喂进去就行。

真正要等的是**真实测量**（S4）和**SVG 生成**（S7b）。但在那之前，把布局不变量先锁住，S4 接线的时候就有护栏了。