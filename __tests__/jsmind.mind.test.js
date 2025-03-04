import assert from 'node:assert/strict';
import test, {mock} from 'node:test';
import { metadata } from '../src/jsmind.meta.js';
import { JmMind } from '../src/jsmind.mind.js';
import { JmMindEventType, JmMindEvent } from '../src/event/jsmind.mind.event.js';
import { JmNode, ReadonlyNode } from '../src/jsmind.node.js';
import { JmEdge, JmEdgeType } from '../src/jsmind.edge.js';

const mindOptions = {
    seq: 1,
    nodeIdGenerator: {
        newId: mock.fn(()=>`node_${mindOptions.seq++}`)
    },
    edgeIdGenerator: {
        newId: mock.fn(()=>`edge_${mindOptions.seq++}`)
    }
};

test('construct JmMind', () => {
    mindOptions.nodeIdGenerator.newId.mock.mockImplementationOnce(()=>'root');
    const mind = new JmMind(mindOptions);
    assert.ok(mind);
    assert.ok(mind.options);
    assert.ok(mind.options.nodeIdGenerator);
    assert.ok(mind.options.edgeIdGenerator);

    assert.ok(mind.meta);
    assert.deepStrictEqual(mind.meta, metadata());

    assert.ok(mind.root);
    assert.strictEqual(mind.root.id, 'root');
    assert.strictEqual(mind.root.topic, mind.meta.name);
});

test('JmMind.getNodeById', ()=>{
    mindOptions.nodeIdGenerator.newId.mock.mockImplementationOnce(()=>'root');
    const mind = new JmMind(mindOptions);
    const fetchedRoot = mind.getNodeById('root');
    assert.ok(fetchedRoot instanceof ReadonlyNode);
    const expectedRoot = mind.root.toReadonlyNode();
    assert.deepStrictEqual(fetchedRoot, expectedRoot);

    mindOptions.nodeIdGenerator.newId.mock.mockImplementationOnce(()=>'child1');
    const child1 = mind.addChildNode(mind.root, 'child1');
    assert.deepStrictEqual(mind.getNodeById('child1'), child1.toReadonlyNode());

    assert.deepStrictEqual(mind.getNodeById('id-not-existing'), null);
});

test('JmMind.addChildNode', () => {
    mindOptions.nodeIdGenerator.newId.mock.mockImplementationOnce(()=>'root');
    const mind = new JmMind(mindOptions);
    mindOptions.nodeIdGenerator.newId.mock.mockImplementationOnce(()=>'node1');
    mindOptions.edgeIdGenerator.newId.mock.mockImplementationOnce(()=>'edge1');
    const child = mind.addChildNode(mind.root, 'child');

    assert.ok(child);
    assert.strictEqual(child.id, 'node1');
    assert.strictEqual(child.topic, 'child');
    assert.strictEqual(child.parent, mind.root);

    const retrievedNode = mind.getNodeById(child.id);
    assert.deepStrictEqual(retrievedNode, child);

    const edge1 = mind._edges['edge1'];
    assert.ok(edge1);
    assert.strictEqual(edge1.sourceNodeId, 'root');
    assert.strictEqual(edge1.targetNodeId, 'node1');
});

test('Observe adding nodes', () => {
    const mind = new JmMind(mindOptions);
    const mockedNotifyObservers = mock.method(mind.observerManager, 'notifyObservers');
    const child1 = mind.addChildNode(mind.root, 'child1');
    mind.addChildNode(mind.root, 'child2');
    assert.strictEqual(mockedNotifyObservers.mock.callCount(), 2);

    const event1 = mockedNotifyObservers.mock.calls[0].arguments[0];
    assert.ok(event1 instanceof JmMindEvent);
    assert.strictEqual(event1.type, JmMindEventType.NodeAdded);

    const eventData = event1.data;
    assert.ok(eventData.node);
    assert.ok(eventData.node instanceof JmNode);
    assert.strictEqual(eventData.node.topic, 'child1');
    assert.strictEqual(eventData.node.parent, mind.root);
    assert.ok(eventData.edge);
    assert.ok(eventData.edge instanceof JmEdge);
    assert.strictEqual(eventData.edge.sourceNodeId, mind.root.id);
    assert.strictEqual(eventData.edge.targetNodeId, child1.id);
    assert.strictEqual(eventData.edge.type, JmEdgeType.Child);
});

