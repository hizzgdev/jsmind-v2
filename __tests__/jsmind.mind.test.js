import assert from 'node:assert/strict';
import test, {mock} from 'node:test';

import { JmMind } from '../src/jsmind.mind.js';
import { JmMindEventType, JmMindEvent } from '../src/event/jsmind.mind.event.js';
import { JmNode, JmNodeDirection} from '../src/jsmind.node.js';
import { JmEdgeType } from '../src/jsmind.edge.js';
import { JmNodeContent } from '../src/jsmind.node.content.js';
import { JsMindError } from '../src/jsmind.error.js';

const metadata = {
    name: 'Test Mind Map',
    version: '1.0',
    author: 'test@example.com'
};

const options = {
    seq: 1,
    nodeIdGenerator: {
        newId: mock.fn(()=>`node_${options.seq++}`)
    },
    edgeIdGenerator: {
        newId: mock.fn(()=>`edge_${options.seq++}`)
    }
};

test('construct JmMind', () => {
    options.nodeIdGenerator.newId.mock.mockImplementationOnce(()=>'root');
    const mind = new JmMind(metadata, options);
    assert.ok(mind);
    assert.ok(mind.options);
    assert.ok(mind.options.nodeIdGenerator);
    assert.ok(mind.options.edgeIdGenerator);

    assert.ok(mind.meta);
    assert.deepStrictEqual(mind.meta, metadata);

    assert.ok(mind.root);
    assert.strictEqual(mind.root.id, 'root');
    assert.strictEqual(mind.root.content.value, mind.meta.name);
});

test('construct JmMind with no options - uses defaults', () => {
    const mind = new JmMind(metadata);
    assert.ok(mind);
    assert.ok(mind.options);
    assert.ok(mind.options.nodeIdGenerator);
    assert.ok(mind.options.edgeIdGenerator);
    assert.strictEqual(mind.options.rootNodeId, 'root');

    // Check root node ID
    assert.strictEqual(mind.root.id, 'root');

    // Add a child node and check its ID and edge ID
    const child = mind.addChildNode(mind.root.id, JmNodeContent.createText('child1'));
    assert.ok(child);
    assert.ok(child.id); // Generated ID should exist
    assert.strictEqual(child.content.value, 'child1');

    // Check that no edges were created (parent-child relationships use direct fields)
    const edgeIds = Object.keys(mind._edges);
    assert.strictEqual(edgeIds.length, 0);
});

test('construct JmMind with partial options - merges with defaults', () => {
    const customNodeIdGenerator = {
        newId: mock.fn(() => 'custom_node_1')
    };
    const customEdgeIdGenerator = {
        newId: mock.fn(() => 'custom_edge_1')
    };

    const mind = new JmMind(metadata, {
        nodeIdGenerator: customNodeIdGenerator,
        edgeIdGenerator: customEdgeIdGenerator,
        rootNodeId: 'custom_root'
    });

    assert.ok(mind);
    assert.ok(mind.options);
    // Custom options should be used
    assert.strictEqual(mind.options.nodeIdGenerator, customNodeIdGenerator);
    assert.strictEqual(mind.options.edgeIdGenerator, customEdgeIdGenerator);
    assert.strictEqual(mind.options.rootNodeId, 'custom_root');

    // Check root node ID (should use custom value)
    assert.strictEqual(mind.root.id, 'custom_root');

    // Add a child node and check its ID and edge ID (should use custom generators)
    const child = mind.addChildNode(mind.root.id, JmNodeContent.createText('child1'));
    assert.ok(child);
    assert.strictEqual(child.id, 'custom_node_1'); // Custom ID generator should be used
    assert.strictEqual(child.content.value, 'child1');

    // Check that no edges were created (parent-child relationships use direct fields)
    const edgeIds = Object.keys(mind._edges);
    assert.strictEqual(edgeIds.length, 0);
});

test('addChildNode with custom nodeId', () => {
    // Create a mind with a mock nodeIdGenerator to track calls
    const mockNodeIdGenerator = {
        newId: mock.fn(() => 'generated_id')
    };

    const mind = new JmMind(metadata, {
        nodeIdGenerator: mockNodeIdGenerator
    });

    // Add a child node with a custom ID
    const customNodeId = 'custom_child_123';
    const child = mind.addChildNode(mind.root.id, JmNodeContent.createText('custom child'), { nodeId: customNodeId });

    assert.ok(child);
    assert.strictEqual(child.id, customNodeId);
    assert.strictEqual(child.content.value, 'custom child');

    // Verify the node exists in the mind's node collection
    assert.ok(mind._nodes[customNodeId]);
    assert.strictEqual(mind._nodes[customNodeId].id, customNodeId);

    // Verify that nodeIdGenerator.newId() was NOT called since we provided a custom ID
    assert.strictEqual(mockNodeIdGenerator.newId.mock.callCount(), 0);
});

