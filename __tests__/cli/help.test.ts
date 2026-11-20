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
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HELP } from '../../src/cli/index.ts';
import { createHelp } from '../../src/cli/commands/create.ts';
import { validateHelp } from '../../src/cli/commands/validate.ts';
import { contextHelp } from '../../src/cli/commands/context.ts';
import { exportHelp } from '../../src/cli/commands/export.ts';
import { mindHelp } from '../../src/cli/commands/mind.ts';
import { mindSetStyleHelp } from '../../src/cli/commands/style.ts';
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
    // Only `set-style` has a block of its own in this group, because only its
    // field table would swamp the group list. Pinned here so the ladder cannot
    // silently collapse back to the index for an unrecognised subcommand.
    const run = runCli(['mind', 'move', '--help']);

    assert.strictEqual(run.code, 0);
    assert.strictEqual(run.stdout, `${mindHelp}\n`);
});

test('help - the retired add-node subcommand appears nowhere in the help', () => {
    // `add-node` was merged into `add-child`; a preview release leaves no alias
    // behind, so listing it would advertise a command that exits 2.
    assert.ok(!HELP.includes('add-node'), 'the index must not list add-node');
    assert.ok(!mindHelp.includes('add-node'), 'the mind block must not list add-node');
    assert.ok(
        runCli(['mind', 'add-node', '--help']).stdout.includes(mindHelp),
        'asking for add-node help falls back to the group block, which no longer names it'
    );
});

test('help - the add-child and set-side option strings match both guide tables', () => {
    // The group help and the two published tables are three copies of one
    // surface. They drifted before (`add-node` survived in both tables after it
    // stopped being a subcommand), so the copies are compared here rather than
    // left to whoever remembers to edit all three.
    //
    // `add-child` carries two segments because the help block wraps the option
    // list: the table prints one line, the block prints it across two. The
    // segments are what both must carry, in order and verbatim.
    const cases = [
        {
            name: 'add-child',
            help: mindHelp,
            segments: [
                '--parent-id <id> --text <text>',
                '[--side left|right] [--position <n>] [--folded true|false]',
            ],
        },
        {
            name: 'set-side',
            help: nodeHelp,
            segments: ['--node-id <id> --side left|right'],
        },
    ];

    for (const { name, help, segments } of cases) {
        const collapsed = help.replace(/[ \t]+/g, ' ');
        let from = 0;
        for (const segment of segments) {
            const at = collapsed.indexOf(segment, from);
            assert.notStrictEqual(at, -1, `the ${name} block should carry: ${segment}`);
            from = at + segment.length;
        }
    }

    for (const relative of ['../../docs/en/guide/cli.md', '../../docs/zh/guide/cli.md']) {
        const text = readFileSync(join(HERE, relative), 'utf8');
        // The tables have to stop mentioning it too, not just the help: the
        // drift this test exists for was `add-node` living on in both tables
        // after it stopped being a subcommand, and the rows above only pin the
        // two surviving commands.
        assert.ok(!text.includes('add-node'), `${relative} must not mention add-node`);
        for (const { name, segments } of cases) {
            const row = text.split('\n').find(line => line.startsWith(`| \`${name}\` |`));
            assert.ok(row, `${relative} should have a ${name} row`);
            // Inside a markdown table `\|` escapes the cell separator, so cells
            // are split on unescaped pipes only and the escape is then undone.
            const cells = row
                .split(/(?<!\\)\|/)
                .map(cell => cell.replace(/\\\|/g, '|').trim());
            assert.strictEqual(
                cells[2]!.replace(/`/g, ''),
                segments.join(' '),
                `${relative} should print ${name}'s options verbatim`
            );
        }
    }
});

test('help - `mind set-style --help` prints the document-style field table', () => {
    // The same reason `node set-style` has one: the field table is longer than
    // the line that introduces it in the group block.
    const run = runCli(['mind', 'set-style', '--help']);

    assert.strictEqual(run.code, 0);
    assert.strictEqual(run.stdout, `${mindSetStyleHelp}\n`);
    assert.ok(run.stdout.includes('--default-tone'), 'the block names the field it writes');
    assert.ok(
        !run.stdout.includes('add-child'),
        'the other mind subcommands belong to the group help'
    );
});

test('help - the document-style row reads the same in both guides and the mind block', () => {
    // The row this rename added is one option string in three places: the mind
    // block an agent reads, and the two published tables. A drift there sends
    // the caller to a flag the command does not accept.
    const segments = ['--default-tone <tone>'];
    assert.ok(
        mindHelp.replace(/[ \t]+/g, ' ').includes(segments.join(' ')),
        'the mind block should carry the document-style options'
    );

    for (const relative of ['../../docs/en/guide/cli.md', '../../docs/zh/guide/cli.md']) {
        const text = readFileSync(join(HERE, relative), 'utf8');
        // The first `set-style` row is the mind one: that table comes first.
        const row = text.split('\n').find(line => line.startsWith('| `set-style` |'));
        assert.ok(row, `${relative} should have a mind set-style row`);
        const cells = row
            .split(/(?<!\\)\|/)
            .map(cell => cell.replace(/\\\|/g, '|').trim());
        assert.strictEqual(
            cells[2]!.replace(/`/g, ''),
            segments.join(' '),
            `${relative} should print set-style's options verbatim`
        );
    }
});

test('help - both set-style blocks say which style they write', () => {
    // The two commands share a name, so the group is the only thing telling them
    // apart and each block has to name its scope outright.
    assert.match(mindSetStyleHelp, /mind\.style/, 'the mind block names mind.style');
    assert.match(mindSetStyleHelp, /node set-style/, 'and points at the per-node command');
    assert.match(setStyleHelp, /override the theme for one node/i, 'the node block says what it overrides');
    assert.match(setStyleHelp, /node\.style/, 'and names node.style');
    assert.ok(nodeHelp.includes('Override the theme for one node'), 'node --help states the scope too');
    assert.ok(
        mindHelp.includes('The document\'s style (mind.style)'),
        'mind --help states the scope too'
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
