import assert from 'node:assert/strict';
import test, {mock} from 'node:test';
import { JmObserverManager } from '../../src/event/jsmind.observer.manager.js';

test('JmObserverManager', () => {
    const obj = new Object();
    const observerManager = new JmObserverManager(obj);

    assert.equal(observerManager.observedObject, obj);
}
);

test('JmObserverManager.addObserver', () => {
    const observerManager = new JmObserverManager(new Object());
    const invalidObserver = new Object();
    const validObserver = {
        onStateChanged: () => { }
    };

    assert.throws(() => {
        observerManager.addObserver(invalidObserver);
    });

    observerManager.addObserver(validObserver);
    assert.strictEqual(observerManager._observers.length, 1);
});

test('JmObserverManager.removeObserver', () => {
    const observerManager = new JmObserverManager(new Object());
    const observer1 = {
        onStateChanged: () => { }
    };

    const observer2 = {
        onStateChanged: () => { }
    };

    observerManager.addObserver(observer1);
    assert.strictEqual(observerManager._observers.length, 1);

    observerManager.addObserver(observer2);
    assert.strictEqual(observerManager._observers.length, 2);

    observerManager.removeObserver(observer1);
    assert.strictEqual(observerManager._observers.length, 1);
}
);

test('JmObserverManager.clearObservers', () => {
    const observerManager = new JmObserverManager(new Object());
    const observer1 = {
        onStateChanged: () => { }
    };

    const observer2 = {
        onStateChanged: () => { }
    };

    observerManager.addObserver(observer1);
    observerManager.addObserver(observer2);
    assert.strictEqual(observerManager._observers.length, 2);

    observerManager.clearObservers();
    assert.strictEqual(observerManager._observers.length, 0);
}
);

test('JmObserverManager.notifyObservers', async () => {
    const observerManager = new JmObserverManager(new Object());
    const observer1 = {
        onStateChanged: mock.fn()
    };

    const observer2 = {
        onStateChanged: mock.fn()
    };

    observerManager.addObserver(observer1);
    observerManager.addObserver(observer2);

    const event = {
        type: 'test'
    };

    mock.timers.enable();
    await observerManager.notifyObservers(event);
    mock.timers.runAll();

    assert.strictEqual(observer1.onStateChanged.mock.callCount(), 1);
    assert.strictEqual(observer2.onStateChanged.mock.callCount(), 1);

    const arg1 = observer1.onStateChanged.mock.calls[0].arguments;
    assert.strictEqual(arg1.length, 2);
    assert.strictEqual(arg1[0], observerManager.observedObject);
    assert.strictEqual(arg1[1], event);

    const arg2 = observer1.onStateChanged.mock.calls[0].arguments;
    assert.strictEqual(arg2.length, 2);
    assert.strictEqual(arg2[0], observerManager.observedObject);
    assert.strictEqual(arg2[1], event);

    mock.timers.reset();
}
);