test('JmMind.removeNode', ()=>{
    const mind = new JmMind(mindOptions);
    const child1 = mind.addChildNode(mind.root, 'child-1');
    const child2 = mind.addChildNode(mind.root, 'child-2');
    const child3 = mind.addChildNode(mind.root, 'child-3');
    const child21 = mind.addChildNode(child2, 'child-2-1');
    const child22 = mind.addChildNode(child2, 'child-2-2');
    const child211 = mind.addChildNode(child21, 'child-2-1-1');
    const child212 = mind.addChildNode(child21, 'child-2-1-2');
    const child221 = mind.addChildNode(child21, 'child-2-2-1');
    const child222 = mind.addChildNode(child21, 'child-2-2-2');

    assert.strictEqual(mind.root.children.length, 3);
    assert.strictEqual(Object.keys(mind._edges).length, 9);
    assert.ok(mind.getNodeById(child1.id));
    assert.ok(mind.getNodeById(child2.id));
    assert.ok(mind.getNodeById(child3.id));
    assert.ok(mind.getNodeById(child221.id));

    const subnodeIdsOfRoot = new Set(mind.root.getAllSubnodes().map(n=>n.id));
    const expectedSubnodeIds = new Set([child1.id, child2.id, child3.id,
        child21.id, child22.id, child211.id, child212.id, child221.id, child222.id]);
    assert.deepStrictEqual(subnodeIdsOfRoot, expectedSubnodeIds);

    mind.removeNode(child2);
    assert.strictEqual(mind.root.children.length, 2);
    assert.strictEqual(Object.keys(mind._edges).length, 2);
    const subnodeIdsOfRoot2 = new Set(mind.root.getAllSubnodes().map(n=>n.id));
    const expectedSubnodeIds2 = new Set([child1.id, child3.id]);
    assert.deepStrictEqual(subnodeIdsOfRoot2, expectedSubnodeIds2);
    assert.ok(mind.getNodeById(child1.id));
    assert.equal(mind.getNodeById(child2.id), null);
    assert.ok(mind.getNodeById(child3.id));
    assert.equal(mind.getNodeById(child21.id), null);
    assert.equal(mind.getNodeById(child22.id), null);
    assert.equal(mind.getNodeById(child211.id), null);
    assert.equal(mind.getNodeById(child212.id), null);
    assert.equal(mind.getNodeById(child221.id), null);
    assert.equal(mind.getNodeById(child222.id), null);

    mind.removeNode(child3);
    assert.strictEqual(mind.root.children.length, 1);
    assert.strictEqual(Object.keys(mind._edges).length, 1);
    const subnodeIdsOfRoot3 = mind.root.getAllSubnodes().map(n=>n.id);
    const expectedSubnodeIds3 = [child1.id];
    assert.deepStrictEqual(subnodeIdsOfRoot3, expectedSubnodeIds3);
    assert.ok(mind.getNodeById(child1.id));
    assert.equal(mind.getNodeById(child3.id), null);
});

test('Observe removing nodes', () => {
    const mind = new JmMind(mindOptions);
    const mockedNotifyObservers = mock.method(mind.observerManager, 'notifyObservers');
    const child2 = mind.addChildNode(mind.root, 'child-2');
    const child21 = mind.addChildNode(child2, 'child-2-1');
    const child22 = mind.addChildNode(child2, 'child-2-2');
    const child211 = mind.addChildNode(child21, 'child-2-1-1');
    const child212 = mind.addChildNode(child21, 'child-2-1-2');
    const child221 = mind.addChildNode(child21, 'child-2-2-1');
    const child222 = mind.addChildNode(child21, 'child-2-2-2');

    const expectedRemovedEdgeIds = new Set(Object.keys(mind._edges));

    mind.removeNode(child2);

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
    assert.strictEqual(eventData.removedEdgeIds.size, 7);
    assert.deepStrictEqual(eventData.removedEdgeIds, expectedRemovedEdgeIds);
});
