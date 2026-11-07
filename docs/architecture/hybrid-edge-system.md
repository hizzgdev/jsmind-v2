# 混合边系统

jsMind v2 用两种不同的机制表达节点之间的关系：**树用直接字段，额外关系用边**。

---

## 1. 设计

| 关系类型 | 存储方式 | 容器 |
|----------|----------|------|
| 父子关系 | `JmNode.parent` / `JmNode.children`（直接引用） | `JmNode` 自身 |
| 额外关系（连线、引用等） | `JmEdge` 对象 | `JmMind._edges`（全局字典） |

**`edges` 只表达树之外的额外关系。** 父子关系永远不写进 `edges`。

---

## 2. 为什么不是全边模型

如果把父子关系也展开成 edge 对象，每条父子连线都是独立记录，有四个问题：

1. **兄弟顺序丢失。** 树用 `children: ["a","b","c"]`，数组索引即显示顺序。边列表没有顺序概念，要另加 `order` 字段。
2. **Agent 生成难度。** 模型要同时维护 id 账本、保证无孤儿无环、保证每个节点恰好一个父。嵌套结构天然满足这些约束。
3. **体积。** 父 + 3 子：树约 20 字节（`"children":["a","b","c"]`），边约 200 字节（三个对象各自带 id/source/target/type），差 5–10 倍。对自包含 HTML 文件的影响尤其大。
4. **每次操作都要重新验证"它还是一棵树"。** 树模型里这些约束由数据结构本身保证。

**推论：树是领域约束，不是图的特例。** 只有多父节点（DAG）成为需求时，树模型才不够用——但那已经是知识图谱而不是思维导图了。

---

## 3. 节点结构

`JmNode` 通过直接字段维护树关系，不存储任何 edge 对象：

```ts
class JmNode {
    parent: JmNode | null;
    children: JmNode[];
}
```

- 添加子节点：O(1) —— `children.push(node)` + `node.parent = parent`
- 删除节点：O(k)，k = 子节点数 —— 递归删子树 + 从父节点 `children` 中 splice
- 移动节点：O(1) —— 从旧父移除 + 加入新父

---

## 4. 边结构

```ts
class JmEdge {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    type: JmEdgeType;          // 当前只有 'link'
    label: string | null;
    style?: JmLineStyle;       // 与 JmNodeStyle.incoming 共用同一类型
}
```

`JmEdgeType.Link = 'link'` 是当前唯一的边类型。`style` 与节点入线共用 `JmLineStyle`，避免两套字段名不同的体系。

---

## 5. 边操作

```ts
// 添加
const edge = mind.addEdge(node1.id, node2.id, JmEdgeType.Link, { label: '依赖于' });

// 查询某个节点相关的所有边
const edges = mind.getEdges(nodeId);

// 按类型过滤
const links = mind.getEdges(nodeId, JmEdgeType.Link);

// 删除
mind.removeEdge(edge.id);
```

删除节点时**自动清理**所有引用该节点的边——扫描 `_edges` 全局字典，移除 `sourceNodeId` 或 `targetNodeId` 匹配的条目。

---

## 6. 序列化

```json
{
  "edges": {
    "jm-e1": {
      "id": "jm-e1",
      "sourceNodeId": "jm-a1",
      "targetNodeId": "jm-b3",
      "type": "link",
      "label": "影响",
      "style": { "color": "#e91e63", "pattern": "dotted" }
    }
  }
}
```

与 `nodes` 一样，`edges` 是 `Record<string, SerializedEdge>`，key 必须等于 `edge.id`。