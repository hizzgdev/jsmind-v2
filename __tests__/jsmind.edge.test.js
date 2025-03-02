import assert from 'node:assert/strict';
import test from 'node:test';
import { JmEdge, JmEdgeType } from '../src/jsmind.edge.js';

const mockNode1 = 'node1';
const mockNode2 = 'node2';

test('JmEdge', () => {
    const edge = new JmEdge('1', mockNode1, mockNode2, JmEdgeType.Child);
    assert.ok(edge);
    assert.strictEqual(edge.id, '1');
    assert.strictEqual(edge.sourceNodeId, mockNode1);
    assert.strictEqual(edge.targetNodeId, mockNode2);
    assert.strictEqual(edge.type, JmEdgeType.Child);
});

test('JmEdge with null id', () => {
    assert.throws(() => {
        new JmEdge(null, mockNode1, mockNode2, JmEdgeType.Child);
    });
});

test('JmEdge with invalid source', () => {
    assert.throws(() => {
        new JmEdge('1', null, mockNode2, JmEdgeType.Child);
    });
});

test('JmEdge with invalid target', () => {
    assert.throws(() => {
        new JmEdge('1', mockNode1, null, JmEdgeType.Child);
    });
});

test('JmEdge with invalid type', () => {
    assert.throws(() => {
        new JmEdge('1', mockNode1, mockNode2, null);
    });
});
