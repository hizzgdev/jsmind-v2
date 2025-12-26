import assert from 'node:assert/strict';
import test from 'node:test';
import { JsMindError } from '../src/jsmind.error.ts';

test('JsMindError', () => {
    const error = new JsMindError('test');
    assert.ok(error);
    assert.strictEqual(error.message, 'test');
}
);

