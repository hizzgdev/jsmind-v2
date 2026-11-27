/**
 * @fileoverview Zoom, measured in a real browser.
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
 * 1. A view nobody zooms keeps native scrolling, unchanged.
 * 2. The reported scale and the painted map agree: map point `p` is painted at
 *    `scale * (p - x)`, for every node.
 * 3. A zoom holds the map point under its anchor still.
 * 4. The factor stops at the range's ends instead of running past them.
 * 5. `capture()` does not care what the zoom is.
 * 6. A node added while zoomed is laid out at its layout size.
 *
 * Pan, `centerOn` and fit-to-view are later items of the same plan and are not
 * exercised here.
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
 * A map with branches on both sides, so nodes land on both sides of the middle
 * of the view.
 *
 * @returns The document, ready to be serialised into the page.
 */
function fixture(): unknown {
    const nodes: Record<string, FixtureNode> = {};
    const branches: string[] = [];
    const node = (
        id: string,
        value: string,
        parent: string | null,
        children: string[],
        nodeSide: number
    ): FixtureNode => ({
        id,
        content: { type: 'text', value },
        parent,
        children,
        folded: false,
        side: nodeSide,
        data: {},
    });

    for (let branch = 0; branch < 6; branch += 1) {
        const id = `c${branch}`;
        const side = branch % 2 === 0 ? 1 : -1;
        const leaves: string[] = [];
        for (let leaf = 0; leaf < 3; leaf += 1) {
            const leafId = `${id}_${leaf}`;
            leaves.push(leafId);
            nodes[leafId] = node(leafId, `分支 ${branch}.${leaf} 的说明文字`, id, [], side);
        }
        branches.push(id);
        nodes[id] = node(id, `主题 ${branch}`, 'root', leaves, side);
    }

    nodes.root = node('root', '缩放测试', null, branches, 0);

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
    /** Layout size, which the viewport transform does not change. */
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
    nodes: RenderedNode[];
    inner: { transform: string; overflow: string };
}

/**
 * Opens the fixture in a fresh page and leaves the instance on `window.__jm`.
 *
 * @param document_ - Document to render.
 */
async function open(document_: unknown): Promise<void> {
    await browser.setContent(
        `<div id="container" style="width:${HOST.width}px;height:${HOST.height}px"></div>`
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
 * @returns The viewport and every rendered node.
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
            nodes,
            inner: { transform: inner.style.transform, overflow: getComputedStyle(inner).overflow },
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
    }
}

before(async () => {
    browser = await BrowserHarness.launch();
    await browser.setViewport(HOST.width, HOST.height);
});

after(async () => {
    await browser.close();
});

test('ui viewport - a view nobody zooms keeps native scrolling', async () => {
    await open(fixture());
    const state = await snapshot();

    // The playground and every other caller that never touches the viewport API
    // must keep the layout it had before zoom existed: no transform, and the
    // inner box still reaches its content with a scrollbar.
    assert.strictEqual(state.inner.transform, '', 'no transform until a viewport API is called');
    assert.strictEqual(state.inner.overflow, 'auto', 'native scrolling stays in charge');
    assert.deepStrictEqual(
        { x: state.viewport.x, y: state.viewport.y, scale: state.viewport.scale },
        { x: 0, y: 0, scale: 1 },
        'an untouched view reports the identity, not a guess'
    );
    assertPaintMatchesViewport(state);
});

test('ui viewport - getViewport describes the painted map', async () => {
    await open(fixture());

    // At rest the origin is zero, so the general formula reduces to
    // `painted left == mapLeft * scale` with scale 1: the layout the renderer
    // wrote is the one on screen.
    const atRest = await snapshot();
    assert.strictEqual(atRest.viewport.scale, 1);
    assert.strictEqual(atRest.viewport.x, 0);
    for (const node of atRest.nodes) {
        assert.ok(
            Math.abs(node.left - node.mapLeft) < 0.5,
            `${node.text}: the unscaled map should paint at its layout position, ${node.mapLeft} vs ${node.left}`
        );
    }
    assertPaintMatchesViewport(atRest);

    // A zoom anchored at the top-left corner leaves the origin at zero, so the
    // reduced formula still has to hold at a scale other than 1.
    await command('jm.commands.zoomTo(1.6, { x: 0, y: 0 })');
    const reduced = await snapshot();
    assert.strictEqual(reduced.viewport.scale, 1.6);
    assert.strictEqual(reduced.viewport.x, 0, 'an anchor at the origin leaves the origin alone');
    for (const node of reduced.nodes) {
        assert.ok(
            Math.abs(node.left - node.mapLeft * 1.6) < 0.5,
            `${node.text}: at 1.6x the map should paint at mapLeft * 1.6, ${(node.mapLeft * 1.6).toFixed(2)} vs ${node.left.toFixed(2)}`
        );
        assert.ok(
            Math.abs(node.width - node.layoutWidth * 1.6) <= 1.5,
            `${node.text}: painted width should follow the zoom, ${(node.layoutWidth * 1.6).toFixed(2)} vs ${node.width.toFixed(2)}`
        );
    }
    assertPaintMatchesViewport(reduced);

    // And the general formula, whose origin is not zero.
    await command('jm.commands.zoomTo(2.2, { x: 300, y: 200 })');
    const general = await snapshot();
    assert.strictEqual(general.viewport.scale, 2.2);
    assert.notStrictEqual(general.viewport.x, 0, 'a zoom about a mid-window point moves the origin');
    assertPaintMatchesViewport(general);
});

