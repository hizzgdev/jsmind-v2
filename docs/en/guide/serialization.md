# Serialization

The jsMind v2 serialization layer turns an in-memory `JmMind` object into a file format, and reads it back. The core files are:

| File | Responsibility |
|---|---|
| `src/serialization/serializer.ts` | The `JmMindSerializer` interface — `serialize` / `deserialize` / `validate` / `getFormatName` |
| `src/serialization/json.ts` | Full implementation of the v2 format: `JmMindJsonSerializer`, corresponding to `format: "jsmind_v2"` |
| `src/serialization/freemind.ts` | FreeMind XML compatibility |
| `src/serialization/serializer-factory.ts` | `jsMind.Serializer.create('json' | 'freemind')` |
| `src/serialization/validation.ts` | `validateMindData()` — structural validation with 22 error codes, separated from read/write (does not depend on a serializer) |

See also the [serialization](/en/reference/api/serialization) API reference. The full on-disk schema is not reproduced here; it remains in the repository as [`docs/requirements/v2-data-format.md`](https://github.com/hizzgdev/jsmind-v2/blob/master/docs/requirements/v2-data-format.md). The [Data Format](/en/reference/data-format) page on this site is still being written.

## 1. Interface

```ts
interface JmMindSerializer {
    serialize(mind: JmMind): unknown;
    deserialize(data: unknown): JmMind;
    validate(data: unknown): boolean;
    getFormatName(): string;
}
```

Get an instance with `jsMind.Serializer.create('json')`; do not `new` it directly.

## 2. JSON serialization

### On-disk format

`format: "jsmind_v2"`. **Flat table**: `nodes` is a `Record<string, SerializedNode>`, parent–child relationships are expressed with id references (`parent` / `children`), and `edges` only stores extra relationships outside the tree.

The complete schema is in [`docs/requirements/v2-data-format.md`](https://github.com/hizzgdev/jsmind-v2/blob/master/docs/requirements/v2-data-format.md).

### serialize

```ts
const serializer = jsMind.Serializer.create('json');
const doc = serializer.serialize(mind);
// → { format: "jsmind_v2", meta: {...}, root: "root", nodes: {...}, edges: {...} }
```

Serialization walks `JmMind._nodes` / `JmMind._edges` one entry at a time. `parent` / `children` store id references, not objects. A node style `node.style` is written if it exists and omitted if it does not — **defaults are not written**; the receiver (the theme) fills them in.

### deserialize

```ts
const json = JSON.parse(fs.readFileSync('map.json', 'utf8'));
const mind = serializer.deserialize(json);
```

This calls `validateMindData()` internally. If validation fails it throws `JsMindError` (with an `errors` array); it will not silently produce a half-built mind. **A validation failure does not modify any state** — nothing has happened when the exception is thrown.

### validate

```ts
serializer.validate(data)  // → true | false
```

`validate` is on the `JmMindSerializer` interface and returns only a boolean. The JSON serializer implementation, `JmMindJsonSerializer`, also has a `check` method that is not part of the interface. Use `check` when you need the error list as well as the boolean:

```ts
// On JmMindJsonSerializer only — not on the JmMindSerializer interface
jsonSerializer.check(data)  // → { valid: boolean, errors: JmValidationIssue[] }
```

Each error has a `code` (a stable identifier, such as `E_FORMAT`), a `path` (a location in the document), and a `message` (text for a person to read).

## 3. FreeMind serialization

`JmMindFreeMindSerializer` is compatible with the FreeMind XML format. It shares the same `JmMindSerializer` interface as the JSON serializer. Get it from the factory: `jsMind.Serializer.create('freemind')`.

## 4. Validation layer

`validateMindData(data: unknown)` is independent of the serializer — it does not depend on `JmMind`, and only consumes a parsed JSON object. That means:

- The CLI command `jsmind validate` can run without initializing a mind
- The serializer and the CLI share the same validation logic
- A validation failure does not throw; it returns `{ valid: false, errors: [...] }`

The 22 error codes fall into four groups: structural integrity (`E_FORMAT` / `E_META` / `E_NODES_MISSING`, and so on), reference integrity (`E_NODE_PARENT_MISSING` / `E_ROOT_MISSING`, and so on), consistency (`E_PARENT_CHILD_MISMATCH`), and value legality (`E_SIDE` / `E_TONE` / `E_CONTENT_TYPE`, and so on). The complete list is in [section 9 of `v2-data-format.md`](https://github.com/hizzgdev/jsmind-v2/blob/master/docs/requirements/v2-data-format.md#9-完整性校验).

## 5. autofix

`validate` reports only, by default. Writing happens only with `--autofix`, **and never silently** — a list of changes must be printed. The repair principle is: prefer a wrong position over dropped data (orphan nodes are hung under root), do not rebuild `children` order, and do not modify `content`. Detailed rules are in [section 10 of `v2-data-format.md`](https://github.com/hizzgdev/jsmind-v2/blob/master/docs/requirements/v2-data-format.md#10-autofix).