test('addChildNode with NodeCreationOptions - sets all options', () => {
    const mind = new JmMind(metadata);

    // Add a child node with all options
    const options = {
        nodeId: 'custom_node_456',
        folded: true,
        direction: 1, // Right direction
        data: { customField: 'customValue', count: 42 }
    };

    const child = mind.addChildNode(mind.root.id, JmNodeContent.createText('node with options'), options);

    assert.ok(child);
    assert.strictEqual(child.id, 'custom_node_456');
    assert.strictEqual(child.content.value, 'node with options');
    assert.strictEqual(child.folded, true);
    assert.strictEqual(child.direction, 1);
    assert.deepStrictEqual(child.data, { customField: 'customValue', count: 42 });

    // Verify the node exists in the mind's node collection
    assert.ok(mind._nodes['custom_node_456']);
    assert.strictEqual(mind._nodes['custom_node_456'].id, 'custom_node_456');
});

test('addChildNode with partial NodeCreationOptions - preserves defaults', () => {
    const mind = new JmMind(metadata);

    // Add a child node with only some options
    const options = {
        nodeId: 'partial_node_789',
        folded: true
        // direction and data are omitted, should preserve JmNode constructor defaults
    };

    const child = mind.addChildNode(mind.root.id, JmNodeContent.createText('partial options'), options);

    assert.ok(child);
    assert.strictEqual(child.id, 'partial_node_789');
    assert.strictEqual(child.content.value, 'partial options');
    assert.strictEqual(child.folded, true); // Explicitly set
    assert.strictEqual(child.direction, null); // Preserved from JmNode constructor default
    assert.deepStrictEqual(child.data, {}); // Preserved from JmNode constructor default
});

test('addChildNode without options - preserves all constructor defaults', () => {
    const mind = new JmMind(metadata);

    // Add a child node without any options
    const child = mind.addChildNode(mind.root.id, JmNodeContent.createText('no options'));

    assert.ok(child);
    assert.ok(child.id); // Generated ID
    assert.strictEqual(child.content.value, 'no options');
    assert.strictEqual(child.folded, false); // JmNode constructor default
    assert.strictEqual(child.direction, null); // JmNode constructor default
    assert.deepStrictEqual(child.data, {}); // JmNode constructor default
});

test('construct JmMind with empty rootNodeId - generates new ID', () => {
    // Create a mind with empty rootNodeId
    const mind = new JmMind(metadata, {
        rootNodeId: ''
    });

    assert.ok(mind);
    assert.ok(mind.options);
    assert.strictEqual(mind.options.rootNodeId, '');

    // Root node should have a generated ID (not empty)
    assert.ok(mind.root.id);
    assert.notStrictEqual(mind.root.id, '');
    assert.ok(mind.root.id); // Should follow default pattern
});

test('construct JmMind with undefined rootNodeId - generates new ID', () => {
    // Create a mind with undefined rootNodeId
    const mind = new JmMind(metadata, {
        rootNodeId: undefined
    });

    assert.ok(mind);
    assert.ok(mind.options);
    assert.strictEqual(mind.options.rootNodeId, undefined);

    // Root node should have a generated ID
    assert.ok(mind.root.id);
    assert.ok(mind.root.id); // Should follow default pattern
});

test('JmMind.findNodeById', ()=>{
    options.nodeIdGenerator.newId.mock.mockImplementationOnce(()=>'root');
    const mind = new JmMind(metadata, options);
    const fetchedRoot = mind.findNodeById('root');
    assert.ok(fetchedRoot);

    options.nodeIdGenerator.newId.mock.mockImplementationOnce(()=>'child1');
    const child1 = mind.addChildNode(mind.root.id, JmNodeContent.createText('child1'));
    const foundChild1 = mind.findNodeById('child1');
    assert.strictEqual(foundChild1.id, child1.id);

    assert.strictEqual(mind.findNodeById('id-not-existing'), null);
});

