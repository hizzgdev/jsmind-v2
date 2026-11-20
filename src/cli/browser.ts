/**
 * @fileoverview A headless browser, driven over the DevTools protocol.
 *
 * Exporting an image needs a rendering engine: the picture is produced by
 * handing markup back to the browser, so there has to be one. That is the only
 * external requirement the CLI has, and it is confined to this file.
 *
 * Talking CDP directly keeps the package dependency-free - no puppeteer, no
 * playwright. Node's built-in WebSocket and fetch are enough.
 *
 * @packageDocumentation
 *
 * Excluded from the unit coverage figure (see `test:coverage` in package.json).
 * This file is a driver: spawn a process, speak a protocol over a socket, wait
 * for replies. Testing it without a browser would mean mocking `spawn`, the
 * DevTools socket and the file system - which asserts that the mocks were
 * called, not that a browser produces an image. The UI suite runs the real
 * thing against the built bundle; that bundle is why the coverage tool cannot
 * attribute the lines back here.
 *
 * Everything around the spawn that can be reasoned about on its own - how long
 * to wait for DevTools, which port to take, how much stderr to quote - lives in
 * `browser-start.ts`, where it is covered by tests that need no browser.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { CliExit, CliError } from './exit.ts';
import {
    DEVTOOLS_POLL_MS,
    DEVTOOLS_POLL_TIMEOUT_MS,
    STDERR_BUFFER_LIMIT,
    describeStartFailure,
    pickFreePort,
    resolveBrowserStartMs,
} from './browser-start.ts';

/** Where a Chromium binary is normally installed. */
const BROWSER_CANDIDATES = [
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/snap/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

/** A CDP session on a blank page, with the jsMind bundle already loaded. */
export interface JmBrowserSession {
    /**
     * Evaluates a function body in the page and returns its value.
     *
     * @param expression - JavaScript to run; may return a promise.
     * @returns Whatever the expression resolves to, by value.
     */
    evaluate: (expression: string) => Promise<unknown>;
    /** Closes the browser and removes the temporary profile. */
    close: () => Promise<void>;
}

/** Locates a Chromium binary, or explains what to install. */
function findBrowser(): string {
    for (const candidate of BROWSER_CANDIDATES) {
        if (candidate && existsSync(candidate)) {
            return candidate;
        }
    }
    // `which` last: PATH may point somewhere the fixed list does not cover.
    for (const name of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
        const found = whichSync(name);
        if (found) {
            return found;
        }
    }
    throw new CliError(
        'No Chromium found. Image export needs a browser: install chromium, ' +
            'or point CHROME_PATH at a Chrome or Chromium binary.',
        CliExit.IoError
    );
}

/** Blocking `which`, without pulling in a dependency for it. */
function whichSync(name: string): string | null {
    const result = spawnSync('which', [name], { encoding: 'utf8' });
    if (result.status !== 0) {
        return null;
    }
    const path = (result.stdout ?? '').trim();
    return path.length > 0 ? path : null;
}

/** Resolves the bundled jsMind build the page should load. */
export function resolveBundlePath(): string {
    const here = dirname(fileURLToPath(import.meta.url));
    // Running from dist/ puts the bundle beside this file; running from src/cli/
    // puts it two levels up. Both are normal during development.
    const candidates = [
        resolve(here, 'jsmind.js'),
        resolve(here, '../../dist/jsmind.js'),
    ];
    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }
    throw new CliError(
        `Cannot find the jsMind bundle (looked in ${candidates.join(', ')}). Run a build first.`,
        CliExit.IoError
    );
}

/** A CDP message carrying a result or an error. */
interface CdpMessage {
    id?: number;
    result?: Record<string, unknown>;
    error?: { message?: string };
}

/** Thrown internally when the page itself raises. */
class PageError extends Error {}

/**
 * Expression that imports the ESM bundle.
 *
 * The bundle is an ES module (`export`, plus a `globalThis.jsMind` assignment).
 * Evaluating that source as a classic script is a syntax error, which is how
 * the CLI used to load the old UMD build. A blob URL is a module.
 *
 * @param source - Contents of `dist/jsmind.js`.
 * @returns An async expression for `Runtime.evaluate`.
 */
