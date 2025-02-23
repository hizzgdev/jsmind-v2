import { config } from '../src/jsmind.config';

test('config', () => {
    const nodeIdGenerator = config.nodeIdGenerator;
    const edgeIdGenerator = config.edgeIdGenerator;

    expect(nodeIdGenerator).not.toBeNull();
    expect(edgeIdGenerator).not.toBeNull();

    expect(nodeIdGenerator.newId).not.toBeNull();
    expect(edgeIdGenerator.newId).not.toBeNull();

    expect(nodeIdGenerator.newId()).not.toBeNull();
    expect(edgeIdGenerator.newId()).not.toBeNull();

    expect(nodeIdGenerator.newId()).not.toBe(nodeIdGenerator.newId());
    expect(edgeIdGenerator.newId()).not.toBe(edgeIdGenerator.newId());
}
);