test('JmMind.addChildNode', () => {
    options.nodeIdGenerator.newId.mock.mockImplementationOnce(()=>'root');
    const mind = new JmMind(metadata, options);
    options.nodeIdGenerator.newId.mock.mockImplementationOnce(()=>'node1');
    options.edgeIdGenerator.newId.mock.mockImplementationOnce(()=>'edge1');
    const child = mind.addChildNode('root', JmNodeContent.createText('child'));

    assert.ok(child);
    assert.strictEqual(child.id, 'node1');
    assert.strictEqual(child.content.value, 'child');
    assert.strictEqual(child.parent.id, mind.root.id);

    const retrievedNode = mind.findNodeById(child.id);
    assert.strictEqual(retrievedNode.id, child.id);
    assert.strictEqual(retrievedNode.content.value, child.content.value);

    // No edges should be created for parent-child relationships
    const edgeIds = Object.keys(mind._edges);
    assert.strictEqual(edgeIds.length, 0);
});

test('Observe adding nodes', () => {
    const mind = new JmMind(metadata, options);
    const mockedNotifyObservers = mock.method(mind.observerManager, 'notifyObservers');
    const child1 = mind.addChildNode(mind.root.id, JmNodeContent.createText('child1'));
    mind.addChildNode(mind.root.id, JmNodeContent.createText('child2'));
    assert.strictEqual(mockedNotifyObservers.mock.callCount(), 2);

    const event1 = mockedNotifyObservers.mock.calls[0].arguments[0];
    assert.ok(event1 instanceof JmMindEvent);
    assert.strictEqual(event1.type, JmMindEventType.NodeAdded);

    const eventData = event1.data;
    assert.ok(eventData.node);
    assert.ok(eventData.node instanceof JmNode);
    assert.strictEqual(eventData.node.content.value, child1.content.value);
    assert.ok(eventData.node.parent.equals(mind.root));
});

test('JmMind.removeNode', ()=>{
    const mind = new JmMind(metadata, options);
    const child1 = mind.addChildNode(mind.root.id, JmNodeContent.createText('child-1'));
    const child2 = mind.addChildNode(mind.root.id, JmNodeContent.createText('child-2'));
    const child3 = mind.addChildNode(mind.root.id, JmNodeContent.createText('child-3'));
    const child21 = mind.addChildNode(child2.id, JmNodeContent.createText('child-2-1'));
    const child22 = mind.addChildNode(child2.id, JmNodeContent.createText('child-2-2'));
    const child211 = mind.addChildNode(child21.id, JmNodeContent.createText('child-2-1-1'));
    const child212 = mind.addChildNode(child21.id, JmNodeContent.createText('child-2-1-2'));
    const child221 = mind.addChildNode(child21.id, JmNodeContent.createText('child-2-2-1'));
    const child222 = mind.addChildNode(child21.id, JmNodeContent.createText('child-2-2-2'));

    assert.strictEqual(mind.root.children.length, 3);
    assert.strictEqual(Object.keys(mind._edges).length, 0);
    assert.ok(mind.findNodeById(child1.id));
    assert.ok(mind.findNodeById(child2.id));
    assert.ok(mind.findNodeById(child3.id));
    assert.ok(mind.findNodeById(child221.id));

    const subnodeIdsOfRoot = new Set(mind.root.getAllSubnodeIds());
    const expectedSubnodeIds = new Set([child1.id, child2.id, child3.id,
        child21.id, child22.id, child211.id, child212.id, child221.id, child222.id]);
    assert.deepStrictEqual(subnodeIdsOfRoot, expectedSubnodeIds);

    mind.removeNode(child2.id);
    assert.strictEqual(mind.root.children.length, 2);
    assert.strictEqual(Object.keys(mind._edges).length, 0);
    const subnodeIdsOfRoot2 = new Set(mind.root.getAllSubnodeIds());
    const expectedSubnodeIds2 = new Set([child1.id, child3.id]);
    assert.deepStrictEqual(subnodeIdsOfRoot2, expectedSubnodeIds2);
    assert.ok(mind.findNodeById(child1.id));
    assert.equal(mind.findNodeById(child2.id), null);
    assert.ok(mind.findNodeById(child3.id));
    assert.equal(mind.findNodeById(child21.id), null);
    assert.equal(mind.findNodeById(child22.id), null);
    assert.equal(mind.findNodeById(child211.id), null);
    assert.equal(mind.findNodeById(child212.id), null);
    assert.equal(mind.findNodeById(child221.id), null);
    assert.equal(mind.findNodeById(child222.id), null);

    mind.removeNode(child3.id);
    assert.strictEqual(mind.root.children.length, 1);
    assert.strictEqual(Object.keys(mind._edges).length, 0);
    const subnodeIdsOfRoot3 = mind.root.getAllSubnodeIds();
    const expectedSubnodeIds3 = [child1.id];
    assert.deepStrictEqual(subnodeIdsOfRoot3, expectedSubnodeIds3);
    assert.ok(mind.findNodeById(child1.id));
    assert.equal(mind.findNodeById(child3.id), null);
});

