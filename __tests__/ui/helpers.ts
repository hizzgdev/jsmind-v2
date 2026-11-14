/**
 * @fileoverview Minimal headless-browser harness for UI tests.
 *
 * @remarks
 * The renderer measures text with `getBoundingClientRect()`, which jsdom
 * returns as zeros — it has no layout engine. So anything that asserts on
 * geometry needs a real browser, and this is the smallest thing that provides
 * one: launch Chromium, talk DevTools over Node's built-in WebSocket, evaluate
 * expressions, shut it down.
 *
 * No Playwright, no Puppeteer. The capability needed is three calls wide.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join, dirname, extname, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** Where the library bundle has to live for a browser to load it. */
const BUNDLE = join(REPO_ROOT, 'dist/jsmind.js');

/** Launch attempts before giving up, each on a fresh port. */
const LAUNCH_ATTEMPTS = 3;

/** DevTools poll attempts, 200ms apart, so about 30 seconds. */
const WAIT_ATTEMPTS = 150;

/**
 * Rejects when a promise takes too long.
 *
 * @remarks
 * Every wait in this file needs a ceiling. Chromium on a CI runner sometimes
 * neither opens a port nor exits, and an unbounded `await` there does not fail —
 * it hangs until the job's own timeout kills it ten minutes later, which reads
 * as "the suite is broken" rather than "one browser start stalled".
 *
 * @param promise - Work to bound.
 * @param ms - Budget in milliseconds.
 * @param label - What was being attempted, for the error message.
 * @returns The promise's value.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
            }),
        ]);
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}

/**
 * Locates a Chromium binary.
 *
 * @returns Path to the binary, or null when none exists.
 */
