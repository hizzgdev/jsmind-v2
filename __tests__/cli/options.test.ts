/**
 * @fileoverview Unknown options: allow-lists, the stderr warning, `--strict`.
 *
 * @remarks
 * The defect this covers is a whole class of silent no-ops: an option that no
 * subcommand took was accepted by the parser, dropped by the command, and the
 * run still exited 0. A caller that only reads exit codes and stdout could not
 * tell it apart from working.
 *
 * The allow-lists themselves are asserted as a table — every subcommand, every
 * option it declares — because the failure mode is a missing entry, and a
 * missing entry is invisible unless something walks the whole table. The policy
 * around them (warning vs `--strict`, stdout left parseable) is asserted through
 * the real process, since that is where a stream can be crossed by accident.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    COMMAND_OPTIONS,
    GLOBAL_OPTIONS,
    OPTION_SPEC,
    assertOptionValues,
    checkOptions,
    commandKey,
    unknownOptions,
} from '../../src/cli/options.ts';
import { packageVersion } from '../../src/cli/version.ts';
import { CliError, CliExit } from '../../src/cli/exit.ts';
import { scratch, capture } from './helpers.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '../../src/cli/index.ts');
const FIXTURE = join(HERE, '../e2e/fixtures/valid-styled.json');

/**
 * Every key the allow-list table is expected to carry.
 *
 * @remarks
 * Written out rather than derived from the table, because the thing worth
 * checking is that the table covers the commands that exist. Deriving it would
 * make the test agree with the table by construction, including when a key is
 * misspelt — `mind style set` is assembled from three words by
 * {@link commandKey} and a typo there would silently skip the check instead of
 * failing.
 */
const EXPECTED_KEYS = [
    'create',
    'validate',
    'context',
    'export',
    'help',
    'mind find',
    'mind list-edges',
    'mind add-child',
    'mind move',
    'mind remove-node',
    'mind add-edge',
    'mind remove-edge',
    'mind style set',
    'node set-text',
    'node set-folded',
    'node set-side',
    'node set-style',
];

/**
 * Runs the CLI as a real child process.
 *
 * @param args - Arguments after the program name.
 * @returns Exit code and both streams.
 */
function runCli(args: string[]): { code: number; stdout: string; stderr: string } {
    const result = spawnSync(
        process.execPath,
        ['--experimental-strip-types', '--no-warnings', CLI, ...args],
        { encoding: 'utf8' }
    );
    return {
        code: result.status ?? -1,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
    };
}

/**
 * Copies the fixture into a scratch directory.
 *
 * @returns The path, the directory to remove, and the original text.
 */
function fixtureCopy(): { file: string; dir: string; before: string } {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    return { file, dir, before: readFileSync(file, 'utf8') };
}

test('options - the table spells every command the CLI dispatches', () => {
    assert.deepStrictEqual(
        Object.keys(COMMAND_OPTIONS).sort(),
        [...EXPECTED_KEYS].sort(),
        'every command and subcommand needs an allow-list entry'
    );
});

test('options - each subcommand accepts its own options and nothing from the globals', () => {
    for (const [key, allowed] of Object.entries(COMMAND_OPTIONS)) {
        const positionals = key.split(' ');

        assert.deepStrictEqual(
            unknownOptions(positionals, allowed),
            [],
            `${key} must accept every option it declares`
        );
        assert.deepStrictEqual(
            unknownOptions(positionals, [...GLOBAL_OPTIONS, ...allowed]),
            [],
            `${key} must accept the global options alongside its own`
        );
        assert.deepStrictEqual(
            unknownOptions(positionals, ['sdie']),
            ['sdie'],
            `${key} must not accept a misspelt option`
        );
    }
});

test('options - the global set is legal everywhere, a sibling subcommand\'s flag is not', () => {
    // The known case from the issue: `--side` belongs to `add-child` only.
    assert.deepStrictEqual(unknownOptions(['mind', 'add-child'], ['side']), []);
    assert.deepStrictEqual(unknownOptions(['mind', 'move'], ['side']), ['side']);
    // `--tone` is a `node set-style` field, not a document-level one.
    assert.deepStrictEqual(unknownOptions(['node', 'set-style'], ['tone']), []);
    assert.deepStrictEqual(unknownOptions(['mind', 'style', 'set'], ['tone']), ['tone']);
    assert.deepStrictEqual(unknownOptions(['mind', 'style', 'set'], ['default-tone']), []);
});