test('Observe removing nodes', () => {
    const mind = new JmMind(metadata, options);
    const mockedNotifyObservers = mock.method(mind.observerManager, 'notifyObservers');
    const child2 = mind.addChildNode(mind.root.id, JmNodeContent.createText('child-2'));
    const child21 = mind.addChildNode(child2.id, JmNodeContent.createText('child-2-1'));
    const child22 = mind.addChildNode(child2.id, JmNodeContent.createText('child-2-2'));
    const child211 = mind.addChildNode(child21.id, JmNodeContent.createText('child-2-1-1'));
    const child212 = mind.addChildNode(child21.id, JmNodeContent.createText('child-2-1-2'));
    const child221 = mind.addChildNode(child21.id, JmNodeContent.createText('child-2-2-1'));
    const child222 = mind.addChildNode(child21.id, JmNodeContent.createText('child-2-2-2'));

    mind.removeNode(child2.id);

    const calls = mockedNotifyObservers.mock.calls;
    const removalEventCall = calls[calls.length-1];
    const removalEvent = removalEventCall.arguments[0];
    assert.ok(removalEvent instanceof JmMindEvent);
    assert.strictEqual(removalEvent.type, JmMindEventType.NodeRemoved);

    const eventData = removalEvent.data;
    assert.strictEqual(eventData.node.id, child2.id);

    const removedNodeIds = new Set(eventData.removedNodeIds);
    const expectedRemovedNodeIds = new Set([child2.id, child21.id, child22.id,
        child211.id, child212.id, child221.id, child222.id]);
    assert.deepStrictEqual(removedNodeIds, expectedRemovedNodeIds);

    const removedEdgeIds = new Set(eventData.removedEdgeIds);
    assert.strictEqual(removedEdgeIds.size, 0);
});

test('managed node equals to original node', ()=>{
    const mind = new JmMind(metadata, options);
    const root = mind.root;
    const node1 = mind.addChildNode(root.id, JmNodeContent.createText('node-sub-1'));
    const node2 = mind.addChildNode(root.id, JmNodeContent.createText('node-sub-2'));
    const foundNode1 = mind.findNodeById(node1.id);
    const foundNode2 = mind.findNodeById(node2.id);

    assert.ok(root.equals(mind._root));
    assert.ok(node1.equals(mind._nodes[node1.id]));
    assert.ok(node2.equals(mind._nodes[node2.id]));
    assert.ok(foundNode1.equals(mind._nodes[node1.id]));
    assert.ok(foundNode2.equals(mind._nodes[node2.id]));
});

test('managed node contains readonly fields', ()=>{
    const mind = new JmMind(metadata, options);
    const node1 = mind.addChildNode(mind.root.id, JmNodeContent.createText('node-sub-1'));
    const managedNode1 = mind.findNodeById(node1.id);

    assert.throws(()=>{mind.root.id = 'other-id';});
    assert.throws(()=>{mind.root.parent = null;});
    assert.throws(()=>{mind.root.children = [];});
    assert.throws(()=>{mind.root.data = {};});

    assert.throws(()=>{mind.root.children[0].id = 'other-id';});
    assert.throws(()=>{mind.root.children[0].parent = null;});
    assert.throws(()=>{mind.root.children[0].children = [];});
    assert.throws(()=>{mind.root.children[0].data = {};});

    assert.throws(()=>{managedNode1.id = 'other-id';});
    assert.throws(()=>{managedNode1.parent = null;});
    assert.throws(()=>{managedNode1.children = [];});
    assert.throws(()=>{managedNode1.data = {};});

    assert.throws(()=>{managedNode1.parent.id = 'other-id';});
    assert.throws(()=>{managedNode1.parent.parent = null;});
    assert.throws(()=>{managedNode1.parent.children = [];});
    assert.throws(()=>{managedNode1.parent.data = {};});
});

