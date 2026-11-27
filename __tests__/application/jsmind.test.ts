import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import JsMind from '../../src/application/jsmind.ts';
import { DEFAULT_OPTIONS, type JsMindOptions } from '../../src/common/option.ts';
import { JmMind } from '../../src/model/mind.ts';
import { JmNodeContent } from '../../src/model/data/node-content.ts';
import { JSMIND_THEME_DEFAULT, JmTone, type JmNodeStyle } from '../../src/model/data/style.ts';
import { JmView } from '../../src/view/index.ts';
import { initDom, JSMIND_CONTAINER_ID } from '../setup/jsdom.ts';
import { TEST_EDGE_11TO2, TEST_MIND, TEST_NODE_1, TEST_NODE_11, TEST_NODE_2 } from '../setup/data.ts';


/**
 * The shadow root the view renders into.
 *
 * @returns The open shadow root of the playground container.
 */
function viewRoot(): ShadowRoot {
    const root = document.getElementById(JSMIND_CONTAINER_ID)?.shadowRoot;
    assert.ok(root, 'the view must render into an open shadow root');
    return root;
}

/** Count of painted node elements, including the ones a folded branch hides. */
function paintedNodeCount(): number {
    return viewRoot().querySelectorAll('.jsmind-node').length;
}

/** Count of painted lines. */
function paintedLineCount(): number {
    return viewRoot().querySelectorAll('.jsmind-edges path').length;
}

/**
 * Reads a node element's fill, the custom property the tone lands on.
 *
 * @remarks
 * Class-qualified on purpose: the expander drawn beside a node carries the same
 * node id and has no tone of its own to read. Returns `null` while the element
 * is not in the document, which is a real state - a measurement detaches the
 * element for a frame - so a poll must read through it instead of failing.
 *
 * @param nodeId - Node to read.
 * @returns The fill as written on that element, or null if it is not there.
 */
function readFill(nodeId: string): string | null {
    const element = viewRoot().querySelector(`.jsmind-node[data-jm-node-id="${nodeId}"]`);
    return element ? (element as HTMLElement).style.getPropertyValue('--jm-node-fill') : null;
}

/**
 * Reads a node element's fill, failing when the node is not rendered.
 *
 * @param nodeId - Node to read.
 * @returns The fill as written on that element.
 */
function nodeFill(nodeId: string): string {
    const fill = readFill(nodeId);
    assert.notStrictEqual(fill, null, `node ${nodeId} should be rendered`);
    return fill as string;
}

/**
 * Waits until a condition holds, then returns.
 *
 * @remarks
 * Model events reach the view through `setTimeout`, and the repaint itself
 * waits a frame to measure, so a style change is not observable on the next
 * tick. Polling says so explicitly instead of scattering sleeps; a short
 * deadline keeps a regression a failure rather than a hang.
 *
 * @param condition - Predicate to wait for.
 * @param what - Description used in the failure message.
 */
