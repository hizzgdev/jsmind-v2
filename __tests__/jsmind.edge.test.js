import assert from 'node:assert/strict';
import test from 'node:test';
import { JmNode } from '../src/jsmind.node.js';
import { JmEdge, JmEdgeType } from '../src/jsmind.edge.js';

const mockNode = JmNode.create('root');


test('JmEdge', () => {
    const edge = new JmEdge('1', mockNode, JmEdgeType.CHILD);
    assert.ok(edge);
    assert.strictEqual(edge.id, '1');
    assert.strictEqual(edge.target, mockNode);
    assert.strictEqual(edge.type, JmEdgeType.CHILD);
}
);

test('JmEdge with invalid target', () => {
    assert.throws(() => {
        new JmEdge('1', 'invalid target', JmEdgeType.CHILD);
    });
}
);

test('JmEdge with null id', () => {
    assert.throws(() => {
        new JmEdge(null, mockNode, JmEdgeType.CHILD);
    });
}
);

test('JmEdge with invalid type', () => {
    assert.throws(() => {
        new JmEdge('1', mockNode, null);
    });
}
);

test('JmEdge.createChildEdge', () => {
    const edge = JmEdge.createChildEdge('1', mockNode);
    assert.ok(edge);
    assert.strictEqual(edge.id, '1');
    assert.strictEqual(edge.target, mockNode);
    assert.strictEqual(edge.type, JmEdgeType.CHILD);
}
);