test('managed node children is immutable', ()=>{
    const mind = new JmMind(metadata, options);
    assert.throws(()=>{mind.root.children.fill('a');});
    assert.throws(()=>{mind.root.children.pop();});
    assert.throws(()=>{mind.root.children.push('a');});
    assert.throws(()=>{mind.root.children.shift('a');});
    assert.throws(()=>{mind.root.children.unshift();});
    assert.throws(()=>{mind.root.children.reverse();});
    assert.throws(()=>{mind.root.children.sort();});
    assert.throws(()=>{mind.root.children.splice();});

    const node = mind.addChildNode(mind.root.id, JmNodeContent.createText('node-sub-1'));
    assert.throws(()=>{node.children.fill('a');});
    assert.throws(()=>{node.children.pop();});
    assert.throws(()=>{node.children.push('a');});
    assert.throws(()=>{node.children.shift('a');});
    assert.throws(()=>{node.children.unshift();});
    assert.throws(()=>{node.children.reverse();});
    assert.throws(()=>{node.children.sort();});
    assert.throws(()=>{node.children.splice();});
});

test('JmMind.moveNode - basic functionality', () => {
    const mind = new JmMind(metadata, options);

    // Create a simple structure: root -> parent1 -> child1, child2
    const parent1 = mind.addChildNode(mind.root.id, JmNodeContent.createText('Parent 1'));
    const child1 = mind.addChildNode(parent1.id, JmNodeContent.createText('Child 1'));
    const child2 = mind.addChildNode(parent1.id, JmNodeContent.createText('Child 2'));

    // Move child1 to be a direct child of root at position 0
    const movedNode = mind.moveNode(child1.id, {
        parentId: mind.root.id,
        position: 0,
        direction: JmNodeDirection.Right
    });

    // Verify the move
    assert.strictEqual(movedNode.id, child1.id);
    assert.strictEqual(movedNode.parent.id, mind.root.id);
    assert.strictEqual(mind.root.children[0].id, child1.id);
    assert.strictEqual(movedNode.direction, JmNodeDirection.Right);

    // Verify parent1 no longer has child1
    assert.strictEqual(parent1.children.length, 1);
    assert.strictEqual(parent1.children[0].id, child2.id);
});

test('JmMind.moveNode - move to different position', () => {
    const mind = new JmMind(metadata, options);

    // Create structure: root -> child1, child2, child3
    const child1 = mind.addChildNode(mind.root.id, JmNodeContent.createText('Child 1'));
    const child2 = mind.addChildNode(mind.root.id, JmNodeContent.createText('Child 2'));
    const child3 = mind.addChildNode(mind.root.id, JmNodeContent.createText('Child 3'));

    // Move child3 to position 0 (first)
    const movedNode = mind.moveNode(child3.id, {
        parentId: mind.root.id,
        position: 0,
        direction: JmNodeDirection.Left
    });

    // Verify the new order: child3, child1, child2
    assert.strictEqual(mind.root.children[0].id, child3.id);
    assert.strictEqual(mind.root.children[1].id, child1.id);
    assert.strictEqual(mind.root.children[2].id, child2.id);
    assert.strictEqual(movedNode.direction, JmNodeDirection.Left);
});

test('JmMind.moveNode - move with null position (no reposition)', () => {
    const mind = new JmMind(metadata, options);

    // Create structure: root -> child1, child2
    const child1 = mind.addChildNode(mind.root.id, JmNodeContent.createText('Child 1'));
    const child2 = mind.addChildNode(mind.root.id, JmNodeContent.createText('Child 2'));

    // Move child1 with null position (should not reposition)
    const movedNode = mind.moveNode(child1.id, {
        parentId: mind.root.id,
        position: null,
        direction: JmNodeDirection.Center
    });

    // Verify the order remains the same: child1, child2
    assert.strictEqual(mind.root.children[0].id, child1.id);
    assert.strictEqual(mind.root.children[1].id, child2.id);
    assert.strictEqual(movedNode.direction, JmNodeDirection.Center);
});

test('JmMind.moveNode - move with undefined direction (preserve current)', () => {
    const mind = new JmMind(metadata, options);

    // Create a child with a specific direction
    const child = mind.addChildNode(mind.root.id, JmNodeContent.createText('Child'));
    child.direction = JmNodeDirection.Right;

    // Move without specifying direction
    const movedNode = mind.moveNode(child.id, {
        parentId: mind.root.id,
        position: 0
        // direction not specified - should preserve current
    });

    // Verify direction is preserved
    assert.strictEqual(movedNode.direction, JmNodeDirection.Right);
});

