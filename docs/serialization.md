# JsMind Serialization System

The JsMind serialization system provides a flexible and extensible way to serialize and deserialize mind maps in different formats.

## Overview

The serialization system follows a **Manager Pattern** with the following components:

- **`JmMindSerializer`** - Base interface for all serializers
- **`JmMindSerializationManager`** - Central coordinator for all serializers
- **Format-specific serializers** - Implementations for different formats

## Architecture

```
JmMind
  ↓
JmMindSerializationManager (singleton)
  ↓
Format Serializers (JSON, FreeMind, etc.)
```

## Supported Formats

### JSON Format (`json`)
- **Status**: ✅ Fully implemented
- **Features**: Complete serialization and deserialization
- **Structure**: Native JavaScript objects

### FreeMind Format (`freemind`)
- **Status**: 🚧 Placeholder implementation
- **Features**: Basic structure, not yet implemented
- **Structure**: XML-based format (planned)

## Usage

### Basic Serialization

```javascript
import { JmMind } from './src/jsmind.mind.js';

// Create a mind map
const mind = new JmMind(options);

// Serialize to JSON (automatically available)
const jsonData = mind.serialize('json');

// Serialize to FreeMind format (placeholder)
const freemindData = mind.serialize('freemind');
```

### Accessing Serialization Manager

```javascript
// Access the serialization manager directly
const manager = mind.serializationManager;

// Check supported formats
const formats = manager.getSupportedFormats();
console.log(formats); // ['json', 'freemind']

// Check if a format is supported
const isSupported = manager.isFormatSupported('json'); // true
const isNotSupported = manager.isFormatSupported('xmind'); // false

// Deserialize using the manager
const newMind = manager.deserialize(jsonData, 'json');
```

### Advanced Usage

```javascript
// Register custom serializers
const customSerializer = new MyCustomSerializer();
mind.serializationManager.registerSerializer(customSerializer);

// Now you can use the custom format
const customData = mind.serialize('custom');
```

## API Reference

### JmMind Methods

#### `serialize(format = 'json')`
Serializes the mind map to the specified format.

- **Parameters**:
  - `format` (string): Target format (default: 'json')
- **Returns**: Serialized data in the specified format

#### `serializationManager`
Provides direct access to the serialization manager instance.

- **Type**: `JmMindSerializationManager`
- **Access**: Read-only property
- **Usage**: Access advanced serialization features like custom serializers and format checking



### JmMindSerializationManager

#### `getInstance()`
Returns the singleton instance of the manager. **Automatically registers default serializers on first access.**

- **Returns**: `JmMindSerializationManager` instance
- **Behavior**: Creates instance on first call, registers JSON and FreeMind serializers automatically

#### `registerSerializer(serializer)`
Registers a new serializer.

- **Parameters**:
  - `serializer` (JmMindSerializer): Serializer to register
- **Validation**: Ensures serializer implements the `JmMindSerializer` interface

#### `serialize(mind, format)`
Serializes a mind map using the specified format.

- **Parameters**:
  - `mind` (JmMind): Mind map to serialize
  - `format` (string): Target format
- **Returns**: Serialized data
- **Throws**: Error if format is not supported

#### `deserialize(data, format)`
Deserializes data using the specified format.

- **Parameters**:
  - `data` (any): Data to deserialize
  - `format` (string): Source format
- **Returns**: `JmMind` instance
- **Throws**: Error if format is not supported

#### `getSupportedFormats()`
Returns an array of supported format names.

- **Returns**: Array of string format names
- **Note**: Includes automatically registered default formats

#### `isFormatSupported(format)`
Checks if a specific format is supported.

- **Parameters**:
  - `format` (string): Format to check
- **Returns**: Boolean indicating support

## Architecture

### Simplified Design

The serialization system has been designed with simplicity in mind:

1. **Automatic Registration**: Default serializers are registered automatically on first access
2. **Clean API**: JmMind provides a simple `serialize()` method for basic operations
3. **Direct Access**: Advanced users can access the serialization manager directly via `mind.serializationManager`
4. **No Complex State**: Simple singleton pattern without complex initialization tracking
5. **Interface Enforcement**: All serializers must implement the `JmMindSerializer` interface

### Key Benefits

- **Zero Configuration**: Users don't need to think about serializer registration
- **Extensible**: Easy to add new serializers through the manager
- **Clean Separation**: Core mind map operations separate from serialization concerns
- **Type Safe**: Runtime validation ensures serializers implement required interface

## Testing

### Test Coverage

