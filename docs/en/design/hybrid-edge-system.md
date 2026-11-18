# Hybrid edge system

jsMind v2 uses two different mechanisms to express relationships between nodes: **the tree uses direct fields; extra relationships use edges**.

## 1. Design

| Relationship | Storage | Container |
|----------|----------|------|
| Parent–child | `JmNode.parent` / `JmNode.children` (direct references) | The `JmNode` itself |
| Extra relationships (links, references, and so on) | `JmEdge` objects | `JmMind._edges` (a global dictionary) |

**`edges` only express extra relationships outside the tree.** Parent–child relationships are never written into `edges`.

## 2. Why not an all-edge model

If parent–child relationships were also expanded into edge objects, every parent–child connection would be a standalone record, and four problems would follow:

1. **Sibling order would be lost.** The tree uses `children: ["a","b","c"]`, and the array index is the display order. An edge list has no notion of order, so a separate `order` field would be required.
2. **Harder for an agent to generate.** The model would have to maintain an id ledger, guarantee no orphans and no cycles, and guarantee that every node has exactly one parent. A nested structure satisfies these constraints naturally.
3. **Size.** One parent + three children: the tree is about 20 bytes (`"children":["a","b","c"]`); edges are about 200 bytes (three objects each carrying id/source/target/type), a 5–10× difference. The impact is especially large for a self-contained HTML file.
4. **Every operation would have to re-verify “it is still a tree”.** In the tree model, those constraints are guaranteed by the data structure itself.

**Implication: the tree is a domain constraint, not a special case of a graph.** The tree model only becomes insufficient if multi-parent nodes (a DAG) become a requirement — but that is already a knowledge graph, not a mind map.

## 3. Node structure

`JmNode` maintains tree relationships through direct fields and does not store any edge objects:

```ts
class JmNode {
    parent: JmNode | null;
    children: JmNode[];
}
```

- Add a child: O(1) — `children.push(node)` + `node.parent = parent`
- Remove a node: O(k), where k is the number of children — recursively delete the subtree and splice it out of the parent's `children`
- Move a node: O(1) — remove from the old parent and add to the new parent

## 4. Edge structure

```ts
class JmEdge {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    type: JmEdgeType;          // currently only 'link'
    label: string | null;
    style?: JmLineStyle;       // shares the same type as JmNodeStyle.incoming
}
```

`JmEdgeType.Link = 'link'` is currently the only edge type. `style` shares `JmLineStyle` with a node's incoming line, so there are not two vocabularies with different field names.

## 5. Edge operations

```ts
// Add
const edge = mind.addEdge(node1.id, node2.id, JmEdgeType.Link, { label: 'depends on' });

// Query every edge related to a node
const edges = mind.getEdges(nodeId);

// Filter by type
const links = mind.getEdges(nodeId, JmEdgeType.Link);

// Remove
mind.removeEdge(edge.id);
```

When a node is deleted, every edge that references it is **cleaned up automatically** — the `_edges` global dictionary is scanned, and entries whose `sourceNodeId` or `targetNodeId` match are removed.

## 6. Serialization

```json
{
  "edges": {
    "jm-e1": {
      "id": "jm-e1",
      "sourceNodeId": "jm-a1",
      "targetNodeId": "jm-b3",
      "type": "link",
      "label": "influences",
      "style": { "color": "#e91e63", "pattern": "dotted" }
    }
  }
}
```

Like `nodes`, `edges` is a `Record<string, SerializedEdge>`; the key must equal `edge.id`.
