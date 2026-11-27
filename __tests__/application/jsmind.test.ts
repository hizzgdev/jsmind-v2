import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import JsMind from '../../src/application/jsmind.ts';
import { DEFAULT_OPTIONS, type JsMindOptions } from '../../src/common/option.ts';
import { DomUtility } from '../../src/common/dom.ts';
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
 * Builds a fixed rect, so a stubbed measurement returns a size without layout.
 *
 * @param width - Rect width in pixels.
 * @param height - Rect height in pixels.
 * @returns A rect with the origin at (0, 0).
 */
function stubRect(width: number, height: number): DOMRect {
    return {
        width,
        height,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: height,
        right: width,
        toJSON: () => ({}),
    } as DOMRect;
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


/**
 * Tells a test when the deferred style repaint starts measuring.
 *
 * @remarks
 * The repaint waits a frame to run and another one inside the measurement, so a
 * case that wants to act while it is in flight has to be told when that started
 * instead of guessing a delay. The first measurement after a style change is the
 * repaint's: an `open` only measures once it has closed and cleared, which is
 * what the caller does after awaiting this.
 *
 * @returns The signal to await, and the restore to call when the case is done.
 */
function repaintMeasurementStarted(): { started: Promise<void>; restore: () => void } {
    const originalMeasureElement = DomUtility.measureElement;
    let markStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => {
        markStarted = resolve;
    });
    DomUtility.measureElement = async (element: HTMLElement, container: HTMLElement): Promise<DOMRect> => {
        const measuring = originalMeasureElement.call(DomUtility, element, container);
        markStarted();
        return await measuring;
    };
    return {
        started,
        restore: () => {
            DomUtility.measureElement = originalMeasureElement;
        },
    };
}


/**
 * Records unhandled promise rejections for the duration of a case.
 *
 * @remarks
 * A repaint is fired and forgotten, so a repaint that outlives its map has
 * nowhere to report a failure: it surfaces as an unhandled rejection instead,
 * which only a test that races the view can see.
 *
 * @returns The collected reasons, and the removal to call when the case is done.
 */