function bundleImportExpression(source: string): string {
    return `(async () => {
        const url = URL.createObjectURL(new Blob([${JSON.stringify(source)}], { type: 'text/javascript' }));
        try {
            await import(url);
        } finally {
            URL.revokeObjectURL(url);
        }
    })()`;
}

/**
 * Starts a headless browser with jsMind loaded on a blank page.
 *
 * @param width - CSS width of the viewport.
 * @param height - CSS height of the viewport.
 * @returns A session that can evaluate expressions and must be closed.
 * @throws {@link CliError} If no browser is found or it fails to start.
 */
export async function openBrowser(width: number, height: number): Promise<JmBrowserSession> {
    const binary = findBrowser();
    const bundle = readFileSync(resolveBundlePath(), 'utf8');
    // Probe before using: `9222 + random` used to collide with whatever else the
    // machine was running, and the poll then waited out the whole timeout on a
    // port this browser never listened on.
    const port = await pickFreePort();
    const startMs = resolveBrowserStartMs();
    const profile = mkdtempSync(join(tmpdir(), 'jsmind-cli-'));

    const chrome = spawn(
        binary,
        [
            '--headless=new',
            `--remote-debugging-port=${port}`,
            `--user-data-dir=${profile}`,
            '--no-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            // Without this the scrollbars land in the picture.
            '--hide-scrollbars',
            'about:blank',
        ],
        { stdio: ['ignore', 'ignore', 'pipe'] }
    );

    let exited: number | null = null;
    chrome.on('exit', code => {
        exited = code ?? -1;
    });

    // Consumed for two reasons. Chrome's stderr is where a sandbox refusal, a
    // locked profile or a "cannot bind" lands, and nothing ever read it - so
    // "the process is alive but silent" and "the process is dead" looked the
    // same from outside. Not reading it also let the pipe buffer fill and block
    // the child, so it is a bug fix as much as a diagnostic.
    let stderr = '';
    chrome.stderr?.setEncoding('utf8');
    chrome.stderr?.on('data', (chunk: string) => {
        stderr += chunk;
        if (stderr.length > STDERR_BUFFER_LIMIT) {
            stderr = stderr.slice(-STDERR_BUFFER_LIMIT);
        }
    });

    let socket: WebSocket | null = null;
    const cleanup = async (): Promise<void> => {
        socket?.close();
        if (exited === null) {
            chrome.kill('SIGKILL');
            await new Promise(done => setTimeout(done, 200));
        }
        try {
            rmSync(profile, { recursive: true, force: true });
        } catch {
            // The profile is temporary; failing to remove it is not worth a word.
        }
    };

    try {
        const version = await waitForDevTools(port, () => exited, startMs, () => stderr);
        socket = new WebSocket(version.webSocketDebuggerUrl);
        await new Promise<void>((ok, fail) => {
            socket!.onopen = () => ok();
            socket!.onerror = () =>
                fail(
                    new CliError(
                        describeStartFailure({
                            kind: 'socket',
                            port,
                            timeoutMs: startMs,
                            stderr,
                        }),
                        CliExit.IoError
                    )
                );
        });

        let nextId = 0;
        let sessionId = '';
        const pending = new Map<number, (message: CdpMessage) => void>();
        socket.onmessage = event => {
            const message = JSON.parse(String(event.data)) as CdpMessage;
            if (message.id !== undefined) {
                const settle = pending.get(message.id);
                if (settle) {
                    pending.delete(message.id);
                    settle(message);
                }
            }
        };

        const send = (method: string, params: Record<string, unknown> = {}): Promise<CdpMessage> =>
            new Promise(done => {
                const id = ++nextId;
                pending.set(id, done);
                socket!.send(
                    JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })
                );
            });

        const target = await send('Target.createTarget', { url: 'about:blank' });
        const attached = await send('Target.attachToTarget', {
            targetId: target.result!.targetId,
            flatten: true,
        });
        sessionId = attached.result!.sessionId as string;

        await send('Page.enable');
        await send('Runtime.enable');
        await send('Emulation.setDeviceMetricsOverride', {
            width,
            height,
            deviceScaleFactor: 1,
            mobile: false,
        });

        const frameTree = await send('Page.getFrameTree');
        const frameId = (frameTree.result!.frameTree as { frame: { id: string } }).frame.id;
        await send('Page.setDocumentContent', {
            frameId,
            html:
                '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
                'html,body{margin:0;padding:0;background:#ffffff}' +
                `#stage{width:${width}px;height:${height}px}` +
                '</style></head><body><div id="stage"></div></body></html>',
        });
        const loaded = await send('Runtime.evaluate', {
            expression: bundleImportExpression(bundle),
            awaitPromise: true,
        });
        const loadError = loaded.result?.exceptionDetails as
            | { exception?: { description?: string }; text?: string }
            | undefined;
        if (loadError) {
            throw new CliError(
                loadError.exception?.description ?? loadError.text ?? 'Could not load the jsMind bundle.',
                CliExit.IoError
            );
        }

        const evaluate = async (expression: string): Promise<unknown> => {
            const message = await send('Runtime.evaluate', {
                expression,
                returnByValue: true,
                awaitPromise: true,
            });
            const details = message.result?.exceptionDetails as
                | { exception?: { description?: string }; text?: string }
                | undefined;
            if (details) {
                throw new PageError(
                    details.exception?.description ?? details.text ?? 'the page raised an error'
                );
            }
            const result = message.result?.result as { value?: unknown } | undefined;
            return result?.value;
        };

        return { evaluate, close: cleanup };
    } catch (error) {
        await cleanup();
        throw error;
    }
}

