# API

::: warning Preview version
The jsMind V2 programming API is currently a preview. The API will change in later updates. Please check this documentation anytime for the interface that is current.
:::

This page shows how to start calling the published 2.x API. It covers only capabilities that are already in the `jsmind@2` package. Class, interface, and method details are generated from the published typings `dist/jsmind.d.ts` and live in the pages linked below.

Install the 2.x version with `npm i jsmind@2`. `npm i jsmind` still installs v1 (0.9.x). See [Getting Started](/en/guide/getting-started) for install details.

The package's only export is the default `JsMind` class. In an ES module or from `require('jsmind')` you get that class; the UMD build also assigns the same value to the global `jsMind`. There are no named exports. Related constructors are available as static properties: `jsMind.Mind`, `jsMind.Serializer`, and `jsMind.NodeSide`.

## Create an instance and open a map

The view attaches to a DOM element. `create` does not open a map by itself — construct a `jsMind.Mind`, then call `open`.

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

`create` accepts a container element or the id of one, and an optional second argument of options. Omitted fields use the library defaults. The default root node id `root` comes from `MindOptions` when you construct `new jsMind.Mind()`, not from `create`.

A classic script tag should load the UMD build (`dist/jsmind.umd.js`), which assigns `jsMind` on the page. The ESM bundle (`dist/jsmind.js`) is for `import` and `<script type="module">`. `require('jsmind')` receives the class itself from the CommonJS entry (`dist/jsmind.cjs`).

You can also try this flow in the [Playground](https://hizzgdev.github.io/jsmind-v2/playground.html) without installing anything.

## Build and edit a map

`jsMind.Mind` is the model. A new map already has a root node. Use `addChildNode` to add text under a parent. To set a node's side or position, call `moveNode` with `jsMind.NodeSide`.

```js
const parentId = mind.root.id;

mind.addChildNode('Left topic', parentId);

const right = mind.addChildNode('Right topic', parentId);
mind.moveNode(right.id, { parentId, side: jsMind.NodeSide.SideA });

mind.addChildNode('Detail', right.id);
```

`addChildNode` accepts a string (stored as text) or a `JmNodeContent` instance. That is the type-checked way to add a text node. `addNode` is typed as taking `JmNodeContent`, not a `{ type, value }` object literal.

Other model methods include `findNodeById`, `moveNode`, `removeNode`, `addEdge`, `removeEdge`, and `getEdges`. `removeNode` removes a node and all of its descendants, and it refuses to remove the root. After you change an already open map in the Playground samples, the examples call `open` again to refresh the view.

`jsMind.NodeSide.SideB` is the left side (`-1`), `Center` is `0`, and `SideA` is the right side (`1`).

## Serialize and export

`serialize` returns a JSON string for the map that is currently open. `exportImage` renders that map to an image (PNG at 2x by default) and returns a `Blob` plus pixel dimensions. The picture is the rendered content's own size: whitespace inside the container is included, and a map larger than its container is not cropped.

```js
const json = jm.serialize();

const image = await jm.exportImage();
// image.blob, image.width, image.height
```

To read or write a map that is not currently open on a view, use `jsMind.Serializer.create('json')` or `jsMind.Serializer.create('freemind')`. Those serializers implement `serialize`, `deserialize`, `validate`, and `getFormatName`.

```js
const serializer = jsMind.Serializer.create('json');
const data = serializer.serialize(mind);
const copy = serializer.deserialize(data);
```

When you are finished with a view, call `jm.close()`.

## Reference

The following pages list the classes, interfaces, and methods from the published typings. Identifiers are in English; each typings comment is included in English here and in Chinese on the Chinese pages.

- [JsMind](./api/jsmind) — the default export: `create`, `open`, `serialize`, `exportImage`, and static helpers
- [JmMind](./api/mind) — the mind map model
- [Nodes](./api/node) — nodes, content, and sides
- [Edges](./api/edge) — additional relationships between nodes
- [Options](./api/options) — configuration for `create`
- [Serialization](./api/serialization) — `jsMind.Serializer`
- [Image export](./api/export) — options and results for `exportImage`
- [Style and theme](./api/style) — visual overrides and theme types

The [data format](./data-format) page, which will describe the on-disk document in more detail, is still being written. Types that the API uses are documented here, but that page is not a finished guide.

To regenerate these reference pages after changing typings or comments, run `npm run docs:api`.
