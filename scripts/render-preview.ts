/**
 * @fileoverview Renders a mind map data file to a PNG.
 *
 * @remarks
 * Meant for a human to look at, not to assert against. Tests answer "is the
 * geometry right"; this answers "does it look like anything", which is the one
 * question a passing test suite cannot answer.
 *
 * Runs in CI so every pull request carries a picture of what the renderer
 * currently produces. Drives a real headless Chromium over DevTools, because
 * text measurement needs a layout engine and jsdom has none.
 *
 * Usage:
 *   node --experimental-strip-types scripts/render-preview.ts <map.json> <out.png> [--width N] [--height N]
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = join(REPO_ROOT, 'dist/jsmind.js');
const STYLESHEET = join(REPO_ROOT, 'styles/jsmind.css');

/** Launch attempts before giving up, each on a fresh port. */
const LAUNCH_ATTEMPTS = 3;

/** DevTools polls per launch, 200ms apart, so about 30 seconds. */
const WAIT_ATTEMPTS = 150;

/** Candidate Chromium binaries. */
const CANDIDATES = [
    process.env.CHROME_PATH,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
];

/**
 * Parses command line arguments.
 *
 * @returns Input path, output path, and viewport size.
 */
function parseArgs(): { input: string; output: string; width: number; height: number } {
    const argv = process.argv.slice(2);
    const positional: string[] = [];
    let width = 1200;
    let height = 800;

    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--width') {
            width = Number(argv[++i]);
        } else if (argv[i] === '--height') {
            height = Number(argv[++i]);
        } else {
            positional.push(argv[i]);
        }
    }

    if (positional.length < 2) {
        console.error('usage: render-preview.ts <map.json> <out.png> [--width N] [--height N]');
        process.exit(2);
    }
    return { input: resolve(positional[0]), output: resolve(positional[1]), width, height };
}

/**
 * Finds a Chromium binary.
 *
 * @returns Path, or null.
 */
function findBrowser(): string | null {
    for (const candidate of CANDIDATES) {
        if (candidate && existsSync(candidate)) {
            return candidate;
        }
    }
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
 * Polls the DevTools endpoint until it answers.
 *
 * @param port - Debugging port.
 * @param exited - Reads the child exit code, or null while it is alive.
 * @returns The `/json/version` payload.
 */
async function waitForDevTools(
    port: number,
    exited: () => number | null
): Promise<Record<string, string>> {
    for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt++) {
        const code = exited();
        if (code !== null) {
            throw new Error('browser exited with code ' + code + ' before opening DevTools');
        }
        try {
            const response = await fetch('http://127.0.0.1:' + port + '/json/version');
            if (response.ok) {
                return (await response.json()) as Record<string, string>;
            }
        } catch {
            // Not listening yet.
        }
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error(
        'browser never exposed DevTools on port ' + port + ' within ' + WAIT_ATTEMPTS * 200 + 'ms'
    );
}

/** A DevTools command channel bound to one page. */
interface Session {
    send: (
        method: string,
        params?: Record<string, unknown>
    ) => Promise<{ result: Record<string, unknown> }>;
    close: () => void;
}

/**
 * Starts a browser and attaches to a blank page.
 *
 * @remarks
 * Retries with a fresh port each attempt. Starting Chromium on a CI runner is
 * not reliably fast: one run spent 16 seconds waiting for DevTools and failed,
 * the next opened it in two. A retry on a new port also clears the case where a
 * previous attempt left something holding the old one.
 *
 * @param binary - Chromium path.
 * @param width - Viewport width.
 * @param height - Viewport height.
 * @returns An attached session plus a cleanup function.
 */
async function launch(
    binary: string,
    width: number,
    height: number
): Promise<{ session: Session; cleanup: () => Promise<void> }> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= LAUNCH_ATTEMPTS; attempt++) {
        const port = 9600 + Math.floor(Math.random() * 300);
        // A private profile is not optional: without it Chromium reaches for a
        // shared default that another process may hold, and exits rather than
        // starting.
        const profileDir = mkdtempSync(join(tmpdir(), 'jsmind-preview-'));

        const chrome = spawn(
            binary,
            [
                '--headless=new',
                '--remote-debugging-port=' + port,
                '--user-data-dir=' + profileDir,
                '--no-sandbox',
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--hide-scrollbars',
                'about:blank',
            ],
            // Piped, not ignored: when the browser refuses to start, its stderr
            // is the only thing that says why.
            { stdio: ['ignore', 'ignore', 'pipe'] }
        );

        let stderr = '';
        chrome.stderr?.on('data', (chunk: Buffer) => {
            stderr += chunk.toString();
        });
        let exitCode: number | null = null;
        chrome.on('exit', (code: number | null) => {
            exitCode = code;
        });

        let socket: WebSocket | null = null;
        try {
            const version = await waitForDevTools(port, () => exitCode);
            socket = new WebSocket(version.webSocketDebuggerUrl);
            await new Promise<void>((res, rej) => {
                socket!.onopen = () => res();
                socket!.onerror = () => rej(new Error('DevTools socket failed to open'));
            });

            let nextId = 0;
            const pending = new Map<number, (value: unknown) => void>();
            let sessionId = '';

            socket.onmessage = (event: MessageEvent) => {
                const message = JSON.parse(String(event.data)) as { id?: number };
                if (message.id !== undefined && pending.has(message.id)) {
                    const res = pending.get(message.id)!;
                    pending.delete(message.id);
                    res(message);
                }
            };

            const send = (
                method: string,
                params: Record<string, unknown> = {}
            ): Promise<{ result: Record<string, unknown> }> =>
                new Promise(res => {
                    const id = ++nextId;
                    pending.set(id, res as (value: unknown) => void);
                    socket!.send(
                        JSON.stringify({
                            id,
                            method,
                            params,
                            ...(sessionId ? { sessionId } : {}),
                        })
                    );
                });

            const created = await send('Target.createTarget', { url: 'about:blank' });
            const attached = await send('Target.attachToTarget', {
                targetId: created.result.targetId as string,
                flatten: true,
            });
            sessionId = attached.result.sessionId as string;

            await send('Page.enable');
            await send('Runtime.enable');
            await send('Emulation.setDeviceMetricsOverride', {
                width,
                height,
                deviceScaleFactor: 2,
                mobile: false,
            });

            const liveSocket = socket;
            return {
                session: { send, close: () => liveSocket.close() },
                cleanup: async () => {
                    try {
                        liveSocket.close();
                    } catch {
                        // Already closed.
                    }
                    chrome.kill('SIGKILL');
                    await new Promise(res => setTimeout(res, 150));
                    rmSync(profileDir, { recursive: true, force: true });
                },
            };
        } catch (error) {
            lastError = error as Error;
            try {
                socket?.close();
            } catch {
                // Ignore.
            }
            chrome.kill('SIGKILL');
            await new Promise(res => setTimeout(res, 200));
            rmSync(profileDir, { recursive: true, force: true });

            // dbus complaints are on every runner and have nothing to do with
            // rendering; keep them out of the message.
            const relevant = stderr
                .split('\n')
                .filter(line => !line.toLowerCase().includes('dbus'))
                .filter(line => !line.includes('Failed to connect to the bus'))
                .slice(-8)
                .join('\n')
                .trim();
            console.error('launch ' + attempt + '/' + LAUNCH_ATTEMPTS + ' failed: ' + lastError.message);
            if (relevant) {
                console.error(relevant);
            }
        }
    }

    throw lastError ?? new Error('could not start a browser');
}

