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
 * 3. A zoom holds the map point under its anchor still while the content still
 *    overflows that axis, and centres a map that fits - so a zoom can never
 *    leave a fitting map somewhere no pan can move it from.
 * 4. The factor stops at the range's ends instead of running past them.
 * 5. `capture()` does not care what the zoom is.
 * 6. A node added while zoomed is laid out at its layout size.
 * 7. A zoomed-out map is painted whole: taking the box over must not clip it.
 * 8. A drag moves the map by exactly the pointer's travel, at any zoom.
 * 9. A pan stops at the content instead of leaving an empty viewport, and a map
 *    that already fits cannot be dragged at all.
 * 10. `centerOn` puts a node's centre in the middle of the box, at the zoom it
 *    was called at, and a native scroll the reader had already made does not
 *    change where it lands.
 * 11. `centerOn` inherits the pan's clamp: a node at the content's edge stops
 *    short of the middle rather than pulling empty canvas into view, and while
 *    the whole map fits the box the call leaves the origin where it was.
 * 12. `centerOn` refuses ids that are not nodes of the map, including the ones
 *    that only exist on `Object.prototype`.
 * 13. `fitToView` shows the whole map centred, from any state the view is in,
 *    and fitting twice gives the same viewport; `canPan` reports whether a pan
 *    would move the map, at any factor.
 * 14. The two fit modes each correct one mismatch and leave the other alone:
 *    `'shrink'` never magnifies a map that fits, `'expand'` never shrinks one
 *    that overflows, and a mode the view does not know is refused without
 *    touching the box.
 * 15. A fit with no mode corrects both mismatches, and on a map that needs one
 *    direction it answers exactly what that direction answers - one fitting
 *    factor with neither bound on the natural size.
 *
 * What is not here: the shell's gestures (double-click, `touch-action`) and the
 * exported page itself, which are measured in `export-html.test.ts`.
 */

import { test, before, after, type TestContext } from 'node:test';
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

/**
 * A box smaller than the fixture on both axes, so there is somewhere to pan.
 *
 * @remarks
 * Panning is only possible when the content is bigger than the box it is shown
 * in, and the default {@link HOST} is wide enough to hold this fixture whole -
 * which would make every drag a no-op and prove nothing.
 */
const SMALL = { width: 420, height: 300 };

/**
 * The tightest box still worth dragging in.
 *
 * @remarks
 * How far the origin can travel is the content's size minus the box, and the
 * content's size comes from the fonts the machine has - a CI runner without
 * this fixture's CJK font lays the same map out a third narrower. The tests
 * about *movement* therefore use the smallest box that can still hold a
 * gesture: the smaller the box, the wider the range, and a fixed 240px drag
 * then has room on any machine. Clamping and capture are measured on
 * {@link SMALL} instead, where they do not depend on the range's width.
 */
const TIGHT = { width: 150, height: 120 };

let browser: BrowserHarness;

/**
 * A map with branches on both sides, so nodes land on both sides of the middle
 * of the view.
 *
 * @param branchCount - How many first-level branches to build.
 * @param leafCount - How many leaves each branch carries.
 * @returns The document, ready to be serialised into the page.
 */
