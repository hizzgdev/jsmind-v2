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
 * the window must be reachable by scrolling the page, not cropped to the
 * viewport. It measures the corners after scrolling there.
 *
 * It drives `dist/cli.js`, so it needs a build and a Chromium binary.
 */

import { test } from 'node:test';
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

test('ui - a map larger than the window scrolls into view instead of being cropped', async () => {
    const { document: data, nodeCount } = bigMap();

    await withExportedPage(data, async ({ output }) => {
        const harness = await BrowserHarness.launch();
        try {
            await harness.setViewport(1200, 800);
            await harness.navigate(pathToFileURL(output).href);

            const before = await harness.evaluate<{
                nodes: number;
                scrolls: [boolean, boolean];
                host: [number, number];
            }>(`(() => {
                const host = document.getElementById('jsmind');
                const nodes = host.shadowRoot.querySelectorAll('.jsmind-node');
                const page = document.documentElement;
                return {
                    nodes: nodes.length,
                    scrolls: [page.scrollWidth > window.innerWidth, page.scrollHeight > window.innerHeight],
                    host: [host.clientWidth, host.clientHeight],
                };
            })()`);

            assert.strictEqual(before.nodes, nodeCount, 'the whole document is rendered');
            assert.strictEqual(before.scrolls[0], true, 'the page scrolls horizontally');
            assert.strictEqual(before.scrolls[1], true, 'the page scrolls vertically');
            assert.ok(before.host[0] > 1200 && before.host[1] > 800, 'the host grew past the viewport');

            // Scroll to the far corner: two nodes that were off-screen must now
            // be inside the window, which is what "not cropped" means.
            const after = await harness.evaluate<{ scroll: [number, number]; visible: boolean }>(
                `(() => {
                    window.scrollTo(document.documentElement.scrollWidth, document.documentElement.scrollHeight);
                    return new Promise(resolve => requestAnimationFrame(() => {
                        const nodes = [...document.getElementById('jsmind').shadowRoot.querySelectorAll('.jsmind-node')];
                        const right = Math.max(...nodes.map(node => node.getBoundingClientRect().right));
                        const bottom = Math.max(...nodes.map(node => node.getBoundingClientRect().bottom));
                        resolve({
                            scroll: [window.scrollX, window.scrollY],
                            visible: right <= window.innerWidth + 1 && bottom <= window.innerHeight + 1,
                        });
                    }));
                })()`,
                true
            );

            assert.ok(after.scroll[0] > 0 && after.scroll[1] > 0, 'the page actually scrolled');
            assert.strictEqual(after.visible, true, 'the far corner of the map is reachable');
        } finally {
            await harness.close();
        }
    });
});
