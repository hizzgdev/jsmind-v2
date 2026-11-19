/**
 * @fileoverview Regression: playground node clicks still update the info bar
 * after the view moved rendering into a shadow root, and do not warn
 * `Node not found`.
 *
 * @remarks
 * PR #19 put nodes inside a shadow root. The playground listened on
 * `#jsmind_container` and walked `event.target` via `parentElement`. Shadow
 * DOM retargets the click, so `event.target` is the container itself, the
 * walk finds no node, and the info bar is cleared to `-`.
 *
 * A later failure: `JsMind.create` reuses the host's shadow root when a map
 * is reloaded (the playground Reset button does this). Previous
 * `.jsmind-inner` trees were left in place, so a click could hit a stale
 * `.jsmind-node` whose id is no longer in `window.mind`. The handler then
 * logged `Node not found` and left Node Content as `-`.
 *
 * This test opens the real playground page, asserts a shadow root is present,
 * then dispatches genuine mouse clicks — not an internal query helper. It
 * also reads Console Output after a click, and again after Reset then a click.
 */

import { test, before, after } from 'node:test';
import type { TestContext } from 'node:test';
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

/** One line from the playground Console Output panel. */
interface ConsoleLine {
    type: string;
    text: string;
}

/** The right-hand column as the browser lays it out. */
interface ReadOnlyPanels {
    headers: string[];
    setupText: string;
    setupFontSize: number;
    initFontSize: number;
    editorFontSize: number;
    setupOverflow: number;
    initOverflow: number;
    heights: number[];
    prismLoaded: boolean;
    prismRequested: boolean;
    setupTokens: number;
    initTokens: number;
    setupColors: string[];
    initColors: string[];
}

/** How long to wait for the CDN copy of Prism before calling it unreachable. */
const PRISM_TIMEOUT_MS = 10_000;

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
 *
 * @param expectedNodeCount - When set, also waits until the shadow root
 * contains exactly this many `.jsmind-node` elements. Used after Reset so a
 * leftover previous map cannot be mistaken for a finished reload.
 */
