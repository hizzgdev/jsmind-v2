/**
 * @fileoverview `Render preview`'s render step, with one retry for a browser
 * that failed to start.
 *
 * @remarks
 * The render itself is `jsmind export image`, unchanged. This wrapper exists because
 * of what that command depends on: a Chrome launch on a shared CI runner. The
 * same image took ~3s to print `google-chrome --version` on one run and ~10s on
 * the next, and a start that ran out of budget failed the whole job for a reason
 * that had nothing to do with the diff. A second launch usually lands on a
 * machine that has finished whatever it was busy with.
 *
 * The retry is deliberately narrow: exit code 3 *and* a stderr carrying
 * {@link START_FAILURE_PREFIX}. Bad data (1), a bad command line (2), a page
 * that threw while rendering - all of those fail the same way on the second
 * attempt, so retrying them only doubles the wait before a red build.
 *
 * @packageDocumentation
 */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { START_FAILURE_PREFIX } from '../src/cli/browser-start.ts';
import { CliExit } from '../src/cli/exit.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** How many times the render may run; two means one retry. */
export const MAX_ATTEMPTS = 2;

/** What one attempt produced. */
export interface RenderOutcome {
    /** Exit code, or null when the child could not be started at all. */
    status: number | null;
    /** Everything the CLI wrote to stderr. */
    stderr: string;
}

/**
 * Decides whether an attempt is worth repeating.
 *
 * @param outcome - Exit code and stderr of the attempt that just failed.
 * @returns True only for a browser that failed to start.
 * @remarks
 * The exit code alone is not enough - 3 also covers a file that cannot be
 * written and a page that threw - and the message alone is not enough either,
 * because a shell wrapper or a Node warning could quote the phrase. It takes
 * both.
 */
export function isRetryableStartFailure(outcome: RenderOutcome): boolean {
    return outcome.status === CliExit.IoError && outcome.stderr.includes(START_FAILURE_PREFIX);
}

/**
 * Runs `jsmind export image` once.
 *
 * @param args - Arguments after `export image`, i.e. file, output and options.
 * @returns Exit code and captured stderr; stdout is left inherited so the
 * rendered-image line reaches the job log as it is produced.
 */
export function renderOnce(args: string[]): RenderOutcome {
    const cli = join(ROOT, 'dist', 'cli.js');
    const result = spawnSync(process.execPath, [cli, 'export', 'image', ...args], {
        stdio: ['ignore', 'inherit', 'pipe'],
        encoding: 'utf8',
    });
    if (result.error) {
        return { status: CliExit.IoError, stderr: `Cannot run ${cli}: ${result.error.message}\n` };
    }
    return { status: result.status, stderr: result.stderr ?? '' };
}

/**
 * Runs the render, retrying a failed browser start once.
 *
 * @param args - Arguments after `export image`.
 * @param attempt - One attempt; injectable so the retry policy can be tested
 * without a browser or a build.
 * @param log - Where the retry annotation goes; stderr by default.
 * @returns The exit code the step should end with.
 */
export function runWithRetry(
    args: string[],
    attempt: (args: string[]) => RenderOutcome = renderOnce,
    log: (line: string) => void = line => process.stderr.write(`${line}\n`)
): number {
    for (let number = 1; number <= MAX_ATTEMPTS; number++) {
        const outcome = attempt(args);
        if (outcome.status === CliExit.Ok) {
            return CliExit.Ok;
        }

        const exhausted = number >= MAX_ATTEMPTS;
        if (!isRetryableStartFailure(outcome) || exhausted) {
            // The last attempt's stderr is the one that explains the failure;
            // earlier attempts have already been quoted by their own warning.
            process.stderr.write(outcome.stderr);
            return outcome.status ?? CliExit.IoError;
        }

        // A workflow command, so the retry shows up in the run summary rather
        // than only in the fold-out log nobody opens until something is red.
        log(
            `::warning::render attempt ${number}/${MAX_ATTEMPTS} failed to start the browser ` +
                `(exit ${outcome.status}); retrying once`
        );
        // Keep the first attempt's diagnosis: if the retry also fails, knowing
        // that both attempts stalled on the same thing is what separates a slow
        // runner from a port that stays occupied.
        process.stderr.write(outcome.stderr);
    }
    return CliExit.IoError;
}

// Run only as a program: the tests import the functions above.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    process.exitCode = runWithRetry(process.argv.slice(2));
}
