import assert from 'node:assert/strict';
import test from 'node:test';
import { options } from '../src/jsmind.options.js';

test('options', () => {
    assert.ok(options.mind);
}
);

test('options.mind.nodeIdGenerator', () => {
    const nodeIdGenerator = options.mind.nodeIdGenerator;
    assert.ok(nodeIdGenerator);
    assert.ok(nodeIdGenerator.newId);
    assert.ok(nodeIdGenerator.newId());
    assert.notEqual(nodeIdGenerator.newId(), nodeIdGenerator.newId());
}
);

test('options.mind.edgeIdGenerator', () => {
    const edgeIdGenerator = options.mind.edgeIdGenerator;
    assert.ok(edgeIdGenerator);
    assert.ok(edgeIdGenerator.newId);
    assert.ok(edgeIdGenerator.newId());
    assert.notEqual(edgeIdGenerator.newId(), edgeIdGenerator.newId());
}
);
