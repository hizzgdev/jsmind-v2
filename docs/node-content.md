# Node Content System

## Overview

The Node Content System in JsMind v2 provides a flexible and extensible way to handle different types of content within mind map nodes. This system separates content type from content value, allowing for future expansion to support various content formats beyond simple text.

## Design Decisions and Evolution

### Initial Requirements and Analysis

The Node Content System was designed based on several key requirements and analysis of the original `jsmind` repository:

1. **Strong Typing**: Unlike the original implementation, JsMind v2 emphasizes strong typing and interfaces for better code quality and developer experience.

2. **Separation of Concerns**: Content type and value are separated to allow for future extensibility while maintaining backward compatibility.

3. **Validation-First Approach**: The system enforces strict validation at construction time rather than deferring validation to usage time.

### Key Design Decisions Made

#### 1. Content Type Enum vs. String Literals
**Decision**: Use an enum (`JmNodeContentType`) instead of string literals or magic strings.

**Rationale**:
- **Type Safety**: Enums provide compile-time checking and prevent typos
- **Maintainability**: Centralized definition makes it easier to add new types
- **Documentation**: Self-documenting code that clearly shows available options
- **IDE Support**: Better autocomplete and refactoring support

**Alternative Considered**: Direct string usage like `'text'`, `'image'` was rejected due to lack of type safety.

#### 2. Factory Methods vs. Direct Constructors
**Decision**: Provide static factory methods (e.g., `createText()`) alongside direct constructors.

**Rationale**:
- **Convenience**: Factory methods provide semantic clarity (`createText()` vs `new JmNodeContent(JmNodeContentType.Text, value)`)
- **Flexibility**: Developers can choose the approach that fits their use case
- **Future-Proofing**: Factory methods can be enhanced with additional logic without breaking existing code
- **Best Practice**: Factory methods are a well-established pattern for object creation

#### 3. Strict Validation at Construction
**Decision**: Validate content type immediately in the constructor, throwing errors for invalid types.

**Rationale**:
- **Fail Fast**: Errors are caught early, making debugging easier
- **Data Integrity**: Ensures only valid content types exist in the system
- **Consistency**: All nodes in the system are guaranteed to have valid content types
- **Performance**: Validation happens once at creation, not repeatedly during usage

**Alternative Considered**: Lazy validation was rejected as it could lead to runtime errors in unexpected places.

#### 4. Content as Required Parameter
**Decision**: Make content a required parameter in the `JmNode` constructor.

**Rationale**:
- **Data Completeness**: A node without content is not meaningful in a mind map
- **Consistency**: All nodes in the system have content, simplifying algorithms
- **Error Prevention**: Prevents creation of incomplete nodes that could cause issues later

**Alternative Considered**: Optional content was rejected as it would require null checks throughout the codebase.

#### 5. Type Checking Methods
**Decision**: Provide both generic (`hasType()`) and specific (`isText()`) type checking methods.

**Rationale**:
- **Generic Method**: Allows for dynamic type checking and future extensibility
- **Specific Methods**: Provide convenience and semantic clarity for common types
- **Performance**: Simple boolean checks are fast and efficient
- **Readability**: `node.content.isText()` is more readable than `node.content.hasType(JmNodeContentType.Text)`

### Evolution from Original jsmind

The original `jsmind` repository had a simpler approach where content was primarily text-based and stored directly in nodes. JsMind v2 evolved this approach by:

1. **Introducing Content Types**: Moving from simple string content to typed content objects
2. **Adding Validation**: Implementing strict validation that wasn't present in the original
3. **Enabling Extensibility**: Designing the system to easily support new content types
4. **Improving Type Safety**: Using modern JavaScript features and JSDoc for better type information

### Trade-offs and Considerations

#### Performance Trade-offs
- **Validation Cost**: Type validation adds a small overhead during node creation
- **Memory Usage**: Content objects use slightly more memory than direct string storage
- **Benefit**: The overhead is minimal compared to the benefits of type safety and validation

#### Complexity Trade-offs
- **Increased Complexity**: The system is more complex than simple string storage
- **Developer Experience**: The complexity is justified by better error messages, type safety, and extensibility
- **Maintenance**: More complex code requires more thorough testing, which is addressed through comprehensive test coverage

