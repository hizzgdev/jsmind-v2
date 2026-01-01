import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { JmEdge, JmEdgeType } from '../../src/model/edge.ts';

const mockNode1 = 'node1';
const mockNode2 = 'node2';

describe('JmEdge', () => {

    it('JmEdge', () => {
        const edge = new JmEdge('1', mockNode1, mockNode2, JmEdgeType.Link);
        assert.ok(edge);
        assert.strictEqual(edge.id, '1');
        assert.strictEqual(edge.sourceNodeId, mockNode1);
        assert.strictEqual(edge.targetNodeId, mockNode2);
        assert.strictEqual(edge.type, JmEdgeType.Link);
        assert.strictEqual(edge.label, null);
    });

    it('JmEdge with label', () => {
        const edge = new JmEdge('1', mockNode1, mockNode2, JmEdgeType.Link, 'test label');
        assert.strictEqual(edge.label, 'test label');
    });
});
