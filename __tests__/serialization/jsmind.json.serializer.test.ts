/**
 * @fileoverview Tests for JmMindJsonSerializer
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { JmMindJsonSerializer, type SerializedMindMap } from '../../src/serialization/jsmind.json.serializer.ts';
import { JmMind } from '../../src/model/jsmind.mind.ts';
import { JmNodeContent } from '../../src/model/jsmind.node.content.ts';
import { JmNode } from '../../src/model/jsmind.node.ts';
import { JmEdge, JmEdgeType } from '../../src/model/jsmind.edge.ts';
import { JsMindError } from '../../src/common/error.ts';

test('JmMindJsonSerializer - getFormatName', () => {
    const serializer = new JmMindJsonSerializer();
    assert.strictEqual(serializer.getFormatName(), 'json');
});

test('JmMindJsonSerializer - serialize with null mind', () => {
    const serializer = new JmMindJsonSerializer();

    assert.throws(() => {
        serializer.serialize(null as unknown as JmMind);
    }, JsMindError, 'Should throw error for null mind');

    assert.throws(() => {
        serializer.serialize(undefined as unknown as JmMind);
    }, JsMindError, 'Should throw error for undefined mind');
});

test('JmMindJsonSerializer - serialize basic mind map', () => {
    const serializer = new JmMindJsonSerializer();

    // Create a simple mind map
    let nodeCounter = 0;
    const options = {
        nodeIdGenerator: { newId: () => `node${++nodeCounter}` },
        edgeIdGenerator: { newId: () => 'edge1' }
    };

    const mind = new JmMind(undefined, options);
    mind.addNode(JmNodeContent.createText('Child'), { parentId: mind.root.id });

    const serialized = serializer.serialize(mind);

    // Verify structure
    assert.ok(serialized.meta, 'Should have meta');
    assert.ok(serialized.root, 'Should have root');
    assert.ok(serialized.nodes, 'Should have nodes');
    assert.ok(serialized.edges, 'Should have edges');

    // Verify root node
    const rootId = Object.keys(serialized.nodes)[0]; // First node is the root
    assert.ok(rootId, 'Should have a root node');
    assert.strictEqual(serialized.root.id, rootId);
    assert.strictEqual(serialized.root.content.type, 'text');
    assert.strictEqual(serialized.root.content.value, 'jsMind Mindmap');
    assert.strictEqual(serialized.root.parent, null);
    assert.ok(Array.isArray(serialized.root.children), 'Should have children array');

    // Verify child node exists
    const childId = Object.keys(serialized.nodes).find(id => id !== rootId);
    assert.ok(childId, 'Should have a child node');
    const childData = serialized.nodes[childId];
    assert.strictEqual(childData.content.value, 'Child');
    assert.strictEqual(childData.parent, rootId);
    assert.deepStrictEqual(childData.children, []);
});

test('JmMindJsonSerializer - serialize node with all properties', () => {
    const serializer = new JmMindJsonSerializer();

    // Create a node with all properties set
    const content = JmNodeContent.createText('Test Node');
    const node = new JmNode('test', content);
    node.folded = true;
    node.direction = 1; // Right
    node.data = { custom: 'value', number: 42 };

    const serialized = serializer._serializeNode(node);

    assert.strictEqual(serialized.id, 'test');
    assert.strictEqual(serialized.content.type, 'text');
    assert.strictEqual(serialized.content.value, 'Test Node');
    assert.strictEqual(serialized.folded, true);
    assert.strictEqual(serialized.direction, 1);
    assert.deepStrictEqual(serialized.data, { custom: 'value', number: 42 });
});

test('JmMindJsonSerializer - serialize edge', () => {
    const serializer = new JmMindJsonSerializer();

    const edge = new JmEdge('edge1', 'source', 'target', JmEdgeType.Link, 'test label');
    const serialized = serializer._serializeEdge(edge);

    assert.strictEqual(serialized.id, 'edge1');
    assert.strictEqual(serialized.sourceNodeId, 'source');
    assert.strictEqual(serialized.targetNodeId, 'target');
    assert.strictEqual(serialized.type, JmEdgeType.Link);
    assert.strictEqual(serialized.label, 'test label');
});

test('JmMindJsonSerializer - validate with valid data', () => {
    const serializer = new JmMindJsonSerializer();

    const validData = {
        meta: { name: 'Test Mind' },
        root: { id: 'root' },
        nodes: { root: { id: 'root' } },
        edges: {}
    };

    assert.strictEqual(serializer.validate(validData), true, 'Should validate correct data');
});

test('JmMindJsonSerializer - validate with invalid data', () => {
    const serializer = new JmMindJsonSerializer();

    // Test null/undefined
    assert.strictEqual(serializer.validate(null), false, 'Should reject null');
    assert.strictEqual(serializer.validate(undefined), false, 'Should reject undefined');

    // Test non-object
    assert.strictEqual(serializer.validate('string'), false, 'Should reject string');
    assert.strictEqual(serializer.validate(42), false, 'Should reject number');

    // Test missing required fields
    assert.strictEqual(serializer.validate({}), false, 'Should reject empty object');
    assert.strictEqual(serializer.validate({ meta: {} }), false, 'Should reject missing root');
    assert.strictEqual(serializer.validate({ meta: {}, root: {} }), false, 'Should reject missing nodes');
    assert.strictEqual(serializer.validate({ meta: {}, root: {}, nodes: {} }), false, 'Should reject missing edges');

    // Test invalid root reference
    const invalidRootData = {
        meta: { name: 'Test' },
        root: { id: 'root' },
        nodes: { other: { id: 'other' } },
        edges: {}
    };
    assert.strictEqual(serializer.validate(invalidRootData), false, 'Should reject invalid root reference');
});

test('JmMindJsonSerializer - deserialize with invalid data', () => {
    const serializer = new JmMindJsonSerializer();

    assert.throws(() => {
        serializer.deserialize(null as unknown as SerializedMindMap);
    }, JsMindError, 'Should throw error for null data');

    assert.throws(() => {
        serializer.deserialize({} as SerializedMindMap);
    }, JsMindError, 'Should throw error for invalid data');
});

test('JmMindJsonSerializer - deserialize basic mind map', () => {
    const serializer = new JmMindJsonSerializer();

    const testData = {
        meta: { name: 'Test Mind', author: 'Test Author' },
        root: { id: 'root' },
        nodes: {
            root: {
                id: 'root',
                content: { type: 'text', value: 'Root' },
                parent: null,
                children: [],
                folded: false,
                direction: 0,
                data: {}
            },
            child1: {
                id: 'child1',
                content: { type: 'text', value: 'Child 1' },
                parent: 'root',
                children: [],
                folded: true,
                direction: -1,
                data: { custom: 'value' }
            }
        },
        edges: {
            edge1: {
                id: 'edge1',
                sourceNodeId: 'root',
                targetNodeId: 'child1',
                type: JmEdgeType.Link,
                label: 'test link'
            }
        }
    };

    const deserialized = serializer.deserialize(testData);

    // Verify metadata
    assert.strictEqual(deserialized.meta.name, 'Test Mind');
    assert.strictEqual(deserialized.meta.author, 'Test Author');

    // Verify nodes exist
    assert.ok(deserialized._nodes['root'], 'Should have root node');
    assert.ok(deserialized._nodes['child1'], 'Should have child1 node');

    // Verify node content
    assert.strictEqual(deserialized._nodes['root'].content.value, 'Root');
    assert.strictEqual(deserialized._nodes['child1'].content.value, 'Child 1');

    // Verify edges
    assert.ok(deserialized._edges['edge1'], 'Should have edge1');
    assert.strictEqual(deserialized._edges['edge1'].sourceNodeId, 'root');
    assert.strictEqual(deserialized._edges['edge1'].targetNodeId, 'child1');
});

test('JmMindJsonSerializer - deserialize node', () => {
    const serializer = new JmMindJsonSerializer();

    const nodeData = {
        id: 'test',
        content: { type: 'text', value: 'Test Node' },
        folded: true,
        direction: -1,
        data: { key: 'value' }
    };

    const node = serializer._deserializeNode(nodeData);

    assert.strictEqual(node.id, 'test');
    assert.strictEqual(node.content.type, 'text');
    assert.strictEqual(node.content.value, 'Test Node');
    assert.strictEqual(node.folded, true);
    assert.strictEqual(node.direction, -1);
    assert.deepStrictEqual(node.data, { key: 'value' });
});

test('JmMindJsonSerializer - deserialize edge', () => {
    const serializer = new JmMindJsonSerializer();

    const edgeData = {
        id: 'edge1',
        sourceNodeId: 'source',
        targetNodeId: 'target',
        type: JmEdgeType.Link,
        label: 'test label'
    };

    const edge = serializer._deserializeEdge(edgeData);

    assert.strictEqual(edge.id, 'edge1');
    assert.strictEqual(edge.sourceNodeId, 'source');
    assert.strictEqual(edge.targetNodeId, 'target');
    assert.strictEqual(edge.type, JmEdgeType.Link);
    assert.strictEqual(edge.label, 'test label');
});

test('JmMindJsonSerializer - round trip serialization', () => {
    const serializer = new JmMindJsonSerializer();

    // Create a simple mind map
    const mind = new JmMind(undefined);
    mind.addNode(JmNodeContent.createText('Child'), { parentId: mind.root.id });

    // Serialize
    const serialized = serializer.serialize(mind);

    // Deserialize
    const deserialized = serializer.deserialize(serialized);

    // Verify basic round trip
    assert.strictEqual(deserialized.meta.name, mind.meta.name);

    // Get the actual node IDs from the deserialized mind
    const deserializedNodeIds = Object.keys(deserialized._nodes);
    assert.ok(deserializedNodeIds.length >= 2, 'Should have at least 2 nodes');

    // Find the root and child nodes by their content
    const rootNode = Object.values(deserialized._nodes).find((node: JmNode) =>
        node.content.value === 'jsMind Mindmap'
    );
    const childNode = Object.values(deserialized._nodes).find((node: JmNode) =>
        node.content.value === 'Child'
    );

    assert.ok(rootNode, 'Should have root node');
    assert.ok(childNode, 'Should have child node');
    assert.strictEqual(childNode.content.value, 'Child');
});

test('JmMindJsonSerializer - handle missing optional properties', () => {
    const serializer = new JmMindJsonSerializer();

    const nodeData = {
        id: 'test',
        content: { type: 'text', value: 'Test' }
        // Missing folded, direction, data
    };

    const node = serializer._deserializeNode(nodeData);

    assert.strictEqual(node.id, 'test');
    assert.strictEqual(node.content.value, 'Test');
    assert.strictEqual(node.folded, undefined); // Missing property
    assert.strictEqual(node.direction, undefined); // Missing property
    assert.deepStrictEqual(node.data, {}); // Missing property defaults to empty object
});

test('JmMindJsonSerializer - handle null/undefined values in node data', () => {
    const serializer = new JmMindJsonSerializer();

    const nodeData = {
        id: 'test',
        content: { type: 'text', value: 'Test' },
        folded: null,
        direction: undefined,
        data: null
    };

    const node = serializer._deserializeNode(nodeData);

    assert.strictEqual(node.id, 'test');
    assert.strictEqual(node.content.value, 'Test');
    assert.strictEqual(node.folded, null);
    assert.strictEqual(node.direction, undefined);
    assert.deepStrictEqual(node.data, {}); // null value is converted to empty object
});

