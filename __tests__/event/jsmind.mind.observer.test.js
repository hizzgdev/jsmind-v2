import assert from 'node:assert/strict';
import test, {mock} from 'node:test';
import { JmMindEventListener } from '../../src/event/jsmind.mind.observer.js';

const mockOnMindChanged = mock.fn();
class TestJmMindEventListener extends JmMindEventListener {
    constructor() {
        super();
    }

    onMindChanged(sender, event) {
        mockOnMindChanged(sender, event);
    }
}

test('JmMindEventListener.update', () => {
    const listener = new TestJmMindEventListener();
    const observedObject = new Object();
    const event = new Object();
    listener.update(observedObject, event);
    assert.ok(mockOnMindChanged.mock.calls.length === 1);
    assert.ok(mockOnMindChanged.mock.calls[0].arguments[0] === observedObject);
    assert.ok(mockOnMindChanged.mock.calls[0].arguments[1] === event);
}
);
