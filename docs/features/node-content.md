# 节点内容

每个 `JmNode` 必须携带一个 `content: JmNodeContent`。当前只有 `text` 类型。

---

## 1. 类型

```ts
const JmNodeContentType = { Text: 'text' } as const;
```

`type` 是 `'text'`，`value` 是 `string`。`value` 在类型声明上是 `unknown`，为将来扩展（图片、富文本等）留余地。遇到不认识的 `type`，反序列化**报错**，不静默降级。

---

## 2. 创建

```ts
// 推荐
const content = JmNodeContent.createText('节点文字');

// 等价但啰嗦
const content = new JmNodeContent(JmNodeContentType.Text, '节点文字');
```

构造时校验 `type`：不在 `JmNodeContentType` 的取值里就抛 `Error`。

---

## 3. 类型判断

```ts
content.isText()                    // → true
content.hasType(JmNodeContentType.Text)  // → true，等价
content.getText()                   // → '节点文字'，非 text 抛 Error
```

---

## 4. 节点使用

```ts
const mind = new JmMind({ name: '我的图' });
mind.root.content = JmNodeContent.createText('根节点');

mind.addNode(
    JmNodeContent.createText('子节点'),
    { parentId: mind.root.id }
);
```

---

## 5. 序列化

```json
{
  "id": "jm-a1",
  "content": { "type": "text", "value": "节点文字" }
}
```

`type` 和 `value` 原样写进 JSON，反序列化原样读回。


---

## 设计决策

这个模块的设计推演在 [`archive/design-decisions/node-content.md`](../archive/design-decisions/node-content.md)：
为什么用 enum 不用字符串字面量、为什么工厂方法优先于直接构造、从 v1 演进时的取舍，
以及**要加新内容类型时该动哪几处**（见那篇的「Future Extensibility」）。

改这个模块之前值得读一遍。