#### Backward Compatibility
- **API Changes**: The new system is not backward compatible with the original jsmind
- **Migration Path**: Clear documentation and examples help developers migrate to the new system
- **Future Benefits**: The investment in the new system pays off with better maintainability and extensibility

## Architecture

### Core Components

#### 1. JmNodeContentType Enum
```javascript
export const JmNodeContentType = {
    Text: 'text',
};
```

**Purpose**: Defines the available content types that nodes can contain.

**Current Types**:
- `Text`: Standard text content for node labels and descriptions

**Extensibility**: New content types can be added to support:
- Rich text with formatting
- Images and media
- HTML content
- Markdown content
- Custom data structures

#### 2. JmNodeContent Class
```javascript
export class JmNodeContent {
    constructor(type, value)
    hasType(type)
    isText()
    static createText(text)
}
```

**Purpose**: Encapsulates content data with type safety and validation.

**Properties**:
- `type`: The content type (must be a valid JmNodeContentType)
- `value`: The actual content data (any type)

**Methods**:
- `hasType(type)`: Check if content matches a specific type
- `isText()`: Convenience method to check if content is text type
- `createText(text)`: Static factory method for creating text content

#### 3. JmNode Integration
```javascript
export class JmNode {
    constructor(id, content)
    // ... other properties and methods
}
```

**Purpose**: Mind map nodes that contain and manage content.

**Content Integration**:
- Each node has a `content` property of type `JmNodeContent`
- Content is required during node construction
- Content participates in node equality comparisons

## Usage Examples

### Creating Text Content

#### Using the Factory Method (Recommended)
```javascript
import { JmNodeContent } from './jsmind.node.content.js';

// Create text content
const textContent = JmNodeContent.createText('My Node Label');
const emptyTextContent = JmNodeContent.createText('');
const nullTextContent = JmNodeContent.createText(null);
```

#### Using the Constructor Directly
```javascript
import { JmNodeContent, JmNodeContentType } from './jsmind.node.content.js';

// Create text content with explicit type
const textContent = new JmNodeContent(JmNodeContentType.Text, 'My Node Label');
```

### Creating Nodes with Content

```javascript
import { JmNode } from './jsmind.node.js';
import { JmNodeContent } from './jsmind.node.content.js';

// Create a node with text content
const content = JmNodeContent.createText('Root Node');
const node = new JmNode('root', content);

// Access content properties
console.log(node.content.type);  // 'text'
console.log(node.content.value); // 'Root Node'
```

### Content Type Checking

```javascript
import { JmNodeContent, JmNodeContentType } from './jsmind.node.content.js';

const content = JmNodeContent.createText('Hello World');

// Check specific type
if (content.hasType(JmNodeContentType.Text)) {
    console.log('Content is text type');
}

// Convenience method for text
if (content.isText()) {
    console.log('Content is text type');
}
```

### Working with Mind Maps

```javascript
import { JmMind } from './jsmind.mind.js';
import { JmNodeContent } from './jsmind.node.content.js';

const mind = new JmMind(options);

// Add nodes with content
const child1 = mind.addChildNode(
    mind.root.id, 
    JmNodeContent.createText('Child Node 1')
);

const child2 = mind.addChildNode(
    mind.root.id, 
    JmNodeContent.createText('Child Node 2')
);
```

## Validation and Error Handling

### Content Type Validation

The system enforces strict type validation:

```javascript
// ❌ Invalid: Unknown content type
try {
    new JmNodeContent('invalid_type', 'Hello');
} catch (error) {
    console.log(error.message); // "Invalid content type: invalid_type"
}

// ❌ Invalid: Null or undefined type
try {
    new JmNodeContent(null, 'Hello');
} catch (error) {
    console.log(error.message); // "Invalid content type: null"
}

// ❌ Invalid: Empty string type
try {
    new JmNodeContent('', 'Hello');
} catch (error) {
    console.log(error.message); // "Invalid content type: "
}
```

### Node Content Requirements

Nodes require valid content during construction:

```javascript
// ❌ Invalid: Missing content
try {
    new JmNode('root');
} catch (error) {
    console.log(error.message); // "Content is required"
}

// ❌ Invalid: Null content
try {
    new JmNode('root', null);
} catch (error) {
    console.log(error.message); // "Content is required"
}
```

## Content Equality and Comparison

### Content Equality

Content objects are compared by both type and value:

