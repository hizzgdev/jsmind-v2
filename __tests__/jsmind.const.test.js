import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_METADATA, DEFAULT_OPTIONS } from '../src/jsmind.const.js';

test('DEFAULT_METADATA', () => {
    const meta = DEFAULT_METADATA;
    assert.ok(meta);
    assert.ok(meta.name);
    assert.ok(meta.version);
    assert.ok(meta.author);
});

test('DEFAULT_OPTIONS', () => {
    assert.ok(DEFAULT_OPTIONS.mind);
    assert.ok(DEFAULT_OPTIONS.mind.rootNodeId);
    assert.strictEqual(DEFAULT_OPTIONS.mind.rootNodeId, 'root');
});
