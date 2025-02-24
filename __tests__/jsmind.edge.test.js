import { JmNode } from '../src/jsmind.node';
import { JmEdge, JmEdgeType } from '../src/jsmind.edge';

const mockNode = JmNode.create('root');


test('JmEdge', () => {
    const edge = new JmEdge('1', mockNode, JmEdgeType.CHILD);
    expect(edge).not.toBeNull();
    expect(edge.id).toBe('1');
    expect(edge.target).toBe(mockNode);
    expect(edge.type).toBe(JmEdgeType.CHILD);
}
);

test('JmEdge with invalid target', () => {
    expect(() => {
        new JmEdge('1', 'invalid target', JmEdgeType.CHILD);
    }).toThrow();
}
);

test('JmEdge with null id', () => {
    expect(() => {
        new JmEdge(null, mockNode, JmEdgeType.CHILD);
    }).toThrow();
}
);

test('JmEdge with invalid type', () => {
    expect(() => {
        new JmEdge('1', mockNode, null);
    }).toThrow();
}
);

test('JmEdge.createChildEdge', () => {
    const edge = JmEdge.createChildEdge('1', mockNode);
    expect(edge).not.toBeNull();
    expect(edge.id).toBe('1');
    expect(edge.target).toBe(mockNode);
    expect(edge.type).toBe(JmEdgeType.CHILD);
}
);