```javascript
const content1 = new JmNodeContent(JmNodeContentType.Text, 'Hello');
const content2 = new JmNodeContent(JmNodeContentType.Text, 'Hello');
const content3 = new JmNodeContent(JmNodeContentType.Text, 'World');

// Same type and value
console.log(content1.type === content2.type);   // true
console.log(content1.value === content2.value); // true

// Same type, different value
console.log(content1.type === content3.type);   // true
console.log(content1.value === content3.value); // false
```

### Node Equality with Content

Node equality includes content comparison:

```javascript
const node1 = new JmNode('node1', JmNodeContent.createText('Hello'));
const node2 = new JmNode('node1', JmNodeContent.createText('Hello'));
const node3 = new JmNode('node1', JmNodeContent.createText('World'));

// Nodes with same content are equal
console.log(node1.equals(node2)); // true

// Nodes with different content are not equal
console.log(node1.equals(node3)); // false
```

## Serialization Support

The node content system integrates with the serialization system:

```javascript
import { JmMindJsonSerializer } from './src/serialization/jsmind.json.serializer.js';

// JSON serialization preserves content structure
const node = new JmNode('root', JmNodeContent.createText('Root'));
const serializer = new JmMindJsonSerializer();
const serialized = serializer.serialize(mind);

// Content is serialized as:
// {
//   "id": "root",
//   "content": {
//     "type": "text",
//     "value": "Root"
//   }
//   // ... other node properties
// }
```

## Testing

The node content system includes comprehensive test coverage:

### Test Files
- `__tests__/jsmind.node.content.test.js` - Content class tests
- `__tests__/jsmind.node.test.js` - Node integration tests

### Test Coverage Areas
- Content type validation
- Content creation and factory methods
- Type checking methods
- Error handling for invalid inputs
- Content equality comparison
- Node integration with content
- Edge cases (null, undefined, empty values)

## Future Extensibility

### Adding New Content Types

To add a new content type:

1. **Extend the enum**:
```javascript
export const JmNodeContentType = {
    Text: 'text',
    Image: 'image',        // New type
    RichText: 'rich_text', // New type
};
```

2. **Add convenience methods**:
```javascript
export class JmNodeContent {
    // ... existing methods ...
    
    isImage() {
        return this.hasType(JmNodeContentType.Image);
    }
    
    static createImage(imageUrl) {
        return new JmNodeContent(JmNodeContentType.Image, imageUrl);
    }
}
```

3. **Update validation** (if needed):
```javascript
constructor(type, value) {
    if (!type || !Object.values(JmNodeContentType).includes(type)) {
        throw new Error(`Invalid content type: ${type}`);
    }
    
    // Add type-specific validation
    if (type === JmNodeContentType.Image && typeof value !== 'string') {
        throw new Error('Image content must have string URL value');
    }
    
    this.type = type;
    this.value = value;
}
```

### Content Type Categories

Future content types could be organized into categories:

- **Text-based**: Text, RichText, Markdown, HTML
- **Media**: Image, Video, Audio
- **Data**: JSON, XML, CSV
- **Interactive**: Form, Button, Link

## Best Practices

### 1. Use Factory Methods
```javascript
// ✅ Recommended
const content = JmNodeContent.createText('Node Label');

// ❌ Avoid direct constructor
const content = new JmNodeContent(JmNodeContentType.Text, 'Node Label');
```

### 2. Validate Content Before Use
```javascript
// ✅ Check content type before processing
if (node.content.isText()) {
    const textValue = node.content.value;
    // Process text content
}
```

### 3. Handle Content Errors Gracefully
```javascript
try {
    const content = JmNodeContent.createText(userInput);
    const node = new JmNode('node1', content);
} catch (error) {
    console.error('Failed to create node:', error.message);
    // Provide fallback or user feedback
}
```

### 4. Use Content in Serialization
```javascript
// ✅ Content-aware serialization
const serializedNode = {
    id: node.id,
    content: {
        type: node.content.type,
        value: node.content.value
    }
    // ... other properties
};
```

## Summary

The Node Content System provides:

- **Type Safety**: Enforced content type validation
- **Extensibility**: Easy addition of new content types
- **Integration**: Seamless integration with nodes and mind maps
- **Serialization**: Full support for data persistence
- **Testing**: Comprehensive test coverage
- **Future-Proof**: Designed for expansion beyond text content

This system forms the foundation for rich, diverse content representation in JsMind v2 mind maps, enabling users to create more engaging and informative visualizations.
