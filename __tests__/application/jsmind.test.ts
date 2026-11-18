import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import JsMind from '../../src/application/jsmind.ts';
import { DEFAULT_OPTIONS, type JsMindOptions } from '../../src/common/option.ts';
import { JmMind } from '../../src/model/mind.ts';
import { initDom, JSMIND_CONTAINER_ID } from '../setup/jsdom.ts';
import { TEST_EDGE_11TO2, TEST_MIND, TEST_NODE_1, TEST_NODE_11, TEST_NODE_2 } from '../setup/data.ts';


describe('JsMind', async () => {
    before(() => {
        initDom();
    });

    it('static properties', () => {
        assert.ok(JsMind.Version);
        assert.ok(JsMind.Author);
    });

    it('open mind map', async () => {
        const opts: JsMindOptions = DEFAULT_OPTIONS;
        const jm = await JsMind.create(JSMIND_CONTAINER_ID, opts);
        await jm.open(TEST_MIND);
        assert.ok(jm);
        assert.strictEqual(JsMind.Version, '2.0');

        assert.ok(jm.mind);
        assert.deepStrictEqual(jm.mind.meta, TEST_MIND.meta);
        assert.strictEqual(jm.mind.root.id, TEST_MIND.options.rootNodeId);
        assert.strictEqual(jm.mind.root.content.value, TEST_MIND.meta.name);

        // Rendered content lives in a shadow root, so the host element's own
        // querySelector cannot see it. That is the isolation working, not a
        // missing node — the root is open, so it stays reachable.
        const containerElement = document.getElementById(JSMIND_CONTAINER_ID);
        const shadowRoot = containerElement?.shadowRoot;
        assert.ok(shadowRoot, 'the view must render into an open shadow root');

        const node1Element = shadowRoot.querySelector(`[data-jm-node-id="${TEST_NODE_1.id}"]`);
        assert.ok(node1Element);
        const node2Element = shadowRoot.querySelector(`[data-jm-node-id="${TEST_NODE_2.id}"]`);
        assert.ok(node2Element);
        const node11Element = shadowRoot.querySelector(`[data-jm-node-id="${TEST_NODE_11.id}"]`);
        assert.ok(node11Element);
        const edge11to2Element = shadowRoot.querySelector(`[data-jm-edge-id="${TEST_EDGE_11TO2.id}"]`);
        assert.ok(!edge11to2Element);
    });

    it('replaces previous rendered content when created again on the same host', async () => {
        const opts: JsMindOptions = DEFAULT_OPTIONS;
        const first = await JsMind.create(JSMIND_CONTAINER_ID, opts);
        await first.open(TEST_MIND);
        first.close();

        const secondMind = new JmMind({ name: 'Second Map' }, { rootNodeId: 'second_root' });
        secondMind.addChildNode('Only in second', secondMind.root.id);

        const second = await JsMind.create(JSMIND_CONTAINER_ID, opts);
        await second.open(secondMind);

        const shadowRoot = document.getElementById(JSMIND_CONTAINER_ID)?.shadowRoot;
        assert.ok(shadowRoot, 'the reused host must still have an open shadow root');
        assert.strictEqual(shadowRoot.querySelectorAll('.jsmind-inner').length, 1,
            'recreating the view must not stack inner containers');
        assert.ok(shadowRoot.querySelector('[data-jm-node-id="second_root"]'),
            'the new map\'s root should be in the shadow root');
        assert.strictEqual(shadowRoot.querySelector(`[data-jm-node-id="${TEST_NODE_1.id}"]`), null,
            'nodes from the previous map must not remain clickable');
    });
});
