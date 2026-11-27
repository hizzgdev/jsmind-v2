/**
 * @fileoverview Pan, zoom and fit, measured in a real browser.
 *
 * @remarks
 * The viewport is geometry, and geometry is exactly what jsdom cannot answer:
 * `getBoundingClientRect()` is all zeros there. So everything here runs against
 * the built bundle in Chromium and asserts on boxes the browser actually laid
 * out — in particular that `getViewport()` describes the map the reader is
 * looking at, which is the one claim a unit test could only guess at.
 *
 * What is asserted, and why that is the whole contract:
 *
 * 1. A view nobody pans keeps native scrolling, unchanged.
 * 2. After `fitToView()` every node is inside the window, and the page itself
 *    does not scroll.
 * 3. `getViewport()`'s `x`/`y`/`scale` and the painted map agree: map point `p`
 *    is painted at `scale * (p - x)`, for every node.
 * 4. `panBy` moves the map by exactly the distance asked for.
 * 5. A zoom holds the map point under its anchor still.
 * 6. At 2x the far corners are still reachable.
 * 7. `capture()` does not care where the viewport is.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert';

import { BrowserHarness } from './helpers.ts';

/** One node in a fixture document. */
interface FixtureNode {
    id: string;
    content: { type: string; value: string };
    parent: string | null;
    children: string[];
    folded: boolean;
    side: number;
    data: Record<string, unknown>;
}

/** The window the map is shown in. */
const HOST = { width: 1000, height: 650 };

let browser: BrowserHarness;

/**
 * A map bigger than {@link HOST} in both directions.
 *
 * @remarks
 * Width comes from the chain, not from the number of branches: every leaf of a
 * branch sits in the same column, so a wide map needs depth. Height comes from
 * the branches stacking their leaves down the page.
 *
 * @returns The document, ready to be written as JSON.
 */
function bigDocument(): unknown {
    const nodes: Record<string, FixtureNode> = {};
    const branches: string[] = [];
    const side = (index: number): number => (index % 2 === 0 ? 1 : -1);
    const node = (id: string, value: string, parent: string | null, children: string[], nodeSide: number): FixtureNode => ({
        id,
        content: { type: 'text', value },
        parent,
        children,
        folded: false,
        side: nodeSide,
        data: {},
    });

    for (let branch = 0; branch < 8; branch += 1) {
        const id = `c${branch}`;
        const leaves: string[] = [];
        for (let leaf = 0; leaf < 6; leaf += 1) {
            const leafId = `${id}_${leaf}`;
            leaves.push(leafId);
            nodes[leafId] = node(leafId, `分支 ${branch}.${leaf} 的说明文字`, id, [], side(branch));
        }
        branches.push(id);
        nodes[id] = node(id, `主题 ${branch}`, 'root', leaves, side(branch));
    }

    for (let depth = 0; depth < 5; depth += 1) {
        const id = `chain${depth}`;
        nodes[id] = node(id, `链路第 ${depth} 层`, depth === 0 ? 'root' : `chain${depth - 1}`, [], 1);
        if (depth > 0) {
            nodes[`chain${depth - 1}`]!.children.push(id);
        }
    }
    branches.push('chain0');

    nodes.root = node('root', '大图', null, branches, 0);

    return {
        format: 'jsmind_v2',
        meta: { name: 'viewport', author: 'tests', version: '1.0' },
        root: 'root',
        nodes,
        edges: {},
    };
}

/** One rendered node, as the browser resolved it. */
interface RenderedNode {
    text: string;
    /** The CSS position the renderer wrote, i.e. the node's map-space corner. */
    mapLeft: number;
    mapTop: number;
    /** Layout size, which a viewport transform does not change. */
    layoutWidth: number;
    layoutHeight: number;
    /** Painted box, relative to the host's top-left corner. */
    left: number;
    top: number;
    width: number;
    height: number;
}

/** Everything one measurement needs from the page. */
interface Snapshot {
    viewport: { x: number; y: number; scale: number; width: number; height: number };
    host: { left: number; top: number; width: number; height: number };
    nodes: RenderedNode[];
    inner: { transform: string; overflow: string };
    page: { scrollWidth: number; scrollHeight: number; innerWidth: number; innerHeight: number };
}

/**
 * Opens the fixture in a fresh page and leaves the instance on `window.__jm`.
 *
 * @param document_ - Document to render.
 * @param host - Host size, in CSS pixels.
 */
