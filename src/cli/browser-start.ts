/**
 * @fileoverview Startup policy for the browser that `jsmind export` drives.
 *
 * @remarks
 * `browser.ts` is a driver: it spawns a process, speaks CDP over a socket, and
 * is excluded from the coverage figure because asserting on it without a browser
 * would assert on mocks. The decisions *around* the spawn are a different
 * matter - how long to wait, which port to take, how much of Chrome's stderr to
 * quote - and they are exactly the parts that fail quietly on a loaded CI
 * runner. They live here as plain functions, so the policy can be tested without
 * a browser.
 *
 * The wait used to be a hardcoded 150 attempts x 200ms. It was enough on an idle
 * machine and not enough on a busy one: the same runner image took 3s to print
 * `google-chrome --version` on one run and 10s on the next, and the render job
 * that failed did so with nothing but "did not start in time" to show for it.
 *
 * @packageDocumentation
 */

import { createServer } from 'node:net';

import { CliError, CliExit } from './exit.ts';

/** How long to wait for the DevTools endpoint when nothing says otherwise. */
export const DEFAULT_BROWSER_START_MS = 60_000;

/** Environment variable that overrides {@link DEFAULT_BROWSER_START_MS}. */
export const BROWSER_START_ENV = 'JSMIND_BROWSER_START_MS';

/** Gap between two DevTools polls. */
export const DEVTOOLS_POLL_MS = 200;

/** Upper bound on one poll, so a half-open socket cannot outlive the deadline. */
export const DEVTOOLS_POLL_TIMEOUT_MS = 2_000;

/** First port candidate for the DevTools endpoint. */
export const PORT_RANGE_START = 9222;

/** How many ports above {@link PORT_RANGE_START} the search may cover. */
export const PORT_RANGE_SIZE = 2000;

/** Lines of Chrome's stderr quoted in a failure message. */
export const STDERR_TAIL_LINES = 20;

/** Hard cap on the stderr kept in memory, so a chatty browser cannot grow it forever. */
export const STDERR_BUFFER_LIMIT = 64 * 1024;

/**
 * Prefix carried by every failure to start the browser.
 *
 * @remarks
 * Stable on purpose: the CI retry (`scripts/render-preview.ts`) keys off it to
 * decide that an exit code 3 is worth one more attempt and that, say, a page
 * error is not. Change it here and the retry follows, because the script
 * imports this constant rather than spelling the phrase out.
 */
export const START_FAILURE_PREFIX = 'Browser startup failed';

/**
 * Resolves how long to wait for the browser to open DevTools.
 *
 * @param env - Environment to read; defaults to `process.env`.
 * @returns Milliseconds to wait.
 * @remarks
 * An unset, empty or unparsable value keeps the default. Falling back rather
 * than throwing is deliberate: this variable is set in CI configuration, where a
 * typo would otherwise turn every render into a usage error. A non-positive
 * value is treated the same way, because a zero-length wait fails instantly and
 * looks like a broken renderer.
 */
export function resolveBrowserStartMs(env: Record<string, string | undefined> = process.env): number {
    const raw = env[BROWSER_START_ENV]?.trim();
    if (!raw) {
        return DEFAULT_BROWSER_START_MS;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
        return DEFAULT_BROWSER_START_MS;
    }
    return Math.floor(value);
}

/**
 * Reports whether a port on loopback can be bound right now.
 *
 * @param port - Port to test.
 * @param host - Interface to bind; loopback by default, matching what Chrome listens on.
 * @returns True when the bind succeeded, i.e. nothing else holds the port.
 * @remarks
 * Binding is the only honest test: reading `/proc` or asking `ss` would not
 * cover the case where the port is free for one process and not another. The
 * server is closed again immediately, so the probe holds the port for well under
 * a millisecond.
 */
export function isPortFree(port: number, host = '127.0.0.1'): Promise<boolean> {
    return new Promise(resolve => {
        const server = createServer();
        const settle = (free: boolean): void => {
            server.removeAllListeners();
            resolve(free);
        };
        server.once('error', () => settle(false));
        server.once('listening', () => {
            server.close(() => settle(true));
        });
        server.listen({ port, host, exclusive: true });
    });
}

/** Knobs for {@link pickFreePort}; every one of them has a working default. */
export interface PortPickOptions {
    /** First port in the window. */
    start?: number;
    /** Size of the window. */
    size?: number;
    /** Where in the window to start looking; `Math.random` by default. */
    random?: () => number;
    /** Availability probe; a real loopback bind by default. */
    probe?: (port: number) => Promise<boolean>;
}

