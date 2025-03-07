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
    assert.deepEqual(node.data, {});
});

test('JmNode with null id', () => {
    assert.throws(() => {
        new JmNode();
    });
});

test('JmNode.getAllSubnodeIds', () => {
    const node = new JmNode('root');
    const child1 = new JmNode('child1');
    const child12 = new JmNode('child12');
    const child11 = new JmNode('child11');
    const child111 = new JmNode('child111');
    const child112 = new JmNode('child112');

    child11.children.push(child111, child112);
    child1.children.push(child11, child12);
    node.children.push(child1);

    assert.deepStrictEqual(child1.getAllSubnodeIds(), ['child11', 'child111', 'child112', 'child12']);
});

test('JmNode.equals returns true', () => {
    const root = new JmNode('root');
    assert.ok(root.equals(root));

    const node1A = new JmNode('node1');
    const node1B = new JmNode('node1');
    assert.ok(node1A.equals(node1B));

    root.children.push(node1A, node1B);
    node1A.parent = root;
    node1B.parent = root;
    assert.ok(root.equals(root));
    assert.ok(node1A.equals(node1B));

    const node2 = new JmNode('node2');
    node1A.children.push(node2);
    node1B.children.push(node2);
    assert.ok(root.equals(root));
    assert.ok(node1A.equals(node1B));

    node1A.topic = 'topic';
    node1A.position = JmNodePosition.Left;
    node1A.folded = false;
    node1B.topic = 'topic';
    node1B.position = JmNodePosition.Left;
    node1B.folded = false;
    assert.ok(node1A.equals(node1B));
});

test('JmNode.equals returns false', () => {
    const node1A = new JmNode('node1');
    const node1B = new JmNode('node1B');
    assert.ok(!node1A.equals(node1B));

    node1B.id = 'node1';
    node1A.topic = 'topic1';
    node1B.topic = 'topic1B';
    assert.ok(!node1A.equals(node1B));

    node1B.topic = 'topic1';
    assert.ok(node1A.equals(node1B));

    const node2 = new JmNode('node2');
    const node3 = new JmNode('node3');
    node1A.children.push(node2, node3);
    node1B.children.push(node2);
    assert.ok(!node1A.equals(node1B));

    node1B.children.push(node3);
    assert.ok(node1A.equals(node1B));

    const root1 = new JmNode('root1');
    const root2 = new JmNode('root2');
    node1A.parent = root1;
    node1B.parent = root2;
    assert.ok(!node1A.equals(node1B));

    root2.id = 'root1';
    assert.ok(node1A.equals(node1B));

    node1A.topic = 'topic';
    node1B.topic = 'topic2';
    assert.ok(!node1A.equals(node1B));

    node1B.topic = 'topic';
    assert.ok(node1A.equals(node1B));

    node1A.position = JmNodePosition.Left;
    node1B.position = JmNodePosition.Right;
    assert.ok(!node1A.equals(node1B));

    node1B.position = JmNodePosition.Left;
    assert.ok(node1A.equals(node1B));

    node1A.folded = false;
    node1B.folded = true;
    assert.ok(!node1A.equals(node1B));
});
