/**
 * @fileoverview End-to-end `jsmind export html` against a real browser.
 *
 * The page is the product: a reader double-clicks it on a machine that may have
 * no network at all. So this suite drives the built CLI, opens the file it
 * wrote over `file://` — no server, no build, nothing to fetch — and asks the
 * rendered document how many nodes it shows and how big they are. A page that
 * only *looks* right in the source would pass every other check.
 *
 * The second case is the one the design decision is about: a map larger than
 * the window opens at the size its text was written for, cropped by the window
 * like any canvas, and the page itself never grows a scrollbar to reach the
 * rest - the map's own viewport moves instead. Fitting the whole map is a
 * command, not a default: a double-click is what asks for it, and that is what
 * the same case measures next.
 *
 * It drives `dist/cli.js`, so it needs a build and a Chromium binary.
 */

import { test, type TestContext } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { BrowserHarness } from './helpers.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '../..');
const CLI = join(REPO_ROOT, 'dist/cli.js');

/**
 * How hard one pixel of wheel scroll zooms the shell's map.
 *
 * @remarks
 * `artifact/shell.js` holds the same number as `ZOOM_PER_WHEEL_PIXEL`. A test
 * that asks for a particular factor has to speak the shell's units, and this is
 * the one place the two numbers are compared: if the shell's constant changes,
 * the factor assertions below move with it.
 */
const ZOOM_PER_WHEEL_PIXEL = 0.0015;

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

/**
 * Builds a fixture document.
 *
 * @param nodes - Nodes keyed by id.
 * @param root - Id of the root node.
 * @param name - Value of `meta.name`.
 * @returns The document, ready to be written as JSON.
 */
function document(nodes: Record<string, FixtureNode>, root: string, name: string): unknown {
    return {
        format: 'jsmind_v2',
        meta: { name, author: 'tests', version: '1.0' },
        root,
        nodes,
        edges: {},
    };
}

/** A five-node map. */
function smallMap(): unknown {
    const node = (id: string, value: string, parent: string | null, children: string[]): FixtureNode => ({
        id,
        content: { type: 'text', value },
        parent,
        children,
        folded: false,
        side: parent === null ? 0 : 1,
        data: {},
    });
    return document(
        {
            root: node('root', 'Offline root', null, ['a', 'b', 'c']),
            a: node('a', 'First', 'root', []),
            b: node('b', 'Second', 'root', []),
            c: node('c', 'Third', 'root', ['c1']),
            c1: node('c1', 'Fourth', 'c', []),
        },
        'root',
        'Small offline map'
    );
}

/**
 * A map bigger than any window: eight branches of eight nodes, plus a six-level
 * chain, so it overflows both axes.
 *
 * @returns The document and the number of nodes it contains.
 */
function bigMap(): { document: unknown; nodeCount: number } {
    const nodes: Record<string, FixtureNode> = {};
    const branches: string[] = [];
    const side = (index: number): number => (index % 2 === 0 ? 1 : -1);

    for (let branch = 0; branch < 8; branch += 1) {
        const id = `c${branch}`;
        const leaves: string[] = [];
        for (let leaf = 0; leaf < 8; leaf += 1) {
            const leafId = `${id}_${leaf}`;
            leaves.push(leafId);
            nodes[leafId] = {
                id: leafId,
                content: { type: 'text', value: `分支 ${branch}.${leaf} 的说明文字` },
                parent: id,
                children: [],
                folded: false,
                side: side(branch),
                data: {},
            };
        }
        branches.push(id);
        nodes[id] = {
            id,
            content: { type: 'text', value: `主题 ${branch}` },
            parent: 'root',
            children: leaves,
            folded: false,
            side: side(branch),
            data: {},
        };
    }

    for (let depth = 0; depth < 6; depth += 1) {
        const id = `chain${depth}`;
        nodes[id] = {
            id,
            content: { type: 'text', value: `链路第 ${depth} 层` },
            parent: depth === 0 ? 'root' : `chain${depth - 1}`,
            children: [],
            folded: false,
            side: 1,
            data: {},
        };
        if (depth > 0) {
            nodes[`chain${depth - 1}`]!.children.push(id);
        }
    }
    branches.push('chain0');
    nodes.root = {
        id: 'root',
        content: { type: 'text', value: '大图' },
        parent: null,
        children: branches,
        folded: false,
        side: 0,
        data: {},
    };

    return { document: document(nodes, 'root', 'Big offline map'), nodeCount: Object.keys(nodes).length };
}

