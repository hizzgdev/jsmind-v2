import assert from 'node:assert/strict';
import test from 'node:test';
import JsMind from '../src/jsmind.ts';
import { type JsMindOptions } from '../src/jsmind.const.ts';
import './setup/jsdom.test.ts';
import { JSMIND_CONTAINER_ID } from './setup/jsdom.test.ts';

test('JsMind static', () => {
    assert.ok(JsMind.Version);
    assert.ok(JsMind.Author);
}
);

test('jsmind', () => {
    const opts: JsMindOptions = { container: JSMIND_CONTAINER_ID, mind: { rootNodeId: 'test' }, viewOptions: { theme: 'test' } };
    const jm = new JsMind(opts);
    assert.ok(jm);
    assert.strictEqual(JsMind.Version, '2.0');
});

