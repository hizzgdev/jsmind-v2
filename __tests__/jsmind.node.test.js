import { jest, test } from '@jest/globals';
import { JmEdgeType } from '../src/jsmind.edge';
import { JmNode } from '../src/jsmind.node';
import { config } from '../src/jsmind.config';

const mockNodeIdGenerate = jest.fn();

beforeAll(() => {
    config.nodeIdGenerator = {
        newId: mockNodeIdGenerate,
    };
});

test('JmNode', () => {
    const node = new JmNode('1', null, 'root');
    expect(node).not.toBeNull();
    expect(node.id).toBe('1');
    expect(node.topic).toBe('root');
    expect(node.parent).toBeNull();
    expect(node.edges).not.toBeNull();
    expect(node.folded).toBe(false);
}
);

test('JmNode with invalid parent', () => {
    expect(() => {
        new JmNode('1', 'invalid parent', 'root');
    }).toThrow();
}
);

test('JmNode with null id', () => {
    const node = new JmNode('1', null, 'root');
    expect(() => {
        new JmNode(null, node, 'root');
    }).toThrow();
}
);

test('JmNode.createRootNode', () => {
    mockNodeIdGenerate.mockReturnValue('1');
    const root = JmNode.createRootNode('root2');
    expect(root).not.toBeNull();
    expect(root.id).toBe('1');
    expect(root.topic).toBe('root2');
    expect(root.parent).toBeNull();
    expect(root.edges).not.toBeNull();
    expect(root.folded).toBe(false);
}
);

test('JmNode.createSubNode', () => {
    mockNodeIdGenerate.mockReturnValue('1');
    const node = JmNode.createRootNode('root');
    mockNodeIdGenerate.mockReturnValue('2');
    const sub = node.createSubNode('sub2');
    expect(sub).not.toBeNull();
    expect(sub.id).toBe('2');
    expect(sub.topic).toBe('sub2');
    expect(sub.parent).toBe(node);
    expect(sub.folded).toBe(false);
    expect(sub.edges).not.toBeNull();
    expect(node.edges.length).toBe(1);
    expect(node.edges[0].target).toBe(sub);
    expect(node.edges[0].type).toBe(JmEdgeType.CHILD);
}
);

test('JmNode.createSubNode with edges not initialized', () => {
    mockNodeIdGenerate.mockReturnValue('1');
    const node = new JmNode('1', null, 'root');
    node.edges = null;
    mockNodeIdGenerate.mockReturnValue('2');
    const sub = node.createSubNode('sub2');
    expect(sub).not.toBeNull();
    expect(node.edges.length).toBe(1);
    expect(node.edges[0].target).toBe(sub);
    expect(node.edges[0].type).toBe(JmEdgeType.CHILD);
}
);

test('JmNode.isRootNode', () => {
    const node = JmNode.createRootNode('root');
    expect(node.isRootNode()).toBe(true);
    const sub = node.createSubNode('sub2');
    expect(sub.isRootNode()).toBe(false);
}
);

test('JmNode.setFolded', () => {
    const node = JmNode.createRootNode('root');
    expect(node.folded).toBe(false);
    node.setFolded(true);
    expect(node.folded).toBe(true);
}
);

test('JmNode.setTopic', () => {
    const node = JmNode.createRootNode('root');
    expect(node.topic).toBe('root');
    node.setTopic('new topic');
    expect(node.topic).toBe('new topic');
}
);
