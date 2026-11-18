# Node content

Every `JmNode` must carry a `content: JmNodeContent`. The only type currently published is `text`.

See also the [Nodes](/en/reference/api/node) API reference.

## 1. Types

```ts
const JmNodeContentType = { Text: 'text' } as const;
```

`type` is `'text'`, and `value` is a `string`. In the type declaration, `value` is `unknown`, leaving room for later extensions (images, rich text, and so on). If an unrecognized `type` is encountered, deserialization **throws**; it does not silently fall back.

## 2. Creation

```ts
// Recommended
const content = JmNodeContent.createText('node text');

// Equivalent, but more verbose
const content = new JmNodeContent(JmNodeContentType.Text, 'node text');
```

The constructor validates `type`: if it is not one of the `JmNodeContentType` values, it throws `Error`.

## 3. Type checks

```ts
content.isText()                         // → true
content.hasType(JmNodeContentType.Text)  // → true, equivalent
content.getText()                        // → 'node text'; throws Error if it is not text
```

## 4. Use on a node

```ts
const mind = new JmMind({ name: 'My map' });
mind.root.content = JmNodeContent.createText('Root');

mind.addNode(
    JmNodeContent.createText('Child'),
    { parentId: mind.root.id }
);
```

`addChildNode` also accepts a string or a `JmNodeContent` and is a shorter way to add a child under a given parent.

## 5. Serialization

```json
{
  "id": "jm-a1",
  "content": { "type": "text", "value": "node text" }
}
```

`type` and `value` are written into JSON as-is, and read back as-is during deserialization.
