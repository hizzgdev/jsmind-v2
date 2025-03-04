import assert from 'node:assert/strict';
import test from 'node:test';
import { JmNode, JmNodePosition } from '../src/jsmind.node.js';

test('JmNode', () => {
    const node = new JmNode('1');
    assert.ok(node);
    assert.strictEqual(node.id, '1');
    assert.strictEqual(node.topic, null);
    assert.strictEqual(node.parent, null);
    assert.strictEqual(node.position, null);
    assert.strictEqual(node.children.length, 0);
    assert.strictEqual(node.folded, false);
    assert.deepEqual(node._data, {});
});

test('JmNode with null id', () => {
    assert.throws(() => {
        new JmNode();
    });
});

test('JmNode.setTopic', () => {
    const node = new JmNode('root')
        .setTopic('root');
    assert.strictEqual(node.topic, 'root');
});

test('JmNode.setParent', () => {
    const node = new JmNode('root');
    assert.strictEqual(node.parent, null);
    const parent = new JmNode('parent');
    node.setParent(parent);
    assert.strictEqual(node.parent, parent);
});

test('JmNode.setParent with invalid parent', () => {
    const node = new JmNode('root');
    assert.throws(() => {
        node.setParent('invalid parent');
    });
});

test('JmNode.setFolded', () => {
    const node = new JmNode('root');
    assert.strictEqual(node.folded, false);
    node.setFolded(true);
    assert.strictEqual(node.folded, true);
});

test('JmNode.setPosition', ()=>{
    const node = new JmNode('root');
    node.setPosition(JmNodePosition.Left);
    assert.strictEqual(node.position, JmNodePosition.Left);
    node.setPosition(JmNodePosition.Right);
    assert.strictEqual(node.position, JmNodePosition.Right);
    node.setPosition(JmNodePosition.Center);
    assert.strictEqual(node.position, JmNodePosition.Center);
});

test('JmNode.addChildNode', () => {
    const node = new JmNode('root');
    const child1 = new JmNode('child1');
    const child2 = new JmNode('child2');

    node.addChildNode(child1);
    assert.strictEqual(node.children.length, 1);
    assert.strictEqual(node.children[0], child1);

    node.addChildNode(child2);
    assert.strictEqual(node.children.length, 2);
    assert.strictEqual(node.children[1], child2);
});

test('JmNode.removeChildNode', () => {
    const node = new JmNode('root');
    const child1 = new JmNode('child1');
    const child2 = new JmNode('child2');
    const child3 = new JmNode('child3');
    const child4 = new JmNode('child4');
    const child5 = new JmNode('child5');

    node.addChildNode(child1)
        .addChildNode(child2)
        .addChildNode(child3)
        .addChildNode(child4)
        .addChildNode(child5);
    assert.strictEqual(node.children.length, 5);
    assert.deepStrictEqual(node.children.map(n=>n.id), ['child1', 'child2', 'child3', 'child4', 'child5']);

    node.removeChildNode(child1);
    assert.strictEqual(node.children.length, 4);
    assert.deepStrictEqual(node.children.map(n=>n.id), ['child2', 'child3', 'child4', 'child5']);

    node.removeChildNode(child5);
    assert.strictEqual(node.children.length, 3);
    assert.deepStrictEqual(node.children.map(n=>n.id), ['child2', 'child3', 'child4']);

    node.removeChildNode(child3);
    assert.strictEqual(node.children.length, 2);
    assert.deepStrictEqual(node.children.map(n=>n.id), ['child2', 'child4']);
});

test('JmNode.isRootNode', () => {
    const node = new JmNode('root');
    assert.strictEqual(node.isRootNode(), true);
    const child1 = new JmNode('child')
        .setParent(node);
    assert.strictEqual(child1.isRootNode(), false);
});

test('JmNode.getAllSubnodes', () => {
    const node = new JmNode('root');
    const child1 = new JmNode('child1');
    const child12 = new JmNode('child12');
    const child11 = new JmNode('child11');
    const child111 = new JmNode('child111');
    const child112 = new JmNode('child112');

    child11.addChildNode(child111).addChildNode(child112);
    child1.addChildNode(child11).addChildNode(child12);
    node.addChildNode(child1);

    const allSubnodesOfChild1 = child1.getAllSubnodes();
    assert.deepStrictEqual(allSubnodesOfChild1.map(n=>n.id), ['child11', 'child12', 'child111', 'child112']);
});

test('JmNode.toReadonlyNode', ()=>{
    const node1 = new JmNode('id-2') .setTopic('topic-2');
    const node2 = new JmNode('id-3') .setTopic('topic-3');

    const node = new JmNode('id-1')
        .setTopic('topic')
        .setParent()
        .setFolded(true)
        .setPosition(JmNodePosition.Left);

    node.addChildNode(node1);
    node.addChildNode(node2);
    node1.setParent(node);
    node2.setParent(node);

    const readonlyNode = node.toReadonlyNode();

    assert.throws(() => { readonlyNode.id = 'id-3'; });
    assert.throws(() => { readonlyNode.topic = 'topic-1111'; });
    assert.throws(() => { readonlyNode.parent = 'new parent';});
    assert.throws(() => { readonlyNode.folded = true;});
    assert.throws(() => { readonlyNode.position = JmNodePosition.Center;});
});