The serialization system is thoroughly tested with comprehensive unit tests:

- **File**: `__tests__/jsmind.serialization.manager.test.js`
- **Coverage**: All serialization manager functionality
- **Tests Include**:
  - Singleton pattern verification
  - Static method behavior and `this` binding
  - Static property isolation
  - Serializer registration and retrieval
  - Format support checking
  - Error handling for unsupported formats
  - JmMind integration
  - Individual serializer implementations

### Running Tests

```bash
npm test
```

## Creating Custom Serializers

To create a new format serializer:

1. **Extend the base class**:
```javascript
import { JmMindSerializer } from './jsmind.serializer.js';

export class JmMindCustomSerializer extends JmMindSerializer {
    getFormatName() {
        return 'custom';
    }
    
    serialize(mind) {
        // Implementation
    }
    
    deserialize(data) {
        // Implementation
    }
    
    validate(data) {
        // Implementation
    }
}
```

2. **Register the serializer**:
```javascript
import { JmMindSerializationManager } from './jsmind.serialization.manager.js';
import { JmMindCustomSerializer } from './jsmind.custom.serializer.js';

const manager = JmMindSerializationManager.getInstance();
manager.registerSerializer(new JmMindCustomSerializer());
```

3. **Register as default serializer** (optional):
```javascript
// Register with the default serializers method
JmMindSerializationManager.registerDefaultSerializers(
    new JmMindJsonSerializer(),
    new JmMindFreeMindSerializer(),
    new JmMindCustomSerializer() // Add your custom serializer
);
```

## Auto-Registration

**Default serializers are automatically registered** when you first access the serialization system - no manual intervention required!

```javascript
// This automatically registers all default serializers
const mind = new JmMind(options);

// Serializers are immediately available
mind.serialize('json'); // ✅ Works
mind.serialize('freemind'); // ✅ Works (placeholder)
```

The auto-registration happens only once, so subsequent `JmMind` instances will use the already-registered serializers.

### **How It Works:**

1. **First access** to `JmMindSerializationManager.getInstance()` automatically registers JSON and FreeMind serializers
2. **All subsequent usage** reuses the registered serializers
3. **JmMind instances** automatically have access to all registered serializers
4. **Completely transparent** - users never need to think about registration
5. **Simple implementation** - registration happens directly in `getInstance()` method
6. **No complex state tracking** - simple singleton pattern with direct registration

## JSON Format Structure

The JSON format produces the following structure:

```json
{
  "meta": {
    "name": "Mind Map Name",
    "version": "1.0",
    "author": "Author Name"
  },
  "root": {
    "id": "root-id",
    "content": {
      "type": "text",
      "value": "Root Node Text"
    },
    "parent": null,
    "children": ["child-1-id", "child-2-id"],
    "folded": false,
    "position": null,
    "data": {}
  },
  "nodes": {
    "node-id": {
      "id": "node-id",
      "content": {
        "type": "text",
        "value": "Node Text"
      },
      "parent": "parent-id",
      "children": [],
      "folded": false,
      "position": null,
      "data": {}
    }
  },
  "edges": {
    "edge-id": {
      "id": "edge-id",
      "sourceNodeId": "source-id",
      "targetNodeId": "target-id",
      "type": 1
    }
  }
}
```



## Testing

### Test Coverage

The serialization system is thoroughly tested with comprehensive unit tests:

- **File**: `__tests__/jsmind.serialization.manager.test.js`
- **Coverage**: All serialization manager functionality
- **Tests Include**:
  - Singleton pattern verification
  - Static method behavior and `this` binding
  - Static property isolation
  - Serializer registration and retrieval
  - Format support checking
  - Error handling for unsupported formats
  - JmMind integration
  - Individual serializer implementations

### Running Tests

```bash
npm test
```

## Future Enhancements

- **FreeMind Format**: Complete XML-based serialization
- **XMind Format**: Support for XMind file format
- **Binary Formats**: Efficient binary serialization
- **Compression**: Data compression for large mind maps
- **Streaming**: Support for streaming serialization

## Summary

The JsMind serialization system provides a clean, simple, and extensible way to serialize and deserialize mind maps:

- **🔄 Automatic**: Default serializers are registered automatically
- **🧹 Clean**: Simple API with advanced features available when needed
- **🔧 Extensible**: Easy to add new serialization formats
- **✅ Tested**: Comprehensive test coverage ensures reliability
- **📚 Documented**: Clear examples and API reference

**Ready to use out of the box with zero configuration!** 🚀