/**
 * Polls the DevTools endpoint until the browser answers.
 *
 * @param port - Port passed to `--remote-debugging-port`.
 * @param hasExited - Exit code once the process is gone, `null` while it runs.
 * @param timeoutMs - How long the start is given.
 * @param readStderr - Chrome's stderr so far; quoted in whichever failure is raised.
 * @returns The DevTools endpoint description once it answers.
 * @throws {@link CliError} Reporting which of the two failure shapes happened.
 * @remarks
 * Both branches end in an error, and they used to end in the same sentence. They
 * are not the same bug: a process that died needs its stderr read (sandbox,
 * profile, a flag it rejected), while a process that is still running and simply
 * never listened needs the port and the wait looked at. The message says which.
 */
async function waitForDevTools(
    port: number,
    hasExited: () => number | null,
    timeoutMs: number,
    readStderr: () => string
): Promise<{ webSocketDebuggerUrl: string }> {
    const deadline = Date.now() + timeoutMs;
    let lastError = '';
    /** The report for a process that is gone; used before and after the polls. */
    const exitedError = (code: number): CliError =>
        new CliError(
            describeStartFailure({ kind: 'exited', port, timeoutMs, exitCode: code, stderr: readStderr() }),
            CliExit.IoError
        );

    for (;;) {
        const code = hasExited();
        if (code !== null) {
            throw exitedError(code);
        }
        try {
            const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
                // A listener that accepts and then says nothing would otherwise
                // hold this poll past the deadline.
                signal: AbortSignal.timeout(DEVTOOLS_POLL_TIMEOUT_MS),
            });
            if (response.ok) {
                return (await response.json()) as { webSocketDebuggerUrl: string };
            }
            lastError = `HTTP ${response.status}`;
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
        }
        if (Date.now() >= deadline) {
            break;
        }
        await new Promise(done => setTimeout(done, DEVTOOLS_POLL_MS));
    }

    // One last look: the process may have died during the final poll, and that
    // failure deserves its own report rather than the timeout wording.
    const code = hasExited();
    if (code !== null) {
        throw exitedError(code);
    }
    throw new CliError(
        describeStartFailure({ kind: 'silent', port, timeoutMs, lastError, stderr: readStderr() }),
        CliExit.IoError
    );
}

/** True when an error came from the page rather than the harness. */
export function isPageError(error: unknown): error is PageError {
    return error instanceof PageError;
}
