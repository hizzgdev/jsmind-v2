/**
 * @fileoverview Startup policy for the export browser: how long the start is
 * given, which port it may use, and what the failure message carries.
 *
 * @remarks
 * These are the parts of a browser start that can be decided without a browser,
 * which is why they were pulled out of `browser.ts`: the wait budget and the
 * port choice are exactly what a busy CI runner turns into a red build, and a
 * driver excluded from coverage has no way to assert on them.
 *
 * The port tests bind real sockets on loopback rather than mocking `net`. A
 * mocked bind would only prove that the mock was called; the bug being fixed
 * was that nothing was asked at all.
 */

import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import type { Server } from 'node:net';
import { test } from 'node:test';

import {
    BROWSER_START_ENV,
    DEFAULT_BROWSER_START_MS,
    START_FAILURE_PREFIX,
    STDERR_TAIL_LINES,
    describeStartFailure,
    formatStderrTail,
    isPortFree,
    pickFreePort,
    resolveBrowserStartMs,
    tailLines,
} from '../../src/cli/browser-start.ts';
import { CliError, CliExit } from '../../src/cli/exit.ts';

/** Binds loopback, optionally on a port the caller names. */
function listen(port: number): Promise<Server> {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.once('error', reject);
        server.listen({ port, host: '127.0.0.1' }, () => resolve(server));
    });
}

/** Port a bound server actually got; `listen(0)` leaves the choice to the OS. */
function portOf(server: Server): number {
    const address = server.address();
    assert.ok(address !== null && typeof address === 'object', 'expected an IP address');
    return address.port;
}

/** Releases a listener and waits until the port is really gone. */
function close(server: Server): Promise<void> {
    return new Promise((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
    });
}

test('resolveBrowserStartMs: an unset variable keeps the one-minute default', () => {
    assert.equal(DEFAULT_BROWSER_START_MS, 60_000);
    assert.equal(resolveBrowserStartMs({}), DEFAULT_BROWSER_START_MS);
});

test('resolveBrowserStartMs: the environment overrides the default', () => {
    assert.equal(resolveBrowserStartMs({ [BROWSER_START_ENV]: '90000' }), 90_000);
    // Padded on purpose: a CI variable pasted with spaces should still work.
    assert.equal(resolveBrowserStartMs({ [BROWSER_START_ENV]: ' 45000 ' }), 45_000);
    assert.equal(resolveBrowserStartMs({ [BROWSER_START_ENV]: '2500.9' }), 2500);
});

test('resolveBrowserStartMs: a value that cannot be a wait keeps the default', () => {
    for (const raw of ['', '   ', 'abc', '0', '-1', 'Infinity']) {
        assert.equal(
            resolveBrowserStartMs({ [BROWSER_START_ENV]: raw }),
            DEFAULT_BROWSER_START_MS,
            `${BROWSER_START_ENV}=${JSON.stringify(raw)}`
        );
    }
});

test('resolveBrowserStartMs: reads process.env when no environment is passed', () => {
    const saved = process.env[BROWSER_START_ENV];
    process.env[BROWSER_START_ENV] = '1234';
    try {
        assert.equal(resolveBrowserStartMs(), 1234);
    } finally {
        if (saved === undefined) {
            delete process.env[BROWSER_START_ENV];
        } else {
            process.env[BROWSER_START_ENV] = saved;
        }
    }
});

test('isPortFree: false while a listener holds the port, true once it is gone', async () => {
    const holder = await listen(0);
    const port = portOf(holder);
    try {
        assert.equal(await isPortFree(port), false);
    } finally {
        await close(holder);
    }
    assert.equal(await isPortFree(port), true);
});

test('pickFreePort: a taken port costs one probe, not the whole render', async () => {
    const holder = await listen(0);
    const taken = portOf(holder);
    try {
        const picked = await pickFreePort({ start: taken, size: 4, random: () => 0 });
        assert.notEqual(picked, taken);
        assert.ok(picked > taken && picked < taken + 4, `${picked} should sit next to ${taken}`);
        assert.equal(await isPortFree(picked), true);
    } finally {
        await close(holder);
    }
});

test('pickFreePort: starts at the random offset and walks forward from there', async () => {
    const probes: number[] = [];
    const picked = await pickFreePort({
        start: 9500,
        size: 10,
        random: () => 0.5,
        probe: async port => {
            probes.push(port);
            return port === 9507;
        },
    });
    assert.equal(picked, 9507);
    assert.deepEqual(probes, [9505, 9506, 9507]);
});