test('options - `commandKey` reads only the words that select a command', () => {
    // Nothing to look up: no command, or a group with no subcommand yet.
    assert.strictEqual(commandKey([]), undefined);
    assert.strictEqual(commandKey(['mind']), undefined);
    assert.strictEqual(commandKey(['node']), undefined);

    // A file path sits where the next word would be, and is not one.
    assert.strictEqual(commandKey(['context', 'm.json']), 'context');
    assert.strictEqual(commandKey(['node', 'set-text', 'm.json']), 'node set-text');

    // The one nested group is three words deep.
    assert.strictEqual(commandKey(['mind', 'style']), 'mind style');
    assert.strictEqual(commandKey(['mind', 'style', 'set', 'm.json']), 'mind style set');
});

test('options - an invocation with no command is judged against the global set', () => {
    // `jsmind --jdson` is a typo for a global flag even though nothing was asked
    // to run; refusing to say so is how the silent-acceptance class starts.
    assert.deepStrictEqual(unknownOptions([], ['jdson']), ['jdson']);
    assert.deepStrictEqual(unknownOptions([], ['json']), []);
});

test('options - an unknown command is left to its own usage error', () => {
    // The dispatcher will refuse it. Adding an options complaint would bury the
    // one message that names the actual mistake.
    assert.deepStrictEqual(unknownOptions(['nonsense'], ['side']), []);
    assert.deepStrictEqual(unknownOptions(['mind', 'nonsense'], ['side']), []);
});

test('options - the warning is one stderr line and the refusal is a usage error', () => {
    const warned = capture(() => {
        checkOptions(['mind', 'move'], ['side'], false);
    });
    assert.strictEqual(warned.out, '', 'the warning must not reach stdout');
    assert.strictEqual(
        warned.err,
        'jsmind: warning: unknown option for "mind move": --side ' +
            '(--strict makes this an error)\n'
    );

    const refused = capture(() => {
        assert.throws(
            () => {
                checkOptions(['mind', 'move'], ['side', 'sdie'], true);
            },
            (err: unknown) => {
                assert.ok(err instanceof CliError);
                assert.strictEqual(err.exit, CliExit.Usage);
                assert.strictEqual(err.message, 'Unknown options for "mind move": --side, --sdie');
                return true;
            }
        );
    });
    assert.strictEqual(refused.out, '');
    assert.strictEqual(refused.err, '', 'a refusal is reported by the caller, not here');
});

test('options - a legal command line stays silent', () => {
    const quiet = capture(() => {
        checkOptions(['node', 'set-style'], ['node-id', 'tone', 'json'], false);
    });
    assert.strictEqual(quiet.out, '');
    assert.strictEqual(quiet.err, '');
});

test('options - every allowed name exists in the parser spec', () => {
    // An allow-list naming a flag the parser does not know can never take
    // effect, and the option would be reported as unknown however the caller
    // spelled the allow-list. Compare the two tables instead of trusting them.
    const allowed = new Set<string>([
        ...GLOBAL_OPTIONS,
        ...Object.keys(COMMAND_OPTIONS).flatMap(key => COMMAND_OPTIONS[key]),
    ]);

    for (const name of allowed) {
        assert.ok(
            OPTION_SPEC[name] !== undefined,
            `--${name} is allowed somewhere but unknown to the parser`
        );
    }
});

test('options - a known option with no value is refused, not read as `true`', () => {
    // Lenient parsing is what lets an unknown option through, and it also turns
    // a valueless known option into `true`. These two are what that would have
    // cost: `--depth` silently falling back to its default, and `--output`
    // taking the next flag as a path.
    const missing = capture(() => {
        assert.throws(
            () => {
                assertOptionValues([{ kind: 'option', name: 'depth' }]);
            },
            (err: unknown) => {
                assert.ok(err instanceof CliError);
                assert.strictEqual(err.exit, CliExit.Usage);
                assert.strictEqual(err.message, 'Option \'--depth <value>\' argument missing');
                return true;
            }
        );
    });
    assert.strictEqual(missing.out, '');

    const ambiguous = capture(() => {
        assert.throws(
            () => {
                assertOptionValues([
                    { kind: 'option', name: 'output', value: '--json', inlineValue: false },
                ]);
            },
            (err: unknown) => {
                assert.ok(err instanceof CliError);
                assert.strictEqual(err.message, 'Option \'--output\' argument is ambiguous.');
                return true;
            }
        );
    });
    assert.strictEqual(ambiguous.out, '');

    // An unknown option with no value is unknown, not malformed: that case
    // belongs to the allow-list, and must not be turned into this error.
    assertOptionValues([{ kind: 'option', name: 'sdie' }]);
    // A value given inline is unambiguous even when it starts with a dash.
    assertOptionValues([{ kind: 'option', name: 'output', value: '--json', inlineValue: true }]);
});

