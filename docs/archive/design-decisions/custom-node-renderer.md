# 归档：自定义节点渲染的设计分析

> **这是从 `roadmap.md` 第 9 节移出的完整分析。**
>
> **新版在 [`development/roadmap.md`](../development/roadmap.md) 第 7.4 节** ——
> 那里只留了一句结论：「接口设计已想清楚：`JmNodeRenderer` 返回 Promise +
> cleanup 函数。前置是 `onNodeUpdated` 接通，实际起点在 S10 之后。」
>
> **留在这里的是当时把这件事想透的全过程：** 完整的 TypeScript 接口定义、
> 为什么必须由调用方返回 Promise 和清理函数、以及四个动手时会踩的坑。
>
> 原文档那句话是「不写下来下次要从头再想一遍」。动手做这个功能之前，
> 先读这里。

---

## 自定义节点渲染

> **状态：不做，先记下来。** 记的原因不是忘了，是这件事已经分析清楚了，
> 不写下来下次要从头再想一遍。

### 1. 需求

节点内容默认按纯文本渲染。希望留一个口子，让使用者接管「往框里画什么」：

- 基于文本做特殊标记解析（`# 标题`、`**强调**`、代码块、图标）
- 换成图表、进度条、头像之类的东西
- 用 React / Vue / Svelte 渲染

画完之后再测量尺寸、参与布局，和其他节点一样。

### 2. 为什么现在不做

**它服务的是视觉定制，不是核心价值。** 这个项目的核心命题是「agent 能可靠地读、改、校验这张图」，对应 S10 / S11 / S12。自定义渲染服务的是「人希望它长得更像自己的东西」，在 S8 / S10 / S11 / S12 面前排不进优先级。

而且它一旦做进来，就得承诺维护一条「任意第三方框架都能接进来」的兼容面，成本和收益不成比例。作为插件单独发更合适。

### 3. 已经想清楚的部分（动手时别重新踩）

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

### 4. 依赖

**前置是 `onNodeUpdated` 接通。** 不补那个洞，这个功能只能静态看图，改一个字内容就不刷新。所以它的实际起点在 S10 之后，这也是它优先级低的原因之一 —— 挡在前面的本来就是更基础的事。
