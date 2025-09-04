import assert from 'node:assert/strict';
import test from 'node:test';
import { SimpleIdGenerator, GLOBAL_ID_GENERATOR } from '../../src/generation/jsmind.id_generator.js';

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
});

test('GLOBAL_ID_GENERATOR', () => {
    assert.ok(GLOBAL_ID_GENERATOR);
    assert.ok(GLOBAL_ID_GENERATOR.newId);
    const idCollection = new Set();
    for(let i = 0; i < 100; i++) {
        const id = GLOBAL_ID_GENERATOR.newId();
        assert.ok(id);
        assert.strictEqual(typeof id, 'string');
        idCollection.add(id);
    }
    assert.strictEqual(idCollection.size, 100);
});

