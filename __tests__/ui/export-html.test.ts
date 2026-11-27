/**
 * @fileoverview End-to-end `jsmind export html` against a real browser.
 *
 * The page is the product: a reader double-clicks it on a machine that may have
 * no network at all. So this suite drives the built CLI, opens the file it
 * wrote over `file://` — no server, no build, nothing to fetch — and asks the
 * rendered document how many nodes it shows and how big they are. A page that
 * only *looks* right in the source would pass every other check.
 *
 * The second case is the one the design decision is about: a map larger than the
 * window has to be reachable in the window, not cropped to the viewport and not
 * delivered by growing the document either. It opens the page and reads the
 * viewport the page established on its own, then drives real pointer and wheel
 * events the way a reader would.
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

/** Where the page's map is, as the browser painted it. */
interface PaintedMap {
    /** Every rendered node's box, relative to the window. */
    nodes: { left: number; top: number; right: number; bottom: number; width: number }[];
    /** The document's own scroll extent, which must not exceed the window. */
    page: [number, number, number, number];
    /** The map's host, which must stay the size of the window. */
    host: [number, number];
}

/**
 * Reads the painted map back from the page.
 *
 * @param harness - Live browser.
 * @returns Boxes in CSS pixels, the outermost first is not implied: callers
 * take the extremes themselves.
 */
async function paintedMap(harness: BrowserHarness): Promise<PaintedMap> {
    return await harness.evaluate<PaintedMap>(`(() => {
        const host = document.getElementById('jsmind');
        const box = host.getBoundingClientRect();
        const nodes = [...host.shadowRoot.querySelectorAll('.jsmind-node')].map(node => {
            const rect = node.getBoundingClientRect();
            return {
                left: rect.left - box.left,
                top: rect.top - box.top,
                right: rect.right - box.left,
                bottom: rect.bottom - box.top,
                width: rect.width,
            };
        });
        const page = document.documentElement;
        return {
            nodes,
            page: [page.scrollWidth, window.innerWidth, page.scrollHeight, window.innerHeight],
            host: [Math.round(box.width), Math.round(box.height)],
        };
    })()`);
}

test('ui - a map larger than the window is fitted to it and moved by gestures', async () => {
    const { document: data, nodeCount } = bigMap();

    await withExportedPage(data, async ({ output }) => {
        const harness = await BrowserHarness.launch();
        try {
            await harness.setViewport(1200, 800);
            await harness.navigate(pathToFileURL(output).href);

            const opened = await paintedMap(harness);
            assert.strictEqual(opened.nodes.length, nodeCount, 'the whole document is rendered');
            assert.deepStrictEqual(opened.page, [1200, 1200, 800, 800], 'the page itself does not scroll');
            assert.deepStrictEqual(opened.host, [1200, 800], 'the host stays the size of the window');

            // "Reachable" means the whole map, not a corner of it: every node
            // has to be inside the window on open.
            const outside = opened.nodes.filter(
                node => node.left < -1 || node.top < -1 || node.right > 1201 || node.bottom > 801
            );
            assert.strictEqual(outside.length, 0, `${outside.length} nodes are outside the window on open`);

            // A map this size fits by shrinking, so the nodes are smaller than
            // their layout size — that is the fit, measured rather than assumed.
            const root = opened.nodes[0]!;
            assert.ok(root.width < 200, `the fitted map should be scaled down, root is ${root.width.toFixed(1)}px wide`);

            // Dragging moves the map by the distance dragged, and only by that.
            await harness.dragTo(600, 400, 350, 250);
            const dragged = await paintedMap(harness);
            for (const [index, node] of dragged.nodes.entries()) {
                const was = opened.nodes[index]!;
                assert.ok(
                    Math.abs(node.left - (was.left - 250)) < 1 && Math.abs(node.top - (was.top - 150)) < 1,
                    `node ${index} should have moved with the pointer: ` +
                        `${was.left.toFixed(1)}/${was.top.toFixed(1)} -> ${node.left.toFixed(1)}/${node.top.toFixed(1)}`
                );
            }
            assert.deepStrictEqual(dragged.page, [1200, 1200, 800, 800], 'dragging does not scroll the page');

            // The wheel zooms: one upward notch scales the map up, anchored on
            // the pointer, so the node under it keeps its place on screen.
            await harness.wheelAt(500, 400, -400);
            const zoomed = await paintedMap(harness);
            const scale = zoomed.nodes[0]!.width / dragged.nodes[0]!.width;
            assert.ok(scale > 1.5, `one long wheel notch should zoom in well past 1.5x, got ${scale.toFixed(2)}`);

            // At that zoom, a reader can still drag their way to the far corner:
            // the map is bigger than the window, so no single drag crosses it.
            const target = (map: PaintedMap) =>
                map.nodes.reduce((best, node) => (node.right + node.bottom > best.right + best.bottom ? node : best));
            let reached = false;
            for (let attempt = 0; attempt < 10 && !reached; attempt += 1) {
                const corner = target(await paintedMap(harness));
                reached = corner.right <= 1190 && corner.bottom <= 790 && corner.right > 0 && corner.bottom > 0;
                if (reached) {
                    break;
                }
                // Drag the distance still needed, capped at what fits inside the
                // window: a drag longer than the window cannot be dispatched.
                const dx = Math.max(-400, Math.min(400, -(corner.right - 1150)));
                const dy = Math.max(-400, Math.min(400, -(corner.bottom - 750)));
                await harness.dragTo(600, 400, 600 + dx, 400 + dy);
            }
            assert.strictEqual(reached, true, 'the far corner of the map is reachable by dragging at 2x');

            // One gesture returns to the fitted view the page opened with.
            await harness.doubleClickAt(400, 300);
            const reset = await paintedMap(harness);
            for (const [index, node] of reset.nodes.entries()) {
                assert.ok(
                    Math.abs(node.left - opened.nodes[index]!.left) < 1 &&
                        Math.abs(node.top - opened.nodes[index]!.top) < 1,
                    `node ${index} should be back where it opened`
                );
            }
            assert.deepStrictEqual(reset.page, [1200, 1200, 800, 800]);
        } finally {
            await harness.close();
        }
    });
});