test('JmMind.moveNode - error cases', () => {
    const mind = new JmMind(metadata, options);

    // Test moving non-existent node
    assert.throws(() => {
        mind.moveNode('non-existent', {
            parentId: mind.root.id,
            position: 0,
            direction: JmNodeDirection.Right
        });
    }, JsMindError, 'Should throw error for non-existent node');

    // Test moving to non-existent parent
    const child = mind.addChildNode(mind.root.id, JmNodeContent.createText('Child'));
    assert.throws(() => {
        mind.moveNode(child.id, {
            parentId: 'non-existent-parent',
            position: 0,
            direction: JmNodeDirection.Right
        });
    }, JsMindError, 'Should throw error for non-existent parent');

    // Test moving node to be its own descendant
    const parent = mind.addChildNode(mind.root.id, JmNodeContent.createText('Parent'));
    const grandchild = mind.addChildNode(parent.id, JmNodeContent.createText('Grandchild'));

    assert.throws(() => {
        mind.moveNode(parent.id, {
            parentId: grandchild.id,
            position: 0,
            direction: JmNodeDirection.Right
        });
    }, JsMindError, 'Should throw error for moving to descendant');

    // Test moving with empty options object
    assert.throws(() => {
        mind.moveNode(child.id, {});
    }, JsMindError, 'Should throw error for empty options object');
});

test('JmMind.moveNode - edge management', () => {
    const mind = new JmMind(metadata, options);

    // Create structure: root -> parent -> child
    const parent = mind.addChildNode(mind.root.id, JmNodeContent.createText('Parent'));
    const child = mind.addChildNode(parent.id, JmNodeContent.createText('Child'));

    // Move child to root
    mind.moveNode(child.id, {
        parentId: mind.root.id,
        position: 0,
        direction: JmNodeDirection.Right
    });

    // Verify no edges are created for parent-child relationships
    assert.strictEqual(Object.keys(mind._edges).length, 0);
});

test('JmMind.moveNode - same parent optimization (reposition only)', () => {
    const mind = new JmMind(metadata, options);

    // Create structure: root -> child1, child2, child3
    const child1 = mind.addChildNode(mind.root.id, JmNodeContent.createText('Child 1'));
    const child2 = mind.addChildNode(mind.root.id, JmNodeContent.createText('Child 2'));
    const child3 = mind.addChildNode(mind.root.id, JmNodeContent.createText('Child 3'));

    // Reposition child3 to position 0 (first) within the same parent
    const movedNode = mind.moveNode(child3.id, {
        parentId: mind.root.id,
        position: 0,
        direction: JmNodeDirection.Left
    });

    // Verify the new order: child3, child1, child2
    assert.strictEqual(mind.root.children[0].id, child3.id);
    assert.strictEqual(mind.root.children[1].id, child1.id);
    assert.strictEqual(mind.root.children[2].id, child2.id);
    assert.strictEqual(movedNode.direction, JmNodeDirection.Left);

    // Verify no edges were created/removed (same parent operation)
    const edgeCount = Object.keys(mind._edges).length;
    assert.strictEqual(edgeCount, 0); // No edges for parent-child relationships
});

test('JmMind.moveNode - same parent with only direction change', () => {
    const mind = new JmMind(metadata, options);

    // Create a child with default direction
    const child = mind.addChildNode(mind.root.id, JmNodeContent.createText('Child'));

    // Change only direction, same parent, same position
    const updatedNode = mind.moveNode(child.id, {
        parentId: mind.root.id,
        // position not specified - should keep current
        direction: JmNodeDirection.Right
    });

    // Verify direction changed
    assert.strictEqual(updatedNode.direction, JmNodeDirection.Right);
    // Verify position unchanged (should still be at index 0)
    assert.strictEqual(mind.root.children[0].id, child.id);
    // Verify parent unchanged
    assert.strictEqual(updatedNode.parent.id, mind.root.id);
});

test('JmMind.moveNode - only direction change (no parent/position)', () => {
    const mind = new JmMind(metadata, options);

    // Create a child with default direction
    const child = mind.addChildNode(mind.root.id, JmNodeContent.createText('Child'));

    // Change only direction, no parent or position specified
    const updatedNode = mind.moveNode(child.id, {
        direction: JmNodeDirection.Left
    });

    // Verify direction changed
    assert.strictEqual(updatedNode.direction, JmNodeDirection.Left);
    // Verify position unchanged
    assert.strictEqual(mind.root.children[0].id, child.id);
    // Verify parent unchanged
    assert.strictEqual(updatedNode.parent.id, mind.root.id);
});

