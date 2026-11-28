# 视口模式：谁拥有滚动

这篇记的是一个决定：**一个 `JsMind` 实例从一开始就选定「谁管滚动」，之后不再变。** 它来自 2026-11-28 的一次讨论，起因是 `#278` 里一行看着很怪的 `jm.commands.zoomTo(1)`。

## 换掉之前的样子（行号是当时的 master）

画布里的内容能被移动，浏览器有两条互斥的路：原生滚动（`overflow: auto` + `scrollLeft/scrollTop`）和 CSS transform（`overflow: visible` + `translate scale`）。同一个盒子上不能两个人同时管。

库里当时用一次**懒激活**来换轨：`JmView` 上挂一个单向布尔，五个公开命令的第一个会把它翻过去。

```
private <mode latch> = false;          src/view/index.ts:65
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
const jm = await jsMind.create(container);                                        // 默认：视口模式
const other = await jsMind.create(container, { view: { viewportMode: 'native' } }); // 要原生滚动才显式传
```

构造函数是私有的，公开入口只有 `static async create(container, options?)`，所以选项落在 `ViewOptions`（`DEFAULT_OPTIONS.view` 里显式写 `'viewport'`），由 `create()` 透传给视图，而不是写进 `new JsMind(...)`。放在 `view` 分组而不是 `JsMindOptions` 顶层：视口模式属于视图层，且与 `view.padding` 同组有内在联系（padding 决定内容尺寸，夹取依赖内容尺寸）。

`open(mind)` 不加参数。模式不是「每张图的决定」，是这个实例的决定。运行期不再存在「模式变错」这件事，所以也就不需要「请重新打开」这类补救说明。

**二、五个视口命令在非视口模式下直接抛错。**

```ts
private _requireViewport(action: string): void {
    if (this.viewportMode !== 'viewport') {
        throw new JsMindError(
            `${action} needs the transform viewport, but this JsMind uses native scrolling; ` +
            `construct it with { view: { viewportMode: 'viewport' } }`
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

那个单向 latch 删掉，换成「`open()` 在 `await coordinator.onMindMapOpened(mind)` 之后确定性地应用一次接管」。这样 reopened 另一张图不需要任何特判，也不会继承上一张图的模式。

## 为什么默认是 `'viewport'`

**v1 与 v2 的分界就在这里。** owner 定这一条的原话是「它跟 v1 就是不一样」：v2 打开一张图，默认体验是 transform 视口，而不是 v1 的原生滚动条。

代价必须一起认：**库不接管浏览器事件。** 手势（滚轮、拖拽、双击）住在 `artifact/shell.js` 里，不在库里——这是既有边界，不是遗漏。所以「默认视口模式」的后果是：任何一个只做 `jsMind.create(container)` 再 `open(mind)` 的宿主，遇到比窗口大的图会得到一块**既不能原生滚动、也没有手势**的画布。内容被裁掉且移不动。

这条决定因此带两个附带要求，缺一不可：

1. **文档要把这件事写在最显眼的地方**：打开大图要先接手势，或者显式传 `viewportMode: 'native'`。
2. **`getViewport().mode` 必须可读**，宿主能自检自己处在哪个模式。等库级手势 API 出现之前，这是唯一的自保手段。

这条代价落在仓库自己的两个宿主上，所以两个例子页显式退回原生滚动：`example/playground.html` 与 `example/demo.html` 都没有手势代码、容器固定尺寸，大图在那里必须还能滚。产物壳有手势，走默认。

## 代价

- **公开契约扩展一次**：构造参数多一个选项，五个命令多一种抛错。v2 未发布前做最便宜。
- **测试迁移**：`__tests__` 里这五个命令的调用点，落地时实测 74 处、3 个文件（`ui/viewport.test.ts` 67、`commander.test.ts` 6、`jsmind.test.ts` 1；讨论时写的 56 是估算）。凡是经 `JsMind` 实例走视口的都要在 `create` 时给得起模式；`commander.test.ts` 那 6 处是转发层对假视图的调用，不经实例，只需要在假视图的 `JmViewport` 字面量里补上 `mode`。
- **`artifact/shell.js` 删掉 `zoomTo(1)` 那一行**，构造改成不传选项——默认就是接管。`#278` 是先合进去的过渡：在旧形状下它是对的（接管必须发生，而当时只有命令能触发），新形状落地后它变成多余。
- **默认 `'viewport'` 把代价推到没有手势的宿主上**：仓库自己的 playground 与 demo 要显式传 `'native'`，产物页则不再为模式传任何东西。前者是这一条默认值付出的实际改动，后者是它换来的简化。
- **测试里有一批用例随懒激活一起消失**：`__tests__/ui/viewport.test.ts` 原先有「第一次缩放 / 第一次平移 / 第一次居中顺手把读者已经滚到的偏移折进原点」三例。接管现在发生在 `open()` 之后（`await coordinator.onMindMapOpened(mind)` 已经把图渲染出来），那时盒子**已经溢出**、内容就在里面——偏移为 0 是因为从构造到 `open()` 之间没有人滚过它，不是因为盒子里没有内容（`__tests__/ui/viewport.test.ts` 里那条 native 用例在 `open()` 之后就能把同一个盒子滚到 `120/60`）。所以「读者先滚、第一次命令把它折进原点」这个场景在浏览器里再也构造不出来：库不再等命令才接管。接管代码里折 `scrollLeft/scrollTop` 的那两行保留（幂等应用要清掉上一个状态）。「reopen 另一张图回到 identity」那条用例走的正是这条零偏移路径；非零的那一半没有用例覆盖，是防御代码。

