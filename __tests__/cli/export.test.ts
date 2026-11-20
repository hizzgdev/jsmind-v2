/**
 * @fileoverview Usage checks for `jsmind export` that do not need a browser.
 *
 * Rendering itself is covered by the UI suite. What is left here is the
 * command-line contract around `--transparent`: it is advertised, and it is
 * rejected when the chosen format cannot carry an alpha channel.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runExport, exportHelp } from '../../src/cli/commands/export.ts';
import { JmImageType, TRANSPARENT_JPEG_ERROR } from '../../src/view/export.ts';
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

test('cli - export --transparent is rejected for JPEG before a file is read', async () => {
    await assert.rejects(
        () =>
            runExport({
                file: 'missing.json',
                output: 'out.jpg',
                width: 1200,
                height: 800,
                scale: 1,
                type: JmImageType.Jpeg,
                asJson: false,
                transparent: true,
            }),
        (error: unknown) => {
            assert.ok(error instanceof CliError);
            assert.strictEqual(error.exit, CliExit.Usage);
            assert.strictEqual(error.message, TRANSPARENT_JPEG_ERROR);
            return true;
        }
    );
});

test('cli - export --transparent --type image/jpeg exits 2', () => {
    const run = runCli([
        'export',
        'missing.json',
        'out.jpg',
        '--transparent',
        '--type',
        'image/jpeg',
    ]);

    assert.strictEqual(run.code, CliExit.Usage);
    assert.ok(run.stderr.includes(TRANSPARENT_JPEG_ERROR), `stderr should explain the conflict, got: ${run.stderr}`);
});