test('ui viewport - a zoom holds the map point under its anchor still', async () => {
    await open(fixture());
    const before_ = await snapshot();

    const anchor = { x: 240, y: 160 };
    const focus = {
        x: before_.viewport.x + anchor.x / before_.viewport.scale,
        y: before_.viewport.y + anchor.y / before_.viewport.scale,
    };

    await command(`jm.commands.zoomTo(2.4, { x: ${anchor.x}, y: ${anchor.y} })`);
    const after_ = await snapshot();

    assert.strictEqual(after_.viewport.scale, 2.4, 'the requested factor is what is applied');
    // The anchor still shows the same map point, so the reader's aim is kept.
    assert.ok(
        Math.abs(after_.viewport.x + anchor.x / after_.viewport.scale - focus.x) < 1e-6,
        'the anchored map point drifted horizontally'
    );
    assert.ok(
        Math.abs(after_.viewport.y + anchor.y / after_.viewport.scale - focus.y) < 1e-6,
        'the anchored map point drifted vertically'
    );

    // The same claim on screen: the painted box of a node has to scale away from
    // the anchor by exactly the factor change, which is what "the point under
    // the anchor is still there" looks like when a whole box is measured rather
    // than a point.
    const ratio = after_.viewport.scale / before_.viewport.scale;
    for (const [index, was] of before_.nodes.entries()) {
        const now = after_.nodes[index]!;
        assert.strictEqual(now.text, was.text, `node ${index} should be the same node`);
        const expectedLeft = anchor.x + (was.left - anchor.x) * ratio;
        const expectedTop = anchor.y + (was.top - anchor.y) * ratio;
        assert.ok(
            Math.abs(now.left - expectedLeft) < 1,
            `${now.text}: should have moved away from the anchor to ${expectedLeft.toFixed(2)}, painted at ${now.left.toFixed(2)}`
        );
        assert.ok(
            Math.abs(now.top - expectedTop) < 1,
            `${now.text}: should have moved away from the anchor to ${expectedTop.toFixed(2)}, painted at ${now.top.toFixed(2)}`
        );
    }
    assertPaintMatchesViewport(after_);
});

test('ui viewport - a zoom without an anchor keeps the middle of the view still', async () => {
    await open(fixture());
    const before_ = await snapshot();

    const centre = { x: HOST.width / 2, y: HOST.height / 2 };
    const focus = {
        x: before_.viewport.x + centre.x,
        y: before_.viewport.y + centre.y,
    };

    await command('jm.commands.zoomTo(1.8)');
    const after_ = await snapshot();

    assert.strictEqual(after_.viewport.scale, 1.8);
    assert.ok(
        Math.abs(after_.viewport.x + centre.x / after_.viewport.scale - focus.x) < 1e-6,
        'the middle of the view should be the default anchor'
    );
    assert.ok(
        Math.abs(after_.viewport.y + centre.y / after_.viewport.scale - focus.y) < 1e-6,
        'the middle of the view should be the default anchor vertically'
    );
    assertPaintMatchesViewport(after_);
});

test('ui viewport - the zoom factor stops at the range limits', async () => {
    await open(fixture());

    await command('jm.commands.zoomTo(99)');
    assert.strictEqual((await snapshot()).viewport.scale, 4, 'a wild zoom-in stops at the maximum');

    await command('jm.commands.zoomTo(0.0001)');
    assert.strictEqual((await snapshot()).viewport.scale, 0.1, 'a wild zoom-out stops at the minimum');

    // The clamp is a state, not just a return value: the painted map is at the
    // boundary scale too.
    assertPaintMatchesViewport(await snapshot());
});

test('ui viewport - the inner box stops scrolling once the zoom takes it over', async () => {
    await open(fixture());
    assert.strictEqual((await snapshot()).inner.overflow, 'auto');

    await command('jm.commands.zoomTo(2)');
    const zoomed = await snapshot();
    assert.strictEqual(zoomed.inner.overflow, 'hidden', 'the transform is in charge now');
    assert.match(zoomed.inner.transform, /scale\(2\)/, 'the zoom is written as a transform');
});

test('ui viewport - capture does not depend on the zoom', async () => {
    await open(fixture());

    const capture = async (): Promise<{ css: [number, number]; bytes: number }> =>
        await browser.evaluate(
            `(async () => {
                const result = await window.__jm.exportImage({ scale: 1 });
                return { css: [result.cssWidth, result.cssHeight], bytes: result.blob.size };
            })()`,
            true
        );

    const atOne = await capture();

    await command('jm.commands.zoomTo(1.75)');
    assert.strictEqual((await snapshot()).viewport.scale, 1.75, 'the view really is zoomed before the second capture');

    const zoomed = await capture();

    // `export.ts` resets the transform on the box it clones precisely so this
    // holds: the picture is the map, not the current view of it. Byte size is
    // the assertion that matters - the dimensions come from `viewSize` either
    // way, so only the encoded pixels prove the clone was unscaled.
    assert.deepStrictEqual(zoomed.css, atOne.css, 'capture size does not depend on the zoom');
    assert.strictEqual(zoomed.bytes, atOne.bytes, 'the same pixels, so the same encoded size');
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
            const document_ = ${JSON.stringify(fixture())};
            const setup = async id => {
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

            const read = id => [...document.getElementById(id).shadowRoot.querySelectorAll('.jsmind-node')].map(el => ({
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