function findBrowser(): string | null {
    const candidates = [
        process.env.CHROME_PATH,
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
    ];
    for (const candidate of candidates) {
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
 * Returns the newest modification time under a directory.
 *
 * @param dir - Directory to walk.
 * @returns Milliseconds since epoch, or 0 for an empty tree.
 */
function newestMtime(dir: string): number {
    let newest = 0;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        const stamp = entry.isDirectory() ? newestMtime(full) : statSync(full).mtimeMs;
        newest = Math.max(newest, stamp);
    }
    return newest;
}

/**
 * Requires the browser bundle to exist and to be newer than the sources.
 *
 * @remarks
 * This deliberately does not build. Building from inside a test means a suite
 * that stalls on a build failure, blocks its worker, and hides the real error
 * behind a timeout — which is exactly what happened on CI when this ran in a
 * coverage-instrumented parallel worker.
 *
 * On CI it refuses to build (see below). Locally it does, so `npm run ci` keeps
 * working unchanged. Either way a stale bundle is never tolerated — it would let
 * these tests pass against code that no longer exists.
 */
function ensureBundle(): void {
    const stale = () => {
        if (!existsSync(BUNDLE)) {
            return 'missing';
        }
        return newestMtime(join(REPO_ROOT, 'src')) > statSync(BUNDLE).mtimeMs ? 'stale' : null;
    };

    const problem = stale();
    if (!problem) {
        return;
    }

    // On CI the bundle must already exist: ci.yml builds before running tests,
    // because a build spawned from inside a coverage-instrumented parallel
    // worker blocks that worker and turns a build failure into an opaque
    // timeout. Locally, building here keeps `npm run ci` working as-is — its
    // order is format, type-check, test, build, and that script is not ours to
    // reorder.
    if (process.env.CI) {
        throw new Error(
            `${BUNDLE} is ${problem} — ci.yml must run \`npm run build\` before the tests. ` +
                'UI tests exercise the built bundle a browser loads, not the sources.'
        );
    }

    const result = spawnSync('npm', ['run', 'build'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 180_000,
    });
    if (result.status !== 0 || stale()) {
        throw new Error(
            `could not build the bundle (status ${result.status}):\n` +
                `${result.stdout ?? ''}\n${result.stderr ?? ''}`
        );
    }
}

/** One evaluated value result from the page. */
type Evaluation<T> = T;

/**
 * A live headless browser speaking DevTools.
 */
export class BrowserHarness {
    // Declared as fields rather than constructor parameter properties: Node's
    // type stripping cannot erase parameter properties, which is exactly what
    // tsconfig's erasableSyntaxOnly forbids.
    private readonly chrome: ReturnType<typeof spawn>;

    private readonly socket: WebSocket;

    private readonly profileDir: string;

    private sessionId: string;

    private nextId = 0;

    private readonly pending = new Map<number, (value: unknown) => void>();

    private constructor(
        chrome: ReturnType<typeof spawn>,
        socket: WebSocket,
        profileDir: string
    ) {
        this.chrome = chrome;
        this.socket = socket;
        this.profileDir = profileDir;
        this.sessionId = '';
    }

    /**
     * Starts Chromium and opens a blank page.
     *
     * @remarks
     * Retries with a fresh port and profile each attempt. One CI run sat for ten
     * minutes because a browser start neither opened its port nor exited, and
     * nothing here imposed a deadline — the job timeout was the first thing to
     * notice.
     *
     * @returns A ready harness.
     */
    static async launch(): Promise<BrowserHarness> {
        ensureBundle();

        const binary = findBrowser();
        if (!binary) {
            throw new Error(
                'no Chromium found. UI tests need a real browser: none of ' +
                    '/usr/bin/chromium, /usr/bin/chromium-browser, /usr/bin/google-chrome exist. ' +
                    'Set CHROME_PATH to point at one.'
            );
        }

        let lastError: Error | null = null;
        for (let attempt = 1; attempt <= LAUNCH_ATTEMPTS; attempt++) {
            try {
                return await BrowserHarness.launchOnce(binary);
            } catch (error) {
                lastError = error as Error;
                console.error(`ui harness launch ${attempt}/${LAUNCH_ATTEMPTS}: ${lastError.message}`);
            }
        }
        throw lastError ?? new Error('could not start a browser');
    }

    /**
     * One launch attempt.
     *
     * @param binary - Chromium path.
     * @returns A ready harness.
     */
    private static async launchOnce(binary: string): Promise<BrowserHarness> {
        const port = 9400 + Math.floor(Math.random() * 400);
        const profileDir = mkdtempSync(join(tmpdir(), 'jsmind-ui-'));
        const chrome = spawn(
            binary,
            [
                '--headless=new',
                `--remote-debugging-port=${port}`,
                `--user-data-dir=${profileDir}`,
                '--no-sandbox',
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--hide-scrollbars',
                '--force-device-scale-factor=1',
                'about:blank',
            ],
            { stdio: 'ignore' }
        );

        let exitCode: number | null = null;
        chrome.on('exit', (code: number | null) => {
            exitCode = code;
        });

        let socket: WebSocket | null = null;
        try {
            const version = await waitForDevTools(port, () => exitCode);
            socket = new WebSocket(version.webSocketDebuggerUrl);
            const live = socket;
            await withTimeout(
                new Promise<void>((resolve, reject) => {
                    live.onopen = () => resolve();
                    live.onerror = () => reject(new Error('could not open the DevTools socket'));
                }),
                10_000,
                'DevTools socket open'
            );

            // The session id only exists after attaching, so the harness is built
            // without it and filled in before any session-scoped call is made.
            const harness = new BrowserHarness(chrome, live, profileDir);
            live.onmessage = (event: MessageEvent) => {
                const message = JSON.parse(String(event.data)) as { id?: number };
                if (message.id !== undefined && harness.pending.has(message.id)) {
                    const resolve = harness.pending.get(message.id)!;
                    harness.pending.delete(message.id);
                    resolve(message);
                }
            };

            const created = await harness.send('Target.createTarget', { url: 'about:blank' });
            const attached = await harness.send('Target.attachToTarget', {
                targetId: created.result.targetId as string,
                flatten: true,
            });
            harness.sessionId = attached.result.sessionId as string;

            await harness.send('Page.enable');
            await harness.send('Runtime.enable');
            return harness;
        } catch (error) {
            try {
                socket?.close();
            } catch {
                // Ignore.
            }
            chrome.kill('SIGKILL');
            await new Promise(resolve => setTimeout(resolve, 200));
            rmSync(profileDir, { recursive: true, force: true });
            throw error;
        }
    }

    /**
     * Sends a DevTools command.
     *
     * @param method - DevTools method name.
     * @param params - Method parameters.
     * @returns The raw response.
     */
    async send(method: string, params: Record<string, unknown> = {}): Promise<{
        result: Record<string, unknown>;
    }> {
        const id = ++this.nextId;
        // Bounded for the same reason the launch is: a DevTools command that is
        // never answered must fail as a test error, not hang the worker.
        const response = await withTimeout(
            new Promise<{ result: Record<string, unknown> }>(resolve => {
                this.pending.set(id, resolve as (value: unknown) => void);
                this.socket.send(
                    JSON.stringify({
                        id,
                        method,
                        params,
                        ...(this.sessionId ? { sessionId: this.sessionId } : {}),
                    })
                );
            }),
            30_000,
            `DevTools ${method}`
        );
        return response;
    }

    /**
     * Loads an HTML document and waits a frame for layout to settle.
     *
     * @param html - Full document body markup.
     */
    async setContent(html: string): Promise<void> {
        const tree = await this.send('Page.getFrameTree');
        const frameTree = tree.result.frameTree as { frame: { id: string } };
        await this.send('Page.setDocumentContent', {
            frameId: frameTree.frame.id,
            html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0">${html}</body></html>`,
        });
        await this.settle();
    }

    /**
     * Waits for two animation frames so measurements are stable.
     */
    async settle(): Promise<void> {
        await this.evaluate(
            `new Promise(resolve =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))`,
            true
        );
    }

    /**
     * Evaluates an expression in the page.
     *
     * @param expression - JavaScript to run.
     * @param awaitPromise - Whether to await a returned promise.
     * @returns The value, deserialised.
     */
    async evaluate<T = unknown>(expression: string, awaitPromise = false): Promise<Evaluation<T>> {
        const response = await this.send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise,
        });
        const payload = response.result as {
            result?: { value?: unknown };
            exceptionDetails?: { text?: string; exception?: { description?: string } };
        };
        if (payload.exceptionDetails) {
            throw new Error(
                `page exception: ${
                    payload.exceptionDetails.exception?.description ??
                    payload.exceptionDetails.text
                }`
            );
        }
        return payload.result?.value as T;
    }

    /**
     * Installs the built library on the page.
     *
     * The bundle is an ES module, so it cannot be evaluated as a classic
     * script. Importing it from a blob URL runs it, and the module assigns
     * `globalThis.jsMind` for the expressions that follow.
     */
    async loadBundle(): Promise<void> {
        const source = readFileSync(BUNDLE, 'utf8');
        await this.evaluate(
            `(async () => {
                const url = URL.createObjectURL(new Blob([${JSON.stringify(source)}], { type: 'text/javascript' }));
                try {
                    await import(url);
                } finally {
                    URL.revokeObjectURL(url);
                }
            })()`,
            true
        );
    }

    /**
     * Sets the viewport size used for layout and click coordinates.
     *
     * @param width - CSS pixel width.
     * @param height - CSS pixel height.
     */
    async setViewport(width: number, height: number): Promise<void> {
        await this.send('Emulation.setDeviceMetricsOverride', {
            width,
            height,
            deviceScaleFactor: 1,
            mobile: false,
        });
    }

    /**
     * Navigates the page to a URL and waits for it to finish loading.
     *
     * @param url - Absolute URL to open.
     */
    async navigate(url: string): Promise<void> {
        await this.send('Page.navigate', { url });
        const deadline = Date.now() + 15_000;
        while (Date.now() < deadline) {
            const href = await this.evaluate<string>('location.href');
            const ready = await this.evaluate<string>('document.readyState');
            if ((href === url || href.startsWith(url)) && ready === 'complete') {
                await this.settle();
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        throw new Error(`page did not load ${url}`);
    }

    /**
     * Dispatches a real left click at a viewport point.
     *
     * @param x - CSS pixel X, as `getBoundingClientRect()` reports it.
     * @param y - CSS pixel Y, as `getBoundingClientRect()` reports it.
     */
    async clickAt(x: number, y: number): Promise<void> {
        const params = {
            x,
            y,
            button: 'left',
            clickCount: 1,
        };
        await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...params });
        await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...params });
    }

    /**
     * Shuts the browser down and removes its temporary profile.
     */
    async close(): Promise<void> {
        try {
            this.socket.close();
        } catch {
            // Already gone.
        }
        this.chrome.kill('SIGKILL');
        await new Promise(resolve => setTimeout(resolve, 150));
        rmSync(this.profileDir, { recursive: true, force: true });
    }
}

