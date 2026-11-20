/**
 * @fileoverview The one-retry wrapper around the preview render.
 *
 * @remarks
 * The retry exists for a failed browser start on a shared CI runner, and the
 * risk of a retry is that it spreads to failures it cannot help with. The cases
 * below pin both halves: what is repeated, and - more importantly - what is not.
 *
 * The attempt is injected, so these run with no browser, no build and no child
 * process. What is being asserted is the decision, not the spawn.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { MAX_ATTEMPTS, isRetryableStartFailure, runWithRetry } from '../../scripts/render-preview.ts';
import type { RenderOutcome } from '../../scripts/render-preview.ts';
import { START_FAILURE_PREFIX } from '../../src/cli/browser-start.ts';
import { CliExit } from '../../src/cli/exit.ts';
import { capture } from '../cli/helpers.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** The stderr line the CLI opens a start failure with. */
const START_FAILURE = `${START_FAILURE_PREFIX}: the browser is running but never opened DevTools on 127.0.0.1:9222 within 60000ms.\n`;

/** Builds an attempt outcome. */
function outcome(status: number | null, stderr = ''): RenderOutcome {
    return { status, stderr };
}

test('isRetryableStartFailure: only exit 3 with a start failure on stderr', () => {
    assert.equal(isRetryableStartFailure(outcome(CliExit.IoError, START_FAILURE)), true);
    // Exit 3 is also how a write error and a page that threw are reported; a
    // second attempt would fail the same way.
    assert.equal(isRetryableStartFailure(outcome(CliExit.IoError, 'Rendering failed: SecurityError\n')), false);
    // Right message, wrong class: a data problem is not a runner problem.
    assert.equal(isRetryableStartFailure(outcome(CliExit.InvalidData, START_FAILURE)), false);
    assert.equal(isRetryableStartFailure(outcome(null, START_FAILURE)), false);
});

test('runWithRetry: a render that works runs exactly once', () => {
    const calls: string[][] = [];
    const result = capture(() =>
        runWithRetry(
            ['in.json', 'out.png'],
            args => {
                calls.push(args);
                return outcome(CliExit.Ok);
            },
            () => assert.fail('a successful render must not log a retry')
        )
    );
    assert.equal(result.out, '');
    assert.equal(result.err, '');
    assert.deepEqual(calls, [['in.json', 'out.png']]);
});

test('runWithRetry: a failed start is retried once, and the log says which attempt', () => {
    let calls = 0;
    let exit = -1;
    const logs: string[] = [];
    const result = capture(() => {
        exit = runWithRetry(
            ['in.json', 'out.png'],
            () => (++calls === 1 ? outcome(CliExit.IoError, START_FAILURE) : outcome(CliExit.Ok)),
            line => logs.push(line)
        );
    });
    assert.equal(calls, 2);
    assert.equal(exit, CliExit.Ok);
    assert.equal(result.err, START_FAILURE);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /^::warning::render attempt 1\/2 failed to start the browser \(exit 3\); retrying once$/);
});

test('runWithRetry: a second failed start ends the step with exit 3 and both diagnoses', () => {
    const attempts = [START_FAILURE, `${START_FAILURE_PREFIX}： second attempt\n`];
    const logs: string[] = [];
    let calls = 0;
    const result = capture(() =>
        runWithRetry(
            ['in.json', 'out.png'],
            () => outcome(CliExit.IoError, attempts[calls++]),
            line => logs.push(line)
        )
    );
    assert.equal(calls, MAX_ATTEMPTS);
    assert.equal(logs.length, 1);
    // Both attempts' stderr reaches the log: if they stalled identically, that
    // is the difference between a slow runner and a port that stays occupied.
    assert.ok(result.err.includes(attempts[0]));
    assert.ok(result.err.includes(attempts[1]));
});

test('runWithRetry: any other failure is passed through without a second attempt', () => {
    let calls = 0;
    const logs: string[] = [];
    const result = capture(() =>
        runWithRetry(
            ['in.json', 'out.png'],
            () => {
                calls++;
                return outcome(CliExit.InvalidData, 'in.json: 2 problem(s)\n');
            },
            line => logs.push(line)
        )
    );
    assert.equal(calls, 1);
    assert.equal(logs.length, 0);
    assert.equal(result.err, 'in.json: 2 problem(s)\n');
});

test('runWithRetry: an attempt that could not be spawned exits 3, not 0', () => {
    let calls = 0;
    let exit = -1;
    const result = capture(() => {
        exit = runWithRetry(
            ['in.json', 'out.png'],
            () => {
                calls++;
                return outcome(null, '');
            },
            () => undefined
        );
    });
    assert.equal(calls, 1);
    assert.equal(exit, CliExit.IoError);
    assert.equal(result.err, '');
});

test('the Render preview step goes through this wrapper', () => {
    // Without this, the retry could be dropped from the workflow and every test
    // above would still pass.
    const action = readFileSync(join(ROOT, '.github/actions/render-map/action.yml'), 'utf8');
    assert.match(action, /node scripts\/render-preview\.ts/);
    assert.ok(!/node dist\/cli\.js export/.test(action), 'the action should not bypass the retry');
});
