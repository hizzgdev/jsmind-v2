# Node Move Operations

## Overview

The `moveNode` method in the `JmMind` class provides comprehensive functionality for moving nodes within a mind map. This includes changing a node's parent, repositioning it among siblings, and updating its direction. The system is designed with performance, maintainability, and user experience in mind.

## Design Decisions and Evolution

### Initial Requirements and Analysis

The `moveNode` method was designed based on several key requirements and analysis of typical mind map operations:

1. **Comprehensive Movement**: Support for parent changes, position changes, and direction updates in a single operation
2. **Performance Optimization**: Efficient handling of same-parent operations vs. cross-parent operations
3. **Event System Integration**: Smart event emission that only fires when actual changes occur
4. **Edge Management**: Automatic creation and removal of edges to maintain data consistency
5. **Validation and Safety**: Comprehensive error checking and prevention of invalid operations

### Key Design Decisions Made

#### 1. Single Method vs. Multiple Specialized Methods
**Decision**: Use a single `moveNode` method with an options object instead of separate methods like `changeParent()`, `reposition()`, and `changeDirection()`.

**Rationale**:
- **Atomic Operations**: All changes happen in a single, atomic operation
- **Consistency**: Ensures data consistency across all operations
- **Performance**: Single method call is more efficient than multiple calls
- **User Experience**: Simpler API with fewer methods to remember
- **Event Management**: Single event emission for all changes

**Alternative Considered**: Multiple specialized methods were rejected as they could lead to inconsistent state and complex event handling.

#### 2. Options Object vs. Multiple Parameters
**Decision**: Use a `NodeMoveOptions` object instead of multiple individual parameters.

**Rationale**:
- **Flexibility**: All options are optional and can be combined
- **Extensibility**: Easy to add new options without breaking existing code
- **Clarity**: Clear which options are being set
- **Default Handling**: Natural way to handle optional parameters
- **API Consistency**: Follows the same pattern as other methods like `addChildNode`

**Alternative Considered**: Multiple parameters were rejected as they would make the method signature complex and hard to extend.

#### 3. Smart Event Emission vs. Always Emit
**Decision**: Only emit events when actual changes occur, with event data containing only changed properties.

**Rationale**:
- **Performance**: Avoids unnecessary event processing
- **Accuracy**: Event data accurately reflects what changed
- **Efficiency**: Reduces observer overhead for no-change operations
- **Debugging**: Clearer event logs with relevant information only
- **User Experience**: Observers only react to meaningful changes

**Alternative Considered**: Always emitting events was rejected as it would create noise and performance overhead.

#### 4. Helper Method Extraction vs. Monolithic Implementation
**Decision**: Extract complex logic into focused helper methods while inlining simple operations.

**Rationale**:
- **Maintainability**: Each helper method has a single, clear responsibility
- **Testability**: Helper methods can be tested independently
- **Readability**: Main method is easier to understand
- **Reusability**: Helper methods can be reused if needed
- **Performance**: Simple operations are inlined to avoid method call overhead

**Alternative Considered**: Monolithic implementation was rejected as it would be hard to maintain and test.

#### 5. Result-Based Change Detection vs. Target-Based Detection
**Decision**: Detect changes by comparing actual node state with old values, not by comparing target values with old values.

**Rationale**:
- **Accuracy**: Detects what actually changed, not what was requested
- **Edge Case Handling**: Catches cases where requests don't result in changes
- **Cleaner Logic**: No complex target variable comparisons
- **Event Accuracy**: Events reflect actual state changes
- **Debugging**: Easier to understand what actually happened

**Alternative Considered**: Target-based detection was rejected as it could miss cases where requests don't result in changes.

### Evolution from Initial Implementation

The `moveNode` method evolved significantly from its initial implementation:

#### Version 1: Monolithic Method
Initially, all logic was contained within a single `moveNode` method, making it complex and hard to maintain.

#### Version 2: Extracted Helper Methods
The logic was broken down into focused helper methods:
- `_removeNodeFromParent()` - Handle node removal from parent
- `_addNodeToParent()` - Handle node addition to new parent
- `_repositionNodeInSameParent()` - Handle same-parent repositioning
- `_emitNodeMovedEventIfChanged()` - Handle smart event emission

#### Version 3: Method Inlining and Simplification
Simple helper methods were inlined to reduce unnecessary abstraction:
- `_updateNodeDirection()` - Inlined as simple assignment
- `_createEdgeToNewParent()` - Inlined into `_addNodeToParent`
- `_removeEdgeToParent()` - Inlined into `_removeNodeFromParent`

### Trade-offs and Considerations

#### Performance Trade-offs
- **Method Call Overhead**: Helper methods add small overhead but improve maintainability
- **Event Emission**: Smart events reduce overhead but add complexity
- **Change Detection**: Result-based detection is more accurate but requires state capture
- **Benefit**: The performance overhead is minimal compared to the benefits of better architecture

