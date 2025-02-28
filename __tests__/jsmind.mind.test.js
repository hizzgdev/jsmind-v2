import assert from 'node:assert/strict';
import test, {mock} from 'node:test';
import { metadata } from "../src/jsmind.meta.js";
import { JmMind } from "../src/jsmind.mind.js";

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

test('JsMind observer', () => {
    const mind = new JmMind(mindOptions);
    const mockedNotifyObservers = mock.method(mind.observerManager, 'notifyObservers');
    mind.addSubNode(mind.root, 'child');
    mind.addSubNode(mind.root, 'child');
    assert.strictEqual(mockedNotifyObservers.mock.callCount(), 2);
}
);