async function open(document_: unknown, host = HOST): Promise<void> {
    await browser.setContent(
        `<div id="container" style="width:${host.width}px;height:${host.height}px"></div>`
    );
    await browser.loadBundle();
    await browser.evaluate(
        `
        (async () => {
            const container = document.getElementById('container');
            const jm = await jsMind.create(container);
            const mind = jsMind.Serializer.create('json').deserialize(${JSON.stringify(document_)});
            await jm.open(mind);
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            window.__jm = jm;
            return true;
        })()
        `,
        true
    );
}

/**
 * Reads the page's geometry back.
 *
 * @returns The viewport, the host box, every node and the page's scroll state.
 */
async function snapshot(): Promise<Snapshot> {
    return await browser.evaluate<Snapshot>(`(() => {
        const jm = window.__jm;
        const host = document.getElementById('container');
        const box = host.getBoundingClientRect();
        const root = host.shadowRoot;
        const inner = root.querySelector('.jsmind-inner');
        const nodes = [...root.querySelectorAll('.jsmind-node')].map(el => {
            const rect = el.getBoundingClientRect();
            return {
                text: (el.textContent || '').trim(),
                mapLeft: parseFloat(el.style.left),
                mapTop: parseFloat(el.style.top),
                layoutWidth: el.offsetWidth,
                layoutHeight: el.offsetHeight,
                left: rect.left - box.left,
                top: rect.top - box.top,
                width: rect.width,
                height: rect.height,
            };
        });
        return {
            viewport: jm.commands.getViewport(),
            host: { left: box.left, top: box.top, width: box.width, height: box.height },
            nodes,
            inner: { transform: inner.style.transform, overflow: getComputedStyle(inner).overflow },
            page: {
                scrollWidth: document.documentElement.scrollWidth,
                scrollHeight: document.documentElement.scrollHeight,
                innerWidth: window.innerWidth,
                innerHeight: window.innerHeight,
            },
        };
    })()`);
}

/**
 * Runs a command on the open instance.
 *
 * @param body - JavaScript calling `jm`.
 */
async function command(body: string): Promise<void> {
    await browser.evaluate(`(() => { const jm = window.__jm; ${body}; return true; })()`);
    await browser.settle();
}

/**
 * The map-space bounding box of the rendered nodes.
 *
 * @param nodes - Nodes as the browser resolved them.
 * @returns The box, in map pixels.
 */
function mapBounds(nodes: RenderedNode[]): { minX: number; minY: number; maxX: number; maxY: number } {
    return {
        minX: Math.min(...nodes.map(node => node.mapLeft)),
        minY: Math.min(...nodes.map(node => node.mapTop)),
        maxX: Math.max(...nodes.map(node => node.mapLeft + node.layoutWidth)),
        maxY: Math.max(...nodes.map(node => node.mapTop + node.layoutHeight)),
    };
}

/**
 * Asserts that the painted map is the one `getViewport()` describes.
 *
 * @remarks
 * The whole point of the viewport state is that it predicts the picture. Map
 * point `p` has to be painted at `scale * (p - x)`: if that holds for every
 * node, the reported origin and zoom are what the reader is looking at, and not
 * a number that agrees with itself.
 *
 * @param state - Snapshot to check.
 */
function assertPaintMatchesViewport(state: Snapshot): void {
    const { x, y, scale } = state.viewport;
    for (const node of state.nodes) {
        const expectedLeft = (node.mapLeft - x) * scale;
        const expectedTop = (node.mapTop - y) * scale;
        assert.ok(
            Math.abs(node.left - expectedLeft) < 0.5,
            `${node.text}: getViewport says x=${x} at scale ${scale} -> ${expectedLeft.toFixed(2)}, painted at ${node.left.toFixed(2)}`
        );
        assert.ok(
            Math.abs(node.top - expectedTop) < 0.5,
            `${node.text}: getViewport says y=${y} at scale ${scale} -> ${expectedTop.toFixed(2)}, painted at ${node.top.toFixed(2)}`
        );
        // `offsetWidth` is an integer, so the expected painted width carries up
        // to half a layout pixel, doubled by the zoom: the tolerance follows.
        const widthTolerance = 0.5 + 0.5 * scale;
        assert.ok(
            Math.abs(node.width - node.layoutWidth * scale) <= widthTolerance,
            `${node.text}: layout width ${node.layoutWidth} at scale ${scale} should paint ${(node.layoutWidth * scale).toFixed(2)}, painted ${node.width.toFixed(2)}`
        );
    }
}