test('cli - an unknown option warns, exits 0 and leaves the file alone', () => {
    const { file, dir, before } = fixtureCopy();

    try {
        const run = runCli(['mind', 'find', file, '--node-id', 'root', '--sdie']);

        assert.strictEqual(run.code, CliExit.Ok, 'a warning must not change the exit code');
        assert.strictEqual(run.stderr, 'jsmind: warning: unknown option for "mind find": --sdie ' + '(--strict makes this an error)\n');
        assert.ok(
            run.stdout.includes('"id": "root"'),
            'the command still runs and prints its result'
        );
        assert.strictEqual(readFileSync(file, 'utf8'), before, 'a read-only command must not write');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - the same command line with --strict exits 2 and writes nothing', () => {
    const { file, dir, before } = fixtureCopy();
    const target = join(dir, 'out.json');

    try {
        const run = runCli([
            'node',
            'set-text',
            file,
            '--node-id',
            'jm-a1',
            '--text',
            'renamed',
            '--sdie',
            '--strict',
            '--output',
            target,
        ]);

        assert.strictEqual(run.code, CliExit.Usage);
        assert.strictEqual(run.stdout, '', 'a refused command prints no result');
        assert.strictEqual(run.stderr, 'Unknown option for "node set-text": --sdie\n');
        assert.strictEqual(readFileSync(file, 'utf8'), before, 'the input stays untouched');
        assert.strictEqual(existsSync(target), false, 'a refused command writes nothing, not even to --output');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - --json output stays parseable when an option is unknown', () => {
    const { file, dir } = fixtureCopy();

    try {
        const run = runCli(['context', file, '--json', '--sdie']);

        assert.strictEqual(run.code, CliExit.Ok);
        assert.ok(run.stderr.includes('--sdie'), 'the warning is on stderr');
        assert.ok(!run.stdout.includes('--sdie'), 'and nowhere near stdout');
        // The whole point: a `| jq` consumer still gets one JSON document.
        const parsed = JSON.parse(run.stdout) as { nodes: { id: string }[] };
        assert.ok(Array.isArray(parsed.nodes), 'the payload is the command\'s own result');
        assert.strictEqual(parsed.nodes[0].id, 'root');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - a mutating command ignores the unknown option and does its real work', () => {
    const { file, dir } = fixtureCopy();

    try {
        const run = runCli(['node', 'set-text', file, '--node-id', 'jm-a1', '--text', 'renamed', '--sdie']);

        assert.strictEqual(run.code, CliExit.Ok);
        assert.ok(run.stderr.includes('--sdie'));
        assert.ok(
            readFileSync(file, 'utf8').includes('renamed'),
            'the option that was understood still applies'
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - an option that belongs to this subcommand is not reported', () => {
    // The allow-list must be wide enough: `add-child` takes `--side` for a
    // direct child of the root, and a warning there would teach callers to
    // ignore warnings.
    const { file, dir } = fixtureCopy();

    try {
        const run = runCli(['mind', 'add-child', file, '--parent-id', 'root', '--text', 'leaf', '--side', 'left']);

        assert.strictEqual(run.code, CliExit.Ok);
        assert.strictEqual(run.stderr, '', 'no warning for a flag of this subcommand');
        assert.ok(run.stdout.includes('side=left'));
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - --version prints the manifest version and nothing else', () => {
    const version = packageVersion();
    assert.strictEqual(
        version,
        (JSON.parse(readFileSync(join(HERE, '../../package.json'), 'utf8')) as { version: string })
            .version,
        'the reported version is the manifest version'
    );

    for (const args of [['--version'], ['mind', 'find', '--version']]) {
        const run = runCli(args);

        assert.strictEqual(run.code, CliExit.Ok, `jsmind ${args.join(' ')} should succeed`);
        assert.strictEqual(run.stdout, `${version}\n`, 'the version alone, on one line');
        assert.strictEqual(run.stderr, '');
    }
});

test('cli - the root help lists the new global options', () => {
    const run = runCli(['--help']);

    assert.strictEqual(run.code, CliExit.Ok);
    assert.ok(run.stdout.includes('--strict'), 'the help explains how to refuse an unknown option');
    assert.ok(run.stdout.includes('--version'));
});
