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
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { CliExit, CliError } from './exit.ts';

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
    const port = 9222 + Math.floor(Math.random() * 2000);
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
        const version = await waitForDevTools(port, () => exited);
        socket = new WebSocket(version.webSocketDebuggerUrl);
        await new Promise<void>((ok, fail) => {
            socket!.onopen = () => ok();
            socket!.onerror = () => fail(new CliError('Cannot connect to the browser.', CliExit.IoError));
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
        await send('Runtime.evaluate', { expression: bundle });

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

/** Polls the DevTools endpoint until the browser answers. */
async function waitForDevTools(
    port: number,
    hasExited: () => number | null
): Promise<{ webSocketDebuggerUrl: string }> {
    for (let attempt = 0; attempt < 150; attempt++) {
        const code = hasExited();
        if (code !== null) {
            throw new CliError(`The browser exited while starting (code ${code}).`, CliExit.IoError);
        }
        try {
            const response = await fetch(`http://127.0.0.1:${port}/json/version`);
            if (response.ok) {
                return (await response.json()) as { webSocketDebuggerUrl: string };
            }
        } catch {
            // Not listening yet.
        }
        await new Promise(done => setTimeout(done, 200));
    }
    throw new CliError('The browser did not start in time.', CliExit.IoError);
}

/** True when an error came from the page rather than the harness. */
export function isPageError(error: unknown): error is PageError {
    return error instanceof PageError;
}
