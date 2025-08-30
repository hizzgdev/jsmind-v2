import assert from 'node:assert/strict';
import test, {mock} from 'node:test';
import { DEFAULT_METADATA } from '../src/jsmind.meta.js';
import { JmMind } from '../src/jsmind.mind.js';
import { JmMindEventType, JmMindEvent } from '../src/event/jsmind.mind.event.js';
import { JmNode, JmNodePosition} from '../src/jsmind.node.js';
import { JmEdge, JmEdgeType } from '../src/jsmind.edge.js';
import { JmNodeContent } from '../src/jsmind.node.content.js';

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
    assert.deepStrictEqual(mind.meta, DEFAULT_METADATA);

    assert.ok(mind.root);
    assert.strictEqual(mind.root.id, 'root');
    assert.strictEqual(mind.root.content.value, mind.meta.name);
});

test('JmMind.findNodeById', ()=>{
    mindOptions.nodeIdGenerator.newId.mock.mockImplementationOnce(()=>'root');
    const mind = new JmMind(mindOptions);
    const fetchedRoot = mind.findNodeById('root');
    assert.ok(fetchedRoot);

    mindOptions.nodeIdGenerator.newId.mock.mockImplementationOnce(()=>'child1');
    const child1 = mind.addChildNode(mind.root.id, JmNodeContent.createText('child1'));
    const foundChild1 = mind.findNodeById('child1');
    assert.strictEqual(foundChild1.id, child1.id);

    assert.strictEqual(mind.findNodeById('id-not-existing'), null);
});

test('JmMind.addChildNode', () => {
    mindOptions.nodeIdGenerator.newId.mock.mockImplementationOnce(()=>'root');
    const mind = new JmMind(mindOptions);
    mindOptions.nodeIdGenerator.newId.mock.mockImplementationOnce(()=>'node1');
    mindOptions.edgeIdGenerator.newId.mock.mockImplementationOnce(()=>'edge1');
    const child = mind.addChildNode('root', JmNodeContent.createText('child'));

    assert.ok(child);
    assert.strictEqual(child.id, 'node1');
    assert.strictEqual(child.content.value, 'child');
    assert.strictEqual(child.parent.id, mind.root.id);

    const retrievedNode = mind.findNodeById(child.id);
    assert.strictEqual(retrievedNode.id, child.id);
    assert.strictEqual(retrievedNode.content.value, child.content.value);

    const edge1 = mind._edges['edge1'];
    assert.ok(edge1);
    assert.strictEqual(edge1.sourceNodeId, 'root');
    assert.strictEqual(edge1.targetNodeId, 'node1');
});

test('Observe adding nodes', () => {
    const mind = new JmMind(mindOptions);
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
    assert.strictEqual(eventData.node.content.value, 'child1');
    assert.ok(eventData.node.parent.equals(mind.root));
    assert.ok(eventData.edge);
    assert.ok(eventData.edge instanceof JmEdge);
    assert.strictEqual(eventData.edge.sourceNodeId, mind.root.id);
    assert.strictEqual(eventData.edge.targetNodeId, child1.id);
    assert.strictEqual(eventData.edge.type, JmEdgeType.Child);
});

test('JmMind.removeNode', ()=>{
    const mind = new JmMind(mindOptions);
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
    assert.strictEqual(Object.keys(mind._edges).length, 9);
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
    assert.strictEqual(Object.keys(mind._edges).length, 2);
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
    assert.strictEqual(Object.keys(mind._edges).length, 1);
    const subnodeIdsOfRoot3 = mind.root.getAllSubnodeIds();
    const expectedSubnodeIds3 = [child1.id];
    assert.deepStrictEqual(subnodeIdsOfRoot3, expectedSubnodeIds3);
    assert.ok(mind.findNodeById(child1.id));
    assert.equal(mind.findNodeById(child3.id), null);
});

test('Observe removing nodes', () => {
    const mind = new JmMind(mindOptions);
    const mockedNotifyObservers = mock.method(mind.observerManager, 'notifyObservers');
    const child2 = mind.addChildNode(mind.root.id, JmNodeContent.createText('child-2'));
    const child21 = mind.addChildNode(child2.id, JmNodeContent.createText('child-2-1'));
    const child22 = mind.addChildNode(child2.id, JmNodeContent.createText('child-2-2'));
    const child211 = mind.addChildNode(child21.id, JmNodeContent.createText('child-2-1-1'));
    const child212 = mind.addChildNode(child21.id, JmNodeContent.createText('child-2-1-2'));
    const child221 = mind.addChildNode(child21.id, JmNodeContent.createText('child-2-2-1'));
    const child222 = mind.addChildNode(child21.id, JmNodeContent.createText('child-2-2-2'));

    const expectedRemovedEdgeIds = new Set(Object.keys(mind._edges));

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
    assert.strictEqual(removedEdgeIds.size, 7);
    assert.deepStrictEqual(removedEdgeIds, expectedRemovedEdgeIds);
});

test('managed node equals to original node', ()=>{
    const mind = new JmMind(mindOptions);
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
    const mind = new JmMind(mindOptions);
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
    const mind = new JmMind(mindOptions);
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


test('Observe update node', () => {
    const mind = new JmMind(mindOptions);
    const mockedNotifyObservers = mock.method(mind.observerManager, 'notifyObservers');
    const node1 = mind.addChildNode(mind.root.id, JmNodeContent.createText('node1'));
    node1.content = JmNodeContent.createText('new name of node1');
    node1.position = JmNodePosition.Right;
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
    assert.equal(events[1].data.property, 'position');
    assert.equal(events[1].data.originValue, null);
    assert.equal(events[1].data.newValue, JmNodePosition.Right);

    assert.equal(events[2].data.node.id, node1.id);
    assert.equal(events[2].data.property, 'folded');
    assert.equal(events[2].data.originValue, false);
    assert.equal(events[2].data.newValue, true);
});
