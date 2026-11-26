/**
 * @fileoverview End-to-end `jsmind export image` against a real browser.
 *
 * @remarks
 * `__tests__/cli/export.test.ts` covers the command line and stops before a
 * renderer is needed. Two things only a real render can answer, and they are
 * what this file is for:
 *
 * 1. `--type` decides the bytes on disk, not the file name — `--type jpeg` into
 *    an `out.png` writes JPEG, warns once, and exits 0.
 * 2. The group form produces the same picture the single-command form did. The
 *    PNG signature and the `--json` shape are pinned here; the byte-for-byte
 *    comparison with the previous release is done by hand in the PR, because a
 *    committed pixel fixture would tie this suite to one browser's encoder.
 *
 * It drives `dist/cli.js`, so it needs a build (as the rest of the UI suite
 * does) and a Chromium binary.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { isRetryableStartFailure } from '../../scripts/render-preview.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '../..');
const CLI = join(REPO_ROOT, 'dist/cli.js');
const FIXTURE = join(HERE, '../e2e/fixtures/valid-styled.json');

/** First bytes of a PNG file. */
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Start-of-image marker every JPEG file begins with. */
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

/**
 * Invocations allowed per export; two means one retry.
 *
 * @remarks
 * `test:ui` runs its files in parallel, so this one starts a browser while
 * `agent-workflow.test.ts` is starting another on the same runner — which is
 * how a start that works on its own can miss its 60s budget in CI. The retry
 * policy is the one the Render preview job already uses: only a browser that
 * failed to start (exit 3 carrying the start-failure prefix) is repeated,
 * because a usage error or a page that threw fails the same way twice.
 */
const RUN_ATTEMPTS = 2;

/** Result of one CLI invocation. */
interface CliRun {
    code: number;
    stdout: string;
    stderr: string;
}

/**
 * Runs the built CLI as a real child process, retrying a browser that failed
 * to start.
 *
 * @param args - Arguments after the program name.
 * @returns Exit code and what was written to both streams.
 */
function runCli(args: string[]): CliRun {
    let last: CliRun | undefined;
    for (let attempt = 1; attempt <= RUN_ATTEMPTS; attempt++) {
        const result = spawnSync(process.execPath, [CLI, ...args], {
            encoding: 'utf8',
            // A stalled browser start would otherwise hang the test file: the
            // renderer's own budget is generous, this is the backstop.
            timeout: 120_000,
        });
        last = {
            code: result.status ?? -1,
            stdout: result.stdout ?? '',
            stderr: result.stderr ?? '',
        };
        const retryable = isRetryableStartFailure({ status: result.status, stderr: last.stderr });
        if (!retryable || attempt === RUN_ATTEMPTS) {
            break;
        }
        console.error(
            `ui export attempt ${attempt}/${RUN_ATTEMPTS} could not start the browser ` +
                `(exit ${last.code}); retrying once`
        );
    }
    return last!;
}

/** The `jsmind: warning:` lines in a stderr transcript. */
function warningLines(stderr: string): string[] {
    return stderr.split('\n').filter(line => line.startsWith('jsmind: warning:'));
}

/** The `--json` result object a successful export prints. */
interface ExportReport {
    output: string;
    width: number;
    height: number;
    cssWidth: number;
    cssHeight: number;
    bytes: number;
    type: string;
}

test('ui - export image writes a PNG by default, with the fields --json always had', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jsmind-export-png-'));
    const out = join(dir, 'styled.png');

    try {
        const run = runCli(['export', 'image', FIXTURE, out, '--json']);

        assert.strictEqual(run.code, 0, run.stderr);
        assert.deepStrictEqual(warningLines(run.stderr), [], 'an agreeing extension is not warned about');

        const bytes = readFileSync(out);
        assert.deepStrictEqual([...bytes.subarray(0, 8)], PNG_MAGIC, 'the default type is still PNG');

        const report = JSON.parse(run.stdout) as ExportReport;
        assert.deepStrictEqual(Object.keys(report).sort(), [
            'bytes',
            'cssHeight',
            'cssWidth',
            'height',
            'output',
            'type',
            'width',
        ]);
        assert.strictEqual(report.output, out);
        assert.strictEqual(report.type, 'image/png', 'the JSON keeps the MIME type, not the CLI word');
        assert.strictEqual(report.bytes, bytes.length);
        assert.ok(report.width > 0 && report.height > 0, 'the render has a size');
        // Rendered at the default 2x: the pixel size is the CSS size doubled,
        // allowing for the rounding the two fields apply separately.
        assert.ok(
            Math.abs(report.width - report.cssWidth * 2) <= 2,
            `width ${report.width} should be about twice cssWidth ${report.cssWidth}`
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('ui - export image --type jpeg writes JPEG bytes into the name it was given', () => {
    // The whole point of the split: `--type` chooses the encoding and the path
    // is written exactly as typed. Renaming would break the caller; obeying the
    // extension would silently override the flag. One warning, exit 0, JPEG
    // bytes in a file called `.png`.
    const dir = mkdtempSync(join(tmpdir(), 'jsmind-export-jpeg-'));
    const out = join(dir, 'styled.png');

    try {
        const run = runCli(['export', 'image', FIXTURE, out, '--type', 'jpeg', '--json']);

        assert.strictEqual(run.code, 0, run.stderr);
        const warnings = warningLines(run.stderr);
        assert.strictEqual(warnings.length, 1, `expected one warning line, got: ${run.stderr}`);
        assert.match(warnings[0]!, /--type jpeg/);
        assert.match(warnings[0]!, /styled\.png/);

        const bytes = readFileSync(out);
        assert.deepStrictEqual([...bytes.subarray(0, 3)], JPEG_MAGIC, 'the bytes are JPEG');
        assert.strictEqual(JSON.parse(run.stdout).type, 'image/jpeg');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
