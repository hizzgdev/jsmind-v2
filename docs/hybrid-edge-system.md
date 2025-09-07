# Hybrid Edge System

## Overview

The hybrid edge system in JsMind v2 provides an optimal balance between performance and extensibility for managing relationships in mind maps. This system combines the efficiency of direct field access for core tree operations with the flexibility of a global edge store for additional relationships. The design addresses the complexity and performance concerns of a fully edge-based system while maintaining extensibility for future relationship types.

## Design Decisions and Evolution

### Initial Requirements and Analysis

The hybrid edge system was designed based on several key requirements and analysis of the previous edge system implementation:

1. **Performance Optimization**: Tree operations (add/remove/move nodes) are the most common operations in mind mapping and must be extremely fast.

2. **Complexity Reduction**: The previous bidirectional edge system introduced significant complexity in maintaining consistency between parent and child edges.

3. **Extensibility**: The system must support future relationship types (links, references, annotations) without affecting core tree performance.

4. **Memory Efficiency**: Minimize memory overhead per node while maintaining fast access to relationships.

5. **API Simplicity**: Provide a clean, intuitive API that abstracts the underlying complexity from users.

### Key Design Decisions Made

#### 1. Hybrid Architecture vs. Pure Edge System
**Decision**: Use a hybrid approach with direct fields for tree relationships and global edge store for additional relationships.

**Rationale**:
- **Performance**: Tree operations are O(1) using direct field access instead of O(n) edge traversal
- **Simplicity**: No bidirectional edge management needed for parent-child relationships
- **Separation of Concerns**: Tree structure and additional relationships are handled separately
- **Memory Efficiency**: Minimal overhead per node, edges only stored when needed
- **Maintainability**: Simpler code with fewer edge cases to handle

**Alternative Considered**: Pure edge system was rejected due to performance overhead and complexity of bidirectional management.

#### 2. Direct Fields vs. Edge-Based Tree Structure
**Decision**: Use direct `parent` and `children` fields in `JmNode` for tree relationships.

**Rationale**:
- **Performance**: O(1) access and modification for tree operations
- **Simplicity**: No edge traversal needed for common operations
- **Intuitive**: Direct field access matches mental model of tree structure
- **Efficiency**: No additional objects or references to manage
- **Consistency**: Standard tree data structure pattern

**Alternative Considered**: Edge-based tree structure was rejected due to performance overhead and complexity.

#### 3. Global Edge Store vs. Node-Centric Edge Storage
**Decision**: Store additional edges in a global `_edges` object in `JmMind` rather than in individual nodes.

**Rationale**:
- **Efficient Cleanup**: Node removal only requires scanning the global store, not all nodes
- **No Node Pollution**: Nodes remain focused on their core tree structure
- **Centralized Management**: All additional relationships in one place
- **Query Performance**: Can efficiently find all edges of a specific type
- **Memory Efficiency**: No edge storage overhead for nodes without additional relationships

**Alternative Considered**: Node-centric edge storage was rejected due to cleanup complexity and memory overhead.

#### 4. String Enums vs. Numeric Enums
**Decision**: Use string values for `JmEdgeType` enum (e.g., `'link'` instead of `1`).

**Rationale**:
- **Readability**: String values are self-documenting and easier to understand
- **JSON Compatibility**: Strings serialize naturally to JSON without conversion
- **Debugging**: Easier to debug with meaningful string values
- **Extensibility**: Adding new types doesn't require careful numbering
- **Maintenance**: No need to manage numeric constants

**Alternative Considered**: Numeric enums were rejected due to poor readability and JSON serialization issues.

#### 5. Simplified JmEdge Structure
**Decision**: Remove `sourceNodeId` and `type` from `JmEdge` constructor, add optional `label` parameter.

**Rationale**:
- **Simplicity**: Fewer required parameters make the API easier to use
- **Flexibility**: Optional label allows for rich edge metadata
- **Consistency**: Matches the pattern of other simplified classes
- **Future-Proofing**: Label field can store additional edge information
- **Clean API**: Constructor focuses on essential edge properties

**Alternative Considered**: Complex edge structure was rejected in favor of simplicity and usability.

## Architecture

### Core Components

The hybrid edge system consists of three main components:

1. **JmNode**: Contains direct `parent` and `children` fields for tree relationships
2. **JmMind**: Manages global `_edges` store for additional relationships
3. **JmEdge**: Represents additional relationships with simplified structure

### JmNode Structure

```javascript
class JmNode {
  constructor(id, content) {
    this.id = id;
    this.content = content;
    
    // Direct fields for core tree structure
    this.parent = null;        // Reference to parent node
    this.children = [];        // Array of child nodes
    
    // Other properties...
    this.folded = false;
    this.direction = null;
    this.data = {};
  }
}
```

