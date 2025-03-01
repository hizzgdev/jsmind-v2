import assert from 'node:assert/strict';
import test, {mock} from 'node:test';
import { metadata } from '../src/jsmind.meta.js';
import { JmMind } from '../src/jsmind.mind.js';
import { JmMindEventType, JmMindEvent } from '../src/event/jsmind.mind.observer.js';
import { JmNode } from '../src/jsmind.node.js';

const mindOptions = {
    nodeIdGenerator: {
        newId: mock.fn(()=>'node_1')
    },
    edgeIdGenerator: {
        newId: mock.fn(()=>'edge_1')
    }
};

test('JmMind', () => {
    const mind = new JmMind(mindOptions);
    assert.ok(mind);
    assert.ok(mind.options);
    assert.ok(mind.options.nodeIdGenerator);
    assert.ok(mind.options.edgeIdGenerator);

    assert.ok(mind.meta);
    assert.deepStrictEqual(mind.meta, metadata());

    assert.ok(mind.root);
    assert.strictEqual(mind.root.id, 'node_1');
    assert.strictEqual(mind.root.topic, mind.meta.name);
}
);

test('JmMind.addSubNode', () => {
    const mind = new JmMind(mindOptions);
    mindOptions.nodeIdGenerator.newId.mock.mockImplementationOnce(()=>'node_2');
    const child = mind.addSubNode(mind.root, 'child');
    assert.ok(child);
    assert.strictEqual(child.id, 'node_2');
    assert.strictEqual(child.topic, 'child');
    assert.strictEqual(child.parent, mind.root);
}
);

test('JsMind.observer', () => {
    const mind = new JmMind(mindOptions);
    const mockedNotifyObservers = mock.method(mind.observerManager, 'notifyObservers');
    mind.addSubNode(mind.root, 'child1');
    mind.addSubNode(mind.root, 'child2');
    assert.strictEqual(mockedNotifyObservers.mock.callCount(), 2);

    const event1 = mockedNotifyObservers.mock.calls[0].arguments[0];
    assert.ok(event1 instanceof JmMindEvent);
    assert.strictEqual(event1.type, JmMindEventType.NodeAdded);

    assert.ok(event1.data instanceof JmNode);
    assert.strictEqual(event1.data.topic, 'child1');
    assert.strictEqual(event1.data.parent, mind.root);
}
);