## 没选的三个形状

1. **保持懒激活（今天的形状）。** 优点：零迁移。缺点：模式会在运行期变，而变的那一刻有可见后果（15px），并且代码里看不到「我要不要视口」这个决定。`#278` 的 `zoomTo(1)` 就是这个缺点的化石。
2. **公开 `view.activateViewport()`。** 能让「翻开关」有名字，但把翻的时机还给了运行期——同一个页面里「有人看到滚动条、有人看不到」的可能原样保留，那 15px 也照样在某个时刻跳。名字解决了可读性，没解决时机。
3. **非视口模式下静默不生效，提示用户重新打开。** 见决定二：晚、静，而且「重新打开」在编辑器场景意味着丢状态，库不该要求这种补救。

## 落地后的收口

讨论时留了三个待定项，落地时这样定：

- **选项名与位置定成 `ViewOptions.viewportMode: 'native' | 'viewport'`，默认 `'viewport'`。** 讨论时倾向保留 `takeOverViewport`，那个理由只否掉了 `viewport: true` 这种名词形式，没有回答真正的问题：`takeOverViewport` 是动词，而这是个构造时定死、运行期不变的持续状态；boolean 也读不出另一个状态叫 `'native'`，而 `JmViewportMode` 这个类型已经有了。`JmViewportMode` 的定义因此搬到 `src/common/option.ts`（放 `src/view/handle.ts` 会让 `common` 反向依赖 `view`），`handle.ts` 改为从 common 引入并 re-export。方法名 `JmView.takeOverViewport()` 保留——它是幂等的接管动作，动词在那里是对的。
- **native 模式下 `getViewport()` 的 `x/y` 删掉了滚动补偿。** 唯一读它的人是那批随懒激活一起消失的用例；而且把 `scrollLeft` 折进原点会让同一个 `x` 在两种模式下指两件事——一种是视口原点，一种是浏览器的滚动位置。现在 native 模式报恒等值，`mode: 'native'` 说明这是哪种情况，`canPan` 恒为 `false`（详见 `src/common/option.ts` 的 `JmViewportMode`）。
- **不提供回到 native 的路径。** 理由与讨论时相同：接管折掉了滚动量、改了 `overflow`，回退要还原这两样，没有需求驱动。`_requireViewport` 的抛错消息直接点名选项，就是因为调用方只能重建实例，不能在这个实例上切回来。

另外一处落地细节：接管成了 `JmView.takeOverViewport()`，由 `JsMind.open()` 在 `coordinator.onMindMapOpened()` 之后调用，每次 open 一次，先重置原点再折滚动偏移。那个单向 latch 与它的四处读者一起删掉；`_whileUnscaled()` 改读构造模式（`viewportMode === 'native'` 时不动 `transform`）。