**Key Features:**
- **No `edges` property**: Nodes do not store any edge information locally
- **Direct parent/children**: Fast access and modification for tree operations
- **Simplified state**: Each node only knows about its immediate tree relationships

### JmMind Structure

```javascript
class JmMind {
  constructor(mindOptions) {
    // Existing properties...
    
    // Global store for additional relationships
    this._edges = {}; // edgeId -> JmEdge
  }
}
```

**Key Features:**
- **Global edge store**: Only stores non-tree relationships (links, references, etc.)
- **No redundancy**: Tree relationships are not duplicated in the edge store
- **Centralized management**: All additional edge operations go through the global store

### JmEdge Structure

```javascript
class JmEdge {
  constructor(id, sourceNodeId, targetNodeId, type, label = null) {
    this.id = id;
    this.sourceNodeId = sourceNodeId;
    this.targetNodeId = targetNodeId;
    this.type = type;           // 'link', 'reference', etc.
    this.label = label;
  }
}
```

**Key Features:**
- **Simplified structure**: Contains only essential relationship information
- **Type-based**: Uses string types for additional relationships
- **No tree types**: Parent-child relationships are not represented as edges

## Edge Types

### Core Tree Relationships
- **Parent-Child**: Managed through direct `parent` and `children` fields
- **Performance**: O(1) access and modification
- **Operations**: Add, remove, move nodes using direct field manipulation

### Additional Relationships
- **Link**: Custom connections between nodes (e.g., cross-references)
- **Future Types**: References, annotations, dependencies can be easily added

## API Reference

### Tree Operations

Tree operations use direct field manipulation for maximum performance:

#### Adding a Child Node
```javascript
addChildNode(parentId, content, options = {}) {
  const parent = this._getNodeById(parentId);
  const child = this._newNode(nodeId, content);
  
  // Direct field manipulation - O(1) operation
  child.parent = parent;
  parent.children.push(child);
  
  // Emit events, update positions, etc.
  this.observerManager.notifyObservers(new JmMindEvent(
    JmMindEventType.NodeAdded, { 'node': child }
  ));
}
```

#### Removing a Node
```javascript
removeNode(nodeId) {
  const node = this._getNodeById(nodeId);
  
  // Handle tree structure - O(1) operation
  if (node.parent) {
    const parent = node.parent;
    const index = parent.children.indexOf(node);
    parent.children.splice(index, 1);
  }
  
  // Remove all children recursively
  node.children.forEach(child => this.removeNode(child.id));
  
  // Clean up additional edges - O(m) where m is number of edges
  const edgeIds = Object.values(this._edges)
    .filter(edge => nodeIds.includes(edge.sourceNodeId) || nodeIds.includes(edge.targetNodeId))
    .map(edge => edge.id);
  edgeIds.forEach(id => delete this._edges[id]);
  
  // Remove node from mind map
  delete this._nodes[nodeId];
}
```

#### Moving a Node
```javascript
moveNode(nodeId, options = {}) {
  const node = this._getNodeById(nodeId);
  const targetParent = this._getNodeById(options.parentId);
  
  // Remove from current parent - O(1) operation
  if (node.parent) {
    const currentParent = node.parent;
    const index = currentParent.children.indexOf(node);
    currentParent.children.splice(index, 1);
  }
  
  // Add to new parent - O(1) operation
  node.parent = targetParent;
  targetParent.children.push(node);
  
  // Handle positioning, events, etc.
}
```

### Additional Edge Operations

Additional edge operations use the global edge store:

#### EdgeCreationOptions

The `addEdge` method accepts an optional `EdgeCreationOptions` parameter:

```typescript
interface EdgeCreationOptions {
  edgeId?: string;  // Optional edge ID, will be generated if not provided
  label?: string;   // Optional label for the edge
}
```

#### Adding an Edge
```javascript
addEdge(sourceNodeId, targetNodeId, type, options) {
  // Validate nodes exist
  this._getNodeById(sourceNodeId);
  this._getNodeById(targetNodeId);

  const edgeId = (options && options.edgeId) || this._idGenerator.newId();
  const label = (options && options.label) || null;
  const edge = new JmEdge(edgeId, sourceNodeId, targetNodeId, type, label);
  this._edges[edgeId] = edge;

  // Emit event
  this.observerManager.notifyObservers(new JmMindEvent(
    JmMindEventType.EdgeAdded, { 'edge': edge }
  ));

  return edge;
}
```

**Usage Examples**:

```javascript
// Add edge with generated ID and no label
const edge1 = mind.addEdge(node1.id, node2.id, JmEdgeType.Link);

// Add edge with custom label
const edge2 = mind.addEdge(node1.id, node2.id, JmEdgeType.Link, { 
  label: 'Custom Link' 
});

// Add edge with custom ID and label
const edge3 = mind.addEdge(node1.id, node2.id, JmEdgeType.Link, { 
  edgeId: 'custom-edge-1',
  label: 'Custom Link' 
});
```

#### Removing an Edge
```javascript
removeEdge(edgeId) {
  const edge = this._edges[edgeId];
  if (edge) {
    delete this._edges[edgeId];

    // Emit event
    this.observerManager.notifyObservers(new JmMindEvent(
      JmMindEventType.EdgeRemoved, { 'edge': edge }
    ));

    return true;
  }
  return false;
}
```

#### Finding Edges
```javascript
getEdges(nodeId, type = null) {
  const edges = [];
  Object.values(this._edges).forEach(edge => {
    if (edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId) {
      if (!type || edge.type === type) {
        edges.push(edge);
      }
    }
  });
  return edges;
}
```

## Performance Characteristics

### Tree Operations
- **Add child**: O(1) - Direct field assignment
- **Remove node**: O(k) where k is the number of children - Direct array manipulation
- **Move node**: O(1) - Direct field updates
- **Traverse tree**: O(n) where n is the number of nodes - Standard tree traversal

### Additional Edge Operations
- **Add edge**: O(1) - Object property assignment
- **Remove edge**: O(1) - Object property deletion
- **Find edges for node**: O(m) where m is the total number of additional edges - Linear scan
- **Cleanup on node removal**: O(m) - Scan all additional edges

### Memory Usage
- **Per node**: Minimal overhead (only direct parent/children references)
- **Global edges**: Only stores additional relationships, not tree relationships
- **Scalability**: Excellent for large mind maps with few additional edges

## Usage Examples

### Basic Tree Operations

```javascript
// Create a mind map
const mind = new JmMind(options);

// Add child nodes
const child1 = mind.addChildNode(mind.root.id, JmNodeContent.createText('Child 1'));
const child2 = mind.addChildNode(mind.root.id, JmNodeContent.createText('Child 2'));

// Move a node
mind.moveNode(child1.id, {
  parentId: child2.id,
  position: 0,
  direction: JmNodeDirection.Right
});

// Remove a node (and all its children)
mind.removeNode(child2.id);
```

### Additional Edge Operations

```javascript
// Create links between nodes
const link1 = mind.addEdge(child1.id, child2.id, JmEdgeType.Link, 'related to');
const link2 = mind.addEdge(child2.id, child3.id, JmEdgeType.Link, 'depends on');

// Find all edges for a node
const nodeEdges = mind.getEdges(child1.id);
const linkEdges = mind.getEdges(child1.id, JmEdgeType.Link);

// Remove an edge
mind.removeEdge(link1.id);
```

### Event Handling

```javascript
// Listen for edge events
mind.observerManager.addObserver({
  onEdgeAdded: (event) => {
    console.log('Edge added:', event.data.edge);
  },
  onEdgeRemoved: (event) => {
    console.log('Edge removed:', event.data.edge);
  }
});
```

## Future Extensibility

### Adding New Edge Types

New relationship types can be easily added by extending the `JmEdgeType` enum:

```javascript
export const JmEdgeType = {
  Link: 'link',
  Reference: 'reference',    // New type
  Annotation: 'annotation',  // New type
  Dependency: 'dependency'   // New type
};
```

### Advanced Features

The hybrid system can support:
- **Edge weights**: For weighted relationships
- **Edge metadata**: Custom properties on edges
- **Edge validation**: Type-specific validation rules
- **Edge queries**: Complex relationship queries across the mind map

## Best Practices

### Tree Operations
- Always use direct field manipulation for parent-child relationships
- Ensure bidirectional consistency when modifying tree structure
- Handle edge cases like root nodes (no parent) and leaf nodes (no children)

### Additional Edge Operations
- Use the global store for all non-tree relationships
- Implement proper cleanup when nodes are removed
- Consider performance implications of edge queries on large mind maps

### Error Handling
- Validate node existence before edge operations
- Handle circular reference prevention for additional edges
- Provide clear error messages for invalid operations

## Conclusion

The hybrid edge system provides an optimal balance between performance and extensibility for JsMind. By using direct fields for core tree operations and a global store for additional relationships, we achieve:

- **Maximum performance** for the most common operations
- **Clean separation** between tree and non-tree relationships
- **Future extensibility** without compromising core functionality
- **Simplified maintenance** compared to a fully edge-based system

This design is particularly well-suited for mind mapping applications where tree operations dominate but occasional additional relationships are valuable for advanced use cases.