/**
 * Polls the DevTools endpoint until it answers.
 *
 * @param port - Debugging port.
 * @returns The `/json/version` payload.
 */
async function waitForDevTools(
    port: number,
    exited: () => number | null
): Promise<Record<string, string>> {
    for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt++) {
        const code = exited();
        if (code !== null) {
            throw new Error(`browser exited with code ${code} before opening DevTools`);
        }
        try {
            const response = await fetch(`http://127.0.0.1:${port}/json/version`);
            if (response.ok) {
                return (await response.json()) as Record<string, string>;
            }
        } catch {
            // Not listening yet.
        }
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error(`browser never exposed DevTools on port ${port}`);
}


const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
};

/**
 * A tiny static file server so the browser can load real pages and ES modules.
 *
 * @remarks
 * `Page.setDocumentContent` has no origin, so `<script type="module">` cannot
 * fetch `../dist/jsmind.js`. Serving the repo over localhost gives the
 * playground the same layout a person would open.
 */
export class StaticServer {
    private readonly server: Server;

    readonly origin: string;

    private constructor(server: Server, origin: string) {
        this.server = server;
        this.origin = origin;
    }

    /**
     * Serves `root` on an ephemeral port.
     *
     * @param root - Directory to expose. Defaults to the repository root.
     * @returns A listening server.
     */
    static start(root: string = REPO_ROOT): Promise<StaticServer> {
        const directory = resolve(root);
        const httpServer = createServer((request, response) => {
            void serveFile(directory, request, response);
        });
        return new Promise((resolveStart, reject) => {
            httpServer.once('error', reject);
            httpServer.listen(0, '127.0.0.1', () => {
                const address = httpServer.address();
                if (!address || typeof address === 'string') {
                    reject(new Error('static server did not bind a TCP port'));
                    return;
                }
                resolveStart(new StaticServer(httpServer, `http://127.0.0.1:${address.port}`));
            });
        });
    }

    /**
     * Stops the server.
     */
    close(): Promise<void> {
        return new Promise((resolveClose, reject) => {
            this.server.close(error => {
                if (error) {
                    reject(error);
                    return;
                }
                resolveClose();
            });
        });
    }
}

/**
 * Writes one file from `root` as an HTTP response, or 404 / 403.
 *
 * @param root - Directory the server is allowed to read.
 * @param request - Incoming request.
 * @param response - Response to fill.
 */
async function serveFile(
    root: string,
    request: IncomingMessage,
    response: ServerResponse
): Promise<void> {
    const rawPath = request.url ?? '/';
    const relativePath = decodeURIComponent(new URL(rawPath, 'http://127.0.0.1').pathname);
    const resolved = resolve(root, `.${relativePath}`);
    const rel = relative(root, resolved);
    if (rel.startsWith('..') || resolve(root, rel) !== resolved) {
        response.writeHead(403);
        response.end();
        return;
    }

    try {
        const body = await readFile(resolved);
        const type = MIME_TYPES[extname(resolved)] ?? 'application/octet-stream';
        response.writeHead(200, { 'content-type': type });
        response.end(body);
    } catch {
        response.writeHead(404);
        response.end();
    }
}