async function waitFor(condition: () => boolean, what: string): Promise<void> {
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
        if (condition()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.fail(`timed out waiting for ${what}`);
}


/**
 * Builds a two-node map whose ids are fixed.
 *
 * @remarks
 * Fixed ids are what lets a second map share them with the first, which is the
 * shape of the reported "old nodes stayed" case: the renderer keys everything on
 * the id, so a map built with generated ids could never hit it.
 *
 * @param name - Map name, so a failure names the map it came from.
 * @param childStyle - Style to create the child with.
 * @returns The map, with one child under the root.
 */
function buildMap(name: string, childStyle?: JmNodeStyle): JmMind {
    const mind = new JmMind({ name }, { rootNodeId: 'shared_root' });
    mind.addNode(
        JmNodeContent.createText('Shared'),
        { parentId: 'shared_root' },
        { nodeId: 'shared_child', style: childStyle }
    );
    return mind;
}


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

    it('repaints the node whose style changed while the map is open', async () => {
        const jm = await JsMind.create(JSMIND_CONTAINER_ID, DEFAULT_OPTIONS);
        const mind = buildMap('Styled');
        await jm.open(mind);

        const element = viewRoot().querySelector('.jsmind-node[data-jm-node-id="shared_child"]');
        assert.ok(element, 'the child should be rendered');
        assert.strictEqual(
            nodeFill('shared_child'),
            JSMIND_THEME_DEFAULT.tones![JmTone.Default]!.fillColor,
            'the node should start in the default tone'
        );

        // The reported call: reassign the style on the model and nothing else.
        const node = mind.findNodeById('shared_child');
        assert.ok(node, 'the child should be findable by id');
        node.style = { tone: JmTone.Danger };

        await waitFor(
            () => readFill('shared_child') === JSMIND_THEME_DEFAULT.tones![JmTone.Danger]!.fillColor,
            'the node to be repainted with its new tone'
        );
        // The repaint measures the node, and a measurement detaches the element
        // for a frame - so "the same element is still on screen" is polled rather
        // than read once.
        await waitFor(
            () => viewRoot().querySelector('.jsmind-node[data-jm-node-id="shared_child"]') === element,
            'the repainted node to remain the element that was already on screen'
        );

        assert.strictEqual(paintedNodeCount(), 2, 'a repaint must not add a second element for the same node');
    });

    it('closes the map off the canvas and reopens it with the style it has now', async () => {
        const jm = await JsMind.create(JSMIND_CONTAINER_ID, DEFAULT_OPTIONS);
        const mind = buildMap('Reopened');
        await jm.open(mind);
        assert.strictEqual(paintedNodeCount(), 2);
        assert.strictEqual(paintedLineCount(), 1);

        jm.close();

        assert.strictEqual(jm.mind, null);
        assert.strictEqual(paintedNodeCount(), 0, 'a closed map must leave no nodes on the canvas');
        assert.strictEqual(paintedLineCount(), 0, 'a closed map must leave no lines on the canvas');

        // No observer is attached now, so this change stays in the model - the
        // state a caller is in when it reopens the map instead of waiting for a
        // repaint.
        const node = mind.findNodeById('shared_child');
        assert.ok(node, 'the closed map keeps its model');
        node.style = { tone: JmTone.Danger };

        await jm.open(mind);

        assert.strictEqual(paintedNodeCount(), 2, 'the reopened map should paint once, not twice');
        assert.strictEqual(
            nodeFill('shared_child'),
            JSMIND_THEME_DEFAULT.tones![JmTone.Danger]!.fillColor,
            'reopening should paint the style the model carries now, not the one it had on first open'
        );
    });

    it('opening another map on the same view replaces the painted one', async () => {
        const jm = await JsMind.create(JSMIND_CONTAINER_ID, DEFAULT_OPTIONS);
        await jm.open(buildMap('First'));
        assert.strictEqual(paintedNodeCount(), 2);

        // Same ids, different style - the shape of the reported case, where the
        // old elements stayed beside the new ones and the count doubled.
        await jm.open(buildMap('Second', { tone: JmTone.Danger }));

        assert.strictEqual(paintedNodeCount(), 2, 'the previous map must not stay beside the new one');
        assert.strictEqual(paintedLineCount(), 1, 'the previous map\'s line must not stay either');
        assert.strictEqual(
            viewRoot().querySelectorAll('.jsmind-node[data-jm-node-id="shared_child"]').length,
            1,
            'the shared id should be painted once'
        );
        assert.strictEqual(
            nodeFill('shared_child'),
            JSMIND_THEME_DEFAULT.tones![JmTone.Danger]!.fillColor,
            'the node on screen should be the new map\'s'
        );
    });

    it('repaints every node a loop restyles in one pass', async () => {
        const jm = await JsMind.create(JSMIND_CONTAINER_ID, DEFAULT_OPTIONS);
        const mind = new JmMind({ name: 'Recoloured' }, { rootNodeId: 'loop_root' });
        const ids = ['loop_a', 'loop_b', 'loop_c'];
        for (const id of ids) {
            mind.addNode(JmNodeContent.createText(id), { parentId: 'loop_root' }, { nodeId: id });
        }
        await jm.open(mind);
        assert.strictEqual(paintedNodeCount(), 4);

        // Count the settle passes: the whole point of collecting the changed
        // nodes for one frame is that the map is arranged and painted once, not
        // once per node.
        const settle = JmView.prototype.settle;
        let passes = 0;
        JmView.prototype.settle = async function (this: JmView, ...args) {
            passes++;
            return await settle.apply(this, args);
        };
        try {
            for (const id of ids) {
                const node = mind.findNodeById(id);
                assert.ok(node, `node ${id} should exist`);
                node.style = { tone: JmTone.Warning };
            }

            const dangerFill = JSMIND_THEME_DEFAULT.tones![JmTone.Warning]!.fillColor;
            await waitFor(() => ids.every((id) => readFill(id) === dangerFill), 'all three nodes to be repainted');
            // Give a second pass the chance it would have had if one had been
            // scheduled, so "one pass" is measured rather than assumed.
            await new Promise((resolve) => setTimeout(resolve, 30));

            assert.strictEqual(passes, 1, `restyling ${ids.length} nodes should settle the map once, got ${passes}`);
        } finally {
            JmView.prototype.settle = settle;
        }
    });

    it('a style change followed by close does not paint the closed map back', async () => {
        const jm = await JsMind.create(JSMIND_CONTAINER_ID, DEFAULT_OPTIONS);
        const mind = buildMap('Closed');
        await jm.open(mind);

        const node = mind.findNodeById('shared_child');
        assert.ok(node, 'the child should be findable by id');
        node.style = { tone: JmTone.Danger };
        // Same turn: the repaint is queued for the next frame and must notice
        // that the map it was queued for is gone.
        jm.close();

        await new Promise((resolve) => setTimeout(resolve, 50));

        assert.strictEqual(paintedNodeCount(), 0, 'a queued repaint must not resurrect a closed map');
    });
});