test('pickFreePort: an offset at the end of the window wraps to its start', async () => {
    // Math.random() never returns 1; this pins the modulo so a future change to
    // the range cannot walk off the end of the window.
    const picked = await pickFreePort({ start: 9500, size: 10, random: () => 1, probe: async () => true });
    assert.equal(picked, 9500);
});

test('pickFreePort: a full window is reported as such', async () => {
    await assert.rejects(
        () => pickFreePort({ start: 9500, size: 3, random: () => 0, probe: async () => false }),
        (error: unknown) => {
            assert.ok(error instanceof CliError);
            assert.equal(error.exit, CliExit.IoError);
            assert.match(error.message, /9500-9502/);
            return true;
        }
    );
});

test('tailLines: keeps the newest non-blank lines', () => {
    assert.deepEqual(tailLines('a\n\nb\r\n  \nc\n'), ['a', 'b', 'c']);
    assert.deepEqual(tailLines('one\ntwo\nthree', 2), ['two', 'three']);
    assert.deepEqual(tailLines('single', 5), ['single']);
    assert.deepEqual(tailLines('', 5), []);
});

test('formatStderrTail: nothing captured adds nothing to the message', () => {
    assert.equal(formatStderrTail(''), '');
    assert.equal(formatStderrTail('\n  \n'), '');
});

test('formatStderrTail: quotes what it has, and counts it', () => {
    assert.equal(formatStderrTail('one\ntwo'), '\nChrome stderr (last 2 lines):\n  one\n  two');
    assert.equal(formatStderrTail('boom'), '\nChrome stderr (last 1 line):\n  boom');
});

test('formatStderrTail: keeps the tail, not the noise from launch', () => {
    const noise = Array.from({ length: 30 }, (_, index) => `line ${index}`).join('\n');
    const text = formatStderrTail(noise);
    assert.ok(text.startsWith(`\nChrome stderr (last ${STDERR_TAIL_LINES} lines):\n  line 10\n`));
    assert.ok(text.trimEnd().endsWith('line 29'));
});

test('describeStartFailure: a process that died reports the exit code and its stderr', () => {
    const message = describeStartFailure({
        kind: 'exited',
        port: 9300,
        timeoutMs: 60_000,
        exitCode: 1,
        stderr: 'Failed to move to new namespace\n',
    });
    assert.ok(message.startsWith(START_FAILURE_PREFIX));
    assert.match(message, /exited while starting \(code 1\)/);
    assert.match(message, /Chrome stderr \(last 1 line\):\n {2}Failed to move to new namespace/);
    // A dead process is not a length problem, so the waiting advice stays out.
    assert.ok(!message.includes(BROWSER_START_ENV));
});

test('describeStartFailure: a silent process names the port, the wait and the way out', () => {
    const message = describeStartFailure({
        kind: 'silent',
        port: 9301,
        timeoutMs: 60_000,
        lastError: 'fetch failed',
    });
    assert.match(message, /is running but never opened DevTools on 127\.0\.0\.1:9301 within 60000ms/);
    assert.match(message, /last attempt: fetch failed/);
    assert.ok(message.includes(BROWSER_START_ENV));
});

test('describeStartFailure: a silent process with no transport error still says something', () => {
    assert.match(describeStartFailure({ kind: 'silent', port: 1, timeoutMs: 2 }), /last attempt: no answer/);
});

test('describeStartFailure: unknown exit code and socket failures are described too', () => {
    assert.match(describeStartFailure({ kind: 'exited', port: 1, timeoutMs: 2, exitCode: null }), /code unknown/);
    assert.match(
        describeStartFailure({ kind: 'socket', port: 9302, timeoutMs: 2, lastError: 'ECONNRESET' }),
        /socket would not open \(ECONNRESET\)/
    );
    assert.match(describeStartFailure({ kind: 'socket', port: 3, timeoutMs: 2 }), /no reason given/);
});

test('describeStartFailure: the two shapes do not read the same', () => {
    const exited = describeStartFailure({ kind: 'exited', port: 1, timeoutMs: 1, exitCode: 7 });
    const silent = describeStartFailure({ kind: 'silent', port: 1, timeoutMs: 1 });
    assert.notEqual(exited, silent);
    // One stable prefix is what lets the CI retry tell these apart from a page error.
    assert.ok(exited.startsWith(START_FAILURE_PREFIX));
    assert.ok(silent.startsWith(START_FAILURE_PREFIX));
});
