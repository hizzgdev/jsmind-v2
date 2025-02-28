import assert from 'node:assert/strict';
import test from 'node:test';
import { JmEdge } from '../src/jsmind.edge.js';
import { JmNode } from '../src/jsmind.node.js';

test('JmNode', () => {
    const node = new JmNode('1');
    assert.ok(node);
    assert.strictEqual(node.id, '1');
    assert.strictEqual(node.topic, null);
    assert.strictEqual(node.parent, null);
    assert.ok(node.edges);
    assert.strictEqual(node.folded, false);
}
);

test('JmNode with null id', () => {
    assert.throws(() => {
        new JmNode();
    });
}
);

test('JmNode.create', () => {
    const node = JmNode.create('1');
    const node2 = new JmNode('1');
    assert.ok(node);
    assert.deepEqual(node, node2);
}
);

test('JmNode.create with null id', () => {
    assert.throws(() => {
        JmNode.create();
    });
}
);


test('JmNode.setTopic', () => {
    const node = JmNode.create('root').setTopic('root');
    assert.strictEqual(node.topic, 'root');
}
);

test('JmNode.setParent', () => {
    const node = JmNode.create('root');
    assert.strictEqual(node.parent, null);
    const parent = JmNode.create('parent');
    node.setParent(parent);
    assert.strictEqual(node.parent, parent);
}
);

test('JmNode.setParent with invalid parent', () => {
    const node = JmNode.create('root');
    assert.throws(() => {
        node.setParent('invalid parent');
    });
}
);

test('JmNode.setFolded', () => {
    const node = JmNode.create('root');
    assert.strictEqual(node.folded, false);
    node.setFolded(true);
    assert.strictEqual(node.folded, true);
}
);

test('JmNode.addEdge', () => {
    const node = JmNode.create('root');
    assert.ok(node.edges);
    assert.strictEqual(node.edges.length, 0);
    const node2 = JmNode.create('node2');
    const edge = JmEdge.createChildEdge('1', node2);
    node.addEdge(edge);
    assert.strictEqual(node.edges.length, 1);
    assert.strictEqual(node.edges[0], edge);
}
);

test('JmNode.addEdge with invalid edge', () => {
    const node = JmNode.create('root');
    assert.throws(() => {
        node.addEdge('invalid edge');
    });
}
);

test('JmNode.isRootNode', () => {
    const node = JmNode.create('root');
    assert.strictEqual(node.isRootNode(), true);
    const sub = JmNode.create('sub').setParent(node);
    assert.strictEqual(sub.isRootNode(), false);
}
);
