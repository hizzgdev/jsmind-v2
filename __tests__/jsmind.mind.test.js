import { expect, jest } from '@jest/globals';
import { metadata } from "../src/jsmind.meta";
import { JmMind } from "../src/jsmind.mind";

const mockNodeIdGenerate = jest.fn();
const mockEdgeIdGenerate = jest.fn();

const mindOptions = {
    nodeIdGenerator: {
        newId: mockNodeIdGenerate
    },
    edgeIdGenerator: {
        newId: mockEdgeIdGenerate
    }
};

test('JmMind', () => {
    mockNodeIdGenerate.mockReturnValue('node_1');
    const mind = new JmMind(mindOptions);
    expect(mind).not.toBeNull();
    expect(mind.options).not.toBeNull();
    expect(mind.options.nodeIdGenerator).not.toBeNull();
    expect(mind.options.edgeIdGenerator).not.toBeNull();

    expect(mind.meta).not.toBeNull();
    expect(mind.meta).toEqual(metadata());

    expect(mind.root).not.toBeNull();
    expect(mind.root.id).toBe('node_1');
    expect(mind.root.topic).toBe(mind.meta.name);
}
);

test('JmMind.addSubNode', () => {
    mockNodeIdGenerate.mockReturnValue('node_1');
    mockEdgeIdGenerate.mockReturnValue('edge_1');
    const mind = new JmMind(mindOptions);
    mockNodeIdGenerate.mockReturnValue('node_2');
    const child = mind.addSubNode(mind.root, 'child');
    expect(child).not.toBeNull();
    expect(child.id).toBe('node_2');
    expect(child.topic).toBe('child');
    expect(child.parent).toBe(mind.root);
}
);