before(async () => {
    browser = await BrowserHarness.launch();
    await browser.setViewport(HOST.width, HOST.height);
});

after(async () => {
    await browser.close();
});

test('ui viewport - a view nobody pans keeps native scrolling', async () => {
    await open(bigDocument());
    const state = await snapshot();

    // The playground and every other caller that never touches the viewport API
    // must keep the layout it had before viewports existed: no transform, and
    // the inner box still reaches its content with a scrollbar.
    assert.strictEqual(state.inner.transform, '', 'no transform until a command asks for one');
    assert.strictEqual(state.inner.overflow, 'auto', 'native scrolling stays in charge');
    assert.strictEqual(state.viewport.scale, 1);
});

test('ui viewport - fitToView shows the whole map without scrolling the page', async () => {
    await open(bigDocument());
    const before_ = await snapshot();

    // The fixture has to be bigger than the window, or the case proves nothing.
    const bounds = mapBounds(before_.nodes);
    assert.ok(
        bounds.maxX - bounds.minX > HOST.width,
        `the fixture should be wider than the window: ${(bounds.maxX - bounds.minX).toFixed(0)} vs ${HOST.width}`
    );
    assert.ok(
        bounds.maxY - bounds.minY > HOST.height,
        `the fixture should be taller than the window: ${(bounds.maxY - bounds.minY).toFixed(0)} vs ${HOST.height}`
    );

    await command('jm.commands.fitToView()');
    const state = await snapshot();

    assert.ok(state.viewport.scale < 1, `a bigger-than-window map has to shrink, got ${state.viewport.scale}`);
    for (const node of state.nodes) {
        assert.ok(node.left >= -1, `${node.text} is cut off on the left at ${node.left.toFixed(1)}`);
        assert.ok(node.top >= -1, `${node.text} is cut off at the top at ${node.top.toFixed(1)}`);
        assert.ok(
            node.left + node.width <= HOST.width + 1,
            `${node.text} runs past the right edge at ${(node.left + node.width).toFixed(1)}`
        );
        assert.ok(
            node.top + node.height <= HOST.height + 1,
            `${node.text} runs past the bottom edge at ${(node.top + node.height).toFixed(1)}`
        );
    }

    // The page is not the scrolling surface any more: fitting a map means it
    // fits the *window*, not that it grew the document.
    assert.strictEqual(state.page.scrollWidth, state.page.innerWidth, 'the page does not scroll sideways');
    assert.strictEqual(state.page.scrollHeight, state.page.innerHeight, 'the page does not scroll down');
    assertPaintMatchesViewport(state);
});

test('ui viewport - getViewport describes the painted map', async () => {
    await open(bigDocument());
    await command('jm.commands.fitToView()');
    const fitted = await snapshot();
    assertPaintMatchesViewport(fitted);

    await command('jm.commands.panTo(-180, -90)');
    const panned = await snapshot();
    assert.deepStrictEqual(
        { x: panned.viewport.x, y: panned.viewport.y },
        { x: -180, y: -90 },
        'panTo stores the map-space point it was given'
    );
    assert.strictEqual(panned.viewport.scale, fitted.viewport.scale, 'panTo leaves the zoom alone');
    assertPaintMatchesViewport(panned);
});

test('ui viewport - panBy moves the map by exactly the distance asked for', async () => {
    await open(bigDocument());
    await command('jm.commands.fitToView()');
    const before_ = await snapshot();

    await command('jm.commands.panBy(-120, 70)');
    const after_ = await snapshot();

    const scale = before_.viewport.scale;
    for (const [index, node] of after_.nodes.entries()) {
        const was = before_.nodes[index]!;
        assert.ok(
            Math.abs(node.left - (was.left - 120)) < 0.5,
            `${node.text} should have moved 120px left: ${was.left.toFixed(2)} -> ${node.left.toFixed(2)}`
        );
        assert.ok(
            Math.abs(node.top - (was.top + 70)) < 0.5,
            `${node.text} should have moved 70px down: ${was.top.toFixed(2)} -> ${node.top.toFixed(2)}`
        );
    }

    // A drag is in screen pixels, so the stored origin moves by delta / scale.
    assert.ok(Math.abs(after_.viewport.x - (before_.viewport.x + 120 / scale)) < 1e-6);
    assert.ok(Math.abs(after_.viewport.y - (before_.viewport.y - 70 / scale)) < 1e-6);
    assertPaintMatchesViewport(after_);
});