function trackUnhandledRejections(): { reasons: unknown[]; restore: () => void } {
    const reasons: unknown[] = [];
    const listener = (reason: unknown): void => {
        reasons.push(reason);
    };
    process.on('unhandledRejection', listener);
    return {
        reasons,
        restore: () => {
            process.off('unhandledRejection', listener);
        },
    };
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

    it('repaints every node a loop restyles in one measurement pass', async () => {
        const jm = await JsMind.create(JSMIND_CONTAINER_ID, DEFAULT_OPTIONS);
        const mind = new JmMind({ name: 'Recoloured' }, { rootNodeId: 'loop_root' });
        const ids = ['loop_a', 'loop_b', 'loop_c'];
        for (const id of ids) {
            mind.addNode(JmNodeContent.createText(id), { parentId: 'loop_root' }, { nodeId: id });
        }
        await jm.open(mind);
        assert.strictEqual(paintedNodeCount(), 4);

        // Count measurement batches, not settle passes. Every measurement waits
        // for a frame, so a repaint that walks the nodes one await at a time
        // shows up here as one batch per node - and it still settles once, which
        // is why counting `settle` passes cannot tell the two implementations
        // apart. A batch is a group of measurements that overlap: all of them
        // start before the first one finishes.
        const originalMeasureElement = DomUtility.measureElement;
        let inFlight = 0;
        let batches = 0;
        let widest = 0;
        DomUtility.measureElement = async (): Promise<DOMRect> => {
            if (inFlight === 0) {
                batches++;
            }
            inFlight++;
            widest = Math.max(widest, inFlight);
            try {
                return await new Promise<DOMRect>((resolve) => {
                    requestAnimationFrame(() => resolve(stubRect(60, 20)));
                });
            } finally {
                inFlight--;
            }
        };
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

            const warningFill = JSMIND_THEME_DEFAULT.tones![JmTone.Warning]!.fillColor;
            await waitFor(() => ids.every((id) => readFill(id) === warningFill), 'all three nodes to be repainted');
            // Give a second pass the chance it would have had if one had been
            // scheduled, so "one pass" is measured rather than assumed.
            await new Promise((resolve) => setTimeout(resolve, 30));

            assert.strictEqual(batches, 1, `restyling ${ids.length} nodes should measure them in one batch, got ${batches}`);
            assert.strictEqual(widest, ids.length, 'every restyled node should be measured in that same batch');
            assert.strictEqual(passes, 1, `restyling ${ids.length} nodes should settle the map once, got ${passes}`);
        } finally {
            DomUtility.measureElement = originalMeasureElement;
            JmView.prototype.settle = settle;
        }
    });

    it('measures a restyled batch unscaled even while the map is zoomed', async () => {
        const jm = await JsMind.create(JSMIND_CONTAINER_ID, DEFAULT_OPTIONS);
        const mind = new JmMind({ name: 'Zoomed' }, { rootNodeId: 'zoom_root' });
        const ids = ['zoom_a', 'zoom_b'];
        for (const id of ids) {
            mind.addNode(JmNodeContent.createText(id), { parentId: 'zoom_root' }, { nodeId: id });
        }
        await jm.open(mind);
        jm.commands.zoomTo(2);
        const inner = viewRoot().querySelector('.jsmind-inner') as HTMLElement;
        assert.notStrictEqual(inner.style.transform, 'none', 'the map should be zoomed before the restyle');

        // Sampled where a real measurement reads its box - after the frame, not
        // when the measurement was requested. The transform has to be out of the
        // way for the whole batch: a per-node unscaled window (the tempting
        // `Promise.all` over `refreshNodeStyle`) puts it back as soon as the
        // first node finishes, and the rest would measure at 2x.
        const originalMeasureElement = DomUtility.measureElement;
        const sampled: string[] = [];
        DomUtility.measureElement = async (): Promise<DOMRect> => {
            await new Promise((resolve) => requestAnimationFrame(resolve));
            sampled.push(inner.style.transform);
            return stubRect(50, 20);
        };
        try {
            for (const id of ids) {
                const node = mind.findNodeById(id);
                assert.ok(node, `node ${id} should exist`);
                node.style = { tone: JmTone.Danger };
            }

            await waitFor(() => sampled.length === ids.length, 'every restyled node to be measured');
            assert.ok(
                sampled.every((transform) => transform === 'none'),
                `every node in the batch should be measured unscaled, got ${JSON.stringify(sampled)}`
            );
            assert.notStrictEqual(inner.style.transform, 'none', 'the zoom should be back once the batch is measured');
        } finally {
            DomUtility.measureElement = originalMeasureElement;
        }
    });

    it('takes a node deleted from the model off the canvas for good', async () => {
        const jm = await JsMind.create(JSMIND_CONTAINER_ID, DEFAULT_OPTIONS);
        const mind = buildMap('Deleting');
        mind.addNode(JmNodeContent.createText('Doomed'), { parentId: 'shared_child' }, { nodeId: 'doomed_node' });
        await jm.open(mind);
        assert.strictEqual(paintedNodeCount(), 3);

        // The documented way to refresh an open map is to reopen it, so a
        // deleted node that survives its own removal would be painted beside the
        // next rendering - the ghost the issue is about.
        mind.removeNode('shared_child');
        await waitFor(() => paintedNodeCount() === 1, 'the deleted subtree to leave the canvas');
        assert.strictEqual(viewRoot().querySelectorAll('[data-jm-node-id="doomed_node"]').length, 0,
            'the deleted node\'s own child must go with it');

        jm.close();
        await jm.open(buildMap('Next', { tone: JmTone.Primary }));

        assert.strictEqual(paintedNodeCount(), 2, 'the deleted subtree must not come back with the next map');
        assert.strictEqual(paintedLineCount(), 1);
        assert.strictEqual(viewRoot().querySelectorAll('[data-jm-node-id="doomed_node"]').length, 0,
            'nothing painted for the deleted subtree should remain');
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

    it('a repaint in flight when another map is opened does not touch the canvas', async () => {
        const jm = await JsMind.create(JSMIND_CONTAINER_ID, DEFAULT_OPTIONS);
        const mind = buildMap('Raced');
        await jm.open(mind);

        const { reasons, restore: stopTracking } = trackUnhandledRejections();
        const { started, restore: restoreMeasurement } = repaintMeasurementStarted();
        try {
            const node = mind.findNodeById('shared_child');
            assert.ok(node, 'the child should be findable by id');
            node.style = { tone: JmTone.Danger };

            // Act in the frame the repaint spends measuring. Up to that point the
            // repaint only has a queued node; here it holds that node's element
            // out of the document, which is exactly what the next map takes away.
            await started;
            await jm.open(buildMap('Next', { tone: JmTone.Primary }));

            // Give whatever the repaint still had queued the chance to run.
            await new Promise((resolve) => setTimeout(resolve, 50));

            assert.strictEqual(paintedNodeCount(), 2, 'the replaced map must not stay beside the new one');
            assert.strictEqual(paintedLineCount(), 1, 'the replaced map\'s line must not stay either');
            assert.strictEqual(
                viewRoot().querySelectorAll('.jsmind-node[data-jm-node-id="shared_child"]').length,
                1,
                'the restyled node must not be painted a second time'
            );
            assert.strictEqual(
                nodeFill('shared_child'),
                JSMIND_THEME_DEFAULT.tones![JmTone.Primary]!.fillColor,
                'the node on screen should be the new map\'s'
            );
            assert.deepStrictEqual(reasons, [], 'a repaint whose map is gone must not reject');
        } finally {
            restoreMeasurement();
            stopTracking();
        }
    });

    it('a repaint in flight when the map is closed leaves the canvas empty', async () => {
        const jm = await JsMind.create(JSMIND_CONTAINER_ID, DEFAULT_OPTIONS);
        const mind = buildMap('Raced closed');
        await jm.open(mind);

        const { reasons, restore: stopTracking } = trackUnhandledRejections();
        const { started, restore: restoreMeasurement } = repaintMeasurementStarted();
        try {
            const node = mind.findNodeById('shared_child');
            assert.ok(node, 'the child should be findable by id');
            node.style = { tone: JmTone.Danger };

            await started;
            jm.close();

            await new Promise((resolve) => setTimeout(resolve, 50));

            assert.strictEqual(paintedNodeCount(), 0, 'the closed map must not be painted back');
            assert.strictEqual(paintedLineCount(), 0, 'nor may its line come back');
            assert.deepStrictEqual(reasons, [], 'a repaint whose map is gone must not reject');
        } finally {
            restoreMeasurement();
            stopTracking();
        }
    });
});