/**
 * Renders the map and writes a PNG.
 */
async function main(): Promise<void> {
    const { input, output, width, height } = parseArgs();

    if (!existsSync(input)) {
        console.error('no such file: ' + input);
        process.exit(2);
    }
    if (!existsSync(BUNDLE)) {
        console.error('missing ' + BUNDLE + ' - run npm run build first');
        process.exit(3);
    }

    const binary = findBrowser();
    if (!binary) {
        console.error('no Chromium found - set CHROME_PATH');
        process.exit(3);
    }

    const data = JSON.parse(readFileSync(input, 'utf8')) as Record<string, unknown>;
    const css = readFileSync(STYLESHEET, 'utf8');
    const bundle = readFileSync(BUNDLE, 'utf8');

    const { session, cleanup } = await launch(binary, width, height);
    try {
        const frame = await session.send('Page.getFrameTree');
        const frameId = (frame.result.frameTree as { frame: { id: string } }).frame.id;
        await session.send('Page.setDocumentContent', {
            frameId,
            html:
                '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + css +
                'html,body{margin:0;padding:0;background:#f7f8fa}' +
                '#stage{width:' + width + 'px;height:' + height + 'px;background:#f7f8fa}' +
                '</style></head><body><div id="stage"></div></body></html>',
        });

        await session.send('Runtime.evaluate', { expression: bundle });

        const render = await session.send('Runtime.evaluate', {
            expression: `
                (async () => {
                    const stage = document.getElementById('stage');
                    const payload = ${JSON.stringify(JSON.stringify(data))};
                    const jm = await jsMind.create(stage);
                    const mind = jsMind.Serializer.create('json').deserialize(JSON.parse(payload));
                    await jm.open(mind);
                    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

                    const nodes = stage.querySelectorAll('.jsmind-node');
                    if (nodes.length === 0) {
                        return JSON.stringify({ nodes: 0, bounds: null });
                    }
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    for (const el of nodes) {
                        const r = el.getBoundingClientRect();
                        minX = Math.min(minX, r.left);
                        minY = Math.min(minY, r.top);
                        maxX = Math.max(maxX, r.right);
                        maxY = Math.max(maxY, r.bottom);
                    }
                    return JSON.stringify({
                        nodes: nodes.length,
                        bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
                    });
                })()
            `,
            returnByValue: true,
            awaitPromise: true,
        });

        const raw = render.result as {
            result?: { value?: string };
            exceptionDetails?: { exception?: { description?: string } };
        };
        if (raw.exceptionDetails) {
            throw new Error(
                'render failed: ' + (raw.exceptionDetails.exception?.description ?? 'unknown')
            );
        }
        const info = JSON.parse(raw.result!.value as string) as {
            nodes: number;
            bounds: { x: number; y: number; width: number; height: number } | null;
        };
        console.log('rendered ' + info.nodes + ' nodes from ' + input);

        // Let fonts settle; a capture mid-swap can catch fallback glyphs.
        await session.send('Runtime.evaluate', {
            expression: 'document.fonts ? document.fonts.ready.then(() => true) : true',
            awaitPromise: true,
            returnByValue: true,
        });
        await new Promise(res => setTimeout(res, 300));

        const PAD = 40;
        const clip = info.bounds
            ? {
                x: Math.max(0, info.bounds.x - PAD),
                y: Math.max(0, info.bounds.y - PAD),
                width: info.bounds.width + PAD * 2,
                height: info.bounds.height + PAD * 2,
                scale: 2,
            }
            : { x: 0, y: 0, width, height, scale: 2 };

        const shot = await session.send('Page.captureScreenshot', { format: 'png', clip });
        const buffer = Buffer.from(shot.result.data as string, 'base64');

        mkdirSync(dirname(output), { recursive: true });
        writeFileSync(output, buffer);
        console.log('wrote ' + output + ' (' + (buffer.length / 1024).toFixed(1) + ' KB)');
    } finally {
        await cleanup();
    }
}

await main();
