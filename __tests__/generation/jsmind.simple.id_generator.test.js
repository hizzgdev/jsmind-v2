import assert from 'node:assert/strict';
import test from 'node:test';
import { SimpleIdGenerator } from '../../src/generation/jsmind.simple.id_generator.js';

test('SimpleIdGenerator', () => {
    const generator = new SimpleIdGenerator('test_');
    assert.ok(generator);
    const idCollection = new Set();
    for(let i = 0; i < 100; i++) {
        const id = generator.newId();
        assert.match(id, /^test_.+/);
        idCollection.add(id);
    }
    assert.strictEqual(idCollection.size, 100);
}
);

test('SimpleIdGenerator with null prefix', () => {
    const generator = new SimpleIdGenerator(null);
    assert.ok(generator);
    const idCollection = new Set();
    for(let i = 0; i < 100; i++) {
        idCollection.add(generator.newId());
    }
    assert.strictEqual(idCollection.size, 100);
}
);

