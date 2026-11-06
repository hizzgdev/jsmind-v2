/**
 * @fileoverview First UI test: does the renderer put nodes where the layout says?
 *
 * @remarks
 * The view layer is not finished, so this covers the one thing that already
 * works end to end — a root with three children gets laid out and drawn. It is
 * deliberately small: the point is the harness and the shape of the assertions,
 * and cases get added as the view grows.
 *
 * What "correct position" means here, given no finished view to compare against:
 *
 * 1. The CSS coordinates the renderer writes are the ones the browser resolves.
 *    If `style.left` says 407.594 and the element paints at 380, the renderer is
 *    lying and every later assertion is meaningless. This one is checked first.
 * 2. The tree relationships hold: children to the right of the parent, siblings
 *    at the same x, siblings ordered down the page at a constant gap.
 * 3. Nothing overlaps.
 *
 * No absolute pixel values are asserted anywhere except the constant gap between
 * siblings, which is a layout option and therefore expected to be stable within
 * one environment. Text widths vary with the font, so they are never hardcoded.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert';

import { BrowserHarness } from './helpers.ts';

/** Fixed viewport: a geometry test needs the container size to be a constant. */
const CONTAINER_WIDTH = 800;
const CONTAINER_HEIGHT = 600;

/** One rendered node as reported from the page. */
interface RenderedNode {
    text: string;
    css: { left: number; top: number };
    rect: { x: number; y: number; width: number; height: number };
}

let browser: BrowserHarness;

/**
 * Renders a fixed tree and reports every node's position.
 *
 * @remarks
 * Positions come back two ways on purpose: the CSS values the renderer wrote,
 * and the rectangles the browser resolved. Comparing them is what proves the
 * renderer's coordinates actually reach the screen.
 *
 * @returns The rendered nodes, in document order.
 */
async function renderFixture(): Promise<RenderedNode[]> {
    // No stylesheet to load: the view installs its own rules inside the shadow
    // root it creates. That is the point of the shadow boundary — a caller
    // cannot forget to include the CSS, and a caller's CSS cannot leak in.
    await browser.setContent(
        `<div id="container" style="width:${CONTAINER_WIDTH}px;height:${CONTAINER_HEIGHT}px"></div>`
    );
    await browser.evaluate(browser.bundleSource());

    const nodes = await browser.evaluate<RenderedNode[]>(
        `
        (async () => {
            const container = document.getElementById('container');
            const jm = await jsMind.create(container);
            const mind = new jsMind.Mind({ name: 'ui-test' });
            mind.root.content = new (mind.root.content.constructor)('text', 'Root');
            mind.addChildNode('Alpha', mind.root.id);
            mind.addChildNode('Bravo', mind.root.id);
            mind.addChildNode('Charlie', mind.root.id);
            await jm.open(mind);

            // Rendered nodes live in the shadow root the view created.
              return [...container.shadowRoot.querySelectorAll('.jsmind-node')].map(el => {
                const r = el.getBoundingClientRect();
                return {
                    text: el.textContent.trim(),
                    css: { left: parseFloat(el.style.left), top: parseFloat(el.style.top) },
                    rect: { x: r.x, y: r.y, width: r.width, height: r.height },
                };
            });
        })()
    `,
        true
    );
    return nodes;
}

before(async () => {
    browser = await BrowserHarness.launch();
});

after(async () => {
    await browser.close();
});

test('ui - the fixture renders a root and its three children', async () => {
    const nodes = await renderFixture();

    assert.strictEqual(nodes.length, 4, 'one root plus three children');
    assert.deepStrictEqual(
        nodes.map(n => n.text),
        ['Root', 'Alpha', 'Bravo', 'Charlie'],
        'nodes should appear in tree order'
    );
});

test('ui - every node is painted where the renderer said it would be', async () => {
    // Checked first and separately: if CSS coordinates and painted rectangles
    // disagree, the renderer has a bug upstream of layout and the geometric
    // assertions below would be testing the wrong thing.
    const nodes = await renderFixture();

    for (const node of nodes) {
        assert.ok(
            Number.isFinite(node.css.left) && Number.isFinite(node.css.top),
            `${node.text}: renderer should write numeric left/top, got ${node.css.left}/${node.css.top}`
        );
        assert.ok(
            Math.abs(node.css.left - node.rect.x) < 0.5,
            `${node.text}: style.left ${node.css.left} but painted at x=${node.rect.x}`
        );
        assert.ok(
            Math.abs(node.css.top - node.rect.y) < 0.5,
            `${node.text}: style.top ${node.css.top} but painted at y=${node.rect.y}`
        );
    }
});

test('ui - children sit to the right of the parent, at the same x as each other', async () => {
    const [root, ...children] = await renderFixture();

    for (const child of children) {
        assert.ok(
            child.rect.x > root.rect.x + root.rect.width,
            `${child.text} should start after the root ends ` +
                `(root ends at ${root.rect.x + root.rect.width}, child starts at ${child.rect.x})`
        );
    }

    // Same side, same level: the x coordinate is a property of the column, not
    // of the node. A per-node x slip here is the classic "nodes look scattered"
    // regression.
    const firstX = children[0].rect.x;
    for (const child of children) {
        assert.ok(
            Math.abs(child.rect.x - firstX) < 0.5,
            `${child.text} should align with its siblings at x=${firstX}, got ${child.rect.x}`
        );
    }
});

test('ui - siblings stack down the page at a constant gap', async () => {
    const [, ...children] = await renderFixture();

    // Leaves only, so the gap is between node boxes, not subtree blocks.
    for (let i = 1; i < children.length; i++) {
        assert.ok(
            children[i].rect.y > children[i - 1].rect.y,
            `${children[i].text} should be below ${children[i - 1].text}`
        );
    }

    const gaps = children.slice(1).map((child, i) => child.rect.y - children[i].rect.y);
    for (const gap of gaps) {
        assert.ok(gap > 0, 'the layout must leave room between siblings');
        assert.ok(
            Math.abs(gap - gaps[0]) < 0.5,
            `sibling gaps should match: got ${gaps.map(g => g.toFixed(2)).join(', ')}`
        );
    }
});

test('ui - no two nodes overlap', async () => {
    // The single most informative check: a wrong text measurement, a missed
    // offset, or a bad gap all surface here before anything else notices.
    const nodes = await renderFixture();

    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i].rect;
            const b = nodes[j].rect;
            const overlaps =
                a.x < b.x + b.width &&
                b.x < a.x + a.width &&
                a.y < b.y + b.height &&
                b.y < a.y + a.height;
            assert.ok(
                !overlaps,
                `${nodes[i].text} and ${nodes[j].text} overlap: ` +
                    `${JSON.stringify(a)} vs ${JSON.stringify(b)}`
            );
        }
    }
});

test('ui - the root is vertically centred on its children', async () => {
    const [root, ...children] = await renderFixture();

    const first = children[0].rect;
    const last = children[children.length - 1].rect;
    const childrenCentre = (first.y + last.y + last.height) / 2;
    const rootCentre = root.rect.y + root.rect.height / 2;

    // Tolerance is one node height: the root centres on the block, and the
    // block's centre need not align exactly with an odd number of children.
    const tolerance = Math.max(root.rect.height, first.height);
    assert.ok(
        Math.abs(rootCentre - childrenCentre) <= tolerance,
        `root centre ${rootCentre.toFixed(1)} should be near children centre ` +
            `${childrenCentre.toFixed(1)} (tolerance ${tolerance.toFixed(1)})`
    );
});