/**
 * Finds a free port for `--remote-debugging-port`.
 *
 * @param options - Window, starting offset and probe.
 * @returns The first port in the window that answered free.
 * @throws {@link CliError} When every port in the window is taken.
 * @remarks
 * The port used to be picked blind (`9222 + random * 2000`). If that number
 * happened to be held, Chrome either failed to open DevTools or quietly listened
 * elsewhere, and the poll then spun until the timeout - a failure that looks
 * identical to a slow start but has nothing to do with it.
 *
 * A random offset is kept so parallel callers do not collide, but the search
 * then walks forward from it. Walking *forward* rather than trying one number
 * means a busy port costs one extra probe instead of a whole failed render.
 */
export async function pickFreePort(options: PortPickOptions = {}): Promise<number> {
    const start = options.start ?? PORT_RANGE_START;
    const size = options.size ?? PORT_RANGE_SIZE;
    const random = options.random ?? Math.random;
    const probe = options.probe ?? isPortFree;

    const offset = Math.floor(random() * size);
    for (let step = 0; step < size; step++) {
        const port = start + ((offset + step) % size);
        if (await probe(port)) {
            return port;
        }
    }
    throw new CliError(
        `No free port for the browser's DevTools endpoint in ${start}-${start + size - 1}.`,
        CliExit.IoError
    );
}

/**
 * Keeps the last few non-empty lines of Chrome's stderr.
 *
 * @param text - Everything captured so far.
 * @param maxLines - How many lines to keep, newest last.
 * @returns The retained lines, oldest first.
 */
export function tailLines(text: string, maxLines: number = STDERR_TAIL_LINES): string[] {
    const lines = text
        .split(/\r?\n/)
        .map(line => line.trimEnd())
        .filter(line => line.length > 0);
    return lines.slice(-maxLines);
}

/**
 * Formats the tail of Chrome's stderr for inclusion in an error message.
 *
 * @param text - Everything captured so far.
 * @param maxLines - How many lines to quote.
 * @returns A leading-newline block, or an empty string when there is nothing to say.
 * @remarks
 * Empty stderr is common and must not turn into an empty "Chrome stderr:" heading
 * that suggests the capture is broken.
 */
export function formatStderrTail(text: string, maxLines: number = STDERR_TAIL_LINES): string {
    const lines = tailLines(text, maxLines);
    if (lines.length === 0) {
        return '';
    }
    const noun = lines.length === 1 ? 'line' : 'lines';
    const body = lines.map(line => `  ${line}`).join('\n');
    return `\nChrome stderr (last ${lines.length} ${noun}):\n${body}`;
}

/**
 * What went wrong while starting the browser.
 *
 * @remarks
 * The three cases are kept apart because a caller can act on them differently.
 * `exited` is usually a sandbox or profile problem, `silent` is usually a slow
 * machine or a taken port, and `socket` is a race that one retry usually clears.
 * Collapsing them into "did not start in time" was the original bug.
 */
export interface StartFailureReport {
    /** Which of the three failures this is. */
    kind: 'exited' | 'silent' | 'socket';
    /** Port the DevTools endpoint was expected on. */
    port: number;
    /** Milliseconds the start was given. */
    timeoutMs: number;
    /** Exit code, for `exited`. */
    exitCode?: number | null;
    /** Last transport error, for `silent` and `socket`. */
    lastError?: string;
    /** Chrome's stderr, quoted in the tail. */
    stderr?: string;
}

/**
 * Builds the message for a failure to start the browser.
 *
 * @param report - What happened.
 * @returns One message: the prefix, the distinguishing detail, and the stderr tail.
 */
export function describeStartFailure(report: StartFailureReport): string {
    const tail = formatStderrTail(report.stderr ?? '');
    if (report.kind === 'exited') {
        return (
            `${START_FAILURE_PREFIX}: the browser process exited while starting ` +
            `(code ${report.exitCode ?? 'unknown'}).${tail}`
        );
    }
    if (report.kind === 'socket') {
        return (
            `${START_FAILURE_PREFIX}: DevTools answered on 127.0.0.1:${report.port} but the ` +
            `debug socket would not open (${report.lastError || 'no reason given'}).${tail}`
        );
    }
    return (
        `${START_FAILURE_PREFIX}: the browser is running but never opened DevTools on ` +
        `127.0.0.1:${report.port} within ${report.timeoutMs}ms ` +
        `(last attempt: ${report.lastError || 'no answer'}). ` +
        `Set ${BROWSER_START_ENV} to wait longer, or check whether another process holds the port.${tail}`
    );
}
