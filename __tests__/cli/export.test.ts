/**
 * @fileoverview Usage checks for `jsmind export` that do not need a browser.
 *
 * Rendering itself is covered by the UI suite. What is left here is the
 * command-line contract around the group: the kind word that has to come first,
 * the short `--type` names and their `jpg` alias, and `--transparent`, which
 * JPEG cannot honour.
 *
 * A successful export needs a browser, so every case below either fails before
 * the renderer is reached or asserts on a run that fails for a reason this
 * suite can produce (a missing input file). The one case that must observe real
 * bytes — `--type jpeg` writing a JPEG into `out.png` and exiting 0 — lives in
 * `__tests__/ui/export-cli.test.ts`, where a browser is already required.
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

/**
 * The `jsmind: warning:` lines in a stderr transcript.
 *
 * @param stderr - What the command wrote.
 * @returns One entry per warning line, in order.
 * @remarks
 * The mismatch warning is meant to be one line, and "one line" is what a caller
 * notices: a second one there is noise on every run of a legitimate command.
 */
function warningLines(stderr: string): string[] {
    return stderr.split('\n').filter(line => line.startsWith('jsmind: warning:'));
}

test('cli - export --help lists the kinds and --transparent', () => {
    const run = runCli(['export', '--help']);

    assert.strictEqual(run.code, 0);
    assert.ok(run.stdout.includes('--transparent'), 'the export help should list --transparent');
    assert.ok(run.stdout.includes('image'), 'the group page should list its kinds');
    assert.ok(run.stdout.includes('png, jpeg, webp'), 'and the encodings --type takes');
    assert.strictEqual(run.stdout, `${exportHelp}\n`);
});

test('cli - `export image --help` is the group page, not a second level', () => {
    // One kind does not earn a page of its own: the group page already carries
    // the kind list and the option table that kind takes.
    const run = runCli(['export', 'image', '--help']);

    assert.strictEqual(run.code, 0);
    assert.strictEqual(run.stdout, `${exportHelp}\n`);
});

test('cli - export without a kind is a usage error, not an image export', () => {
    // The old form (`export <file> <out.png>`) is gone with no compatibility
    // period, so it has to fail loudly: reading the first path as a kind would
    // be a silent guess at what the caller meant.
    for (const args of [['export'], ['export', 'missing.json', 'out.png']]) {
        const run = runCli(args);

        assert.strictEqual(run.code, CliExit.Usage, `jsmind ${args.join(' ')} should be exit 2`);
        assert.match(run.stderr, /kinds: image/, 'the error should name the available kinds');
        assert.ok(!run.stderr.includes('File not found'), 'nothing is read before the kind is judged');
        assert.strictEqual(run.stdout, '', 'a usage error prints no result');
    }
});

test('cli - export rejects a kind it does not have', () => {
    const run = runCli(['export', 'pdf', 'missing.json', 'out.pdf']);

    assert.strictEqual(run.code, CliExit.Usage);
    assert.match(run.stderr, /pdf/, 'the error should quote the word that was not a kind');
    assert.match(run.stderr, /kinds: image/);
    assert.strictEqual(run.stdout, '');
});

test('cli - --type jpg is the same format as jpeg', async () => {
    // `jpg` is an alias, so it has to reach the renderer as JPEG. The
    // transparent warning is the observable proof: it exists only for JPEG, and
    // it is raised from the MIME type the command resolved, not from the word
    // the caller typed. A missing input ends the run at the IO error either
    // way — what matters is that the value was accepted first.
    const jpg = runCli(['export', 'image', 'missing.json', 'out.jpg', '--type', 'jpg', '--transparent']);
    const jpeg = runCli(['export', 'image', 'missing.json', 'out.jpg', '--type', 'jpeg', '--transparent']);

    for (const run of [jpg, jpeg]) {
        assert.strictEqual(run.code, CliExit.IoError, run.stderr);
        assert.ok(
            run.stderr.includes(TRANSPARENT_JPEG_WARNING),
            `--type jpg should mean JPEG, got: ${run.stderr}`
        );
        assert.ok(run.stderr.includes('File not found'));
    }
    assert.strictEqual(jpg.stderr, jpeg.stderr, 'both spellings should behave identically');
});

test('cli - --type rejects a word that is not one of its values', () => {
    const run = runCli(['export', 'image', 'missing.json', 'out.gif', '--type', 'gif']);

    assert.strictEqual(run.code, CliExit.Usage);
    assert.strictEqual(run.stderr, '--type must be one of png, jpeg, webp, got "gif"\n');
    assert.strictEqual(run.stdout, '');
});

test('cli - --type disagrees with the output extension and says so once', () => {
    // Neither side is corrected: the flag decides the bytes, the path is what
    // the caller typed. One line on stderr, and the run continues.
    const run = runCli(['export', 'image', 'missing.json', 'out.png', '--type', 'jpeg']);

    const warnings = warningLines(run.stderr);
    assert.strictEqual(warnings.length, 1, `expected one warning, got: ${run.stderr}`);
    assert.match(warnings[0]!, /--type jpeg/);
    assert.match(warnings[0]!, /out\.png/);
    assert.notStrictEqual(run.code, CliExit.Usage, 'a mismatch is not a usage error');
    assert.strictEqual(run.code, CliExit.IoError, 'the missing input is still the failure that ends the run');
});

test('cli - a matching extension, or one that names no format, is not warned about', () => {
    for (const args of [
        ['export', 'image', 'missing.json', 'out.png'],
        ['export', 'image', 'missing.json', 'out.png', '--type', 'png'],
        ['export', 'image', 'missing.json', 'out.jpg', '--type', 'jpg'],
        // `.bin` promises nothing, so there is nothing for --type to contradict.
        ['export', 'image', 'missing.json', 'out.bin', '--type', 'jpeg'],
    ]) {
        const run = runCli(args);

        assert.strictEqual(run.code, CliExit.IoError, run.stderr);
        assert.deepStrictEqual(warningLines(run.stderr), [], `no warning expected for: ${args.join(' ')}`);
    }
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

test('cli - export image --transparent --type jpeg warns and does not exit 2', () => {
    const run = runCli([
        'export',
        'image',
        'missing.json',
        'out.jpg',
        '--transparent',
        '--type',
        'jpeg',
    ]);

    assert.notStrictEqual(run.code, CliExit.Usage);
    assert.strictEqual(run.code, CliExit.IoError);
    assert.ok(
        run.stderr.includes(TRANSPARENT_JPEG_WARNING),
        `stderr should warn that transparency was ignored, got: ${run.stderr}`
    );
    assert.ok(run.stderr.includes('File not found'), `stderr should still report the missing file, got: ${run.stderr}`);
});