async function waitForPlayground(expectedNodeCount?: number): Promise<void> {
    const countCheck = expectedNodeCount === undefined
        ? 'nodes.length >= 3'
        : `nodes.length === ${expectedNodeCount}`;
    const ready = await browser.evaluate<boolean>(
        `(async () => {
            const deadline = Date.now() + ${READY_TIMEOUT_MS};
            while (Date.now() < deadline) {
                const container = document.getElementById('jsmind_container');
                const nodes = container?.shadowRoot?.querySelectorAll('.jsmind-node') ?? [];
                if (window.mind && container?.shadowRoot && ${countCheck}) {
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

/**
 * Reads the playground Console Output panel.
 *
 * @returns Each line's level and full text.
 */
async function consoleLines(): Promise<ConsoleLine[]> {
    return browser.evaluate<ConsoleLine[]>(`[...document.querySelectorAll('#console-output .console-line')].map(el => ({
        type: [...el.classList].find(name => name !== 'console-line') || '',
        text: el.textContent,
    }))`);
}

/**
 * Asserts that Console Output has no `Node not found` warning.
 *
 * @param lines - Lines currently shown in the panel.
 * @param when - Included in the assertion message.
 */
function assertNoNodeNotFoundWarning(lines: ConsoleLine[], when: string): void {
    const warnings = lines.filter(line => line.type === 'warn' && line.text.includes('Node not found'));
    assert.strictEqual(warnings.length, 0, `${when} should not warn "Node not found"; got: ${
        warnings.map(line => line.text).join(' | ') || 'no matching warns'
    }`);
}

/**
 * Locates a painted node and a blank point inside the map container.
 *
 * @param label - Preferred node label, falling back to another rendered node.
 * @returns Geometry and ids, plus whether a shadow root is present.
 */
async function clickSetup(label = 'Node 1'): Promise<{
    hasShadowRoot: boolean;
    nodeCount: number;
    innerCount: number;
    node: NodeTarget | null;
    blank: Point | null;
}> {
    return browser.evaluate(`(() => {
        const container = document.getElementById('jsmind_container');
        const shadowRoot = container && container.shadowRoot;
        const nodes = shadowRoot ? [...shadowRoot.querySelectorAll('.jsmind-node')] : [];
        const chosen = nodes.find(el => el.textContent.trim() === ${JSON.stringify(label)})
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
            nodeCount: nodes.length,
            innerCount: shadowRoot ? shadowRoot.querySelectorAll('.jsmind-inner').length : 0,
            node,
            blank,
        };
    })()`);
}

test('ui - playground header contains a visible link to the jsmind-v2 repository', async () => {
    const link = await browser.evaluate<{
        href: string;
        target: string;
        rel: string;
        text: string;
        inHeader: boolean;
    }>(`(() => {
        const header = document.querySelector('.header');
        const a = header && header.querySelector('a[href="https://github.com/hizzgdev/jsmind-v2"]');
        return {
            href: a ? a.getAttribute('href') || '' : '',
            target: a ? a.getAttribute('target') || '' : '',
            rel: a ? a.getAttribute('rel') || '' : '',
            text: a ? a.textContent.replace(/\\s+/g, ' ').trim() : '',
            inHeader: !!(header && a),
        };
    })()`);
    assert.ok(link.inHeader, 'the repository link should be inside the header');
    assert.strictEqual(link.href, 'https://github.com/hizzgdev/jsmind-v2');
    assert.strictEqual(link.target, '_blank');
    assert.ok(link.rel.split(/\s+/).includes('noopener'), 'the link should use rel=noopener');
    assert.ok(link.text.includes('jsmind-v2'), 'the link should visibly name the jsmind-v2 project');
});

test('ui - the right column shows the CDN setup line above the read-only code, both smaller and highlighted', async (t: TestContext) => {
    const view = await browser.evaluate<ReadOnlyPanels>(
        `(async () => {
            const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

            // Prism is fetched from a CDN, so give it a bounded chance to
            // arrive. Without it the page is expected to keep working, and
            // only the colour assertions are skipped.
            const deadline = Date.now() + ${PRISM_TIMEOUT_MS};
            while (Date.now() < deadline && !window.Prism) {
                await sleep(100);
            }
            if (window.Prism) {
                const paintDeadline = Date.now() + 2000;
                while (Date.now() < paintDeadline && !document.querySelector('#init-code-editor .token')) {
                    await sleep(50);
                }
            }

            const sections = [...document.querySelectorAll('.right-panel .code-section')];
            const setupCode = document.getElementById('setup-code');
            const setupPre = setupCode ? setupCode.closest('pre') : null;
            const initPre = document.querySelector('#init-code-editor pre');
            const initCode = initPre ? initPre.querySelector('code') : null;
            const textarea = document.querySelector('#code-editor textarea');
            const fontSize = el => (el ? Number.parseFloat(getComputedStyle(el).fontSize) : 0);
            const colors = el => (el
                ? [...new Set([...el.querySelectorAll('.token')].map(token => getComputedStyle(token).color))]
                : []);

            return {
                headers: sections.map(section => section.querySelector('.panel-header').textContent),
                setupText: setupCode ? setupCode.textContent : '',
                setupFontSize: fontSize(setupCode),
                initFontSize: fontSize(initCode),
                editorFontSize: fontSize(textarea),
                setupOverflow: setupPre ? setupPre.scrollWidth - setupPre.clientWidth : -1,
                initOverflow: initPre ? initPre.scrollWidth - initPre.clientWidth : -1,
                heights: sections.map(section => Math.round(section.getBoundingClientRect().height)),
                prismLoaded: Boolean(window.Prism),
                prismRequested: [...document.scripts].some(script => script.src.includes('prism.min.js')),
                setupTokens: setupCode ? setupCode.querySelectorAll('.token').length : 0,
                initTokens: initCode ? initCode.querySelectorAll('.token').length : 0,
                setupColors: colors(setupCode),
                initColors: colors(initCode),
            };
        })()`,
        true
    );

    assert.deepStrictEqual(
        view.headers,
        ['Setup (Read-only)', 'Initialization Code (Read-only)', 'Code Editor'],
        'the right column should read Setup, then Initialization Code, then Code Editor'
    );

    // The escaped tag is shown as text: the page itself keeps loading the local
    // bundle, and @2 (not @latest, still v1) is the range the docs advertise.
    assert.strictEqual(
        view.setupText,
        '<script type="module" src="https://cdn.jsdelivr.net/npm/jsmind@2/dist/jsmind.js"></script>',
        'the Setup block should show the CDN script tag as text'
    );

    assert.ok(
        view.setupFontSize > 0 && view.setupFontSize <= 13,
        `the Setup block should be set around 12px, got ${view.setupFontSize}px`
    );
    assert.ok(
        view.initFontSize > 0 && view.initFontSize <= 13,
        `the read-only initialization code should be set around 12px, got ${view.initFontSize}px`
    );
    assert.strictEqual(view.editorFontSize, 14, 'the editable textarea should keep its 14px type');
    assert.ok(
        view.setupFontSize < view.editorFontSize && view.initFontSize < view.editorFontSize,
        'both read-only blocks should be smaller than the editable editor'
    );

    // prism-tomorrow wants `white-space: pre`; the read-only blocks have to
    // wrap instead of scrolling sideways.
    assert.ok(view.setupOverflow <= 1, `the Setup block should not overflow sideways, by ${view.setupOverflow}px`);
    assert.ok(view.initOverflow <= 1, `the initialization block should not overflow sideways, by ${view.initOverflow}px`);

    // Setup takes its content height, the initialization block keeps its 35%,
    // and the editor takes what is left.
    assert.ok(
        view.heights[0] < view.heights[1] && view.heights[1] < view.heights[2],
        `expected Setup < Initialization Code < Code Editor, got ${view.heights.join(' / ')}`
    );

    if (!view.prismLoaded) {
        t.diagnostic('Prism did not load from the CDN; colour assertions skipped (plain text is the documented fallback)');
        assert.strictEqual(view.setupTokens, 0, 'without Prism the setup line should stay plain text');
        assert.strictEqual(view.initTokens, 0, 'without Prism the init code should stay plain text');
        return;
    }

    assert.ok(view.prismRequested, 'the page should request Prism from the CDN');
    assert.ok(view.setupTokens > 0, 'the Setup line should be tokenized');
    assert.ok(view.initTokens > 0, 'the initialization code should be tokenized after it is inserted');
    assert.ok(view.setupColors.length > 1, `the Setup line should use more than one token colour, got ${view.setupColors.join(', ')}`);
    assert.ok(view.initColors.length > 1, `the initialization code should use more than one token colour, got ${view.initColors.join(', ')}`);
});

test('ui - playground node clicks update the info bar under a shadow root, and a blank click clears it', async () => {
    const setup = await clickSetup();

    assert.ok(setup.hasShadowRoot, 'the playground must render nodes inside a shadow root');
    assert.ok(setup.node, 'the playground should have a clickable node');
    assert.ok(setup.node.id, 'the clicked node should have a data-jm-node-id');
    assert.ok(setup.blank, 'the playground should have a blank point inside the container');
    assert.strictEqual(setup.nodeCount, 3, 'the initial map should have exactly three nodes');
    assert.strictEqual(setup.innerCount, 1, 'the initial map should have a single inner container');

    const initial = await infoBar();
    assert.strictEqual(initial.nodeId, '-', 'info bar Node ID should start empty');
    assert.strictEqual(initial.content, '-', 'info bar Node Content should start empty');

    const beforeClick = await consoleLines();
    await browser.clickAt(setup.node.x, setup.node.y);
    await browser.settle();

    const selected = await infoBar();
    assert.notStrictEqual(selected.nodeId, '-', 'Node ID should no longer be a dash');
    assert.strictEqual(selected.nodeId, setup.node.id, 'Node ID should match the clicked node');
    assert.notStrictEqual(selected.content, '-', 'Node Content should no longer be a dash');
    assert.strictEqual(selected.content, setup.node.content, 'Node Content should match the clicked node');

    const afterClick = await consoleLines();
    const newLines = afterClick.slice(beforeClick.length);
    assertNoNodeNotFoundWarning(afterClick, 'clicking an existing node on the initial map');
    assert.ok(
        newLines.some(line => line.type === 'log' && line.text.includes('Clicked node:') && line.text.includes(setup.node.id)),
        'clicking a node should log the clicked id'
    );
    assert.ok(
        newLines.some(line => line.type === 'log' && line.text.includes('Node info:')),
        'clicking a node should log the node content from the current mind'
    );

    await browser.clickAt(setup.blank.x, setup.blank.y);
    await browser.settle();

    const cleared = await infoBar();
    assert.strictEqual(cleared.nodeId, '-', 'clicking blank space should clear Node ID');
    assert.strictEqual(cleared.content, '-', 'clicking blank space should clear Node Content');
});

test('ui - playground reset then a node click does not warn Node not found', async () => {
    const beforeReset = await clickSetup();
    assert.ok(beforeReset.node, 'the playground should have a clickable node before reset');

    await browser.evaluate('(async () => { await window.Playground.resetMindMap(); })()', true);
    await waitForPlayground(3);

    const setup = await clickSetup();
    assert.ok(setup.hasShadowRoot, 'reset must still render nodes inside a shadow root');
    assert.ok(setup.node, 'the playground should have a clickable node after reset');
    assert.ok(setup.node.id, 'the clicked node should have a data-jm-node-id after reset');
    assert.strictEqual(setup.nodeCount, 3, 'reset must not leave nodes from the previous map in the shadow root');
    assert.strictEqual(setup.innerCount, 1, 'reset must not stack inner containers');
    assert.notStrictEqual(
        setup.node.id,
        beforeReset.node.id,
        'reset should create a new map with new node ids'
    );

    const beforeClick = await consoleLines();
    await browser.clickAt(setup.node.x, setup.node.y);
    await browser.settle();

    const selected = await infoBar();
    assert.strictEqual(selected.nodeId, setup.node.id, 'after reset, Node ID should match the clicked node');
    assert.strictEqual(selected.content, setup.node.content, 'after reset, Node Content should match the clicked node');

    const afterClick = await consoleLines();
    const newLines = afterClick.slice(beforeClick.length);
    assertNoNodeNotFoundWarning(afterClick, 'clicking an existing node after reset');
    const clickedLogs = newLines.filter(line => line.type === 'log' && line.text.includes('Clicked node:'));
    assert.strictEqual(
        clickedLogs.length,
        1,
        `reset should not stack click listeners; got ${clickedLogs.length} "Clicked node" logs: ${
            clickedLogs.map(line => line.text).join(' | ')
        }`
    );
});
