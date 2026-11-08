# 节点移动

`JmMind.moveNode()` 一次调用可以同时完成三件事：换父节点、换兄弟位置、换方向。

---

## 1. API

```ts
moveNode(nodeId: string, destOptions: NodeDestinationOptions): JmNode
```

```ts
interface NodeDestinationOptions {
    parentId: string;       // 目标父节点 id（必填）
    position?: number;      // 在兄弟中的位置索引（省略则放到末尾）
    side?: JmNodeSide;      // 方向：-1（左）、0（居中，仅根节点）、1（右）
}
```

**所有字段都是可选的……除了 `parentId`。** 空 `{}` 会抛错，因为至少要知道往哪放。

---

## 2. 行为

### 换父节点

`parentId` 指向与当前父节点不同的节点时，先从原父节点的 `children` 中移除，再插入到新父节点。**自动防止循环**——如果把一个节点的父节点设成它自己的后代，抛 `JsMindError`。

### 换兄弟位置

`position` 是目标索引。`0` 是第一个，`null` / `undefined` 是末尾。如果只改位置不想换父，传同一个 `parentId`：方法识别到父节点没变，跳过父节点操作只做兄弟重排。

### 换方向

`side` 影响视图布局，不影响数据树。`JmNodeSide.SideA`（1，右侧）、`JmNodeSide.SideB`（-1，左侧）。根节点不受此影响——它固定为 `Center`（0）。

### 根节点保护

**动根节点是空操作**——直接返回根，不抛错、不改任何东西。根不能被移动，因为它是所有节点的祖先。

---

## 3. 事件

只有**实际发生了变化**才会发 `NodeMoved` 事件。比较的是操作前后的真实状态，不是传进来的参数：

- `parentChanged`：旧父 id ≠ 新父 id
- `positionChanged`：旧索引 ≠ 新索引
- `sideChanged`：旧方向 ≠ 新方向

事件数据里只带变了的那几项（`oldParentId` / `oldPosition` / `oldSide`），没变的不带。观察者不用猜「这次到底什么变了」。

---

## 4. 边的自动管理

换父节点时自动处理父子连线：从旧父节点移除一条 `Child` 类型的 edge，在新父节点创建一条。这部分对调用方透明。

---

## 5. 使用示例

```ts
// 换父 + 定位置
mind.moveNode('jm-a1', { parentId: 'jm-b2', position: 0 });

// 只改兄弟顺序（同一个 parentId）
mind.moveNode('jm-a1', { parentId: 'jm-a1-parent', position: 2 });

// 改方向
mind.moveNode('jm-a1', { parentId: mind.root.id, side: -1 });

// 三种一起
mind.moveNode('jm-a1', { parentId: 'jm-c3', position: 1, side: -1 });


---

## 设计决策

这个模块的设计推演在 [`archive/design-decisions/node-move.md`](../archive/design-decisions/node-move.md)：
为什么用一个 `moveNode()` 而不是拆成 `changeParent()` / `reposition()` / `changeDirection()`
三个方法、为什么用 options 对象而不是多参数、为什么事件只在真正变化时才发，
以及被否决的替代方案和实现时踩过的坑。

改这个方法之前值得读一遍。