test('ui viewport - a zoom holds the map point under its anchor still', async () => {
    await open(bigDocument());
    await command('jm.commands.fitToView()');
    const before_ = await snapshot();

    const anchor = { x: 300, y: 200 };
    const focus = {
        x: before_.viewport.x + anchor.x / before_.viewport.scale,
        y: before_.viewport.y + anchor.y / before_.viewport.scale,
    };

    await command(`jm.commands.zoomTo(2.2, { x: ${anchor.x}, y: ${anchor.y} })`);
    const after_ = await snapshot();

    assert.strictEqual(after_.viewport.scale, 2.2, 'the requested factor is what is applied');
    // The anchor still shows the same map point, so the reader's aim is kept.
    assert.ok(
        Math.abs(after_.viewport.x + anchor.x / after_.viewport.scale - focus.x) < 1e-6,
        'the anchored map point drifted horizontally'
    );
    assert.ok(
        Math.abs(after_.viewport.y + anchor.y / after_.viewport.scale - focus.y) < 1e-6,
        'the anchored map point drifted vertically'
    );
    assertPaintMatchesViewport(after_);
});

test('ui viewport - at 2x every corner of the map is still reachable', async () => {
    await open(bigDocument());
    await command('jm.commands.zoomTo(2)');
    const zoomed = await snapshot();
    assert.strictEqual(zoomed.viewport.scale, 2);

    const bounds = mapBounds(zoomed.nodes);
    const { width, height } = zoomed.viewport;

    // Pan until the last node of the map sits just inside the bottom-right
    // corner. `panTo` takes a map point, so this is the corner in map pixels.
    await command(`jm.commands.panTo(${bounds.maxX - (width - 20) / 2}, ${bounds.maxY - (height - 20) / 2})`);
    const bottomRight = await snapshot();

    const lastX = Math.max(...bottomRight.nodes.map(node => node.left + node.width));
    const lastY = Math.max(...bottomRight.nodes.map(node => node.top + node.height));
    assert.ok(lastX <= width + 1 && lastY <= height + 1, `the far corner should be inside the window: ${lastX.toFixed(1)}x${lastY.toFixed(1)}`);
    assert.ok(lastX > 0 && lastY > 0, 'the far corner should actually be on screen');
    assertPaintMatchesViewport(bottomRight);

    await command(`jm.commands.panTo(${bounds.minX - 10}, ${bounds.minY - 10})`);
    const topLeft = await snapshot();
    const firstX = Math.min(...topLeft.nodes.map(node => node.left));
    const firstY = Math.min(...topLeft.nodes.map(node => node.top));
    assert.ok(firstX >= -1 && firstY >= -1, `the near corner should be inside the window: ${firstX.toFixed(1)}x${firstY.toFixed(1)}`);
    assert.ok(firstX < width && firstY < height, 'the near corner should actually be on screen');
});

test('ui viewport - the zoom factor is clamped to the range the view accepts', async () => {
    await open(bigDocument());

    await command('jm.commands.zoomTo(99)');
    assert.strictEqual((await snapshot()).viewport.scale, 4, 'a wild zoom-in stops at the maximum');

    await command('jm.commands.zoomTo(0.0001)');
    assert.strictEqual((await snapshot()).viewport.scale, 0.1, 'a wild zoom-out stops at the minimum');
});

test('ui viewport - centerOn puts the node in the middle of the window', async () => {
    await open(bigDocument());
    await command('jm.commands.centerOn(\'c3\')');

    const state = await snapshot();
    const node = state.nodes.find(candidate => candidate.text === '主题 3');
    assert.ok(node, 'the fixture node was rendered');

    const centreX = node.left + node.width / 2;
    const centreY = node.top + node.height / 2;
    assert.ok(
        Math.abs(centreX - HOST.width / 2) < 1,
        `the node should be centred horizontally: ${centreX.toFixed(2)} vs ${HOST.width / 2}`
    );
    assert.ok(
        Math.abs(centreY - HOST.height / 2) < 1,
        `the node should be centred vertically: ${centreY.toFixed(2)} vs ${HOST.height / 2}`
    );
    assertPaintMatchesViewport(state);
});

