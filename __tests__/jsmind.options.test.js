import { options } from '../src/jsmind.options';

test('options', () => {
    expect(options.mind).not.toBeNull();
}
);

test('options.mind.nodeIdGenerator', () => {
    const nodeIdGenerator = options.mind.nodeIdGenerator;
    expect(nodeIdGenerator).not.toBeNull();
    expect(nodeIdGenerator.newId).not.toBeNull();
    expect(nodeIdGenerator.newId()).not.toBeNull();
    expect(nodeIdGenerator.newId()).not.toBe(nodeIdGenerator.newId());
}
);

test('options.mind.edgeIdGenerator', () => {
    const edgeIdGenerator = options.mind.edgeIdGenerator;
    expect(edgeIdGenerator).not.toBeNull();
    expect(edgeIdGenerator.newId).not.toBeNull();
    expect(edgeIdGenerator.newId()).not.toBeNull();
    expect(edgeIdGenerator.newId()).not.toBe(edgeIdGenerator.newId());
}
);
