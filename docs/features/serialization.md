# JsMind Serialization System

The JsMind serialization system provides a flexible and extensible way to serialize and deserialize mind maps in different formats.

## Overview

The serialization system uses **external serializers** that can be used independently of the core `JmMind` class. This approach provides maximum flexibility and separation of concerns.

## Current Architecture

The serialization system consists of:

- **`JmMindSerializer`** - Base interface for all serializers
- **Format-specific serializers** - Implementations for different formats (JSON, FreeMind, etc.)
- **External usage** - Serializers are used directly, not integrated into `JmMind`

## Design Decisions and Evolution

### Current Design Philosophy

The serialization system was refactored to follow these principles:

1. **Separation of Concerns**: Serialization is completely separate from core mind map functionality
2. **External Usage**: Serializers are used directly, not through a manager or integrated into `JmMind`
3. **Simplicity**: No complex manager pattern or singleton dependencies
4. **Flexibility**: Each serializer can be used independently with any mind map instance

### Key Design Decisions

#### 1. External Serializers vs. Integrated Serialization
**Decision**: Use external serializers that are used directly, not integrated into the `JmMind` class.

**Rationale**:
- **Separation of Concerns**: Serialization logic is completely separate from core functionality
- **Simplicity**: No complex manager pattern or singleton dependencies
- **Flexibility**: Serializers can be used with any mind map instance
- **Testability**: Serializers can be tested independently
- **Reusability**: Serializers can be used in different contexts

**Previous Approach**: Manager pattern was removed due to complexity and circular dependency issues.

#### 2. Interface-Based Design
**Decision**: Define a `JmMindSerializer` interface that all serializers must implement.

**Rationale**:
- **Contract Enforcement**: Ensures all serializers follow the same contract
- **Type Safety**: Provides compile-time checking and better IDE support
- **Consistency**: All serializers have the same method signatures
- **Documentation**: Interface serves as living documentation of serializer requirements
- **Testing**: Easier to create mock serializers for testing

#### 3. Direct Usage Pattern
**Decision**: Serializers are instantiated and used directly.

**Rationale**:
- **Simplicity**: No complex registration or management needed
- **Performance**: No overhead from manager pattern
- **Flexibility**: Easy to customize or extend serializers
- **Clarity**: Clear and straightforward usage pattern

## Available Serializers

### JSON Serializer

The JSON serializer (`JmMindJsonSerializer`) is the primary serializer for JsMind mind maps.

**Features**:
- Serializes mind maps to JSON format
- Supports all mind map features (nodes, edges, metadata)
- Handles parent-child relationships and additional edges
- Validates data before serialization/deserialization

**Usage**:
```javascript
import { JmMindJsonSerializer } from './src/serialization/jsmind.json.serializer.js';
import { JmMind } from './src/jsmind.mind.js';

const mind = new JmMind();
const serializer = new JmMindJsonSerializer();

// Serialize
const jsonData = serializer.serialize(mind);

// Deserialize
const restoredMind = serializer.deserialize(jsonData);
```

### FreeMind Serializer

The FreeMind serializer (`JmMindFreeMindSerializer`) provides compatibility with FreeMind format.

**Features**:
- Serializes mind maps to FreeMind XML format
- Maintains compatibility with FreeMind software
- Handles FreeMind-specific attributes and structure

**Usage**:
```javascript
import { JmMindFreeMindSerializer } from './src/serialization/jsmind.freemind.serializer.js';

const serializer = new JmMindFreeMindSerializer();
const freemindData = serializer.serialize(mind);
```

## Serializer Interface

All serializers implement the `JmMindSerializer` interface:

```javascript
export class JmMindSerializer {
    /**
     * Get the format name
     * @returns {string} The format name
     */
    getFormatName() {
        throw new Error('Method must be implemented');
    }

    /**
     * Serialize a mind map
     * @param {JmMind} mind - The mind map to serialize
     * @returns {any} The serialized data
     */
    serialize(mind) {
        throw new Error('Method must be implemented');
    }

    /**
     * Deserialize data to a mind map
     * @param {any} data - The data to deserialize
     * @returns {JmMind} The deserialized mind map
     */
    deserialize(data) {
        throw new Error('Method must be implemented');
    }

    /**
     * Validate if data can be deserialized
     * @param {any} data - The data to validate
     * @returns {boolean} True if valid, false otherwise
     */
    validate(data) {
        throw new Error('Method must be implemented');
    }
}
```

## Data Format

### JSON Format

The JSON serializer produces data in the following format:

```json
{
  "meta": {
    "name": "My Mind Map",
    "version": "1.0",
    "author": "user@example.com"
  },
  "root": {
    "id": "root",
    "content": {
      "type": "text",
      "value": "My Mind Map"
    },
    "parent": null,
    "children": []
  },
  "nodes": {
    "node1": {
      "id": "node1",
      "content": {
        "type": "text",
        "value": "Child Node"
      },
      "parent": "root",
      "children": []
    }
  },
  "edges": {
    "edge1": {
      "id": "edge1",
      "sourceNodeId": "node1",
      "targetNodeId": "node2",
      "type": "link",
      "label": "Link Label"
    }
  }
}
```

## Error Handling

Serializers provide comprehensive error handling:

- **Validation Errors**: Invalid data is rejected with clear error messages
- **Format Errors**: Unsupported formats are handled gracefully
- **Type Errors**: Type mismatches are caught and reported
- **Missing Data**: Required fields are validated before processing

## Performance Considerations

The external serializer approach provides several performance benefits:

- **No Overhead**: No manager pattern or singleton overhead
- **Direct Access**: Serializers are used directly without indirection
- **Memory Efficiency**: No global state or registration overhead
- **Lazy Loading**: Serializers are only instantiated when needed

## Future Extensibility

The external serializer pattern makes it easy to add new formats:

1. **Create New Serializer**: Implement the `JmMindSerializer` interface
2. **Add Format Support**: Handle the specific format requirements
3. **Use Directly**: Instantiate and use the new serializer

No changes to core classes or manager registration are needed.

## Migration from Manager Pattern

If you were using the previous manager pattern, update your code as follows:

**Before (Manager Pattern)**:
```javascript
const mind = new JmMind();
const data = mind.serialize('json');
```

**After (External Serializers)**:
```javascript
const mind = new JmMind();
const serializer = new JmMindJsonSerializer();
const data = serializer.serialize(mind);
```

This change provides better separation of concerns and eliminates circular dependency issues.