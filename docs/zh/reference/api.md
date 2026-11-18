# API

::: warning 预览版本
jsMind V2 的编程 API 目前是预览版本，之后还会更新。请随时查阅本文档，以了解当前的接口。
:::

本页说明如何开始调用已发布的 2.0.0 API，只覆盖 `jsmind@2` 包中已经提供的能力。类、接口和方法的详细说明由已发布的类型声明 `dist/jsmind.d.ts` 生成，见下方链接的页面。

请先用 `npm i jsmind@2` 安装 2.x 版本。`npm i jsmind` 仍然会安装 v1（0.9.x）。安装说明见 [快速上手](/zh/guide/getting-started)。

该包的唯一导出是默认的 `JsMind` 类。在 ES 模块或 `require('jsmind')` 中得到的就是这个类；UMD 构建还会把同一个值赋给全局变量 `jsMind`。没有具名导出。相关的构造函数通过静态属性提供：`jsMind.Mind`、`jsMind.Serializer` 和 `jsMind.NodeSide`。

## 创建实例并打开导图

视图会附加到一个 DOM 元素上。`create` 本身不会打开导图——需要先构造一个 `jsMind.Mind`，再调用 `open`。

```js
import jsMind from 'jsmind';

const jm = await jsMind.create('jsmind_container');

const mind = new jsMind.Mind({
    name: 'Hello',
    author: 'example',
    version: '1.0',
});

mind.addChildNode('World', mind.root.id);

await jm.open(mind);
```

`create` 接受一个容器元素或元素 id，以及可选的第二个参数作为选项。省略的字段使用库的默认值。默认根节点 id `root` 来自构造 `new jsMind.Mind()` 时的 `MindOptions`，而不是来自 `create`。

用传统 script 标签时，应加载 UMD 构建（`dist/jsmind.umd.js`），它会在页面上赋值 `jsMind`。ESM 包（`dist/jsmind.js`）用于 `import` 和 `<script type="module">`。`require('jsmind')` 从 CommonJS 入口（`dist/jsmind.cjs`）直接得到这个类。

也可以在 [Playground](https://hizzgdev.github.io/jsmind-v2/playground.html) 里试用这一流程，无需安装。

## 构建和编辑导图

`jsMind.Mind` 是数据模型。新创建的导图已经有一个根节点。用 `addChildNode` 在父节点下添加文本。若要设置节点的方向或位置，再调用 `moveNode`，并使用 `jsMind.NodeSide`。

```js
const parentId = mind.root.id;

mind.addChildNode('左侧主题', parentId);

const right = mind.addChildNode('右侧主题', parentId);
mind.moveNode(right.id, { parentId, side: jsMind.NodeSide.SideA });

mind.addChildNode('细节', right.id);
```

`addChildNode` 接受字符串（作为文本存储）或 `JmNodeContent` 实例。这是类型检查能通过的添加文本节点的写法。`addNode` 在类型声明中接受 `JmNodeContent`，而不是 `{ type, value }` 对象字面量。

模型上的其他方法包括 `findNodeById`、`moveNode`、`removeNode`、`addEdge`、`removeEdge` 和 `getEdges`。`removeNode` 会删除节点及其全部后代，并且拒绝删除根节点。在 Playground 的示例里，对已经打开的导图做修改后，会再次调用 `open` 以刷新视图。

`jsMind.NodeSide.SideB` 是左侧（`-1`），`Center` 是 `0`，`SideA` 是右侧（`1`）。

## 序列化与导出

`serialize` 返回当前已打开导图的 JSON 字符串。`exportImage` 将该导图渲染为图片（默认是 2 倍的 PNG），并返回 `Blob` 以及像素尺寸。画面尺寸是已渲染内容自身的尺寸：容器内的空白会计入图片，大于容器的导图也不会被裁切。

```js
const json = jm.serialize();

const image = await jm.exportImage();
// image.blob, image.width, image.height
```

若要读写尚未在视图中打开的导图，使用 `jsMind.Serializer.create('json')` 或 `jsMind.Serializer.create('freemind')`。这些序列化器实现了 `serialize`、`deserialize`、`validate` 和 `getFormatName`。

```js
const serializer = jsMind.Serializer.create('json');
const data = serializer.serialize(mind);
const copy = serializer.deserialize(data);
```

不再使用某个视图时，调用 `jm.close()`。

## 参考

下列页面列出了已发布类型声明中的类、接口和方法。标识符保持英文；类型声明中的说明文字在本页对应的英文版和中文版中成对提供。

- [JsMind](./api/jsmind) — 默认导出：`create`、`open`、`serialize`、`exportImage` 以及静态辅助属性
- [JmMind](./api/mind) — 思维导图模型
- [节点](./api/node) — 节点、内容和方向
- [边](./api/edge) — 节点之间的额外关系
- [选项](./api/options) — `create` 的配置
- [序列化](./api/serialization) — `jsMind.Serializer`
- [图片导出](./api/export) — `exportImage` 的选项和结果
- [样式与主题](./api/style) — 视觉覆盖和主题类型

更详细说明磁盘文档的 [数据格式](./data-format) 页面仍在编写中。API 用到的类型会在本参考中说明，但那一页还不是完成态的指南。

若类型声明或注释有变更，请运行 `npm run docs:api` 重新生成这些参考页。
