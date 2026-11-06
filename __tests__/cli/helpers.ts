/**
 * @fileoverview Shared helpers for CLI tests.
 *
 * @remarks
 * Both command suites drive commands as functions and assert on what they
 * write, so the setup is the same. Keeping one copy means a change to how
 * output is captured cannot land in one suite and not the other.
 */

import { mock } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Creates a scratch directory that the caller is responsible for removing.
 *
 * @returns Absolute path to a fresh directory.
 */
export function scratch(): string {
    return mkdtempSync(join(tmpdir(), 'jsmind-cli-'));
}

/**
 * Captures everything a command writes to stdout and stderr.
 *
 * @remarks
 * The mocks are restored in a `finally` so a throwing command cannot leave
 * process.stdout patched for the next test in the same file.
 *
 * @param run - Callback that triggers the command.
 * @returns What was written to each stream.
 */
export function capture(run: () => void): { out: string; err: string } {
    const out: string[] = [];
    const err: string[] = [];
    const outMock = mock.method(process.stdout, 'write', (chunk: string | Uint8Array) => {
        out.push(String(chunk));
        return true;
    });
    const errMock = mock.method(process.stderr, 'write', (chunk: string | Uint8Array) => {
        err.push(String(chunk));
        return true;
    });
    try {
        run();
    } finally {
        outMock.mock.restore();
        errMock.mock.restore();
    }
    return { out: out.join(''), err: err.join('') };
}
