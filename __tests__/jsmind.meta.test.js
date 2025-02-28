import assert from 'node:assert/strict';
import test from 'node:test';
import { metadata } from "../src/jsmind.meta.js";

test('metadata', () => {
    const meta = metadata();
    assert.ok(meta);
    assert.ok(meta.name);
    assert.ok(meta.version);
    assert.ok(meta.author);
}
);

test('metadata is not shared object', () => {
    const meta1 = metadata();
    const meta2 = metadata();
    assert.notEqual(meta1, meta2);
}
);
