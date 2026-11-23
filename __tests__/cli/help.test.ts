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

import { INDEX, MANUAL } from '../../src/cli/index.ts';
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

/**
 * The six first-level blocks, by the command that owns each.
 *
 * @remarks
 * One list, used twice: the manual must carry every block, and a bare `jsmind`
 * must carry none of them. `export` had a block of its own but was never
 * concatenated into the root page, so the "complete" reference was missing its
 * flags for as long as it existed — a drift the set comparison below catches
 * and a spot check would not.
 */
const COMMANDS = [
    { name: 'create', block: createHelp },
    { name: 'validate', block: validateHelp },
    { name: 'export', block: exportHelp },
    { name: 'context', block: contextHelp },
    { name: 'mind', block: mindHelp },
    { name: 'node', block: nodeHelp },
];

test('help - a bare `jsmind` prints the index and no command block', () => {
    // A bare invocation asks "what is there?" — the command table, the global
    // options, one sentence about writes and the exit codes. It used to hand
    // back the whole manual, which is the opposite of what the caller asked.
    const run = runCli([]);

    assert.strictEqual(run.code, 0, 'jsmind should succeed');
    assert.strictEqual(run.stdout, `${INDEX}\n`, 'jsmind should print the index');
    for (const { name, block } of COMMANDS) {
        assert.ok(!run.stdout.includes(block), `the index should not carry the ${name} block`);
    }
    assert.ok(!run.stdout.includes('Options in full'), 'the option-by-option section is the manual');
});

test('help - `help` and `--help` print the complete manual', () => {
    // The other entry point: one page an agent can read end to end. Both
    // spellings resolve through the same dispatcher branch, so they are
    // asserted against the same text.
    for (const args of [['help'], ['--help']]) {
        const run = runCli(args);

        assert.strictEqual(run.code, 0, `jsmind ${args.join(' ')} should succeed`);
        assert.strictEqual(run.stdout, `${MANUAL}\n`, `jsmind ${args.join(' ')} should print the manual`);
    }
});

test('help - the manual carries a block for every first-level command', () => {
    // The manual's whole promise is that one read covers the surface. Nothing
    // compared it against the set of blocks before, which is exactly how
    // `export` stayed out of `jsmind --help` unnoticed: its block was written
    // and reachable from its own `--help`, but absent from the assembly. The
    // comparison is against the block a caller gets from `jsmind <command>
    // --help`, so an assembly that drops one fails here.
    const manual = runCli(['--help']).stdout;

    for (const { name, block } of COMMANDS) {
        assert.ok(manual.includes(block), `the manual should carry the ${name} block verbatim`);
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
    assert.ok(!INDEX.includes('add-node'), 'the index must not list add-node');
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

test('help - the mind group and `mind set-style` share one field table', () => {
    // One copy in the source, two pages that show it: the group block inlines
    // the table where the subcommand gets a page of its own. Pinned because two
    // hand-written copies is how a flag goes missing from one of them.
    const table = [
        'Accepted tone names are read from the model',
        '  --default-tone <tone>       default | primary | success | warning | danger | info | accent',
        'tone follows this one, lines included; pass `default` to go back to the built-in',
    ];

    for (const line of table) {
        assert.ok(mindHelp.includes(line), `the mind group block should carry: ${line}`);
    }
    // The standalone page is its own title and scope, then the same table.
    const groupTable = mindHelp.slice(mindHelp.indexOf(table[0]!));
    const pageTable = mindSetStyleHelp.slice(mindSetStyleHelp.indexOf(table[0]!));
    assert.strictEqual(pageTable, groupTable, 'both pages should print the same field table verbatim');
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
    // their block is the whole answer. They used to get the whole index:
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

test('help - the manual separates global options from write options', () => {
    // The three write flags used to sit in "Options in full" beside `--json`,
    // which is the page claiming they are global — the same claim that made
    // `validate x.json --output y.json` look accepted.
    const fullAt = MANUAL.indexOf('Options in full');
    const writeAt = MANUAL.indexOf('Write options', fullAt);
    const createAt = MANUAL.indexOf('jsmind create', writeAt);

    assert.ok(fullAt !== -1, 'the manual should carry an "Options in full" section');
    assert.ok(writeAt > fullAt, 'a "Write options" section should follow it');
    assert.ok(createAt > writeAt, 'the write section should close before the command blocks');

    const globalSection = MANUAL.slice(fullAt, writeAt);
    for (const flag of ['--dry-run', '--output', '--backup']) {
        assert.ok(!globalSection.includes(flag), `${flag} must not be listed as a global option`);
    }
    assert.ok(globalSection.includes('--json'), 'the genuinely global flags stay');
    assert.ok(globalSection.includes('--strict'));

    const writeSection = MANUAL.slice(writeAt, createAt);
    for (const flag of ['--dry-run', '--output', '--backup']) {
        assert.ok(writeSection.includes(flag), `${flag} belongs in the write section`);
    }
    // The claim has to be the narrow one: `find` and `list-edges` sit under
    // `mind` but only read, so a blanket "every mind and node subcommand" is the
    // same over-promise this section is meant to end.
    assert.match(writeSection, /the mind and node subcommands that\s+write/);
    assert.doesNotMatch(writeSection, /every mind and node subcommand/);
    assert.match(writeSection, /find and list-edges/);
});

test('help - the index states which write commands take --output', () => {
    // A bare `jsmind` prints only the index, so the exception the manual makes
    // for `--output` has to appear here too: `create` refuses the flag (its path
    // is positional), and a reader who never runs `--help` would otherwise take
    // the index at its word. This is the same surface stated in two places, so
    // both are pinned.
    const writeAt = INDEX.indexOf('Write options');
    const exitAt = INDEX.indexOf('Exit codes', writeAt);

    assert.ok(writeAt !== -1, 'the index should carry its own write options block');
    assert.ok(exitAt > writeAt, 'the write block should close before the exit codes');

    const writeSection = INDEX.slice(writeAt, exitAt);
    for (const flag of ['--dry-run', '--output', '--backup']) {
        assert.ok(writeSection.includes(flag), `${flag} belongs in the index's write block`);
    }
    // Narrow claim only: the index must not repeat the blanket "create, and
    // every mind and node subcommand" wording that `create --output` falsifies.
    assert.match(writeSection, /mind and node subcommands that\s+write/);
    assert.match(writeSection, /create and export take their path/);
    assert.doesNotMatch(writeSection, /create, and the mind and node subcommands that write/);
});
