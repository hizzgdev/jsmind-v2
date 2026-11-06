/**
 * @fileoverview Probe: is a headless browser available and usable here?
 *
 * @remarks
 * The renderer needs real text measurement, and jsdom cannot provide it (no
 * layout engine: `getBoundingClientRect()` returns zeros and there is no canvas
 * implementation). That means any render test has to drive an actual browser,
 * which in turn means the machine running the tests needs one.
 *
 * This script answers that question for whatever environment it runs in, without
 * pulling in Playwright or Puppeteer: it finds a Chromium binary, speaks the
 * DevTools protocol over Node's built-in WebSocket, measures some text, takes a
 * screenshot, and reports what it found. Exit code 0 means the environment is
 * usable for render tests.
 *
 * Run: node --experimental-strip-types scripts/probe-browser.ts
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** Candidate Chromium binaries, in preference order. */
const CANDIDATES = [
    process.env.CHROME_PATH,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/snap/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];

/**
 * Finds a usable Chromium binary.
 *
 * @returns Path to the binary, or null when none is present.
 */
function findBrowser(): string | null {
    for (const candidate of CANDIDATES) {
        if (candidate && existsSync(candidate)) {
            return candidate;
        }
    }
    // Fall back to PATH lookup for anything else that is installed.
    for (const name of ['chromium', 'chromium-browser', 'google-chrome']) {
        const which = spawnSync('which', [name], { encoding: 'utf8' });
        const found = which.stdout?.trim();
        if (which.status === 0 && found) {
            return found;
        }
    }
    return null;
}

/**
 * Waits for the DevTools endpoint to answer.
 *
 * @param port - Debugging port the browser was started with.
 * @param tries - Poll attempts before giving up.
 * @returns The `/json/version` payload.
 */
