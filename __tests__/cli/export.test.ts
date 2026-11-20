/**
 * @fileoverview Usage checks for `jsmind export` that do not need a browser.
 *
 * Rendering itself is covered by the UI suite. What is left here is the
 * command-line contract around `--transparent`: it is advertised, and JPEG
 * cannot carry an alpha channel so the flag is ignored with a warning rather
 * than failing the export.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runExport, exportHelp } from '../../src/cli/commands/export.ts';
import {
    JmImageType,
    TRANSPARENT_JPEG_WARNING,
    shouldExportTransparent,
} from '../../src/view/export.ts';
import { CliError, CliExit } from '../../src/cli/exit.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '../../src/cli/index.ts');

/**
 * Runs the CLI as a real child process.
 *
 * @param args - Arguments after the program name.
 * @returns Exit code and what was written to both streams.
 */
function runCli(args: string[]): { code: number; stdout: string; stderr: string } {
    const result = spawnSync(
        process.execPath,
        ['--experimental-strip-types', '--no-warnings', CLI, ...args],
        { encoding: 'utf8' }
    );
    return { code: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

test('cli - export --help lists --transparent', () => {
    const run = runCli(['export', '--help']);

    assert.strictEqual(run.code, 0);
    assert.ok(run.stdout.includes('--transparent'), 'the export help should list --transparent');
    assert.strictEqual(run.stdout, `${exportHelp}\n`);
});

test('cli - shouldExportTransparent warns and returns false for JPEG', () => {
    const warnings: string[] = [];

    assert.strictEqual(shouldExportTransparent(JmImageType.Png, true), true);
    assert.strictEqual(shouldExportTransparent(JmImageType.Webp, true), true);
    assert.strictEqual(shouldExportTransparent(JmImageType.Png, false), false);
    assert.strictEqual(shouldExportTransparent(JmImageType.Jpeg, false), false);
    assert.strictEqual(
        shouldExportTransparent(JmImageType.Jpeg, true, message => warnings.push(message)),
        false
    );
    assert.deepStrictEqual(warnings, [TRANSPARENT_JPEG_WARNING]);
});

test('cli - export --transparent with JPEG warns and does not fail as usage', async () => {
    const writes: string[] = [];
    const originalWrite = process.stderr.write;
    process.stderr.write = function (chunk: string | Uint8Array, ...args: unknown[]): boolean {
        writes.push(String(chunk));
        return originalWrite.apply(this, [chunk, ...args] as Parameters<typeof originalWrite>);
    };

    let error: unknown;
    try {
        await runExport({
            file: 'missing.json',
            output: 'out.jpg',
            width: 1200,
            height: 800,
            scale: 1,
            type: JmImageType.Jpeg,
            asJson: false,
            transparent: true,
        });
    } catch (caught) {
        error = caught;
    } finally {
        process.stderr.write = originalWrite;
    }

    const stderr = writes.join('');
    assert.ok(error instanceof CliError);
    assert.strictEqual(error.exit, CliExit.IoError, 'a missing file is still an IO error, not a usage error');
    assert.ok(stderr.includes(TRANSPARENT_JPEG_WARNING), `stderr should warn, got: ${stderr}`);
});

test('cli - export --transparent --type image/jpeg warns and does not exit 2', () => {
    const run = runCli([
        'export',
        'missing.json',
        'out.jpg',
        '--transparent',
        '--type',
        'image/jpeg',
    ]);

    assert.notStrictEqual(run.code, CliExit.Usage);
    assert.strictEqual(run.code, CliExit.IoError);
    assert.ok(
        run.stderr.includes(TRANSPARENT_JPEG_WARNING),
        `stderr should warn that transparency was ignored, got: ${run.stderr}`
    );
    assert.ok(run.stderr.includes('File not found'), `stderr should still report the missing file, got: ${run.stderr}`);
});
