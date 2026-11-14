/**
 * @fileoverview Regression: playground node clicks still update the info bar
 * after the view moved rendering into a shadow root.
 *
 * @remarks
 * PR #19 put nodes inside a shadow root. The playground listened on
 * `#jsmind_container` and walked `event.target` via `parentElement`. Shadow
 * DOM retargets the click, so `event.target` is the container itself, the
 * walk finds no node, and the info bar is cleared to `-`.
 *
 * This test opens the real playground page, asserts a shadow root is present,
 * then dispatches genuine mouse clicks — not an internal query helper.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert';

import { BrowserHarness, StaticServer } from './helpers.ts';

/** Large enough that the playground's two-column layout has room to paint. */
const VIEWPORT_WIDTH = 1280;

const VIEWPORT_HEIGHT = 800;

/** How long to wait for the playground to finish creating its map. */
const READY_TIMEOUT_MS = 15_000;

/** Extra wait after nodes appear, so the delayed click listener is attached. */
const LISTENER_DELAY_MS = 250;

/** Values shown in the playground info bar. */
interface InfoBar {
    nodeId: string;
    content: string;
}

/** A node the test will click, with its centre in viewport coordinates. */
interface NodeTarget {
    id: string;
    content: string;
    x: number;
    y: number;
}

/** A viewport point. */
interface Point {
    x: number;
    y: number;
}

let browser: BrowserHarness;

let server: StaticServer;

before(async () => {
    server = await StaticServer.start();
    browser = await BrowserHarness.launch();
    await browser.setViewport(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
    await browser.navigate(`${server.origin}/example/playground.html`);
    await waitForPlayground();
});

after(async () => {
    if (browser) {
        await browser.close();
    }
    if (server) {
        await server.close();
    }
});

/**
 * Waits until the playground has rendered a map inside a shadow root.
 */
async function waitForPlayground(): Promise<void> {
    const ready = await browser.evaluate<boolean>(
        `(async () => {
            const deadline = Date.now() + ${READY_TIMEOUT_MS};
            while (Date.now() < deadline) {
                const container = document.getElementById('jsmind_container');
                const nodes = container?.shadowRoot?.querySelectorAll('.jsmind-node') ?? [];
                if (window.mind && container?.shadowRoot && nodes.length >= 3) {
                    await new Promise(resolve => setTimeout(resolve, ${LISTENER_DELAY_MS}));
                    return true;
                }
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            return false;
        })()`,
        true
    );
    assert.ok(ready, 'playground should finish loading a mind map inside a shadow root');
}

/**
 * Reads the Node ID and Node Content fields from the info bar.
 *
 * @returns The text currently shown in the bar.
 */
async function infoBar(): Promise<InfoBar> {
    return browser.evaluate<InfoBar>(`({
        nodeId: document.getElementById('node-id-value').textContent,
        content: document.getElementById('content-value').textContent,
    })`);
}

test('ui - playground node clicks update the info bar under a shadow root, and a blank click clears it', async () => {
    const setup = await browser.evaluate<{
        hasShadowRoot: boolean;
        node: NodeTarget | null;
        blank: Point | null;
    }>(`(() => {
        const container = document.getElementById('jsmind_container');
        const shadowRoot = container && container.shadowRoot;
        const nodes = shadowRoot ? [...shadowRoot.querySelectorAll('.jsmind-node')] : [];
        const chosen = nodes.find(el => el.textContent.trim() === 'Node 1')
            ?? nodes[1]
            ?? nodes[0];
        const node = chosen
            ? (() => {
                const rect = chosen.getBoundingClientRect();
                return {
                    id: chosen.getAttribute('data-jm-node-id'),
                    content: chosen.textContent.trim(),
                    x: rect.x + rect.width / 2,
                    y: rect.y + rect.height / 2,
                };
            })()
            : null;

        const blank = (() => {
            if (!container) {
                return null;
            }
            const area = container.getBoundingClientRect();
            const boxes = nodes.map(el => el.getBoundingClientRect());
            const hits = (x, y) => boxes.some(
                r => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
            );
            const inset = 8;
            const candidates = [
                [area.left + inset, area.top + inset],
                [area.right - inset, area.top + inset],
                [area.left + inset, area.bottom - inset],
                [area.right - inset, area.bottom - inset],
            ];
            for (let y = area.top + inset; y < area.bottom - inset; y += 16) {
                for (let x = area.left + inset; x < area.right - inset; x += 16) {
                    candidates.push([x, y]);
                }
            }
            for (const [x, y] of candidates) {
                if (!hits(x, y)) {
                    return { x, y };
                }
            }
            return null;
        })();

        return {
            hasShadowRoot: Boolean(shadowRoot),
            node,
            blank,
        };
    })()`);

    assert.ok(setup.hasShadowRoot, 'the playground must render nodes inside a shadow root');
    assert.ok(setup.node, 'the playground should have a clickable node');
    assert.ok(setup.node.id, 'the clicked node should have a data-jm-node-id');
    assert.ok(setup.blank, 'the playground should have a blank point inside the container');

    const initial = await infoBar();
    assert.strictEqual(initial.nodeId, '-', 'info bar Node ID should start empty');
    assert.strictEqual(initial.content, '-', 'info bar Node Content should start empty');

    await browser.clickAt(setup.node.x, setup.node.y);
    await browser.settle();

    const selected = await infoBar();
    assert.notStrictEqual(selected.nodeId, '-', 'Node ID should no longer be a dash');
    assert.strictEqual(selected.nodeId, setup.node.id, 'Node ID should match the clicked node');
    assert.notStrictEqual(selected.content, '-', 'Node Content should no longer be a dash');
    assert.strictEqual(selected.content, setup.node.content, 'Node Content should match the clicked node');

    await browser.clickAt(setup.blank.x, setup.blank.y);
    await browser.settle();

    const cleared = await infoBar();
    assert.strictEqual(cleared.nodeId, '-', 'clicking blank space should clear Node ID');
    assert.strictEqual(cleared.content, '-', 'clicking blank space should clear Node Content');
});