/**
 * Runs the built CLI as a real child process.
 *
 * @param args - Arguments after the program name.
 * @param env - Extra environment for the child.
 * @returns Exit code and what was written to both streams.
 */
function runCli(args: string[], env: NodeJS.ProcessEnv = {}): {
    code: number;
    stdout: string;
    stderr: string;
} {
    const result = spawnSync(process.execPath, [CLI, ...args], {
        encoding: 'utf8',
        timeout: 60_000,
        env: { ...process.env, ...env },
    });
    return { code: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/**
 * Writes one fixture and exports it.
 *
 * @param data - Document to write.
 * @param body - What to do with the paths once the export succeeded.
 * @param env - Extra environment for the CLI.
 */
async function withExportedPage(
    data: unknown,
    body: (paths: { dir: string; output: string }) => Promise<void>,
    env: NodeJS.ProcessEnv = {}
): Promise<void> {
    const dir = mkdtempSync(join(tmpdir(), 'jsmind-export-html-ui-'));
    const file = join(dir, 'map.json');
    const output = join(dir, 'page.html');
    writeFileSync(file, JSON.stringify(data), 'utf8');

    try {
        const run = runCli(['export', 'html', file, output, '--json'], env);
        assert.strictEqual(run.code, 0, run.stderr);
        assert.deepStrictEqual(JSON.parse(run.stdout), { file, output });
        await body({ dir, output });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

test('ui - export html writes one page that renders over file:// with no browser of its own', async () => {
    // CHROME_PATH pointed at nothing proves the point of the kind: an image
    // export would fail on that setting, this one must not look for a browser.
    await withExportedPage(
        smallMap(),
        async ({ dir, output }) => {
            assert.deepStrictEqual(readdirSync(dir).sort(), ['map.json', 'page.html'], 'no companion files');
            assert.doesNotMatch(readFileSync(output, 'utf8'), /\s(?:src|href)\s*=\s*["']/);

            const harness = await BrowserHarness.launch();
            try {
                await harness.setViewport(1200, 800);
                await harness.navigate(pathToFileURL(output).href);

                const rendered = await harness.evaluate<{
                    title: string;
                    nodes: number;
                    size: [number, number];
                    errorShown: boolean;
                }>(`(() => {
                    const host = document.getElementById('jsmind');
                    const root = host.shadowRoot;
                    const nodes = [...root.querySelectorAll('.jsmind-node')];
                    const box = nodes[0].getBoundingClientRect();
                    const error = document.getElementById('jsmind-error');
                    return {
                        title: document.title,
                        nodes: nodes.length,
                        size: [Math.round(box.width), Math.round(box.height)],
                        errorShown: error !== null && !error.hidden,
                    };
                })()`);

                assert.strictEqual(rendered.title, 'Small offline map');
                assert.strictEqual(rendered.nodes, 5, 'every node in the document is rendered');
                assert.ok(rendered.size[0] > 0 && rendered.size[1] > 0, 'nodes are laid out, not collapsed');
                assert.strictEqual(rendered.errorShown, false, 'the page reports no failure');
            } finally {
                await harness.close();
            }
        },
        { CHROME_PATH: '/nonexistent/chromium' }
    );
});

/**
 * Reads every rendered node's painted box, in viewport pixels.
 *
 * @remarks
 * Viewport coordinates rather than box-relative ones on purpose: a wheel event
 * is dispatched in viewport coordinates, so this is the space the anchor
 * assertion lives in.
 *
 * @param harness - Browser to read from.
 * @returns One box per rendered node.
 */
async function paintedNodes(harness: BrowserHarness): Promise<
    { left: number; top: number; right: number; bottom: number; width: number; height: number }[]
> {
    return await harness.evaluate(
        `[...document.getElementById('jsmind').shadowRoot.querySelectorAll('.jsmind-node')].map(el => {
            const rect = el.getBoundingClientRect();
            return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
        })`
    );
}

/**
 * Reads the touch behaviour the shell has put on the map's host.
 *
 * @remarks
 * What the browser will let a finger do on the map: `none` means a drag is the
 * map's, `auto` means it is the page's. Reading it through `getComputedStyle`
 * rather than the inline value keeps the assertion about the behaviour a device
 * sees, and it is the only state that decides this - `preventDefault` on the
 * press cannot stop a touch pan.
 *
 * @param harness - Browser to read from.
 * @returns The computed `touch-action` of the host element.
 */
async function touchActionOf(harness: BrowserHarness): Promise<string> {
    return await harness.evaluate<string>('getComputedStyle(document.getElementById(\'jsmind\')).touchAction');
}

test('ui - the wheel zooms about the pointer on an exported page', async () => {
    const { document: data } = bigMap();

    await withExportedPage(data, async ({ output }) => {
        const harness = await BrowserHarness.launch();
        try {
            await harness.setViewport(1200, 800);
            await harness.navigate(pathToFileURL(output).href);

            const opened = await paintedNodes(harness);
            const centres = opened.map(node => ({
                x: node.left + node.width / 2,
                y: (node.top + node.bottom) / 2,
            }));
            const onScreen = (point: { x: number; y: number }): boolean =>
                point.x > 50 && point.x < 1150 && point.y > 50 && point.y < 750;
            const distanceFromMiddle = (point: { x: number; y: number }): number =>
                Math.hypot(point.x - 600, point.y - 400);

            // Aim at the node furthest from the middle of the window. A zoom
            // anchored anywhere else - or one that ignored the pointer - moves
            // that node instead of holding it, and a node near the middle would
            // hardly move even under a wrong anchor, so the choice is the test.
            let aimIndex = -1;
            for (const [index, point] of centres.entries()) {
                if (!onScreen(point)) {
                    continue;
                }
                if (aimIndex < 0 || distanceFromMiddle(point) > distanceFromMiddle(centres[aimIndex]!)) {
                    aimIndex = index;
                }
            }
            assert.notStrictEqual(aimIndex, -1, 'some node centre should be on screen to aim at');
            const aim = centres[aimIndex]!;
            assert.ok(
                distanceFromMiddle(aim) > 150,
                `the aim point should be well off the middle of the window: ${distanceFromMiddle(aim).toFixed(0)}px`
            );

            const scrollBefore = await harness.evaluate<[number, number]>('[window.scrollX, window.scrollY]');

            // One upward notch: the map gets bigger, and the point under the
            // pointer stays under it.
            await harness.wheelAt(aim.x, aim.y, -400);
            await harness.settle();

            const zoomed = await paintedNodes(harness);
            const scale = zoomed[aimIndex]!.width / opened[aimIndex]!.width;
            assert.ok(scale > 1.5, `one long wheel notch should zoom in well past 1.5x, got ${scale.toFixed(2)}`);

            const pinned = zoomed[aimIndex]!;
            const pinnedCentre = {
                x: pinned.left + pinned.width / 2,
                y: (pinned.top + pinned.bottom) / 2,
            };
            assert.ok(
                Math.abs(pinnedCentre.x - aim.x) < 2 && Math.abs(pinnedCentre.y - aim.y) < 2,
                `the node under the pointer should stay under it: ${aim.x.toFixed(1)}/${aim.y.toFixed(1)} -> ` +
                    `${pinnedCentre.x.toFixed(1)}/${pinnedCentre.y.toFixed(1)}`
            );

            // The wheel belongs to the map: the page around it is not scrolled
            // by the same gesture.
            const scrollAfter = await harness.evaluate<[number, number]>('[window.scrollX, window.scrollY]');
            assert.deepStrictEqual(scrollAfter, scrollBefore, 'zooming should not scroll the page');
        } finally {
            await harness.close();
        }
    });
});

/**
 * Parses the translate and scale a viewport transform carries.
 *
 * @remarks
 * The origin is `-translate / scale`, so reading it this way is how a test can
 * talk about where the view is looking without the page exposing its instance.
 *
 * @param transform - Value of the inner box's `transform` property.
 * @returns The translate in screen pixels and the scale it is paired with.
 */
function translateOf(transform: string): { x: number; y: number; scale: number } {
    const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(transform);
    assert.ok(match, `expected a translate+scale transform, got "${transform}"`);
    return { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) };
}

/**
 * Reads the transform the view has written on the inner box.
 *
 * @param harness - Browser to read from.
 * @returns The value of the `transform` property.
 */
async function innerTransform(harness: BrowserHarness): Promise<string> {
    return await harness.evaluate<string>(
        `(() => {
            const inner = document.getElementById('jsmind').shadowRoot.querySelector('.jsmind-inner');
            return inner.style.transform;
        })()`
    );
}

test('ui - a drag pans the map on an exported page', async () => {
    // The shell owns the gesture (`artifact/shell.js`), so this is the only
    // place the shipped pointer handling is exercised: a real mouse, on the page
    // a reader double-clicks. The library-level arithmetic is pinned in
    // `viewport.test.ts`; here the claim is that pointer travel reaches it.
    const { document: data } = bigMap();

    await withExportedPage(data, async ({ output }) => {
        const harness = await BrowserHarness.launch();
        try {
            await harness.setViewport(1200, 800);
            await harness.navigate(pathToFileURL(output).href);

            // Zoomed in so there is room to pan in the first place. The page
            // opens at 1x and writes no transform, so the factor to reach is a
            // constant and the wheel delta follows from it.
            const targetScale = 3;
            await harness.wheelAt(600, 400, -Math.log(targetScale) / ZOOM_PER_WHEEL_PIXEL);
            await harness.settle();
            const zoomed = await innerTransform(harness);
            assert.match(zoomed, /scale\(/, 'the wheel should have zoomed the map');
            assert.ok(
                translateOf(zoomed).scale > targetScale * 0.99,
                `the map should be zoomed well past 1x: ${translateOf(zoomed).scale}`
            );

            // A drag to the content's top-left corner first, so the measured
            // gesture below has room in its direction and cannot be clamped -
            // clamping is the viewport suite's claim, not this one's.
            for (let attempt = 0; attempt < 2; attempt += 1) {
                await harness.dragBy({ x: 300, y: 250 }, 400, 300);
            }
            const corner = await innerTransform(harness);

            const before_ = await paintedNodes(harness);
            const scrollBefore = await harness.evaluate<[number, number]>('[window.scrollX, window.scrollY]');

            const travel = { x: -240, y: -160 };
            await harness.dragBy({ x: 700, y: 550 }, travel.x, travel.y);

            const after_ = await paintedNodes(harness);
            const moved = await innerTransform(harness);

            assert.strictEqual(after_.length, before_.length, 'the same nodes are still on the page');
            for (const [index, was] of before_.entries()) {
                const now = after_[index]!;
                assert.ok(
                    Math.abs(now.left - was.left - travel.x) < 0.5 &&
                        Math.abs(now.top - was.top - travel.y) < 0.5,
                    `node ${index} moved ${(now.left - was.left).toFixed(2)}/${(now.top - was.top).toFixed(2)}, not ${travel.x}/${travel.y}`
                );
            }

            // The same movement in the state the shell wrote: the translate is
            // `-origin * scale`, so a drag of `travel` changes it by `travel`
            // itself - the scale cancels.
            const at = translateOf(corner);
            const now = translateOf(moved);
            assert.ok(
                Math.abs(now.x - at.x - travel.x) < 0.5 && Math.abs(now.y - at.y - travel.y) < 0.5,
                `the transform should have moved by ${travel.x}/${travel.y}: ${corner} -> ${moved}`
            );

            // The drag belongs to the map: the page around it does not scroll,
            // and the press does not select any text on the way.
            const scrollAfter = await harness.evaluate<[number, number]>('[window.scrollX, window.scrollY]');
            assert.deepStrictEqual(scrollAfter, scrollBefore, 'dragging the map should not scroll the page');
            const selected = await harness.evaluate<string>('String(window.getSelection())');
            assert.strictEqual(selected, '', 'a drag should not select text');
        } finally {
            await harness.close();
        }
    });
});

test('ui - the map claims touch drags only while a pan has room', async (t: TestContext) => {
    // `touch-action: none` is what turns a finger drag into a pan instead of a
    // page scroll, and the browser settles it before the gesture starts - so it
    // has to be decided from the state the reader is in, not once at load.
    //
    // The page opens unfitted, at the map's natural size, and this map is
    // larger than the window - so the first answer is `none`: a finger drag is
    // the map's, and nothing else would move it. Zooming out far enough closes
    // the band and hands the gesture back to the page; zooming back in opens it
    // again.
    //
    // The factor in the middle of that range is the case a `scale > 1` rule
    // gets wrong: below 1x the content already overflows, nothing on the page
    // can scroll, and a drag handed to the page would be a region no finger can
    // move. The rule is the view's own `canPan` for exactly that reason.
    const { document: data } = bigMap();

    await withExportedPage(data, async ({ output }) => {
        const harness = await BrowserHarness.launch();
        try {
            await harness.setViewport(1200, 800);
            await harness.navigate(pathToFileURL(output).href);

            assert.strictEqual(
                await innerTransform(harness),
                'none',
                'the page opens at 1x with no fit applied, and the box has been taken over'
            );
            assert.strictEqual(await touchActionOf(harness), 'none', 'overflowing at 1x, a finger drag belongs to the map');

            // Out until the whole map is inside the window: the band closes and
            // the gesture goes back to the page.
            await harness.wheelAt(600, 400, 4000);
            await harness.settle();
            const out = translateOf(await innerTransform(harness));
            assert.ok(out.scale < 1, `zoomed far out the whole map is inside, got ${out.scale}`);
            assert.strictEqual(await touchActionOf(harness), 'auto', 'fitted, the touch scroll is the page\'s');

            // And back in, but only part of the way: a factor below 1x that
            // still overflows the window. The wheel is asked for the factor
            // rather than given a notch, because where the band opens depends
            // on the map's size and that depends on the fonts this machine has.
            const target = 0.6;
            await harness.wheelAt(600, 400, -Math.log(target / out.scale) / ZOOM_PER_WHEEL_PIXEL);
            await harness.settle();
            const zoomed = translateOf(await innerTransform(harness));
            assert.ok(
                Math.abs(zoomed.scale - target) < 0.02 && zoomed.scale < 1,
                `the map should be inside 1x but past the fit, got ${zoomed.scale}`
            );
            assert.strictEqual(await touchActionOf(harness), 'none', 'overflowing below 1x, a finger drag belongs to the map');

            // A zoom anchored on the pointer leaves the origin wherever the
            // arithmetic put it, and that can be outside the band a pan may
            // travel in - the first drag would then snap it back into the band
            // and move further than the hand did. Push it to the content's near
            // edge first, which is exactly where that clamp lands, so the
            // measured gesture below has room in its own direction.
            await harness.dragBy({ x: 700, y: 550 }, 0, 400);
            const settled = translateOf(await innerTransform(harness));
            assert.ok(settled.scale === zoomed.scale, 'the warm-up drag moves the map, not the zoom');

            // The claimed gesture really pans: a value the handler then ignored
            // would read the same. Only the axes whose content overflows may
            // move - this map is taller than it is wide.
            const before_ = await paintedNodes(harness);
            const extent = {
                left: Math.min(...before_.map(node => node.left)),
                right: Math.max(...before_.map(node => node.right)),
                top: Math.min(...before_.map(node => node.top)),
                bottom: Math.max(...before_.map(node => node.bottom)),
            };
            const room = {
                x: extent.right - extent.left > 1200 + 1,
                y: extent.bottom - extent.top > 800 + 1,
            };
            assert.strictEqual(room.x || room.y, true, 'the map should overflow at this zoom, or the case proves nothing');

            await harness.dragBy({ x: 700, y: 550 }, -120, -80);
            const after_ = await paintedNodes(harness);
            for (const [index, was] of before_.entries()) {
                const now = after_[index]!;
                const expectedX: number = room.x ? -120 : 0;
                const expectedY: number = room.y ? -80 : 0;
                assert.ok(
                    Math.abs(now.left - was.left - expectedX) < 1 && Math.abs(now.top - was.top - expectedY) < 1,
                    `node ${index} moved ${(now.left - was.left).toFixed(1)}/${(now.top - was.top).toFixed(1)}, not ${expectedX}/${expectedY}`
                );
            }

            // The double-click - the other path that changes the zoom - is
            // re-decided too, and it is the one gesture that fits the page: from
            // this zoomed-in state it puts the whole map inside the window and
            // hands the gesture back to the page.
            await harness.doubleClickAt(600, 400);
            const returned = translateOf(await innerTransform(harness));
            const touchReturned = await touchActionOf(harness);

            assert.ok(returned.scale < 1, `a map larger than the window fits below 1x, got ${returned.scale}`);
            assert.strictEqual(touchReturned, 'auto', 'and the fit handed the gesture back to the page');

            t.diagnostic(
                'touch-action: open 1x -> none, ' +
                    `wheel out ${out.scale.toFixed(4)} -> auto, ` +
                    `wheel ${zoomed.scale.toFixed(4)} -> none, ` +
                    `dblclick ${returned.scale.toFixed(4)} -> ${touchReturned}`
            );
        } finally {
            await harness.close();
        }
    });
});

/**
 * Measures the exported page the way a reader meets it.
 *
 * @remarks
 * Everything the case is about, in one round trip: how many nodes the document
 * has, where the page's own scroll limits are, how big the map's host is, what
 * transform the view has written (`none` means nothing has moved the map yet),
 * what the inner box's `overflow` says, how much of its width and height a
 * scrollbar has taken from it, and what a written scroll offset does to it, how
 * many nodes are past the window's edge, how many the window actually shows, and
 * where the painted map's centre sits.
 *
 * `getBoundingClientRect` ignores clipping, so the count of painted nodes is
 * taken through an `IntersectionObserver` against the window instead: a node
 * inside a clipped edge has a rect and is still not shown.
 *
 * @param harness - Browser to measure.
 * @returns The measurement.
 */
async function measurePage(harness: BrowserHarness): Promise<{
    nodes: number;
    page: [number, number];
    window: [number, number];
    host: [number, number];
    transform: string;
    overflow: string;
    gap: [number, number];
    scrolled: [number, number];
    outside: number;
    centre: [number, number];
    painted: number;
}> {
    return await harness.evaluate<{
        nodes: number;
        page: [number, number];
        window: [number, number];
        host: [number, number];
        transform: string;
        overflow: string;
        gap: [number, number];
        scrolled: [number, number];
        outside: number;
        centre: [number, number];
        painted: number;
    }>(`(async () => {
        const host = document.getElementById('jsmind');
        const root = host.shadowRoot;
        const nodes = [...root.querySelectorAll('.jsmind-node')];
        const rects = nodes.map(node => node.getBoundingClientRect());
        const inner = root.querySelector('.jsmind-inner');

        const seen = new Set();
        const observer = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    seen.add(entry.target);
                }
            }
        }, { root: null });
        nodes.forEach(node => observer.observe(node));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        observer.disconnect();

        const page = document.scrollingElement;
        // What this box does with a scroll offset, then put the offset back:
        // while native scrolling is in charge the write moves the map, and once
        // the viewport has taken the box over it moves nothing.
        inner.scrollLeft = 999;
        inner.scrollTop = 999;
        const scrolled = [inner.scrollLeft, inner.scrollTop];
        inner.scrollLeft = 0;
        inner.scrollTop = 0;
        return {
            nodes: nodes.length,
            page: [page.scrollWidth, page.scrollHeight],
            window: [window.innerWidth, window.innerHeight],
            host: [host.clientWidth, host.clientHeight],
            transform: inner.style.transform,
            overflow: getComputedStyle(inner).overflow,
            gap: [inner.offsetWidth - inner.clientWidth, inner.offsetHeight - inner.clientHeight],
            scrolled,
            outside: rects.filter(rect =>
                rect.left < -1 || rect.top < -1 || rect.right > window.innerWidth + 1 || rect.bottom > window.innerHeight + 1
            ).length,
            centre: [
                (Math.min(...rects.map(rect => rect.left)) + Math.max(...rects.map(rect => rect.right))) / 2,
                (Math.min(...rects.map(rect => rect.top)) + Math.max(...rects.map(rect => rect.bottom))) / 2,
            ],
            painted: seen.size,
        };
    })()`, true);
}

test('ui - an exported page opens unfitted, and a double-click fits the whole map', async (t: TestContext) => {
    // The requirement this case exists for: `fitToView` is a method, not a
    // default action. A page that renders a map shows it at the size its text
    // was written for, cropped by the window like any canvas - so a large map
    // opening cropped is the point here, not a regression. It is what proves
    // nothing fitted the map behind the reader's back, which a reading of
    // "every node is inside" alone could never tell apart from a page that
    // quietly shrank the map to a wall of unreadable text.
    //
    // What must hold either way is that the *page* does not grow a scrollbar:
    // the map's own viewport is what moves, and the double-click - the one
    // gesture that asks for the whole map - puts all of it back inside the
    // window without the page scrolling to reach it.
    const { document: data, nodeCount } = bigMap();

    await withExportedPage(data, async ({ output }) => {
        const harness = await BrowserHarness.launch();
        try {
            await harness.setViewport(1200, 800);
            await harness.navigate(pathToFileURL(output).href);

            const opened = await measurePage(harness);

            assert.strictEqual(opened.nodes, nodeCount, 'the whole document is rendered');
            assert.deepStrictEqual(opened.page, opened.window, 'the page itself has nothing to scroll');
            assert.deepStrictEqual(opened.host, opened.window, 'the host stayed the size of the window');
            assert.strictEqual(opened.transform, 'none', 'nothing has moved the map: the page opens it at 1x, unfitted');
            assert.strictEqual(
                opened.overflow,
                'visible',
                'the box is taken over at open: nothing the reader does later can make it start scrolling'
            );
            assert.deepStrictEqual(
                opened.gap,
                [0, 0],
                'no scrollbar has taken width or height from the box, so taking it over reveals the whole canvas instead of growing it'
            );
            // The gap above is the measurement a browser with visible
            // scrollbars gives; this harness runs Chromium with
            // `--hide-scrollbars`, so it reports `[0, 0]` for a box that still
            // scrolls and cannot tell the two states apart (measured: `auto`
            // and a gap of `[0, 0]` with the takeover removed). The offset that
            // box accepts is what can be observed here, and taking the box over
            // takes it away.
            assert.deepStrictEqual(
                opened.scrolled,
                [0, 0],
                'the box does not scroll: a scroll offset written at open leaves it where it was'
            );
            assert.ok(
                opened.outside > 0,
                `a map larger than the window is cropped at 1x, so some node is past the edge, but all ${nodeCount} are inside`
            );
            assert.ok(
                opened.painted < nodeCount,
                `only the part of the map that fits is shown: ${opened.painted}/${nodeCount}`
            );

            // The reader asks for the whole map. `'shrink'` is the mode the page
            // uses, so the map is scaled down until it fits and centred; a page
            // that opened already fitted would land on these same numbers, which
            // is why the transform before this line had to be the identity.
            await harness.doubleClickAt(600, 400);
            const fitted = await measurePage(harness);

            const scale = translateOf(fitted.transform).scale;
            assert.ok(scale > 0 && scale < 1, `a map larger than the window fits below 1x, got ${scale}`);
            assert.strictEqual(fitted.outside, 0, 'no node is left outside the window');
            assert.strictEqual(fitted.painted, nodeCount, 'every node is actually shown, not merely inside a clipped edge');
            assert.deepStrictEqual(fitted.page, fitted.window, 'and the page still has nothing to scroll');
            assert.ok(
                Math.abs(fitted.centre[0] - fitted.window[0] / 2) <= 2 && Math.abs(fitted.centre[1] - fitted.window[1] / 2) <= 2,
                `the map should be centred: ${fitted.centre[0].toFixed(1)}/${fitted.centre[1].toFixed(1)} in ${fitted.window.join('x')}`
            );

            // Zoom in and drag away, then double-click again: the same answer
            // field for field, which is what makes the gesture usable twice.
            await harness.wheelAt(600, 400, -400);
            await harness.settle();
            await harness.dragBy({ x: 700, y: 550 }, -260, -180);
            assert.notStrictEqual(await innerTransform(harness), fitted.transform, 'the page really is showing something else');

            await harness.doubleClickAt(600, 400);
            assert.strictEqual(await innerTransform(harness), fitted.transform, 'fitting twice gives the same view');

            t.diagnostic(
                `opened at 1x with ${opened.outside} nodes past the edge (${opened.painted}/${nodeCount} shown), ` +
                    `page ${opened.page.join('x')} in ${opened.window.join('x')}; ` +
                    `fitted at ${scale.toFixed(4)}x, centre ${fitted.centre[0].toFixed(1)}/${fitted.centre[1].toFixed(1)}`
            );
        } finally {
            await harness.close();
        }
    });
});
