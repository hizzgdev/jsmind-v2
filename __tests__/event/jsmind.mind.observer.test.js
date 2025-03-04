import assert from 'node:assert/strict';
import test from 'node:test';
import { JmMindObserver } from '../../src/event/jsmind.mind.observer.js';


test('JmMindObserver', () => {
    const mockView = new Object();
    const observer = new JmMindObserver(mockView);
    // TODO more assertions
    assert.ok(observer);
}
);
