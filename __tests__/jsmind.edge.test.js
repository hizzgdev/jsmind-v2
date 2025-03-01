import assert from 'node:assert/strict';
import test from 'node:test';
import { JmNode } from '../src/jsmind.node.js';
import { JmEdge, JmEdgeType } from '../src/jsmind.edge.js';

const mockNode1 = JmNode.create('root');
const mockNode2 = JmNode.create('root');


test('JmEdge', () => {
    const edge = new JmEdge('1', mockNode1, mockNode2, JmEdgeType.CHILD);
    assert.ok(edge);
    assert.strictEqual(edge.id, '1');
    assert.strictEqual(edge.source, mockNode1);
    assert.strictEqual(edge.target, mockNode2);
    assert.strictEqual(edge.type, JmEdgeType.CHILD);
}
);

test('JmEdge with invalid source', () => {
    assert.throws(() => {
        new JmEdge('1', 'invalid source', mockNode2, JmEdgeType.CHILD);
    });
}
);

test('JmEdge with invalid target', () => {
    assert.throws(() => {
        new JmEdge('1', mockNode1, 'invalid target', JmEdgeType.CHILD);
    });
}
);

test('JmEdge with null id', () => {
    assert.throws(() => {
        new JmEdge(null, mockNode1, mockNode2, JmEdgeType.CHILD);
    });
}
);

test('JmEdge with invalid type', () => {
    assert.throws(() => {
        new JmEdge('1', mockNode1, mockNode2, null);
    });
}
);

test('JmEdge.createChildEdge', () => {
    const edge = JmEdge.createChildEdge('1', mockNode1, mockNode2);
    assert.ok(edge);
    assert.strictEqual(edge.id, '1');
    assert.strictEqual(edge.source, mockNode1);
    assert.strictEqual(edge.target, mockNode2);
    assert.strictEqual(edge.type, JmEdgeType.CHILD);
}
);
