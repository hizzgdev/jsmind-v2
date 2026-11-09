# 序列化系统

jsMind v2 的序列化层把内存里的 `JmMind` 对象转成文件格式，以及反向读回。三个核心文件：

| 文件 | 职责 |
|---|---|
| `src/serialization/serializer.ts` | `JmMindSerializer` 接口——`serialize` / `deserialize` / `validate` / `getFormatName` |
| `src/serialization/json.ts` | v2 格式的完整实现：`JmMindJsonSerializer`，对应 `format: "jsmind_v2"` |
| `src/serialization/freemind.ts` | FreeMind XML 格式兼容 |
| `src/serialization/serializer-factory.ts` | `JmMindSerializerFactory.create('json' | 'freemind')` |
| `src/serialization/validation.ts` | `validateMindData()`——37 个错误码的结构校验，读写分离（不依赖序列化器） |

---

## 1. 接口

```ts
interface JmMindSerializer {
    serialize(mind: JmMind): unknown;
    deserialize(data: unknown): JmMind;
    validate(data: unknown): boolean;
    getFormatName(): string;
}
```

用 `JmMindSerializerFactory.create('json')` 获取实例，不直接 `new`。

---

## 2. JSON 序列化

### 磁盘格式

`format: "jsmind_v2"`。**扁平表**：`nodes` 是 `Record<string, SerializedNode>`，父子关系通过 id 引用（`parent` / `children`）表达，`edges` 只存树之外的额外关系。

完整 schema 见 [`docs/requirements/v2-data-format.md`](../requirements/v2-data-format.md)。

### serialize

```ts
const serializer = new JmMindJsonSerializer();
const doc = serializer.serialize(mind);
// → { format: "jsmind_v2", meta: {...}, root: "root", nodes: {...}, edges: {...} }
```

走 `JmMind._nodes` / `JmMind._edges` 逐个序列化。`parent` / `children` 存的是 id 引用，不是对象。节点样式 `node.style` 存在就写，不存在就省略——**不写默认值**，让接收方（主题）来填。

### deserialize

```ts
const json = JSON.parse(fs.readFileSync('map.json', 'utf8'));
const mind = serializer.deserialize(json);
```

内部调 `validateMindData()`，校验不通过抛 `JsMindError`（带 `errors` 数组），不会静默产出一个半残的 mind。**校验失败不修改任何状态**——抛异常之前什么都没发生。

### validate

```ts
serializer.validate(data)  // → true | false
serializer.check(data)     // → { valid: boolean, errors: JmValidationIssue[] }
```

`check` 比 `validate` 多返回错误列表。每个错误带 `code`（稳定标识，如 `E_FORMAT`）、`path`（文档内位置）、`message`（给人看的文案）。

---

## 3. FreeMind 序列化

`JmMindFreeMindSerializer` 兼容 FreeMind XML 格式。与 JSON 序列化器共用同一个 `JmMindSerializer` 接口。通过 factory 获取：`JmMindSerializerFactory.create('freemind')`。

---

## 4. 校验层

`validateMindData(data: unknown)` 独立于序列化器——它不依赖 `JmMind`，只吃解析后的 JSON 对象。这意味着：

- CLI 的 `jsmind validate` 不需要初始化 mind 就能跑
- 序列化器和 CLI 共用同一套校验逻辑
- 校验失败不是抛异常，是回 `{ valid: false, errors: [...] }`

37 个错误码分四类：结构完整性（`E_FORMAT`/`E_META`/`E_NODES_MISSING`等）、引用完整性（`E_NODE_PARENT_MISSING`/`E_ROOT_MISSING`等）、一致性（`E_PARENT_CHILD_MISMATCH`）、取值合法性（`E_SIDE`/`E_TONE`/`E_CONTENT_TYPE`等）。完整列表见 [`v2-data-format.md` 第 9 节](../requirements/v2-data-format.md#9-完整性校验)。

---

## 5. autofix

`validate` 默认只报告。加 `--autofix` 才写入，**且绝不静默**——必须输出改动清单。修复原则：宁可位置不对也不丢数据（孤儿节点挂 root）、不重建 `children` 顺序、不修改 `content`。详细规则见 [`v2-data-format.md` 第 10 节](../requirements/v2-data-format.md#10-autofix)。


---

## 设计决策

从 Manager 模式改成 Serializer 接口的完整理由与迁移过程，在
[`archive/design-decisions/serialization.md`](../archive/design-decisions/serialization.md)。

加新序列化格式之前值得读一遍。
