# Moving nodes

A single call to `JmMind.moveNode()` can do three things at once: change the parent, change the sibling position, and change the side.

See also the [JmMind](/en/reference/api/mind) API reference.

## 1. API

```ts
moveNode(nodeId: string, destOptions: NodeDestinationOptions): JmNode
```

```ts
interface NodeDestinationOptions {
    parentId: string;       // id of the destination parent (required)
    position?: number;      // index among siblings (omitted: append at the end)
    side?: JmNodeSide;      // direction: -1 (left), 0 (center, root only), 1 (right)
}
```

**Every field is optional… except `parentId`.** An empty `{}` throws, because the method at least needs to know where to put the node.

## 2. Behavior

### Change parent

When `parentId` points at a node other than the current parent, the node is first removed from the old parent's `children`, then inserted under the new parent. **Cycles are prevented automatically** — setting a node's parent to one of its own descendants throws `JsMindError`.

Parent–child relationships are stored on the node itself (`parent` / `children`), not as edges. See the [hybrid edge system](/en/design/hybrid-edge-system).

### Change sibling position

`position` is the destination index. `0` is first; `null` / `undefined` means the end. If you only want to change position and not the parent, pass the same `parentId`: the method sees that the parent has not changed, skips the parent update, and only reorders siblings.

### Change side

`side` affects view layout, not the data tree. `JmNodeSide.SideA` (1, right) and `JmNodeSide.SideB` (-1, left). The root is not affected — it is fixed as `Center` (0).

### Root protection

**Moving the root is a no-op** — the method returns the root immediately, without throwing and without changing anything. The root cannot be moved, because it is the ancestor of every node.

## 3. Events

A `NodeMoved` event is emitted only when **something actually changed**. The comparison uses the real state before and after the operation, not the arguments that were passed in:

- `parentChanged`: old parent id ≠ new parent id
- `positionChanged`: old index ≠ new index
- `sideChanged`: old side ≠ new side

The event data only includes the fields that changed (`oldParentId` / `oldPosition` / `oldSide`); unchanged fields are omitted. Observers do not have to guess what changed this time.

## 4. Examples

```ts
// Change parent and set a position
mind.moveNode('jm-a1', { parentId: 'jm-b2', position: 0 });

// Reorder siblings only (same parentId)
mind.moveNode('jm-a1', { parentId: 'jm-a1-parent', position: 2 });

// Change side
mind.moveNode('jm-a1', { parentId: mind.root.id, side: -1 });

// All three at once
mind.moveNode('jm-a1', { parentId: 'jm-c3', position: 1, side: -1 });
```