#### Complexity Trade-offs
- **Increased Complexity**: The system is more complex than simple move operations
- **Developer Experience**: The complexity is justified by better performance, maintainability, and user experience
- **Learning Curve**: Slightly steeper learning curve, but better long-term benefits

#### Memory and Resource Trade-offs
- **State Capture**: Capturing old values uses temporary memory
- **Event Objects**: Creating event objects for each change
- **Benefit**: Better debugging, accurate events, and improved user experience

### Implementation Challenges and Solutions

#### 1. Edge Management Complexity
**Challenge**: Managing edges during parent changes while maintaining consistency.

**Solution**: Automatic edge creation/removal in helper methods with proper validation.

#### 2. Event Data Construction
**Challenge**: Building event data that only includes changed properties.

**Solution**: Dynamic event data construction based on change detection flags.

#### 3. Position Handling Semantics
**Challenge**: Defining clear semantics for undefined, null, and numeric positions.

**Solution**: Consistent handling where undefined/null mean "no change" and numbers mean "specific position".

#### 4. Change Detection Accuracy
**Challenge**: Accurately detecting what actually changed vs. what was requested.

**Solution**: Compare actual node state with captured old values instead of target values.

## Architecture

### Core Components

#### 1. moveNode Method
The main entry point that orchestrates all move operations:

```javascript
moveNode(nodeId, options) {
    // 1. Validation
    // 2. Node lookup and capture old state
    // 3. Parent change (if needed)
    // 4. Position update (if needed)
    // 5. Direction update (if needed)
    // 6. Event emission (if changes occurred)
}
```

#### 2. Helper Methods
Focused methods for specific operations:

- **`_removeNodeFromParent(node)`**: Handles node removal and edge cleanup
- **`_addNodeToParent(node, targetParent, targetPosition)`**: Handles node addition and edge creation
- **`_repositionNodeInSameParent(node, targetPosition)`**: Handles same-parent repositioning
- **`_emitNodeMovedEventIfChanged(node, oldParent, oldPosition, oldDirection)`**: Handles smart event emission

#### 3. NodeMoveOptions Type
```javascript
/**
 * @typedef {Object} NodeMoveOptions
 * @property {string} [parentId] - The ID of the new parent node
 * @property {number|null} [position] - The new position index among siblings
 * @property {JmNodeDirection} [direction] - The new visual direction
 */
```

### Operation Flow

```
1. Validation → 2. State Capture → 3. Parent Change → 4. Position Update → 5. Direction Update → 6. Event Emission
```

### Edge Management

The system automatically handles edges:
- **Removes** edges from old parent to node
- **Creates** edges from new parent to node
- **Validates** edge properties during operations
- **Maintains** edge count consistency

## Usage Examples

### Basic Node Movement

```javascript
// Move a node to a new parent at position 0
const movedNode = mind.moveNode('node_123', {
    parentId: 'parent_456',
    position: 0,
    direction: JmNodeDirection.Right
});
```

### Repositioning Within Same Parent

```javascript
// Move a node to position 2 within the same parent
const movedNode = mind.moveNode('node_123', {
    position: 2
});
```

### Direction Change Only

```javascript
// Change only the direction without moving
const movedNode = mind.moveNode('node_123', {
    direction: JmNodeDirection.Left
});
```

### Move to End of Parent

```javascript
// Move a node to the end of its parent's children
const movedNode = mind.moveNode('node_123', {
    parentId: 'parent_456',
    position: null  // null means "add to end"
});
```

## Implementation Details

### Validation Strategy

The method validates inputs at multiple levels:

```javascript
// 1. Options validation
if (!options || Object.keys(options).length === 0) {
    throw new JsMindError('Options are required for moveNode operation');
}

// 2. Node existence validation
const node = this._getNodeById(nodeId);
if (!node) {
    throw new JsMindError(`Node with ID '${nodeId}' not found`);
}

// 3. Root node protection
if (node === this.root) {
    return this.nodeManager.manage(node);
}

// 4. Parent existence validation
if (targetParentId) {
    const targetParent = this._getNodeById(targetParentId);
    if (!targetParent) {
        throw new JsMindError(`Target parent with ID '${targetParentId}' not found`);
    }
}

// 5. Circular reference prevention
if (targetParent && targetParent.isDescendant(node)) {
    throw new JsMindError('Cannot move a node to be its own descendant');
}
```

### State Capture

Old values are captured before any changes:

```javascript
// Capture original values before any changes
const oldParent = node.parent;
const oldPosition = node.parent ? node.parent.children.indexOf(node) : -1;
const oldDirection = node.direction;
```

### Change Detection

Changes are detected by comparing actual state with old values:

```javascript
const parentChanged = oldParent.id !== node.parent.id;
const positionChanged = oldPosition !== node.parent.children.indexOf(node);
const directionChanged = oldDirection !== node.direction;
```

### Event Data Construction

Event data is built dynamically based on actual changes:

```javascript
const eventData = {
    'node': node
};

// Only include changed properties in event data
if (parentChanged) {
    eventData.oldParentId = oldParent.id;
}
if (positionChanged) {
    eventData.oldPosition = oldPosition;
}
if (directionChanged) {
    eventData.oldDirection = oldDirection;
}
```

## Error Handling

### Validation Errors

- **Missing Options**: Throws error if no options provided
- **Empty Options**: Throws error if options object is empty
- **Invalid Node ID**: Throws error if source node not found
- **Invalid Parent ID**: Throws error if target parent not found
- **Circular Reference**: Prevents moving node to its own descendant

### Error Examples

```javascript
// ❌ Will throw error
mind.moveNode('node_123');  // No options

// ❌ Will throw error
mind.moveNode('node_123', {});  // Empty options

// ❌ Will throw error
mind.moveNode('non-existent', { parentId: 'parent_456' });

// ❌ Will throw error
mind.moveNode('node_123', { parentId: 'non-existent-parent' });
```

## Performance Considerations

### Optimization Features

- **Early Returns**: Skip processing for root nodes
- **Change Detection**: Only perform operations when needed
- **Smart Events**: Emit events only for actual changes
- **Efficient Repositioning**: Optimized for same-parent operations

### Same-Parent Optimization

When moving within the same parent, the method uses optimized logic:

```javascript
// Only reposition if position actually changed
if (currentIndex !== newPosition) {
    parent.children.splice(currentIndex, 1);
    parent.children.splice(newPosition, 0, node);
}
```

### Edge Management Efficiency

Edge operations are optimized:

```javascript
// Use Object.values for efficient iteration
Object.values(this._edges)
    .filter(edge => edge.sourceNodeId === parent.id &&
                   edge.targetNodeId === node.id &&
                   edge.type === JmEdgeType.Child)
    .forEach(edge => delete this._edges[edge.id]);
```

## Testing

### Test Coverage

The `moveNode` method is thoroughly tested with comprehensive unit tests:

- **File**: `__tests__/jsmind.mind.test.js`
- **Coverage**: All moveNode functionality and edge cases
- **Tests Include**:
  - Valid operations with various option combinations
  - Error cases and validation
  - Edge cases (root nodes, empty options, null positions)
  - Performance optimizations (same-parent operations)
  - Event emission accuracy
  - Edge management consistency

### Running Tests

```bash
npm test
```

## Future Enhancements

### Potential Improvements

- **Bulk Operations**: Support for moving multiple nodes at once
- **Custom Edge Types**: Support for different edge types beyond Child
- **Position Constraints**: Validation for position bounds
- **Undo/Redo**: Integration with history management system
- **Move Validation**: Custom validation rules for specific use cases

### Extension Points

The current design provides clear extension points:

- **New Move Types**: Easy to add new move operations
- **Custom Validators**: Pluggable validation system
- **Event Extensions**: Flexible event data structure
- **Helper Methods**: Modular design for easy modification

## Best Practices

### 1. Use Options Object
```javascript
// ✅ Recommended
mind.moveNode('node_123', {
    parentId: 'new_parent',
    position: 0,
    direction: JmNodeDirection.Right
});

// ❌ Avoid multiple parameters
// mind.moveNode('node_123', 'new_parent', 0, JmNodeDirection.Right);
```

### 2. Handle Errors Gracefully
```javascript
try {
    const movedNode = mind.moveNode('node_123', options);
    // Process successful move
} catch (error) {
    console.error('Move failed:', error.message);
    // Provide user feedback or fallback
}
```

### 3. Check for Changes
```javascript
// Listen for move events to track changes
mind.observerManager.addObserver((event) => {
    if (event.type === JmMindEventType.NodeMoved) {
        console.log('Node moved:', event.data.node.id);
        if (event.data.oldParentId) {
            console.log('Parent changed from:', event.data.oldParentId);
        }
    }
});
```

### 4. Optimize for Same-Parent Operations
```javascript
// For same-parent repositioning, only specify position
mind.moveNode('node_123', { position: 2 });

// For parent changes, specify parentId
mind.moveNode('node_123', { parentId: 'new_parent' });
```

## Summary

The `moveNode` method provides:

- **Comprehensive Movement**: Parent, position, and direction changes in one operation
- **Performance Optimization**: Efficient handling of different move types
- **Smart Events**: Only fires when actual changes occur
- **Edge Management**: Automatic edge creation and removal
- **Validation**: Comprehensive error checking and prevention
- **Extensibility**: Clear extension points for future enhancements

This implementation serves as a model for how complex operations can be broken down into manageable, testable components while maintaining excellent performance and user experience.

The design decisions reflect careful consideration of:
- **User Experience**: Clear API semantics and helpful error messages
- **Performance**: Optimized operations and smart event emission
- **Maintainability**: Clean separation of concerns and focused helper methods
- **Extensibility**: Clear extension points for future enhancements
