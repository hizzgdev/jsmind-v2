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
import { createHelp } from '../../src/cli/commands/create.ts';
import { validateHelp } from '../../src/cli/commands/validate.ts';
import { contextHelp } from '../../src/cli/commands/context.ts';
import { exportHelp } from '../../src/cli/commands/export.ts';
import { mindHelp } from '../../src/cli/commands/mind.ts';
import { styleHelp, styleActionHelp } from '../../src/cli/commands/style.ts';
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
    for (const topic of ['mind', 'create', 'validate', 'context', 'export']) {
        const aliased = runCli(['help', topic]);
        const flagged = runCli([topic, '--help']);

        assert.strictEqual(aliased.code, 0, `jsmind help ${topic} should succeed`);
        assert.strictEqual(aliased.stdout, flagged.stdout, `help ${topic} should equal ${topic} --help`);
    }
});

test('help - a mind subcommand other than set-style still gets the group block', () => {
    // Only set-style has a third level, so anything else under `mind` stops at
    // the group. Pinned here so the ladder cannot silently collapse back to the
    // index for an unrecognised subcommand.
    const run = runCli(['mind', 'add-node', '--help']);

    assert.strictEqual(run.code, 0);
    assert.strictEqual(run.stdout, `${mindHelp}\n`);
});

test('help - `mind style --help` prints the document-style block', () => {
    const run = runCli(['mind', 'style', '--help']);

    assert.strictEqual(run.code, 0);
    assert.strictEqual(run.stdout, `${styleHelp}\n`);
    assert.ok(run.stdout.includes('--default-tone'), 'the block names the field it writes');
});

test('help - `mind style set --help` prints the field table instead of the group', () => {
    // The same reason `node set-style` has a third level: the field table is
    // longer than the list that introduces it.
    const run = runCli(['mind', 'style', 'set', '--help']);

    assert.strictEqual(run.code, 0);
    assert.strictEqual(run.stdout, `${styleActionHelp('set')}\n`);
    assert.ok(
        !run.stdout.includes('Document-level style: one declaration'),
        'the group block belongs to the previous level'
    );
});

test('help - every single-page command prints only its own block', () => {
    // `create`, `validate`, `context` and `export` have no second level, so
    // their block is the whole answer. They used to get the 134-line index:
    // the block was in there, but the caller had to find it.
    const cases = [
        { topic: 'create', block: createHelp, foreign: 'set-style' },
        { topic: 'validate', block: validateHelp, foreign: '--title' },
        { topic: 'context', block: contextHelp, foreign: 'add-child' },
        { topic: 'export', block: exportHelp, foreign: 'set-style' },
    ];

    for (const { topic, block, foreign } of cases) {
        const run = runCli([topic, '--help']);

        assert.strictEqual(run.code, 0, `jsmind ${topic} --help should succeed`);
        assert.strictEqual(run.stdout, `${block}\n`, `jsmind ${topic} --help should print only its block`);
        assert.ok(!run.stdout.includes(foreign), `the ${topic} block should not carry ${foreign}`);
    }
});

test('help - `--help` after the file argument still answers for the command', () => {
    // Asking what a command takes should never run it: with `--help` present
    // the dispatcher answers and stops, whether or not a path was typed first.
    const run = runCli(['create', 'not-created.json', '--help']);

    assert.strictEqual(run.code, 0);
    assert.strictEqual(run.stdout, `${createHelp}\n`);
});