test('ui viewport - capture ignores where the viewport is looking', async () => {
    await open(bigDocument());
    await command('jm.commands.fitToView()');

    const capture = async (): Promise<{
        cssWidth: number;
        cssHeight: number;
        width: number;
        height: number;
        bytes: number;
    }> =>
        await browser.evaluate(
            `(async () => {
                const jm = window.__jm;
                const result = await jm.exportImage({ scale: 1 });
                return {
                    cssWidth: result.cssWidth,
                    cssHeight: result.cssHeight,
                    width: result.width,
                    height: result.height,
                    bytes: result.blob.size,
                };
            })()`,
            true
        );

    const atFit = await capture();

    // Move the view somewhere else entirely: panned, and zoomed in.
    await command('jm.commands.panBy(-320, -180); jm.commands.zoomTo(1.75)');
    const moved = await snapshot();
    assert.notStrictEqual(moved.viewport.x, 0, 'the viewport really moved before the second capture');
    assert.strictEqual(moved.viewport.scale, 1.75);

    const afterMove = await capture();

    // `export.ts` resets the transform on the box it clones precisely so this
    // holds: the picture is the map, not the current view of it.
    assert.strictEqual(afterMove.cssWidth, atFit.cssWidth, 'capture size does not depend on the pan');
    assert.strictEqual(afterMove.cssHeight, atFit.cssHeight);
    assert.strictEqual(afterMove.width, atFit.width);
    assert.strictEqual(afterMove.height, atFit.height);
    assert.strictEqual(afterMove.bytes, atFit.bytes, 'the same pixels, so the same encoded size');
});

test('ui viewport - a node added while zoomed is laid out at its layout size', async () => {
    // Same document, same box, twice: one view zoomed before the edit and one
    // not. Measuring a node reads a rect, and a rect includes the transform, so
    // the zoomed view would record twice the size and lay the map out around it.
    // Comparing map-space positions is what makes that visible.
    await browser.setContent(
        '<div id="plain" style="width:600px;height:400px"></div><div id="zoomed" style="width:600px;height:400px"></div>'
    );
    await browser.loadBundle();

    const layout = await browser.evaluate<{
        plain: { text: string; left: number; top: number; width: number; height: number }[];
        zoomed: { text: string; left: number; top: number; width: number; height: number }[];
    }>(
        `
        (async () => {
            const document_ = ${JSON.stringify(bigDocument())};
            const setup = async (id) => {
                const container = document.getElementById(id);
                const jm = await jsMind.create(container);
                const mind = jsMind.Serializer.create('json').deserialize(document_);
                await jm.open(mind);
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                return jm;
            };

            const plain = await setup('plain');
            const zoomed = await setup('zoomed');
            zoomed.commands.zoomTo(2);

            plain.mind.addChildNode('Extra', plain.mind.root.id);
            zoomed.mind.addChildNode('Extra', zoomed.mind.root.id);
            // The observer's re-layout is asynchronous and there is no promise
            // to await from outside, so give it a few frames.
            await new Promise(r => setTimeout(r, 400));

            const read = (id) => [...document.getElementById(id).shadowRoot.querySelectorAll('.jsmind-node')].map(el => ({
                text: (el.textContent || '').trim(),
                left: parseFloat(el.style.left),
                top: parseFloat(el.style.top),
                width: el.offsetWidth,
                height: el.offsetHeight,
            }));
            return { plain: read('plain'), zoomed: read('zoomed') };
        })()
        `,
        true
    );

    assert.strictEqual(layout.zoomed.length, layout.plain.length, 'both maps have the same nodes');
    assert.ok(
        layout.plain.some(node => node.text === 'Extra'),
        'the added node is rendered in both maps'
    );

    for (const [index, node] of layout.zoomed.entries()) {
        const reference = layout.plain[index]!;
        assert.strictEqual(node.text, reference.text, `node ${index} should be the same node`);
        assert.ok(
            Math.abs(node.left - reference.left) < 0.01 && Math.abs(node.top - reference.top) < 0.01,
            `${node.text} is laid out at ${node.left}/${node.top} when zoomed, but at ${reference.left}/${reference.top} when not`
        );
        assert.strictEqual(node.width, reference.width, `${node.text} records a different width when zoomed`);
        assert.strictEqual(node.height, reference.height, `${node.text} records a different height when zoomed`);
    }
});
