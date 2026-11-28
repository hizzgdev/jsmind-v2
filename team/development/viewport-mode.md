# 视口模式：谁拥有滚动

这篇记的是一个决定：**一个 `JsMind` 实例从一开始就选定「谁管滚动」，之后不再变。** 它来自 2026-11-28 的一次讨论，起因是 `#278` 里一行看着很怪的 `jm.commands.zoomTo(1)`。

## 今天的样子

画布里的内容能被移动，浏览器有两条互斥的路：原生滚动（`overflow: auto` + `scrollLeft/scrollTop`）和 CSS transform（`overflow: visible` + `translate scale`）。同一个盒子上不能两个人同时管。

库里今天用一次**懒激活**来换轨：`JmView` 上挂一个单向布尔，五个公开命令的第一个会把它翻过去。

```
private viewportActive = false;        src/view/index.ts:65
_activateViewport()                    src/view/index.ts:596（只有一处置 true，没有一处置回 false）

zoomTo     :409     panTo   :456     panBy  :467
centerOn   :509     fitToView :566
```

`_activateViewport()` 干三件事：把当前滚动偏移折进视口原点、把 `scrollLeft/scrollTop` 清零、把 `overflow` 改成 `visible`。**它不读任何布局尺寸**——真正量盒子的是 `_viewportSize()`，只被 pan / zoom / fit / `getViewport()` 用到，都在激活之后。

这个形状有三个后果，都是实测过的：

1. **打开到第一次手势之间，是原生滚动在管。** 导出页在 500×400 的窗口里，打开时 `clientWidth` 是 485（两条 15px 滚动条），第一次手势接管后变 500——画面在那一刻宽了 15px。
2. **一次 `zoomTo(1)` 就等于「翻开关且不动画面」。** 倍率没变时原点逐值相同，`viewportCssTransform` 返回 `'none'`。所以 `#278` 用它当接管开关：这不是缩放，是副作用。
3. **开关是 view 级的，view 比一张图活得久。** `JsMind.open()` 先 `close()` 再开新图，view 不重建，所以「上一张图碰过视口」会泄漏到下一张图。这和 `#103` 那两个缺陷是同一个根：view 的生命周期长于 map。

## 决定

**一、模式在构造时定，实例活多久就是多久。**

```ts
const jm = new JsMind(container, { takeOverViewport: true });
```

`open(mind)` 不加参数。模式不是「每张图的决定」，是这个实例的决定。运行期不再存在「模式变错」这件事，所以也就不需要「请重新打开」这类补救说明。

**二、五个视口命令在非视口模式下直接抛错。**

```ts
private _requireViewport(action: string): void {
    if (!this.takeOverViewport) {
        throw new JsMindError(
            `${action} needs the transform viewport, but this JsMind uses native scrolling; ` +
            `construct it with { takeOverViewport: true }`
        );
    }
}
```

`zoomTo` / `panTo` / `panBy` / `centerOn` / `fitToView` 各在开头调一次，替掉现在的 `_activateViewport()`。`getViewport()` 只读，不设防。

理由：静默不生效是最差的失败方式。错误会在用户第一次滚轮时发生，代码早就跑完了，而且不报错——等于把 bug 外包给用户报告。库里同类位置的既有做法就是抛（`centerOn` 在没开图时 `throw new JsMindError('No mind map is currently open')`，`fitToView` 同样），同一层的东西该同样处理。

**三、`getViewport()` 报出模式。**

```ts
interface JmViewport { x, y, scale, canPan, mode: 'native' | 'viewport' }
```

宿主和测试都应该能断言「我现在在哪个模式」，而不是去读 `overflow` 这种实现细节。

`canPan` 在 native 模式下恒为 `false`。它今天答的是「夹取带有不有空间」，而 native 模式下夹取根本不起作用；语义应该是「库能不能帮你平移」，否则壳里 `touch-action` 的判据会拿到一个没有意义的 true。

**四、接管改成每次 `open()` 幂等应用。**

`viewportActive` 那个单向 latch 删掉，换成「`open()` 在 `await coordinator.onMindMapOpened(mind)` 之后确定性地应用一次接管」。这样 reopened 另一张图不需要任何特判，也不会继承上一张图的模式。

## 为什么默认是 `false`

**库不接管浏览器事件。** 手势（滚轮、拖拽、双击）住在 `artifact/shell.js` 里，不在库里——这是既有边界，不是遗漏。

所以「默认视口模式」的后果是：任何一个只做 `new JsMind(...).open(mind)` 的宿主，遇到比窗口大的图会得到一块**既不能原生滚动、也没有手势**的画布。内容被裁掉且移不动。

`true` 只能给那些自己实现了手势的宿主（今天只有产物壳）。因此默认 `false`，谁要谁开。

（讨论中我先倾向过 `true`——「视口是 v2 的新能力」——这条被上面这个理由推翻：能力在壳里，不在库里。）

## 代价

- **公开契约扩展一次**：构造参数多一个选项，五个命令多一种抛错。v2 未发布前做最便宜。
- **测试迁移**：`__tests__` 里这五个命令共 56 次调用、3 个文件（`zoomTo` 24、`fitToView` 14、`panTo` 10、`panBy` 4、`centerOn` 4），凡是走视口的都要在构造时开选项。机械改动，但没有捷径。
- **`artifact/shell.js` 删掉 `zoomTo(1)` 那一行**，改成构造时传选项。`#278` 是先合进去的过渡：在旧形状下它是对的（接管必须发生，而当时只有命令能触发），新形状落地时它会变成多余。
- **默认 `false` 意味着「打开即原生滚动」仍然是默认体验**，产物页靠选项离开它。这条不会自己消失，是刻意的。

## 没选的三个形状

1. **保持懒激活（今天的形状）。** 优点：零迁移。缺点：模式会在运行期变，而变的那一刻有可见后果（15px），并且代码里看不到「我要不要视口」这个决定。`#278` 的 `zoomTo(1)` 就是这个缺点的化石。
2. **公开 `view.activateViewport()`。** 能让「翻开关」有名字，但把翻的时机还给了运行期——同一个页面里「有人看到滚动条、有人看不到」的可能原样保留，那 15px 也照样在某个时刻跳。名字解决了可读性，没解决时机。
3. **非视口模式下静默不生效，提示用户重新打开。** 见决定二：晚、静，而且「重新打开」在编辑器场景意味着丢状态，库不该要求这种补救。

## 还没定的

- **选项名**：`takeOverViewport` 是讨论里用的名字，落地时再看要不要更短（`viewport: true`）。
- **`x/y` 到底指什么**：现在两种模式下 `getViewport()` 都返回「贴左上角的地图点」（native 模式把 `scrollLeft/scale` 补进去）。加了 `mode` 之后这条要不要保留，取决于是否还有人要在 native 模式下读它。
- **能不能回到 native**：目前打算不做。接管折掉了滚动量、改了 `overflow`，回退要还原这两样，且没有任何需求驱动它。