test('JmMind.moveNode - no options (should throw error)', () => {
    const mind = new JmMind(metadata, options);

    // Create a child
    const child = mind.addChildNode(mind.root.id, JmNodeContent.createText('Child'));

    // Call moveNode with no options should throw error
    assert.throws(() => {
        mind.moveNode(child.id);
    }, JsMindError, 'Should throw error when no options provided');
});

test('Observe update node', () => {
    const mind = new JmMind(metadata, options);
    const mockedNotifyObservers = mock.method(mind.observerManager, 'notifyObservers');
    const node1 = mind.addChildNode(mind.root.id, JmNodeContent.createText('node1'));
    node1.content = JmNodeContent.createText('new name of node1');
    node1.direction = JmNodeDirection.Right;
    node1.folded = true;
    node1.data['a'] = 'b';
    assert.strictEqual(mockedNotifyObservers.mock.callCount(), 4);

    const events = mockedNotifyObservers.mock.calls.map(c=>c.arguments[0]);
    //remove the first event (NodeAdded)
    events.shift();
    assert.ok(events.every((e)=>{
        return (e instanceof JmMindEvent) && e.type === JmMindEventType.NodeUpdated;
    }));

    assert.equal(events[0].data.node.id, node1.id);
    assert.equal(events[0].data.property, 'content');
    assert.equal(events[0].data.originValue.value, 'node1');
    assert.equal(events[0].data.newValue.value, 'new name of node1');

    assert.equal(events[1].data.node.id, node1.id);
    assert.equal(events[1].data.property, 'direction');
    assert.equal(events[1].data.originValue, null);
    assert.equal(events[1].data.newValue, JmNodeDirection.Right);

    assert.equal(events[2].data.node.id, node1.id);
    assert.equal(events[2].data.property, 'folded');
    assert.equal(events[2].data.originValue, false);
    assert.equal(events[2].data.newValue, true);
});

test('JmMind.addEdge', () => {
    const mind = new JmMind(metadata, options);
    const child1 = mind.addChildNode(mind.root.id, JmNodeContent.createText('child1'));
    const child2 = mind.addChildNode(mind.root.id, JmNodeContent.createText('child2'));

    const edge = mind.addEdge(child1.id, child2.id, JmEdgeType.Link, 'test link');
    assert.ok(edge);
    assert.strictEqual(edge.sourceNodeId, child1.id);
    assert.strictEqual(edge.targetNodeId, child2.id);
    assert.strictEqual(edge.type, JmEdgeType.Link);
    assert.strictEqual(edge.label, 'test link');

    // Check that edge is stored in _edges
    assert.ok(mind._edges[edge.id]);
    assert.strictEqual(mind._edges[edge.id], edge);
});

test('JmMind.addEdge without label', () => {
    const mind = new JmMind(metadata, options);
    const child1 = mind.addChildNode(mind.root.id, JmNodeContent.createText('child1'));
    const child2 = mind.addChildNode(mind.root.id, JmNodeContent.createText('child2'));

    const edge = mind.addEdge(child1.id, child2.id, JmEdgeType.Link);
    assert.strictEqual(edge.label, null);
});

test('JmMind.addEdge with invalid source node', () => {
    const mind = new JmMind(metadata, options);
    const child1 = mind.addChildNode(mind.root.id, JmNodeContent.createText('child1'));

    assert.throws(() => {
        mind.addEdge('invalid', child1.id, JmEdgeType.Link);
    });
});

test('JmMind.addEdge with invalid target node', () => {
    const mind = new JmMind(metadata, options);
    const child1 = mind.addChildNode(mind.root.id, JmNodeContent.createText('child1'));

    assert.throws(() => {
        mind.addEdge(child1.id, 'invalid', JmEdgeType.Link);
    });
});

test('JmMind.removeEdge', () => {
    const mind = new JmMind(metadata, options);
    const child1 = mind.addChildNode(mind.root.id, JmNodeContent.createText('child1'));
    const child2 = mind.addChildNode(mind.root.id, JmNodeContent.createText('child2'));

    const edge = mind.addEdge(child1.id, child2.id, JmEdgeType.Link, 'test link');
    assert.ok(mind._edges[edge.id]);

    const result = mind.removeEdge(edge.id);
    assert.strictEqual(result, true);
    assert.strictEqual(mind._edges[edge.id], undefined);
});