function fixture(branchCount = 6, leafCount = 3): unknown {
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

    for (let branch = 0; branch < branchCount; branch += 1) {
        const id = `c${branch}`;
        const side = branch % 2 === 0 ? 1 : -1;
        const leaves: string[] = [];
        for (let leaf = 0; leaf < leafCount; leaf += 1) {
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
    viewport: { x: number; y: number; scale: number; width: number; height: number; canPan: boolean };
    nodes: RenderedNode[];
    inner: { transform: string; overflow: string };
}

/**
 * Opens the fixture in a fresh page and leaves the instance on `window.__jm`.
 *
 * @param document_ - Document to render.
 * @param host - Size of the container, in CSS pixels. Defaults to {@link HOST}.
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

/**
 * The three numbers a pan writes.
 *
 * @param state - Snapshot to read.
 * @returns The origin and the zoom, without the view size.
 */
function origin(state: Snapshot): { x: number; y: number; scale: number } {
    return { x: state.viewport.x, y: state.viewport.y, scale: state.viewport.scale };
}

/**
 * The box the whole map is painted in, relative to the host's corner.
 *
 * @param state - Snapshot to measure.
 * @returns Leftmost, rightmost, topmost and bottommost painted edge.
 */
function paintedExtent(state: Snapshot): { left: number; right: number; top: number; bottom: number } {
    return {
        left: Math.min(...state.nodes.map(node => node.left)),
        right: Math.max(...state.nodes.map(node => node.left + node.width)),
        top: Math.min(...state.nodes.map(node => node.top)),
        bottom: Math.max(...state.nodes.map(node => node.top + node.height)),
    };
}

/**
 * Installs a caller that turns pointer travel into `panBy`.
 *
 * @remarks
 * The library exposes the movement, not the pointer handling: `artifact/shell.js`
 * ships this gesture for exported pages and an embedder is expected to wire the
 * same one. The harness installs it so a test can drive the library with real
 * pointer events; the shell's own copy of the handler is covered where it lives,
 * on an exported page (`export-html.test.ts`).
 *
 * Without `setPointerCapture` a fast drag stops being delivered the moment the
 * pointer leaves the box, which is what the capture in the shell exists for.
 */
async function installDragCaller(): Promise<void> {
    await browser.evaluate(`(() => {
        const container = document.getElementById('container');
        let captured = null;
        let lastX = 0;
        let lastY = 0;
        container.addEventListener('pointerdown', event => {
            if (captured !== null || event.button !== 0) {
                return;
            }
            captured = event.pointerId;
            lastX = event.clientX;
            lastY = event.clientY;
            container.setPointerCapture(event.pointerId);
            event.preventDefault();
        });
        container.addEventListener('pointermove', event => {
            if (event.pointerId !== captured) {
                return;
            }
            const dx = event.clientX - lastX;
            const dy = event.clientY - lastY;
            if (dx === 0 && dy === 0) {
                return;
            }
            lastX = event.clientX;
            lastY = event.clientY;
            window.__jm.commands.panBy(dx, dy);
        });
        const end = event => {
            if (event.pointerId === captured) {
                captured = null;
            }
        };
        container.addEventListener('pointerup', end);
        container.addEventListener('pointercancel', end);
        container.addEventListener('lostpointercapture', end);
        return true;
    })()`);
}

/**
 * The two ends of the range the origin is clamped to, and how wide it is.
 *
 * @remarks
 * The range comes from the rendered content, and the content's width comes from
 * the fonts the machine has: a CI runner without this fixture's CJK font lays
 * the same map out noticeably narrower than a laptop does. Asking for the ends
 * keeps the assertions about *movement between them* - the numbers a reader can
 * check - instead of about where a particular machine's typography puts the
 * content. A test that hardcodes a corner position passes on a laptop and fails
 * on the runner for a reason that has nothing to do with panning.
 *
 * Asking is also the only way to read them: the origin is public, the content
 * rectangle is not.
 *
 * @returns Both ends, in map pixels, and the span between them.
 */
async function panLimits(): Promise<{
    near: { x: number; y: number };
    far: { x: number; y: number };
    span: { x: number; y: number };
}> {
    const near = await browser.evaluate<{ x: number; y: number }>(
        `(() => {
            window.__jm.commands.panTo(-1e9, -1e9);
            return window.__jm.commands.getViewport();
        })()`
    );
    const far = await browser.evaluate<{ x: number; y: number }>(
        `(() => {
            window.__jm.commands.panTo(1e9, 1e9);
            return window.__jm.commands.getViewport();
        })()`
    );
    await browser.settle();
    return {
        near: { x: near.x, y: near.y },
        far: { x: far.x, y: far.y },
        span: { x: far.x - near.x, y: far.y - near.y },
    };
}

/**
 * The middle of the range, which leaves the most room in either direction.
 *
 * @param limits - Range to pick from.
 * @returns A point inside it.
 */
function middleOf(limits: { near: { x: number; y: number }; span: { x: number; y: number } }): {
    x: number;
    y: number;
} {
    return { x: limits.near.x + limits.span.x / 2, y: limits.near.y + limits.span.y / 2 };
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
    // Not `hidden`: the inner box is only as big as the view, and clipping there
    // would cut a zoomed-out map at the box's own edges (see the clipping test).
    // `visible` does not scroll either, so native scrolling is still gone.
    assert.strictEqual(zoomed.inner.overflow, 'visible', 'the transform is in charge now');
    assert.match(zoomed.inner.transform, /scale\(2\)/, 'the zoom is written as a transform');
});

test('ui viewport - a zoomed-out map is painted whole', async () => {
    // The box the transform is written on is only as big as the view, and an
    // `overflow` that clips cuts in the element's own coordinate space - so a
    // clipping value there would keep showing the same screenful of the map,
    // merely smaller, and the rest of a zoomed-out map would be neither painted
    // nor (before pan exists) reachable. Clipping belongs to `:host`, whose box
    // is the same size but which clips what the transform actually painted.
    //
    // `getBoundingClientRect()` cannot see this: it ignores ancestor clipping,
    // so a node cut away by its own box still reports a box inside the view.
    // An IntersectionObserver can, because its intersection rect is clipped by
    // every ancestor between the target and the root.
    await open(fixture(10, 6), { width: 420, height: 300 });

    const painted = await browser.evaluate<{
        viewport: { scale: number };
        inside: { text: string; intersects: boolean }[];
    }>(
        `(async () => {
            const jm = window.__jm;
            const host = document.getElementById('container');
            jm.commands.zoomTo(0.2);

            const box = host.getBoundingClientRect();
            const nodes = [...host.shadowRoot.querySelectorAll('.jsmind-node')];

            const seen = new Map();
            const observer = new IntersectionObserver(entries => {
                for (const entry of entries) {
                    seen.set(entry.target, entry.isIntersecting);
                }
            });
            nodes.forEach(node => observer.observe(node));
            // Observations are delivered with a rendering update, and there is
            // no promise to await from out here; a timer is the floor.
            await new Promise(resolve => setTimeout(resolve, 400));
            observer.disconnect();

            const inside = [];
            for (const node of nodes) {
                const rect = node.getBoundingClientRect();
                const within =
                    rect.left >= box.left &&
                    rect.top >= box.top &&
                    rect.right <= box.right &&
                    rect.bottom <= box.bottom;
                if (within) {
                    inside.push({
                        text: (node.textContent || '').trim(),
                        intersects: seen.get(node) === true,
                    });
                }
            }
            return { viewport: jm.commands.getViewport(), inside };
        })()`,
        true
    );

    assert.strictEqual(painted.viewport.scale, 0.2, 'the map really is zoomed out');
    // Without this the assertion below could pass on a map that shows nothing.
    assert.ok(
        painted.inside.length >= 20,
        `a zoomed-out map should fill the view with nodes, only ${painted.inside.length} of its boxes land inside it`
    );
    const clipped = painted.inside.filter(entry => !entry.intersects).map(entry => entry.text);
    assert.deepStrictEqual(
        clipped,
        [],
        `these nodes have a box inside the view but are clipped away: ${clipped.join(', ')}`
    );
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

test('ui viewport - a zoom takes over the scroll the reader had already made', async () => {
    // A map bigger than its box, so the inner box really scrolls natively
    // before any zoom arrives. The box is deliberately small: the fixture is
    // only wide where a chain of nodes stacks, and a scroll offset on one axis
    // alone would leave half of the handover untested.
    await open(fixture(10, 6), { width: 420, height: 300 });
    const ready = await browser.evaluate<{ scrollable: boolean }>(
        `(() => {
            const inner = document.getElementById('container').shadowRoot.querySelector('.jsmind-inner');
            return { scrollable: inner.scrollWidth > inner.clientWidth && inner.scrollHeight > inner.clientHeight };
        })()`
    );
    assert.ok(ready.scrollable, 'the fixture should overflow its box, otherwise the scroll being taken over proves nothing');

    await command(`
        const inner = document.getElementById('container').shadowRoot.querySelector('.jsmind-inner');
        inner.scrollLeft = 120;
        inner.scrollTop = 60;
    `);
    const scrolled = await snapshot();

    // Until a command arrives the box is still natively scrolled, and the
    // accessor has to describe that rather than report the map at its origin.
    assert.strictEqual(scrolled.inner.overflow, 'auto', 'nothing has taken the box over yet');
    assert.strictEqual(scrolled.inner.transform, '', 'still no transform');
    assert.deepStrictEqual(
        { x: scrolled.viewport.x, y: scrolled.viewport.y, scale: scrolled.viewport.scale },
        { x: 120, y: 60, scale: 1 },
        'the viewport reports the scroll the reader is looking at'
    );
    assertPaintMatchesViewport(scrolled);

    // A zoom folds that displacement into the origin: the map point under the
    // anchor before the command is still under it after, which is exactly what
    // a silently dropped scroll offset would break.
    const anchor = { x: 400, y: 300 };
    const focus = { x: scrolled.viewport.x + anchor.x, y: scrolled.viewport.y + anchor.y };
    await command(`jm.commands.zoomTo(1.5, { x: ${anchor.x}, y: ${anchor.y} })`);
    const zoomed = await snapshot();

    assert.strictEqual(zoomed.inner.overflow, 'visible', 'the transform is in charge now');
    assert.strictEqual(zoomed.viewport.scale, 1.5);
    assert.ok(
        Math.abs(zoomed.viewport.x + anchor.x / 1.5 - focus.x) < 1e-6,
        `the anchored map point drifted horizontally: ${zoomed.viewport.x}`
    );
    assert.ok(
        Math.abs(zoomed.viewport.y + anchor.y / 1.5 - focus.y) < 1e-6,
        `the anchored map point drifted vertically: ${zoomed.viewport.y}`
    );
    assertPaintMatchesViewport(zoomed);
});

test('ui viewport - a pan writes the origin it was given, and the map follows it', async () => {
    await open(fixture(10, 6), TIGHT);
    const limits = await panLimits();

    // The origin asked for is inside the range and the same at both zooms, so
    // the two halves of this test are about the translate, not the clamp.
    const target = { x: limits.near.x + 50, y: limits.near.y + 150 };
    assert.ok(limits.span.x > 50 && limits.span.y > 150, `the content must overflow the box: ${limits.span.x}/${limits.span.y}`);

    await command(`jm.commands.panTo(${target.x}, ${target.y})`);
    const panned = await snapshot();

    // `panTo` names a map point to show at the corner, in the same space
    // `getViewport()` reports - so a caller can read, keep and restore it.
    assert.deepStrictEqual(origin(panned), { x: target.x, y: target.y, scale: 1 });
    assert.strictEqual(panned.inner.overflow, 'visible', 'a pan takes the box over from native scrolling');
    assert.strictEqual(
        panned.inner.transform,
        `translate(${-target.x}px, ${-target.y}px) scale(1)`,
        'the origin is written as a translate, with the scale applied to both'
    );
    assertPaintMatchesViewport(panned);

    // At a zoom the translate carries the scale with it, which is what keeps
    // the origin in map pixels rather than screen pixels.
    await command('jm.commands.zoomTo(2, { x: 100, y: 100 })');
    await command(`jm.commands.panTo(${target.x}, ${target.y})`);
    const zoomed = await snapshot();

    assert.deepStrictEqual(origin(zoomed), { x: target.x, y: target.y, scale: 2 });
    assert.strictEqual(zoomed.inner.transform, `translate(${-target.x * 2}px, ${-target.y * 2}px) scale(2)`);
    assertPaintMatchesViewport(zoomed);
});

test('ui viewport - a drag moves the view by exactly the pointer travel', async () => {
    await open(fixture(10, 6), TIGHT);
    await installDragCaller();

    const travel = { x: 240, y: 160 };

    const checkDrag = async (scale: number) => {
        // Started at the far end of the range, so the whole range is room to
        // travel in and nothing here can be clamped - a clamped drag is the
        // next test's claim, and mixing the two would let a wrong delta hide
        // behind a correct clamp.
        const limits = await panLimits();
        assert.ok(
            limits.span.x > travel.x + 10 && limits.span.y > travel.y + 10,
            `the content must overflow the box by more than the drag: ${limits.span.x}/${limits.span.y} against ${travel.x}/${travel.y}`
        );
        await command(`jm.commands.panTo(${limits.far.x}, ${limits.far.y})`);
        const before_ = await snapshot();
        assert.deepStrictEqual(origin(before_), { x: limits.far.x, y: limits.far.y, scale });

        await browser.dragBy({ x: 5, y: 5 }, travel.x, travel.y);
        const after_ = await snapshot();

        assert.deepStrictEqual(
            origin(after_),
            { x: limits.far.x - travel.x / scale, y: limits.far.y - travel.y / scale, scale },
            `at ${scale}x the origin moves by the travel divided by the zoom`
        );
        for (const [index, was] of before_.nodes.entries()) {
            const now = after_.nodes[index]!;
            assert.ok(
                Math.abs(now.left - was.left - travel.x) < 0.5,
                `${now.text}: the map should have moved right by ${travel.x}, it moved ${(now.left - was.left).toFixed(2)}`
            );
            assert.ok(
                Math.abs(now.top - was.top - travel.y) < 0.5,
                `${now.text}: the map should have moved down by ${travel.y}, it moved ${(now.top - was.top).toFixed(2)}`
            );
        }
        assertPaintMatchesViewport(after_);
    };

    // At 1x the pointer travel is the map travel.
    await checkDrag(1);

    // At 2x it is divided by the zoom on the way in and multiplied back on the
    // way out, so the map still moves by exactly the travel on screen - which
    // is why this is checked at a scale other than 1.
    await command('jm.commands.zoomTo(2, { x: 125, y: 90 })');
    await checkDrag(2);
});

test('ui viewport - a zoomed map can be dragged into every corner and stops at the content', async () => {
    await open(fixture(10, 6), SMALL);
    await installDragCaller();
    await command('jm.commands.zoomTo(2, { x: 210, y: 150 })');

    // Each drag is smaller than the overflow, so a corner takes several of them
    // and the gesture stays inside the box - which is what a hand does. The
    // press point is chosen per direction so the pointer never leaves the box:
    // Chrome stops delivering moves once the position is outside it.
    const unit = { dx: 230, dy: 160 };
    const dragTowards = async (dx: number, dy: number) => {
        await browser.dragBy(
            { x: dx >= 0 ? 10 : SMALL.width - 10, y: dy >= 0 ? 10 : SMALL.height - 10 },
            dx,
            dy
        );
    };
    const dragUntilStopped = async (dx: number, dy: number) => {
        let previous = await snapshot();
        // At 2x a 160px drag moves the origin by 80 map pixels, so the tallest
        // overflow in the fixture takes two dozen gestures before the one that
        // changes nothing.
        for (let attempt = 0; attempt < 40; attempt += 1) {
            await dragTowards(dx, dy);
            const state = await snapshot();
            if (state.viewport.x === previous.viewport.x && state.viewport.y === previous.viewport.y) {
                return state;
            }
            previous = state;
        }
        throw new Error('the view never stopped moving');
    };

    // Down and right: the content's top-left corner comes to the viewport's.
    const topLeft = await dragUntilStopped(unit.dx, unit.dy);
    const near = paintedExtent(topLeft);
    // `:host` clips, so a box past the edge would be cut: the map has to be
    // pressed against the edge, not floating in the middle of the view.
    assert.ok(near.left >= 0 && near.left < 40, `the leftmost box sits at ${near.left.toFixed(2)}, not against the left edge`);
    assert.ok(near.top >= 0 && near.top < 40, `the topmost box sits at ${near.top.toFixed(2)}, not against the top edge`);
    assertPaintMatchesViewport(topLeft);

    // One more drag of the same length must not move it at all: the clamp is a
    // wall, not a slow drift.
    await dragTowards(unit.dx, unit.dy);
    assert.deepStrictEqual(origin(await snapshot()), origin(topLeft), 'a drag past the edge must stop moving the view');

    // Right-hand corner: at 2x there is room for the origin to travel, and it
    // ends with the map's right edge against the viewport's.
    const topRight = await dragUntilStopped(-unit.dx, 0);
    assert.ok(topRight.viewport.x > topLeft.viewport.x, 'at 2x the right-hand side is reachable');
    assert.strictEqual(topRight.viewport.y, topLeft.viewport.y, 'a horizontal drag leaves the vertical origin alone');
    const right = paintedExtent(topRight);
    assert.ok(
        right.right <= SMALL.width && right.right > SMALL.width - 40,
        `the rightmost box sits at ${right.right.toFixed(2)} of ${SMALL.width}`
    );
    assertPaintMatchesViewport(topRight);

    // Bottom-right, then bottom-left, then back: every corner is a limit, and a
    // round trip lands exactly where it started.
    const bottomRight = await dragUntilStopped(0, -unit.dy);
    const bottom = paintedExtent(bottomRight);
    assert.ok(
        bottom.bottom <= SMALL.height && bottom.bottom > SMALL.height - 40,
        `the bottommost box sits at ${bottom.bottom.toFixed(2)} of ${SMALL.height}`
    );
    assert.deepStrictEqual(origin(await dragUntilStopped(0, -unit.dy)), origin(bottomRight), 'the bottom limit holds');

    const bottomLeftBack = await dragUntilStopped(unit.dx, 0);
    assert.strictEqual(bottomLeftBack.viewport.y, bottomRight.viewport.y, 'the horizontal drag left the vertical limit alone');
    assert.strictEqual(bottomLeftBack.viewport.x, topLeft.viewport.x, 'the left limit is the same one reached from the other side');
    assertPaintMatchesViewport(bottomLeftBack);

    const roundTrip = await dragUntilStopped(0, unit.dy);
    assert.deepStrictEqual(origin(roundTrip), origin(topLeft), 'a round trip must land on the origin it started from');
});

test('ui viewport - a pan takes over the scroll the reader had already made', async () => {
    // The first pan arrives while native scrolling is still in charge, and the
    // scroll offset is the same displacement the origin describes. Folding one
    // into the other is what keeps the picture from jumping at the handover.
    await open(fixture(10, 6), TIGHT);
    await installDragCaller();

    // Half-way through the native scroll range: an offset the box really has,
    // whatever size the fonts made the content.
    const scrolled = await browser.evaluate<{ scrollLeft: number; scrollTop: number }>(
        `(() => {
            const inner = document.getElementById('container').shadowRoot.querySelector('.jsmind-inner');
            inner.scrollLeft = Math.round((inner.scrollWidth - inner.clientWidth) / 2);
            inner.scrollTop = Math.round((inner.scrollHeight - inner.clientHeight) / 2);
            return { scrollLeft: inner.scrollLeft, scrollTop: inner.scrollTop };
        })()`
    );
    assert.ok(scrolled.scrollLeft > 50, `the box should really be scrolled: ${scrolled.scrollLeft}`);

    const before_ = await snapshot();
    assert.strictEqual(before_.viewport.x, scrolled.scrollLeft, 'the accessor reports the scroll the reader is looking at');
    assert.strictEqual(before_.inner.overflow, 'auto', 'nothing has taken the box over yet');

    // Dragging the map left raises the origin: the whole range above the scroll
    // offset is room for it, so this cannot be clamped.
    await browser.dragBy({ x: 100, y: 100 }, -100, 0);
    const panned = await snapshot();

    // The scroll folded into the origin, then the drag applied: the origin is
    // the scroll offset plus the travel, not the travel on its own.
    assert.deepStrictEqual(origin(panned), {
        x: scrolled.scrollLeft + 100,
        y: scrolled.scrollTop,
        scale: 1,
    });
    assert.strictEqual(panned.inner.overflow, 'visible');
    assertPaintMatchesViewport(panned);
});

test('ui viewport - a map that already fits the box cannot be dragged', async () => {
    await open(fixture(), TIGHT);
    await installDragCaller();

    // First the same gesture where there is room, so "nothing moved" below
    // cannot be a drag that never reached the view.
    const limits = await panLimits();
    // A drag of 100/80 from the middle of the range needs half of it on each
    // side, so 200/160 is the floor and this is that with a little room.
    assert.ok(limits.span.x > 210 && limits.span.y > 170, `the content must overflow the box: ${limits.span.x}/${limits.span.y}`);
    const start = middleOf(limits);
    await command(`jm.commands.panTo(${start.x}, ${start.y})`);

    // Both gestures here stay inside the box on purpose: this test is about the
    // range being empty or not, and a drag that leaves the box would also be
    // relying on the pointer capture - which has its own case above.
    await browser.dragBy({ x: 5, y: 5 }, 100, 80);
    const moved = await snapshot();
    assert.deepStrictEqual(origin(moved), { x: start.x - 100, y: start.y - 80, scale: 1 }, 'the drag reaches the view');

    // Now zoomed out until the content is smaller than the box on both axes.
    // The range is empty there, so a drag has to leave the origin alone instead
    // of pushing the map out of an otherwise complete view.
    await command('jm.commands.zoomTo(0.1)');
    const before_ = await snapshot();
    assert.strictEqual(before_.viewport.scale, 0.1);
    const extent = paintedExtent(before_);
    assert.ok(extent.left >= 0 && extent.right <= TIGHT.width, 'the zoomed-out map fits the box horizontally');
    assert.ok(extent.top >= 0 && extent.bottom <= TIGHT.height, 'the zoomed-out map fits the box vertically');

    await browser.dragBy({ x: 5, y: 5 }, 100, 80);
    const after_ = await snapshot();

    assert.deepStrictEqual(origin(after_), origin(before_), 'a map that fits has nowhere to pan to');
    assert.deepStrictEqual(paintedExtent(after_), extent, 'and every node stays where it was, none of them dragged off the box');
});

test('ui viewport - centerOn of a map that fits the box moves nothing', async () => {
    await open(fixture(), TIGHT);

    // The same state the drag above is a no-op in: the content brought inside
    // the box and then zoomed out until it is smaller than the box on both
    // axes, so the clamp has no band to move the origin in. Centring goes
    // through the pan rather than writing the origin it computed, so it
    // inherits that. An implementation that wrote it anyway would shove the map
    // into a corner - and leave it there, since the empty band means a pan
    // cannot bring it back.
    const middle = middleOf(await panLimits());
    await command(`jm.commands.panTo(${middle.x}, ${middle.y})`);
    await command('jm.commands.zoomTo(0.1)');
    const before_ = await snapshot();
    assert.strictEqual(before_.viewport.scale, 0.1);
    const extent = paintedExtent(before_);
    assert.ok(
        extent.left >= 0 && extent.right <= TIGHT.width,
        `the zoomed-out map fits the box horizontally: ${extent.left}..${extent.right} in ${TIGHT.width}, origin ${before_.viewport.x}/${before_.viewport.y}`
    );
    assert.ok(
        extent.top >= 0 && extent.bottom <= TIGHT.height,
        `the zoomed-out map fits the box vertically: ${extent.top}..${extent.bottom} in ${TIGHT.height}`
    );

    // A leaf at the content's edge, so the origin a centring would compute is
    // far from the one the zoom left behind: the root sits near the middle and
    // would make a no-op and a centring look alike.
    const leaf = identifierFor('分支 0.0 的说明文字');
    const beforeCentre = centreOf(before_, '分支 0.0 的说明文字');
    const beforeMiddle = middleOfBox(before_);
    assert.ok(
        Math.abs(beforeCentre.x - beforeMiddle.x) > 5 || Math.abs(beforeCentre.y - beforeMiddle.y) > 5,
        `the node should not already be in the middle: ${beforeCentre.x.toFixed(2)}/${beforeCentre.y.toFixed(2)} against ${beforeMiddle.x}/${beforeMiddle.y}`
    );

    await command(`jm.commands.centerOn('${leaf}')`);
    const after_ = await snapshot();

    assert.deepStrictEqual(origin(after_), origin(before_), 'a map that fits has no middle to move to');
    assert.deepStrictEqual(paintedExtent(after_), extent, 'and every node stays where it was, none of them pushed off the box');
    assertPaintMatchesViewport(after_);
});

test('ui viewport - zoom and pan alternate without overwriting each other', async () => {
    await open(fixture(10, 6), TIGHT);
    const limits = await panLimits();
    // The anchored zoom moves the origin by 125 - 125/2.4 and the pan by 50
    // more, so the range has to be at least twice that on each axis.
    assert.ok(limits.span.x > 260 && limits.span.y > 190, `the content must overflow the box: ${limits.span.x}/${limits.span.y}`);
    const middle = middleOf(limits);

    // The pan is the origin the next zoom has to start from: a zoom that reset
    // it, or a pan that recomputed it from zero, would move the anchored point.
    await command(`jm.commands.panTo(${middle.x}, ${middle.y})`);
    const panned = await snapshot();
    assertPaintMatchesViewport(panned);

    await command('jm.commands.zoomTo(2.4, { x: 125, y: 90 })');
    const zoomed = await snapshot();
    const focus = {
        x: panned.viewport.x + 125 / panned.viewport.scale,
        y: panned.viewport.y + 90 / panned.viewport.scale,
    };
    assert.ok(
        Math.abs(zoomed.viewport.x + 125 / zoomed.viewport.scale - focus.x) < 1e-6,
        'the anchored map point drifted horizontally'
    );
    assert.ok(
        Math.abs(zoomed.viewport.y + 90 / zoomed.viewport.scale - focus.y) < 1e-6,
        'the anchored map point drifted vertically'
    );
    assertPaintMatchesViewport(zoomed);

    await command('jm.commands.panBy(120, 80)');
    const afterPan = await snapshot();
    assert.ok(
        Math.abs(afterPan.viewport.x - (zoomed.viewport.x - 120 / zoomed.viewport.scale)) < 1e-6,
        'panBy should continue from the zoomed origin, not from zero'
    );
    assert.ok(
        Math.abs(afterPan.viewport.y - (zoomed.viewport.y - 80 / zoomed.viewport.scale)) < 1e-6,
        'panBy should continue from the zoomed origin vertically'
    );
    assertPaintMatchesViewport(afterPan);

    await command('jm.commands.zoomTo(1)');
    assertPaintMatchesViewport(await snapshot());
});

test('ui viewport - capture does not depend on the pan', async () => {
    await open(fixture(10, 6), SMALL);

    const capture = async (): Promise<{ css: [number, number]; bytes: number }> =>
        await browser.evaluate(
            `(async () => {
                const result = await window.__jm.exportImage({ scale: 1 });
                return { css: [result.cssWidth, result.cssHeight], bytes: result.blob.size };
            })()`,
            true
        );

    // At rest: no transform, the box still on native scrolling. This has to be
    // taken before any command, because the first one hands the box over.
    const atRest = await capture();

    const limits = await panLimits();
    const target = { x: limits.near.x + 20, y: limits.near.y + 20 };
    assert.ok(target.x !== 0 && target.y !== 0, 'the panned position has to differ from the rest one');
    await command(`jm.commands.panTo(${target.x}, ${target.y})`);
    assert.strictEqual((await snapshot()).inner.overflow, 'visible', 'the view really is panned before the second capture');
    const panned = await capture();

    // `export.ts` resets the transform on the box it clones, so the picture is
    // the map and not the current view of it. Both dimensions and byte size: a
    // clone that kept the pan would shift the content inside the same canvas.
    assert.deepStrictEqual(panned.css, atRest.css, 'capture size does not depend on the pan');
    assert.strictEqual(panned.bytes, atRest.bytes, 'the same pixels, so the same encoded size');
});

/** The text the fixture gives the root, which is not on either side of the map. */
const ROOT_TEXT = '缩放测试';

/** Centring the root, as the page would be asked. */
const CENTRE_ROOT = 'jm.commands.centerOn(\'root\')';

/**
 * The rendered node whose text is `text`.
 *
 * @param state - Snapshot to search.
 * @param text - The node's content, which is what the snapshot identifies it by.
 * @returns Its painted box.
 */
function findNode(state: Snapshot, text: string): RenderedNode {
    const node = state.nodes.find(entry => entry.text === text);
    if (!node) {
        throw new Error(`the page should render a node reading "${text}"`);
    }
    return node;
}

/**
 * The fixture id behind a rendered node.
 *
 * @remarks
 * The snapshot identifies nodes by their text, and `centerOn` takes an id, so
 * the one has to be read back as the other. The mapping is the one
 * {@link fixture} writes: `root`, `c<n>` for a branch and `c<n>_<m>` for a leaf.
 *
 * @param text - The node's content.
 * @returns Its id in the document.
 */
function identifierFor(text: string): string {
    if (text === ROOT_TEXT) {
        return 'root';
    }
    const branch = /^主题 (\d+)$/.exec(text);
    if (branch) {
        return `c${branch[1]}`;
    }
    const leaf = /^分支 (\d+)\.(\d+) 的说明文字$/.exec(text);
    if (leaf) {
        return `c${leaf[1]}_${leaf[2]}`;
    }
    throw new Error(`the fixture has no node reading "${text}"`);
}

/**
 * A node's painted centre and the middle of the visible box.
 *
 * @param state - Snapshot to measure.
 * @param text - Node to measure.
 * @returns Both points, in the same space: CSS pixels from the host's corner.
 */
function centreOf(state: Snapshot, text: string): { x: number; y: number } {
    const node = findNode(state, text);
    return { x: node.left + node.width / 2, y: node.top + node.height / 2 };
}

/**
 * The middle of the visible box, in the space the snapshot's boxes are in.
 *
 * @param state - Snapshot to read.
 * @returns The centre, in CSS pixels from the host's corner.
 */
function middleOfBox(state: Snapshot): { x: number; y: number } {
    return { x: state.viewport.width / 2, y: state.viewport.height / 2 };
}

/**
 * Asserts that one node's centre is the middle of the visible box, within a
 * pixel of rounding.
 *
 * @param state - Snapshot to check.
 * @param text - Node that should be centred.
 * @returns What was measured, so a caller can report it.
 */
function assertCentred(state: Snapshot, text: string): { centre: { x: number; y: number }; middle: { x: number; y: number } } {
    const centre = centreOf(state, text);
    const middle = middleOfBox(state);
    assert.ok(
        Math.abs(centre.x - middle.x) <= 1,
        `${text}: the centre is at x=${centre.x.toFixed(2)}, the middle of the ${state.viewport.width}px box is ${middle.x}`
    );
    assert.ok(
        Math.abs(centre.y - middle.y) <= 1,
        `${text}: the centre is at y=${centre.y.toFixed(2)}, the middle of the ${state.viewport.height}px box is ${middle.y}`
    );
    return { centre, middle };
}

test('ui viewport - centerOn puts a node in the middle of the box, at 1x and at 2x', async (t: TestContext) => {
    // A box much smaller than the map on both axes, so the origin has room to
    // move on both. With the map inside the box there would be nothing to move
    // and the assertions below would pass on a no-op.
    await open(fixture(10, 6), SMALL);

    const atRest = await snapshot();
    assert.strictEqual(atRest.viewport.scale, 1, 'the page opens at 1x');
    assert.strictEqual(atRest.inner.overflow, 'auto', 'nothing has taken the box over yet');

    await command(CENTRE_ROOT);
    const atOne = await snapshot();
    const one = assertCentred(atOne, ROOT_TEXT);

    // The zoom is not the command's business: centring is a move.
    assert.strictEqual(atOne.viewport.scale, atRest.viewport.scale, 'centerOn leaves the zoom alone');
    // Same handover a pan makes: without it the origin would be written on top
    // of the native scroll offset and the picture would jump.
    assert.strictEqual(atOne.inner.overflow, 'visible', 'centerOn takes the box over, as a pan does');
    assertPaintMatchesViewport(atOne);
    t.diagnostic(
        `1x: node centre ${one.centre.x.toFixed(2)}/${one.centre.y.toFixed(2)}, ` +
            `box middle ${one.middle.x}/${one.middle.y}, origin ${atOne.viewport.x}/${atOne.viewport.y}`
    );

    // 2x, from a view the zoom has already pushed the node away from the middle
    // of: the arithmetic that carries the scale is only exercised here, since a
    // centring that ignored it would still look right at 1x.
    await command('jm.commands.zoomTo(2, { x: 60, y: 60 })');
    const zoomed = await snapshot();
    assert.strictEqual(zoomed.viewport.scale, 2, 'the view really is at 2x');
    const beforeCentre = centreOf(zoomed, ROOT_TEXT);
    const beforeMiddle = middleOfBox(zoomed);
    assert.ok(
        Math.abs(beforeCentre.x - beforeMiddle.x) > 20 || Math.abs(beforeCentre.y - beforeMiddle.y) > 20,
        `the node should be off-centre before the call: ${beforeCentre.x.toFixed(2)}/${beforeCentre.y.toFixed(2)} against ${beforeMiddle.x}/${beforeMiddle.y}`
    );

    await command(CENTRE_ROOT);
    const atTwo = await snapshot();
    const two = assertCentred(atTwo, ROOT_TEXT);

    assert.strictEqual(atTwo.viewport.scale, 2, 'still at the factor the reader chose');
    assert.notStrictEqual(atTwo.viewport.x, zoomed.viewport.x, 'the origin really moved');
    assertPaintMatchesViewport(atTwo);
    t.diagnostic(
        `2x: node centre ${two.centre.x.toFixed(2)}/${two.centre.y.toFixed(2)}, ` +
            `box middle ${two.middle.x}/${two.middle.y}, origin ${atTwo.viewport.x}/${atTwo.viewport.y}`
    );
});

test('ui viewport - centerOn after a native scroll lands where it does without one', async () => {
    const document_ = fixture(10, 6);

    // The reference: the same page, the same command, no scroll in the way.
    await open(document_, TIGHT);
    await command(CENTRE_ROOT);
    const straight = await snapshot();

    // A fresh page, so the first command is still the one that has to fold the
    // scroll in - the handover a pan makes, done once.
    await open(document_, TIGHT);
    const scrolled = await browser.evaluate<{ scrollLeft: number; scrollTop: number }>(
        `(() => {
            const inner = document.getElementById('container').shadowRoot.querySelector('.jsmind-inner');
            inner.scrollLeft = Math.round((inner.scrollWidth - inner.clientWidth) / 2);
            inner.scrollTop = Math.round((inner.scrollHeight - inner.clientHeight) / 2);
            return { scrollLeft: inner.scrollLeft, scrollTop: inner.scrollTop };
        })()`
    );
    assert.ok(
        scrolled.scrollLeft > 40 && scrolled.scrollTop > 40,
        `the box should really be scrolled: ${scrolled.scrollLeft}/${scrolled.scrollTop}`
    );
    const before_ = await snapshot();
    assert.strictEqual(before_.inner.overflow, 'auto', 'nothing has taken the box over yet');
    assert.strictEqual(before_.viewport.x, scrolled.scrollLeft, 'the accessor reports the scroll the reader is looking at');

    await command(CENTRE_ROOT);
    const after_ = await snapshot();

    // The scroll is folded into the origin once, at the handover - and the
    // origin `centerOn` writes does not depend on where the view was, so it has
    // to be the same one a page that never scrolled ends on. Eating the offset
    // twice would move it by exactly the scroll, which is what this compares.
    assert.ok(
        Math.abs(after_.viewport.x - straight.viewport.x) < 0.01,
        `the origin drifted by ${(after_.viewport.x - straight.viewport.x).toFixed(2)}px horizontally`
    );
    assert.ok(
        Math.abs(after_.viewport.y - straight.viewport.y) < 0.01,
        `the origin drifted by ${(after_.viewport.y - straight.viewport.y).toFixed(2)}px vertically`
    );
    assertCentred(after_, ROOT_TEXT);
    assertPaintMatchesViewport(after_);
});

test('ui viewport - centerOn of a node at the edge stops at the content', async () => {
    await open(fixture(10, 6), SMALL);
    const initial = await snapshot();
    const middle = middleOfBox(initial);

    // The node furthest out on the horizontal axis: centring it would need an
    // origin left of the content, and that is exactly the case the pan's clamp
    // refuses.
    const leftmost = initial.nodes.reduce((best, node) => (node.left < best.left ? node : best));
    await command(`jm.commands.centerOn('${identifierFor(leftmost.text)}')`);
    const after_ = await snapshot();

    const node = findNode(after_, leftmost.text);
    const centre = node.left + node.width / 2;
    assert.ok(
        centre < middle.x - 40,
        `an edge node cannot reach the middle: it painted at ${centre.toFixed(1)}, the middle is ${middle.x}`
    );
    // And nothing was pulled in beside the map to make up the difference: the
    // clamp is the same one a pan has, so the content stays against the edge.
    const extent = paintedExtent(after_);
    assert.ok(extent.left >= -0.5, `the map should stay against the left edge, it starts at ${extent.left.toFixed(1)}`);
    assertPaintMatchesViewport(after_);
});

test('ui viewport - centerOn refuses an id that is not a node of the map', async () => {
    await open(fixture(10, 6), SMALL);

    // `constructor`, `__proto__` and `toString` all exist on `Object.prototype`
    // and `mind._nodes` is a plain object, so a bare `_nodes[id]` lookup answers
    // with a function and the failure surfaces later as a `TypeError` from
    // reading `layout` off it. A refused call is not allowed to move the view
    // either, so the box is still on native scrolling afterwards.
    //
    // The bundle renames the error class on the way through rollup, so
    // `instanceof JsMindError` cannot be written out by name here. One error
    // from another path in the same bundle gives the class to compare against,
    // which is the same claim: the same class, not a `TypeError`.
    const probe = await browser.evaluate<{
        reference: string;
        outcomes: { id: string; threw: boolean; isMindError: boolean; isTypeError: boolean; isError: boolean; message: string }[];
    }>(`(() => {
        const jm = window.__jm;
        const reference = (() => {
            try {
                jsMind.Serializer.create('no-such-format');
                return null;
            } catch (error) {
                return error;
            }
        })();
        const outcomes = ['constructor', '__proto__', 'toString', 'no-such-node'].map(id => {
            try {
                jm.commands.centerOn(id);
                return { id, threw: false, isMindError: false, isTypeError: false, isError: false, message: '' };
            } catch (error) {
                return {
                    id,
                    threw: true,
                    isMindError: reference !== null && error instanceof reference.constructor,
                    isTypeError: error instanceof TypeError,
                    isError: error instanceof Error,
                    message: error && error.message ? error.message : '',
                };
            }
        });
        return { reference: reference === null ? '' : String(reference.message), outcomes };
    })()`);
    assert.ok(probe.reference.length > 0, 'the page should have a library error to compare classes against');

    for (const outcome of probe.outcomes) {
        assert.strictEqual(outcome.threw, true, `centerOn('${outcome.id}') should be refused`);
        assert.strictEqual(outcome.isMindError, true, `centerOn('${outcome.id}') did not throw a JsMindError`);
        assert.strictEqual(outcome.isTypeError, false, `centerOn('${outcome.id}') threw a TypeError`);
        assert.strictEqual(outcome.isError, true, `centerOn('${outcome.id}') did not throw an Error`);
        assert.ok(
            outcome.message.includes(outcome.id),
            `centerOn('${outcome.id}') should name the id in its message, it said "${outcome.message}"`
        );
    }

    const state = await snapshot();
    assert.deepStrictEqual(origin(state), { x: 0, y: 0, scale: 1 }, 'a refused command does not move the view');
    assert.strictEqual(state.inner.overflow, 'auto', 'and does not take the box over either');
});

test('ui viewport - fitToView shows the whole map, centred, in one command', async () => {
    // A box far smaller than the map on both axes, so a fit has to shrink it -
    // and so "everything inside" cannot pass by accident.
    await open(fixture(10, 6), SMALL);

    const atRest = await snapshot();
    assert.strictEqual(atRest.viewport.scale, 1, 'the page opens at 1x');
    assert.strictEqual(atRest.inner.overflow, 'auto', 'nothing has taken the box over yet');
    assert.strictEqual(atRest.viewport.canPan, true, 'at 1x the map overflows the box');

    await command('jm.commands.fitToView("shrink")');
    const fitted = await snapshot();

    assert.ok(fitted.viewport.scale < 1, `a map larger than the box has to be shrunk, got ${fitted.viewport.scale}`);
    assert.strictEqual(fitted.inner.overflow, 'visible', 'the fit takes the box over, as a zoom does');
    // The written origin has to be the one the browser painted: an origin
    // computed without the clamp, from the layout, is exactly the kind of
    // number that could disagree with the picture.
    assertPaintMatchesViewport(fitted);

    const extent = paintedExtent(fitted);
    assert.ok(extent.left >= -0.5 && extent.top >= -0.5, `the map starts inside the box: ${extent.left}/${extent.top}`);
    assert.ok(
        extent.right <= SMALL.width + 0.5 && extent.bottom <= SMALL.height + 0.5,
        `the map ends inside the box: ${extent.right}/${extent.bottom} in ${SMALL.width}x${SMALL.height}`
    );

    // The factor is the largest at which the map fits, so one axis is filled to
    // within a pixel or two of the box. Not exactly: these are the nodes' own
    // boxes, and the layout's bounds are a little larger than them (the
    // expanders sit outside a node's box). The exact arithmetic is pinned in
    // `__tests__/view/viewport.test.ts`; what is checked here is that the fit
    // used the content and not the padded canvas, which would leave a margin on
    // both axes.
    const gaps = {
        x: SMALL.width - (extent.right - extent.left),
        y: SMALL.height - (extent.bottom - extent.top),
    };
    assert.ok(
        Math.min(gaps.x / SMALL.width, gaps.y / SMALL.height) <= 0.02,
        `one axis should be filled to within 2%: gaps ${gaps.x.toFixed(1)}/${gaps.y.toFixed(1)}`
    );

    const middle = middleOfBox(fitted);
    // Two pixels, not one: these boxes are the nodes alone and the fit centres
    // the layout's own bounds, which sit a little outside them. What this rules
    // out is a map parked at an edge.
    assert.ok(
        Math.abs((extent.left + extent.right) / 2 - middle.x) <= 2,
        `the map is centred horizontally: ${((extent.left + extent.right) / 2).toFixed(2)} against ${middle.x}`
    );
    assert.ok(
        Math.abs((extent.top + extent.bottom) / 2 - middle.y) <= 2,
        `the map is centred vertically: ${((extent.top + extent.bottom) / 2).toFixed(2)} against ${middle.y}`
    );

    assert.strictEqual(fitted.viewport.canPan, false, 'nothing overflows once it is fitted');

    // The other mode does nothing to this state, and the nothing is the point:
    // `'expand'` is for a map smaller than the box, so a map that overflows is
    // left at its natural size rather than shrunk. A reader who asked to fill
    // the canvas did not ask to lose the part of the map that does not fit.
    await command('jm.commands.fitToView("expand")');
    const expanded = await snapshot();
    assert.strictEqual(expanded.viewport.scale, 1, 'expanding must not shrink a map that overflows');
    assertPaintMatchesViewport(expanded);
    const kept = paintedExtent(expanded);
    assert.ok(
        kept.right - kept.left > SMALL.width || kept.bottom - kept.top > SMALL.height,
        `the map should still overflow the box: ${(kept.right - kept.left).toFixed(1)}x${(kept.bottom - kept.top).toFixed(1)} in ${SMALL.width}x${SMALL.height}`
    );
});

test('ui viewport - a fit with no mode corrects both mismatches, one map at a time', async () => {
    // The mode-less call has to be the answer of whichever direction each map
    // needs, not a third arithmetic that happens to land nearby. Measured in the
    // browser because "which direction" is decided from the layout the view
    // itself measured: a comparison against a hand-computed factor would agree
    // with a wrong measure.
    await open(fixture(10, 6), SMALL);
    await command('jm.commands.fitToView("shrink")');
    const shrunk = await snapshot();
    assert.ok(shrunk.viewport.scale < 1, `this map is larger than the box, got ${shrunk.viewport.scale}`);

    await command('jm.commands.fitToView()');
    const withoutMode = await snapshot();
    assert.deepStrictEqual(withoutMode.viewport, shrunk.viewport, 'on a map too large, no mode answers what shrink answers');
    assertPaintMatchesViewport(withoutMode);
    const extent = paintedExtent(withoutMode);
    assert.ok(
        extent.left >= -0.5 && extent.top >= -0.5 && extent.right <= SMALL.width + 0.5 && extent.bottom <= SMALL.height + 0.5,
        `the whole map is inside the box: ${extent.left.toFixed(1)}..${extent.right.toFixed(1)} x ${extent.top.toFixed(1)}..${extent.bottom.toFixed(1)}`
    );

    // The other state: a map the default box holds whole at 1x. Here the
    // mode-less fit has to magnify, which is the half a `min(1, fitting)` would
    // lose - a viewer with one button would then do nothing on a small map.
    await open(fixture(), HOST);
    await command('jm.commands.fitToView("expand")');
    const expanded = await snapshot();
    assert.ok(expanded.viewport.scale > 1, `this map is smaller than the box, got ${expanded.viewport.scale}`);

    await command('jm.commands.fitToView()');
    const filled = await snapshot();
    assert.deepStrictEqual(filled.viewport, expanded.viewport, 'on a map that fits, no mode answers what expand answers');
    assertPaintMatchesViewport(filled);
});

test('ui viewport - expanding is what fits a map smaller than the box, and shrinking leaves it alone', async () => {
    // The state the other mode exists for. The default host holds this fixture
    // whole, so at 1x there is nothing to shrink - and `'shrink'` must not
    // answer by blowing the map up to the box, which is the case a fit that
    // always took the largest factor would get wrong on a small map: two or
    // three nodes with their text at the size of the window.
    await open(fixture(), HOST);
    const atRest = await snapshot();
    assert.strictEqual(atRest.viewport.scale, 1, 'the page opens at 1x');
    assert.strictEqual(atRest.viewport.canPan, false, 'the map fits the box whole at 1x');
    const resting = paintedExtent(atRest);
    assert.ok(
        resting.right - resting.left < HOST.width && resting.bottom - resting.top < HOST.height,
        `the fixture should leave margin on both axes: ${(resting.right - resting.left).toFixed(1)}x${(resting.bottom - resting.top).toFixed(1)} in ${HOST.width}x${HOST.height}`
    );

    await command('jm.commands.fitToView("shrink")');
    const shrunk = await snapshot();
    assert.strictEqual(shrunk.viewport.scale, 1, 'shrinking a map that already fits leaves it at its natural size');
    assertPaintMatchesViewport(shrunk);
    const afterShrink = paintedExtent(shrunk);
    assert.ok(
        Math.abs((afterShrink.left + afterShrink.right) / 2 - HOST.width / 2) <= 2 &&
            Math.abs((afterShrink.top + afterShrink.bottom) / 2 - HOST.height / 2) <= 2,
        `and centres it: ${((afterShrink.left + afterShrink.right) / 2).toFixed(1)}/${((afterShrink.top + afterShrink.bottom) / 2).toFixed(1)}`
    );

    await command('jm.commands.fitToView("expand")');
    const expanded = await snapshot();
    assert.ok(expanded.viewport.scale > 1, `expanding should magnify the map, got ${expanded.viewport.scale}`);
    assertPaintMatchesViewport(expanded);

    // Filled, as far as the layout allows. Two bounds, both about the nodes the
    // reader can see rather than about a magic tolerance: `room` is the largest
    // factor at which the nodes' own boxes would fit, so the fit can only be at
    // or below it (the layout's bounds include the fold expanders, which sit
    // outside a node's box), and it has to be close to it - a fit well below
    // would leave a margin the box did not ask for.
    const extent = paintedExtent(expanded);
    assert.ok(
        extent.left >= -0.5 && extent.top >= -0.5 && extent.right <= HOST.width + 0.5 && extent.bottom <= HOST.height + 0.5,
        `the expanded map is all inside the box: ${extent.left.toFixed(1)}..${extent.right.toFixed(1)} x ${extent.top.toFixed(1)}..${extent.bottom.toFixed(1)}`
    );
    const room = Math.min(
        HOST.width / (resting.right - resting.left),
        HOST.height / (resting.bottom - resting.top)
    );
    assert.ok(
        expanded.viewport.scale <= room + 1e-9,
        `the fit cannot be larger than the nodes allow: ${expanded.viewport.scale} > ${room}`
    );
    assert.ok(
        expanded.viewport.scale >= room * 0.9,
        `and it should be close to it: ${expanded.viewport.scale} against ${room}`
    );
    const middle = middleOfBox(expanded);
    assert.ok(
        Math.abs((extent.left + extent.right) / 2 - middle.x) <= 2 &&
            Math.abs((extent.top + extent.bottom) / 2 - middle.y) <= 2,
        `the expanded map is centred: ${((extent.left + extent.right) / 2).toFixed(2)}/${((extent.top + extent.bottom) / 2).toFixed(2)}`
    );

    // Twice is the same as once, in both modes: the mode is part of the answer,
    // so a second call must not creep.
    await command('jm.commands.fitToView("expand")');
    assert.deepStrictEqual((await snapshot()).viewport, expanded.viewport, 'expanding twice gives the same viewport');
});

test('ui viewport - a zoom leaves a map that fits centred, never in a corner', async () => {
    // The reported sequence ended in a map that fitted the box at 0.1x, sat
    // entirely outside it, and could not be dragged back: the pan band is empty
    // at that zoom, so neither a drag nor a centring had anywhere to go. This is
    // the same trip - drag to the far corner, then zoom out until the map fits -
    // and the corner state is now unreachable: the zoom writes the only origin
    // an empty band allows, which is the middle.
    await open(fixture(), TIGHT);

    const limits = await panLimits();
    await command(`jm.commands.panTo(${limits.far.x}, ${limits.far.y})`);
    await command('jm.commands.zoomTo(0.1)');
    const fitted = await snapshot();
    assert.strictEqual(fitted.viewport.scale, 0.1);
    assert.strictEqual(fitted.viewport.canPan, false, 'at 0.1x the whole map fits, so nothing can move');

    // Inside the box and centred on both axes - the two things the corner state
    // broke, on the axis that fitted and on the far corner it was dragged to.
    const extent = paintedExtent(fitted);
    assert.ok(
        extent.left >= -0.5 && extent.top >= -0.5 && extent.right <= TIGHT.width + 0.5 && extent.bottom <= TIGHT.height + 0.5,
        `the map is inside the box: ${extent.left}..${extent.right} x ${extent.top}..${extent.bottom}`
    );
    assert.ok(
        Math.abs((extent.left + extent.right) / 2 - TIGHT.width / 2) <= 2 &&
            Math.abs((extent.top + extent.bottom) / 2 - TIGHT.height / 2) <= 2,
        `and centred: ${((extent.left + extent.right) / 2).toFixed(1)}/${((extent.top + extent.bottom) / 2).toFixed(1)}`
    );
    assertPaintMatchesViewport(fitted);

    // The pan contract is untouched: a map that fits still cannot be dragged or
    // centred (#245), and it no longer needs to be.
    await command('jm.commands.panBy(-400, -300)');
    await command(CENTRE_ROOT);
    assert.deepStrictEqual(origin(await snapshot()), origin(fitted), 'a drag and a centring are still no-ops here');

    // The fit is still the way to the whole map - the one command that writes
    // an origin outside the band on purpose, from any state.
    await command('jm.commands.fitToView("shrink")');
    const whole = await snapshot();
    const wholeExtent = paintedExtent(whole);
    assert.ok(
        wholeExtent.left >= -0.5 &&
            wholeExtent.top >= -0.5 &&
            wholeExtent.right <= TIGHT.width + 0.5 &&
            wholeExtent.bottom <= TIGHT.height + 0.5,
        `the fit keeps the map inside the box: ${wholeExtent.left}..${wholeExtent.right} x ${wholeExtent.top}..${wholeExtent.bottom}`
    );
    assert.ok(
        Math.abs((wholeExtent.left + wholeExtent.right) / 2 - TIGHT.width / 2) <= 2 &&
            Math.abs((wholeExtent.top + wholeExtent.bottom) / 2 - TIGHT.height / 2) <= 2,
        `and centred: ${((wholeExtent.left + wholeExtent.right) / 2).toFixed(1)}/${((wholeExtent.top + wholeExtent.bottom) / 2).toFixed(1)}`
    );
    assertPaintMatchesViewport(whole);
});

test('ui viewport - fitting twice gives the same viewport, and canPan follows the zoom', async () => {
    await open(fixture(10, 6), SMALL);

    // From somewhere other than the opening view, so the first fit has work to
    // do and a fit that only ran once would not be caught by the second.
    await command('jm.commands.zoomTo(1.7)');
    await command('jm.commands.fitToView("shrink")');
    const first = await snapshot();
    assert.strictEqual(first.viewport.canPan, false, 'nothing overflows at the fitted zoom');

    await command('jm.commands.fitToView("shrink")');
    const second = await snapshot();

    // Field for field, including the size the answer was computed against: a
    // first fit that measured a box still narrowed by a scrollbar would answer
    // differently here, which is the whole reason the box is taken over first.
    assert.deepStrictEqual(second.viewport, first.viewport, 'the same command gives the same answer');

    // Halfway between the fit and 1x: still below 1, but the content already
    // overflows, so a drag has to pan. A `scale > 1` test calls this "no room",
    // and after this item the page has no scrollbar to hand the gesture to.
    const between = (first.viewport.scale + 1) / 2;
    await command(`jm.commands.zoomTo(${between}, { x: 0, y: 0 })`);
    const zoomed = await snapshot();
    assert.ok(zoomed.viewport.scale < 1, `the factor should still be below 1, got ${zoomed.viewport.scale}`);
    assert.strictEqual(zoomed.viewport.canPan, true, 'the content overflows at this factor');

    const before_ = origin(zoomed);
    await command('jm.commands.panBy(-60, -40)');
    const panned = await snapshot();
    assert.notDeepStrictEqual(origin(panned), before_, 'and the drag really moves the map');

    // Below the fitted factor the whole map is inside again and there is
    // nothing left to pan.
    await command(`jm.commands.zoomTo(${first.viewport.scale * 0.8})`);
    const out = await snapshot();
    assert.strictEqual(out.viewport.canPan, false, 'the whole map is inside again');
    assertPaintMatchesViewport(out);
});

test('ui viewport - fitToView refuses before a map has been shown', async () => {
    await browser.setContent('<div id="empty" style="width:200px;height:150px"></div>');
    await browser.loadBundle();

    // A view with no map has no content to fit. Answering anyway would mean a
    // scale and an origin derived from a zero-sized box, and those would shift
    // the first map opened afterwards - so the command is refused rather than
    // silently guessed, the way `capture` and `centerOn` already are.
    //
    // The bundle renames the error class on the way through rollup, so the
    // comparison is against another error from the same bundle rather than
    // against `JsMindError` by name.
    const probe = await browser.evaluate<{
        threw: boolean;
        isMindError: boolean;
        isTypeError: boolean;
        message: string;
        transform: string;
        overflow: string;
    }>(`(async () => {
        const host = document.getElementById('empty');
        const jm = await jsMind.create(host);
        const reference = (() => {
            try {
                jsMind.Serializer.create('no-such-format');
                return null;
            } catch (error) {
                return error;
            }
        })();
        const inner = host.shadowRoot.querySelector('.jsmind-inner');
        try {
            jm.commands.fitToView('shrink');
            return { threw: false, isMindError: false, isTypeError: false, message: '', transform: inner.style.transform, overflow: getComputedStyle(inner).overflow };
        } catch (error) {
            return {
                threw: true,
                isMindError: reference !== null && error instanceof reference.constructor,
                isTypeError: error instanceof TypeError,
                message: error && error.message ? error.message : '',
                transform: inner.style.transform,
                overflow: getComputedStyle(inner).overflow,
            };
        }
    })()`, true);

    assert.strictEqual(probe.threw, true, 'a fit with nothing to fit is refused');
    assert.strictEqual(probe.isMindError, true, 'and refused with the library\'s own error class');
    assert.strictEqual(probe.isTypeError, false, 'not with a TypeError');
    assert.match(probe.message, /no mind map/i, `the message should say what is missing, it said "${probe.message}"`);
    assert.strictEqual(probe.transform, '', 'a refused command writes no transform');
    assert.strictEqual(probe.overflow, 'auto', 'and does not take the box over either');
});

test('ui viewport - fitToView refuses a mode it does not know, and leaves the view alone', async () => {
    // The mode is the whole request, so a caller that got it wrong - a typo in
    // plain JavaScript, or a value from an older API - has to be told rather
    // than quietly given the shrinking behaviour and a map that moves for no
    // reason they can see. Refused before the box is taken over, so a failed
    // call changes nothing at all.
    await open(fixture(10, 6), SMALL);
    const atRest = await snapshot();

    const probe = await browser.evaluate<{
        threw: boolean;
        isMindError: boolean;
        message: string;
        transform: string;
        overflow: string;
    }>(`(() => {
        const jm = window.__jm;
        const inner = document.getElementById('container').shadowRoot.querySelector('.jsmind-inner');
        // Asked of the bundle rather than by name: rollup renames the error
        // class on the way through, so an error the library raises and one it
        // raises here are compared by constructor.
        const reference = (() => {
            try {
                jsMind.Serializer.create('no-such-format');
                return null;
            } catch (error) {
                return error;
            }
        })();
        try {
            jm.commands.fitToView('grow');
            return { threw: false, isMindError: false, message: '', transform: inner.style.transform, overflow: getComputedStyle(inner).overflow };
        } catch (error) {
            return {
                threw: true,
                isMindError: reference !== null && error instanceof reference.constructor,
                message: error && error.message ? error.message : '',
                transform: inner.style.transform,
                overflow: getComputedStyle(inner).overflow,
            };
        }
    })()`);

    assert.strictEqual(probe.threw, true, 'an unknown mode is refused');
    assert.strictEqual(probe.isMindError, true, 'and refused with the error class the library raises');
    assert.match(probe.message, /grow/, `the message should quote what was passed, it said "${probe.message}"`);
    assert.match(probe.message, /shrink.*expand/, `and name the modes that exist, it said "${probe.message}"`);
    assert.strictEqual(probe.transform, '', 'a refused command writes no transform');
    assert.strictEqual(probe.overflow, 'auto', 'and does not take the box over either');
    assert.deepStrictEqual((await snapshot()).viewport, atRest.viewport, 'the view is exactly where it was');
});
