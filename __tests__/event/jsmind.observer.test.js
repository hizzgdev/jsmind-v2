import assert from 'node:assert/strict';
import test from 'node:test';
import { JmObserver } from '../../src/event/jsmind.observer.js';

test('JmObserver', () => {
    const observer = new JmObserver();
    assert.ok(observer);
    assert.ok(observer.update);
}
);
