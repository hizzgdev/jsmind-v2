import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_METADATA } from '../src/jsmind.meta.js';

test('DEFAULT_METADATA', () => {
    const meta = DEFAULT_METADATA;
    assert.ok(meta);
    assert.ok(meta.name);
    assert.ok(meta.version);
    assert.ok(meta.author);
});
