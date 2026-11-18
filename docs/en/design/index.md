# Design

These pages explain why jsMind V2 is structured the way it is, and how the layers work together. They are not a getting-started guide. For usage, see the [Guide](/en/guide/).

Related design articles:

- [Layout system](./layout-system) — coordinate system, box model, layout pipeline, and spacing
- [Theme system](./theme-system) — data-driven themes, tones, the override chain, and shadow merging
- [Hybrid edge system](./hybrid-edge-system) — tree relationships use direct fields; extra relationships use edges

jsMind v2 is organized in six layers, from the bottom up: model → serialization → arranger → view → application → CLI.

## 1. Layers

```
CLI         jsMind command entry point, argument parsing, exit codes, headless browser wrapper
application JsMind facade, JmMindChangeCoordinator (passive observation), JmCommander (active commands)
view        Rendering: Shadow DOM isolation, nodes / connections / expanders, theme variables, image export
arranger    Pure layout calculation: feed in node sizes → compute coordinates. Zero DOM dependency
serialization JSON/FreeMind read and write, validator (37 error codes)
model       JmMind / JmNode / JmEdge / JmNodeContent / style / theme type system
```

## 2. Data flow

### Agent path (file → command line)

```
JSON file → serialization.deserialize → JmMind
    → CLI command (add-child / set-text / ...) operates on the JmMind API
    → serialization.serialize → JSON file
    → validate → roll back if validation fails
```

### Human interaction path (browser)

```
User action → JmMind API (moveNode / addChildNode / ...)
    → JmMindChangeCoordinator.onNodeMoved / onNodeAdded / ...
    → view.settle (relayout + redraw)
```

### Export path

```
JmCommander.exportImage() → JmViewHandle.capture()
    → captureShadowContent: clone the DOM → SVG foreignObject → canvas → Blob
```

## 3. Dual channels

The application layer has two channels into the view. The test is whether the operation changes the model:

```
Caller → JmCommander → JmViewHandle → JmView      (commands: export, pan/zoom)
Model change → JmMindChangeCoordinator → JmView    (reactions: node add / remove / edit)
```

**Operations that change the model must use the second channel.** Folding, moving, changing text, changing style — the data is the source of truth, and the view is a projection. Putting model changes through Commander would create a second write path, and that path would diverge from the one agents take through the CLI.

**Operations that do not change the model use the first channel.** Pan, zoom, and export only change how the map is observed; they do not change any node. `JmViewHandle` is the narrow interface the view exposes to the application layer (currently only `capture()`; `pan` / `zoom` / `centerOn` may be added later).

## 4. Key decisions

| Decision | Reason |
|------|------|
| Flat table for the on-disk format | Clean diffs, O(1) incremental lookup, isomorphic with edges, no deep recursion |
| Nested tree for LLM interaction | Outlines and directory trees are a natural form in LLM training data |
| SVG + foreignObject for rendering | Lossless vector scaling, natural Bézier support, typography left to the browser |
| Shadow DOM enabled unconditionally | Style isolation is a hard requirement: a self-contained HTML document may be embedded in any page |
| CSS custom properties for style | Geometry can inherit once from the host; color can be overridden on a single node |
| Arranger has zero DOM dependency | Layout tests run in Node, with no browser required |
| Validator is independent of the serializer | The CLI can validate without loading a complete mind |
| Leave the v1 adapter until last | Wait until the schema is frozen; writing a converter against a still-moving model is wasted work |

## 5. File index

| Layer | Core files |
|---|---|
| model | `src/model/mind.ts`, `src/model/data/node.ts`, `src/model/data/edge.ts`, `src/model/data/node-content.ts`, `src/model/data/style.ts` |
| serialization | `src/serialization/json.ts`, `src/serialization/freemind.ts`, `src/serialization/serializer.ts`, `src/serialization/validation.ts`, `src/serialization/serializer-factory.ts` |
| arranger | `src/arranger/mindmap.ts` |
| view | `src/view/index.ts`, `src/view/node.ts`, `src/view/edge.ts`, `src/view/shadow.ts`, `src/view/export.ts`, `src/view/handle.ts` |
| application | `src/application/jsmind.ts`, `src/application/mind-change-coordinator.ts`, `src/application/commander.ts` |
| CLI | `src/cli/index.ts`, `src/cli/io.ts`, `src/cli/browser.ts`, `src/cli/commands/*.ts` |
