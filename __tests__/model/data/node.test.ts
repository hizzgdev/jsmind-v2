import assert from 'node:assert/strict';
import test from 'node:test';
import { JmNode, JmNodeSide } from '../../../src/model/data/node.ts';
import { JmNodeContent } from '../../../src/model/data/node-content.ts';

// Shared test content for tests
const testContent = JmNodeContent.createText('');

test('JmNode', () => {
    const node = new JmNode('1', testContent);
    assert.ok(node);
    assert.strictEqual(node.id, '1');
    assert.strictEqual(node.content.value, '');
    assert.strictEqual(node.parent, null);
    assert.strictEqual(node.side, JmNodeSide.SideA);
    assert.strictEqual(node.children.length, 0);
    assert.strictEqual(node.folded, false);
    assert.deepEqual(node.data, {});
});

test('JmNode with null id', () => {

    assert.throws(() => {
        new JmNode(null as unknown as string, testContent);
    });
});

test('JmNode.getAllSubnodeIds', () => {
    const node = new JmNode('root', testContent);
    const child1 = new JmNode('child1', testContent);
    const child12 = new JmNode('child12', testContent);
    const child11 = new JmNode('child11', testContent);
    const child111 = new JmNode('child111', testContent);
    const child112 = new JmNode('child112', testContent);

    child11.children.push(child111, child112);
    child1.children.push(child11, child12);
    node.children.push(child1);

    assert.deepStrictEqual(child1.getAllSubnodeIds(), ['child11', 'child111', 'child112', 'child12']);
});

test('JmNode.equals returns true', () => {
    const root = new JmNode('root', testContent);
    assert.ok(root.equals(root));

    const node1A = new JmNode('node1', testContent);
    const node1B = new JmNode('node1', testContent);
    assert.ok(node1A.equals(node1B));

    root.children.push(node1A, node1B);
    node1A.parent = root;
    node1B.parent = root;
    assert.ok(root.equals(root));
    assert.ok(node1A.equals(node1B));

    const node2 = new JmNode('node2', testContent);
    node1A.children.push(node2);
    node1B.children.push(node2);
    assert.ok(root.equals(root));
    assert.ok(node1A.equals(node1B));

    node1A.content = JmNodeContent.createText('topic');
    node1A.side = JmNodeSide.SideB;
    node1A.folded = false;
    node1B.content = JmNodeContent.createText('topic');
    node1B.side = JmNodeSide.SideB;
    node1B.folded = false;
    assert.ok(node1A.equals(node1B));
});

test('JmNode.equals returns false', () => {
    const node1A = new JmNode('node1', testContent);
    const node1B = new JmNode('node1B', testContent);
    assert.ok(!node1A.equals(node1B));

    node1B.id = 'node1';
    node1A.content = JmNodeContent.createText('topic1');
    node1B.content = JmNodeContent.createText('topic1B');
    assert.ok(!node1A.equals(node1B));

    node1B.content = JmNodeContent.createText('topic1');
    assert.ok(node1A.equals(node1B));

    const node2 = new JmNode('node2', testContent);
    const node3 = new JmNode('node3', testContent);
    node1A.children.push(node2, node3);
    node1B.children.push(node2);
    assert.ok(!node1A.equals(node1B));

    node1B.children.push(node3);
    assert.ok(node1A.equals(node1B));

    const root1 = new JmNode('root1', testContent);
    const root2 = new JmNode('root2', testContent);
    node1A.parent = root1;
    node1B.parent = root2;
    assert.ok(!node1A.equals(node1B));

    root2.id = 'root1';
    assert.ok(node1A.equals(node1B));

    node1A.content = JmNodeContent.createText('topic');
    node1B.content = JmNodeContent.createText('topic2');
    assert.ok(!node1A.equals(node1B));

    node1B.content = JmNodeContent.createText('topic');
    assert.ok(node1A.equals(node1B));

    node1A.side = JmNodeSide.SideB;
    node1B.side = JmNodeSide.SideA;
    assert.ok(!node1A.equals(node1B));

    node1B.side = JmNodeSide.SideB;
    assert.ok(node1A.equals(node1B));

    node1A.folded = false;
    node1B.folded = true;
    assert.ok(!node1A.equals(node1B));
});