async function waitForDevTools(port: number, tries = 60): Promise<Record<string, string>> {
    for (let attempt = 0; attempt < tries; attempt++) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/json/version`);
            if (response.ok) {
                return (await response.json()) as Record<string, string>;
            }
        } catch {
            // Not up yet.
        }
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`browser did not expose DevTools on port ${port}`);
}

/**
 * Resolves when a condition holds.
 *
 * @param ms - Milliseconds to wait.
 */
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Runs the whole probe.
 */
async function main(): Promise<void> {
    const chrome = findBrowser();
    if (!chrome) {
        console.error('NO BROWSER: none of the candidate paths exist and none are on PATH');
        console.error('On Debian/Ubuntu: sudo apt-get install -y chromium-browser');
        process.exit(2);
    }
    console.log(`browser: ${chrome}`);

    const version = spawnSync(chrome, ['--version'], { encoding: 'utf8' });
    console.log(`version: ${(version.stdout || version.stderr || '').trim()}`);

    const port = 9500 + Math.floor(Math.random() * 400);
    const profile = mkdtempSync(join(tmpdir(), 'jsmind-probe-'));

    const child = spawn(
        chrome,
        [
            '--headless=new',
            `--remote-debugging-port=${port}`,
            `--user-data-dir=${profile}`,
            '--no-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--hide-scrollbars',
            '--force-device-scale-factor=1',
            'about:blank',
        ],
        { stdio: 'ignore' }
    );

    let failed = false;
    try {
        const info = await waitForDevTools(port);
        console.log(`devtools: ${info['Browser']}`);

        const socket = new WebSocket(info.webSocketDebuggerUrl);
        await new Promise<void>((resolve, reject) => {
            socket.onopen = () => resolve();
            socket.onerror = () => reject(new Error('could not open DevTools socket'));
        });

        let nextId = 0;
        const pending = new Map<number, (value: unknown) => void>();
        socket.onmessage = (event: MessageEvent) => {
            const message = JSON.parse(String(event.data)) as { id?: number };
            if (message.id !== undefined && pending.has(message.id)) {
                const resolve = pending.get(message.id)!;
                pending.delete(message.id);
                resolve(message);
            }
        };
        const send = (
            method: string,
            params: Record<string, unknown> = {},
            sessionId?: string
        ): Promise<{ result: Record<string, unknown> }> =>
            new Promise(resolve => {
                const id = ++nextId;
                pending.set(id, resolve as (value: unknown) => void);
                socket.send(JSON.stringify({ id, method, params, sessionId }));
            });

        const created = await send('Target.createTarget', { url: 'about:blank' });
        const targetId = created.result.targetId as string;
        const attached = await send('Target.attachToTarget', { targetId, flatten: true });
        const sessionId = attached.result.sessionId as string;

        await send('Page.enable', {}, sessionId);
        await send('Runtime.enable', {}, sessionId);
        await send(
            'Emulation.setDeviceMetricsOverride',
            { width: 400, height: 200, deviceScaleFactor: 1, mobile: false },
            sessionId
        );

        // ---- measurement -------------------------------------------------
        const measureExpression = `(() => {
            const ns = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(ns, 'svg');
            svg.setAttribute('width', '400');
            svg.setAttribute('height', '100');
            document.body.appendChild(svg);
            const out = {};
            for (const [key, value] of [['ascii','Hello World'],['chinese','中文测试文本']]) {
                const text = document.createElementNS(ns, 'text');
                text.setAttribute('x', '0');
                text.setAttribute('y', '20');
                text.setAttribute('font-family', 'sans-serif');
                text.setAttribute('font-size', '14');
                text.textContent = value;
                svg.appendChild(text);
                const box = text.getBBox();
                out[key] = { w: Math.round(box.width * 100) / 100, h: Math.round(box.height * 100) / 100 };
            }
            const canvas = document.createElement('canvas').getContext('2d');
            canvas.font = '14px sans-serif';
            out.canvasChinese = Math.round(canvas.measureText('中文测试文本').width * 100) / 100;
            return JSON.stringify(out);
        })()`;

        const measured = await send(
            'Runtime.evaluate',
            { expression: measureExpression, returnByValue: true },
            sessionId
        );
        const metrics = JSON.parse(measured.result.result.value as string) as Record<
            string,
            { w?: number; h?: number } | number
        >;
        console.log(`measured: ${JSON.stringify(metrics)}`);

        const asciiWidth = (metrics.ascii as { w: number }).w;
        if (!(asciiWidth > 0)) {
            console.error('MEASUREMENT FAILED: SVG getBBox returned a zero width');
            failed = true;
        }

        const canvasWidth = metrics.canvasChinese as number;
        const svgWidth = (metrics.chinese as { w: number }).w;
        if (canvasWidth > 0 && svgWidth > 0 && canvasWidth !== svgWidth) {
            console.log(`note: canvas ${canvasWidth} vs svg ${svgWidth} differ (tolerable)`);
        }

        // ---- screenshot determinism --------------------------------------
        const frame = await send('Page.getFrameTree', {}, sessionId);
        const frameTree = frame.result.frameTree as { frame: { id: string } };
        await send(
            'Page.setDocumentContent',
            {
                frameId: frameTree.frame.id,
                html: `<html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">
                    <rect width="400" height="200" fill="#fff"/>
                    <line x1="100" y1="100" x2="250" y2="100" stroke="#666" stroke-width="2"/>
                    <rect x="20" y="80" width="80" height="40" rx="6" fill="#e8f0fe" stroke="#4285f4" stroke-width="2"/>
                    <text x="60" y="105" font-family="sans-serif" font-size="14" text-anchor="middle">根节点</text>
                </svg></body></html>`,
            },
            sessionId
        );
        await sleep(400);

        const shots: string[] = [];
        for (let i = 0; i < 2; i++) {
            const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
            shots.push(shot.result.data as string);
        }

        const probeDir = mkdtempSync(join(tmpdir(), 'jsmind-shot-'));
        const first = join(probeDir, 'a.png');
        writeFileSync(first, Buffer.from(shots[0], 'base64'));
        console.log(`screenshot: ${Buffer.from(shots[0], 'base64').length} bytes -> ${first}`);
        console.log(`screenshots identical: ${shots[0] === shots[1] ? 'yes' : 'NO (nondeterministic)'}`);
        if (shots[0] !== shots[1]) {
            failed = true;
        }

        socket.close();
    } finally {
        child.kill('SIGKILL');
        await sleep(200);
        rmSync(profile, { recursive: true, force: true });
    }

    if (failed) {
        console.error('PROBE FAILED');
        process.exit(1);
    }
    console.log('PROBE OK: browser is usable for render tests');
}

await main();
