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
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** Where the UMD bundle has to live for a browser to load it. */
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
                'UI tests exercise the UMD bundle a browser loads, not the sources.'
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
     * Reads the UMD bundle so it can be injected into a page.
     *
     * @returns The bundle source.
     */
    bundleSource(): string {
        return readFileSync(BUNDLE, 'utf8');
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