test('JmMind.removeEdge with invalid edge ID', () => {
    const mind = new JmMind(metadata, options);

    const result = mind.removeEdge('invalid');
    assert.strictEqual(result, false);
});

test('JmMind.getEdges', () => {
    const mind = new JmMind(metadata, options);
    const child1 = mind.addChildNode(mind.root.id, JmNodeContent.createText('child1'));
    const child2 = mind.addChildNode(mind.root.id, JmNodeContent.createText('child2'));
    const child3 = mind.addChildNode(mind.root.id, JmNodeContent.createText('child3'));

    const edge1 = mind.addEdge(child1.id, child2.id, JmEdgeType.Link, 'link1');
    const edge2 = mind.addEdge(child2.id, child3.id, JmEdgeType.Link, 'link2');
    const edge3 = mind.addEdge(child1.id, child3.id, JmEdgeType.Link, 'link3');

    // Get all edges for child1
    const child1Edges = mind.getEdges(child1.id);
    assert.strictEqual(child1Edges.length, 2);
    assert.ok(child1Edges.some(e => e.id === edge1.id));
    assert.ok(child1Edges.some(e => e.id === edge3.id));

    // Get all edges for child2
    const child2Edges = mind.getEdges(child2.id);
    assert.strictEqual(child2Edges.length, 2);
    assert.ok(child2Edges.some(e => e.id === edge1.id));
    assert.ok(child2Edges.some(e => e.id === edge2.id));

    // Get edges with type filter
    const child1LinkEdges = mind.getEdges(child1.id, JmEdgeType.Link);
    assert.strictEqual(child1LinkEdges.length, 2);
});

test('JmMind.getEdges with no edges', () => {
    const mind = new JmMind(metadata, options);
    const child1 = mind.addChildNode(mind.root.id, JmNodeContent.createText('child1'));

    const edges = mind.getEdges(child1.id);
    assert.strictEqual(edges.length, 0);
});

test('JmMind edge events', () => {
    const mind = new JmMind(metadata, options);
    const child1 = mind.addChildNode(mind.root.id, JmNodeContent.createText('child1'));
    const child2 = mind.addChildNode(mind.root.id, JmNodeContent.createText('child2'));

    const mockedNotifyObservers = mock.method(mind.observerManager, 'notifyObservers');

    // Test addEdge event
    const edge = mind.addEdge(child1.id, child2.id, JmEdgeType.Link, 'test link');

    const addEventCall = mockedNotifyObservers.mock.calls[mockedNotifyObservers.mock.calls.length - 1];
    const addEvent = addEventCall.arguments[0];
    assert.ok(addEvent instanceof JmMindEvent);
    assert.strictEqual(addEvent.type, JmMindEventType.EdgeAdded);
    assert.strictEqual(addEvent.data.edge, edge);

    // Test removeEdge event
    mind.removeEdge(edge.id);

    const removeEventCall = mockedNotifyObservers.mock.calls[mockedNotifyObservers.mock.calls.length - 1];
    const removeEvent = removeEventCall.arguments[0];
    assert.ok(removeEvent instanceof JmMindEvent);
    assert.strictEqual(removeEvent.type, JmMindEventType.EdgeRemoved);
    assert.strictEqual(removeEvent.data.edge, edge);
});

test('JmMind.removeNode cleans up edges', () => {
    const mind = new JmMind(metadata, options);
    const child1 = mind.addChildNode(mind.root.id, JmNodeContent.createText('child1'));
    const child2 = mind.addChildNode(mind.root.id, JmNodeContent.createText('child2'));
    const child3 = mind.addChildNode(mind.root.id, JmNodeContent.createText('child3'));

    // Create edges involving child2
    const edge1 = mind.addEdge(child1.id, child2.id, JmEdgeType.Link, 'link1');
    const edge2 = mind.addEdge(child2.id, child3.id, JmEdgeType.Link, 'link2');
    const edge3 = mind.addEdge(child1.id, child3.id, JmEdgeType.Link, 'link3');

    assert.ok(mind._edges[edge1.id]);
    assert.ok(mind._edges[edge2.id]);
    assert.ok(mind._edges[edge3.id]);

    // Remove child2 - should remove edge1 and edge2, but not edge3
    mind.removeNode(child2.id);

    assert.strictEqual(mind._edges[edge1.id], undefined);
    assert.strictEqual(mind._edges[edge2.id], undefined);
    assert.ok(mind._edges[edge3.id]); // edge3 should still exist
});
