import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import JsMind from '../src/jsmind.ts';
import { DEFAULT_OPTIONS, type JsMindOptions } from '../src/common/option.ts';
import { initDom, JSMIND_CONTAINER_ID } from './setup/jsdom.ts';
import { TEST_EDGE_11TO2, TEST_MIND, TEST_NODE_1, TEST_NODE_11, TEST_NODE_2 } from './setup/data.ts';


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

        const containerElement = document.getElementById(JSMIND_CONTAINER_ID);
        const node1Element = containerElement?.querySelector(`[data-jm-node-id="${TEST_NODE_1.id}"]`);
        assert.ok(node1Element);
        const node2Element = containerElement?.querySelector(`[data-jm-node-id="${TEST_NODE_2.id}"]`);
        assert.ok(node2Element);
        const node11Element = containerElement?.querySelector(`[data-jm-node-id="${TEST_NODE_11.id}"]`);
        assert.ok(node11Element);
        const edge11to2Element = containerElement?.querySelector(`[data-jm-edge-id="${TEST_EDGE_11TO2.id}"]`);
        assert.ok(edge11to2Element);
    });
});
