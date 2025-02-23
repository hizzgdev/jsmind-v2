import { SimpleIdGenerator } from '../../src/impl/jsmind.impl.simple_id_generator';

test('SimpleIdGenerator', () => {
    const generator = new SimpleIdGenerator('test_');
    expect(generator).not.toBeNull();
    const idCollection = new Set();
    for(let i = 0; i < 100; i++) {
        const id = generator.newId();
        expect(id).toMatch(/^test_.+/);
        idCollection.add(id);
    }
    expect(idCollection.size).toBe(100);
}
);

test('SimpleIdGenerator with null prefix', () => {
    const generator = new SimpleIdGenerator(null);
    expect(generator).not.toBeNull();
    const idCollection = new Set();
    for(let i = 0; i < 100; i++) {
        idCollection.add(generator.newId());
    }
    expect(idCollection.size).toBe(100);
}
);

