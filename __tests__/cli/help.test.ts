/**
 * @fileoverview `--help` at each level prints only its own block.
 *
 * @remarks
 * These drive the CLI as a child process, the way the end-to-end suite does,
 * because the defect lived in the argument dispatcher rather than in the help
 * text: asserting on the constants alone would have passed while
 * `jsmind mind --help` still printed the full index. What is checked here is
 * what a caller actually receives.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HELP } from '../../src/cli/index.ts';
import { mindHelp } from '../../src/cli/commands/mind.ts';
import { nodeHelp, setStyleHelp } from '../../src/cli/commands/node.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '../../src/cli/index.ts');

/**
 * Runs the CLI as a real child process.
 *
 * @param args - Arguments after the program name.
 * @returns Exit code and what was written to stdout.
 */
function runCli(args: string[]): { code: number; stdout: string } {
    const result = spawnSync(
        process.execPath,
        ['--experimental-strip-types', '--no-warnings', CLI, ...args],
        { encoding: 'utf8' }
    );
    return { code: result.status ?? -1, stdout: result.stdout ?? '' };
}

test('help - the root help is what no command, `help` and `--help` print', () => {
    // The index is the only complete page and stays untouched, so all three
    // entry points must keep producing exactly it — including the trailing
    // newline the dispatcher adds.
    for (const args of [[], ['help'], ['--help']]) {
        const run = runCli(args);
        assert.strictEqual(run.code, 0, `jsmind ${args.join(' ')} should succeed`);
        assert.strictEqual(run.stdout, `${HELP}\n`, `jsmind ${args.join(' ')} should print the index`);
    }
});

test('help - `mind --help` prints the mind block and nothing else', () => {
    const run = runCli(['mind', '--help']);

    assert.strictEqual(run.code, 0);
    assert.strictEqual(run.stdout, `${mindHelp}\n`);
    assert.ok(run.stdout.includes('add-child'), 'the mind block should list its subcommands');
    assert.ok(
        !run.stdout.includes('jsmind create'),
        'the mind block should not carry the cross-boundary commands'
    );
});

test('help - `node --help` prints the node block without the mind command list', () => {
    const run = runCli(['node', '--help']);

    assert.strictEqual(run.code, 0);
    assert.strictEqual(run.stdout, `${nodeHelp}\n`);
    assert.ok(run.stdout.includes('set-style'));
    // The block does mention `jsmind mind` once, as a pointer at where
    // structure lives; what it must not carry is the mind subcommand list
    // itself, so a mind-only subcommand is the thing to look for.
    assert.ok(!run.stdout.includes('add-child'), 'the node block should not list mind subcommands');
});

test('help - `node set-style --help` prints only the style field table', () => {
    const run = runCli(['node', 'set-style', '--help']);

    assert.strictEqual(run.code, 0);
    assert.strictEqual(run.stdout, `${setStyleHelp}\n`);
    assert.ok(run.stdout.includes('--tone'), 'the field table should list its flags');
    assert.ok(!run.stdout.includes('set-folded'), 'the other node subcommands belong to the group help');
});

test('help - `help <topic>` is the same request as `<topic> --help`', () => {
    const aliased = runCli(['help', 'mind']);
    const flagged = runCli(['mind', '--help']);

    assert.strictEqual(aliased.code, 0);
    assert.strictEqual(aliased.stdout, flagged.stdout);
});

test('help - a mind subcommand other than set-style still gets the group block', () => {
    // Only set-style has a third level, so anything else under `mind` stops at
    // the group. Pinned here so the ladder cannot silently collapse back to the
    // index for an unrecognised subcommand.
    const run = runCli(['mind', 'add-node', '--help']);

    assert.strictEqual(run.code, 0);
    assert.strictEqual(run.stdout, `${mindHelp}\n`);
});
