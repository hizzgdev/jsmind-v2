import assert from 'node:assert/strict';
import test from 'node:test';
import JsMind from '../src/jsmind.js';


test('JsMind static', () => {
    assert.ok(JsMind.Version);
    assert.ok(JsMind.Author);
}
);

test('jsmind', () => {
    const opts = { a: 'test' };
    const jm = new JsMind(opts);
    assert.ok(jm);
    assert.strictEqual(JsMind.Version, '2.0');
});
