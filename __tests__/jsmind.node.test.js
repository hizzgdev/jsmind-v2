import { JmEdge } from '../src/jsmind.edge';
import { JmNode } from '../src/jsmind.node';

test('JmNode', () => {
    const node = new JmNode('1');
    expect(node).not.toBeNull();
    expect(node.id).toBe('1');
    expect(node.topic).toBeNull();
    expect(node.parent).toBeNull();
    expect(node.edges).not.toBeNull();
    expect(node.folded).toBe(false);
}
);

test('JmNode with null id', () => {
    expect(() => {
        new JmNode();
    }).toThrow();
}
);

test('JmNode.create', () => {
    const node = JmNode.create('1');
    const node2 = new JmNode('1');
    expect(node).not.toBeNull();
    expect(node).toEqual(node2);
}
);

test('JmNode.create with null id', () => {
    expect(() => {
        JmNode.create();
    }).toThrow();
}
);


test('JmNode.setTopic', () => {
    const node = JmNode.create('root').setTopic('root');
    expect(node.topic).toBe('root');
}
);

test('JmNode.setParent', () => {
    const node = JmNode.create('root');
    expect(node.parent).toBeNull();
    const parent = JmNode.create('parent');
    node.setParent(parent);
    expect(node.parent).toBe(parent);
}
);

test('JmNode.setParent with invalid parent', () => {
    const node = JmNode.create('root');
    expect(() => {
        node.setParent('invalid parent');
    }).toThrow();
}
);

test('JmNode.setFolded', () => {
    const node = JmNode.create('root');
    expect(node.folded).toBe(false);
    node.setFolded(true);
    expect(node.folded).toBe(true);
}
);

test('JmNode.addEdge', () => {
    const node = JmNode.create('root');
    expect(node.edges).not.toBeNull();
    expect(node.edges.length).toBe(0);
    const node2 = JmNode.create('node2');
    const edge = JmEdge.createChildEdge('1', node2);
    node.addEdge(edge);
    expect(node.edges.length).toBe(1);
    expect(node.edges[0]).toBe(edge);
}
);

test('JmNode.addEdge with invalid edge', () => {
    const node = JmNode.create('root');
    expect(() => {
        node.addEdge('invalid edge');
    }).toThrow();
}
);

test('JmNode.isRootNode', () => {
    const node = JmNode.create('root');
    expect(node.isRootNode()).toBe(true);
    const sub = JmNode.create('sub').setParent(node);
    expect(sub.isRootNode()).toBe(false);
}
);
