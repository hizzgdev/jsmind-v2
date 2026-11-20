/**
 * @fileoverview Exit-code classification for `mind` write verbs.
 *
 * @remarks
 * `exit.ts` splits failures three ways: an agent that gets `1` fixes the data,
 * one that gets `2` fixes the command line, one that gets `3` stops and asks a
 * human. An id that is not in the document belongs to the first class, so a
 * mutating `mind` subcommand has to fail as `InvalidData` - not escape the
 * model's `JsMindError` and land in the catch-all runtime branch.
 *
 * The cases below are pairwise: every write verb against every id it takes, plus
 * the boundary that an unexpected error still exits 3. The last one is asserted
 * on the process entry because that branch is otherwise unreachable from a
 * well-formed command.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { copyFileSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mindHelp, runMind } from '../../src/cli/commands/mind.ts';
import { CliError, CliExit, dataError, describeFailure } from '../../src/cli/exit.ts';
import { scratch, capture } from './helpers.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, '../e2e/fixtures/valid-styled.json');
const CLI = join(HERE, '../../src/cli/index.ts');

/** Write options that touch the real file. */
const WRITE = { dryRun: false, backup: false };

/**
 * One write command whose id is not in the fixture.
 */
interface UnknownIdCase {
    /** Subcommand under test. */
    sub: string;
    /** Parsed options as the CLI would hand them over. */
    values: Record<string, unknown>;
    /** Expected message, with `<file>` standing for the temporary path. */
    message: string;
}

/**
 * Every id-taking write verb, against an id the fixture does not have.
 *
 * @remarks
 * `add-child` / `add-edge` take no node id of their own, so their only absent-id
 * case is the parent / endpoint they hang the new thing off. `move` takes both
 * kinds of id, and the two must read differently: a caller who mistyped
 * `--parent-id` should not be sent looking at `--node-id`.
 */
const UNKNOWN_IDS: UnknownIdCase[] = [
    {
        sub: 'add-child',
        values: { 'parent-id': 'ghost', 'text': 'x' },
        message: 'No parent node with id "ghost" in <file>',
    },
    {
        sub: 'move',
        values: { 'node-id': 'ghost', 'parent-id': 'root' },
        message: 'No node with id "ghost" in <file>',
    },
    {
        sub: 'move',
        values: { 'node-id': 'jm-b1', 'parent-id': 'ghost' },
        message: 'No parent node with id "ghost" in <file>',
    },
    {
        sub: 'remove-node',
        values: { 'node-id': 'ghost' },
        message: 'No node with id "ghost" in <file>',
    },
    {
        sub: 'add-edge',
        values: { 'source-id': 'ghost', 'target-id': 'jm-a2' },
        message: 'No source node with id "ghost" in <file>',
    },
    {
        sub: 'add-edge',
        values: { 'source-id': 'jm-a2', 'target-id': 'ghost' },
        message: 'No target node with id "ghost" in <file>',
    },
];

/**
 * Runs the CLI as a real child process.
 *
 * @param args - Arguments after the program name.
 * @returns Exit code and what was written to stderr.
 */
function runCli(args: string[]): { code: number; stderr: string } {
    const result = spawnSync(
        process.execPath,
        ['--experimental-strip-types', '--no-warnings', CLI, ...args],
        { encoding: 'utf8' }
    );
    return { code: result.status ?? -1, stderr: result.stderr ?? '' };
}

test('cli - mind write verbs report an absent id as invalid data', () => {
    for (const item of UNKNOWN_IDS) {
        const dir = scratch();
        const file = join(dir, 'm.json');
        copyFileSync(FIXTURE, file);
        const before = readFileSync(file, 'utf8');
        try {
            assert.throws(
                () => {
                    capture(() => {
                        runMind(file, item.sub, item.values, WRITE);
                    });
                },
                (err: unknown) => {
                    assert.ok(err instanceof CliError, `${item.sub} must fail as a CliError`);
                    assert.strictEqual(err.exit, CliExit.InvalidData);
                    assert.strictEqual(err.message, item.message.replace('<file>', file));
                    return true;
                }
            );
            assert.strictEqual(
                readFileSync(file, 'utf8'),
                before,
                `${item.sub} must not write when the id is absent`
            );
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }
});

test('cli - mind move refuses a target inside the node, as invalid data', () => {
    // Both are addressable nodes, so neither is a missing-id case - the model
    // refuses the shape of the request. Still the caller's mistake, still 1.
    for (const [nodeId, parentId, message] of [
        ['jm-a1', 'jm-b1', 'Cannot move "jm-a1" under "jm-b1" in <file>: "jm-b1" is a descendant of "jm-a1"'],
        ['jm-a1', 'jm-a1', 'Cannot move "jm-a1" under itself in <file>'],
    ] as const) {
        const dir = scratch();
        const file = join(dir, 'm.json');
        copyFileSync(FIXTURE, file);
        try {
            assert.throws(
                () => {
                    capture(() => {
                        runMind(file, 'move', { 'node-id': nodeId, 'parent-id': parentId }, WRITE);
                    });
                },
                (err: unknown) => {
                    assert.ok(err instanceof CliError);
                    assert.strictEqual(err.exit, CliExit.InvalidData);
                    assert.strictEqual(err.message, message.replace('<file>', file));
                    return true;
                }
            );
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }
});

test('cli - mind remove-node refuses the root, as invalid data', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);

    try {
        assert.throws(
            () => {
                capture(() => {
                    runMind(file, 'remove-node', { 'node-id': 'root' }, WRITE);
                });
            },
            (err: unknown) => {
                assert.ok(err instanceof CliError);
                assert.strictEqual(err.exit, CliExit.InvalidData);
                assert.strictEqual(err.message, `Cannot remove the root node "root" in ${file}`);
                return true;
            }
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - an unexpected error is still a runtime failure', () => {
    // The classification boundary itself: everything that is not a CliError is a
    // crash, keeps the prefix, and exits 3 so the caller stops instead of
    // retrying with a different command line.
    const crash = describeFailure(new Error('boom'));
    assert.strictEqual(crash.exit, CliExit.IoError);
    assert.strictEqual(crash.message, 'Unexpected failure: boom');

    const data = describeFailure(dataError('No node with id "ghost" in m.json'));
    assert.strictEqual(data.exit, CliExit.InvalidData);
    assert.strictEqual(
        data.message,
        'No node with id "ghost" in m.json',
        'the Unexpected failure prefix is for crashes only'
    );
});

test('cli - an absent id exits 1 through the real process, worded like the node family', () => {
    // The unit cases above assert on the CliError each command raises; this one
    // proves the exit code a shell (or an agent) actually sees, and that the two
    // command families say the same sentence for the same mistake.
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);

    try {
        const tree = runCli(['mind', 'move', file, '--node-id', 'ghost', '--parent-id', 'root']);
        const attrs = runCli(['node', 'set-text', file, '--node-id', 'ghost', '--text', 'x']);
        const parent = runCli(['mind', 'move', file, '--node-id', 'jm-b1', '--parent-id', 'ghost']);

        assert.strictEqual(tree.code, CliExit.InvalidData);
        assert.strictEqual(attrs.code, CliExit.InvalidData);
        assert.strictEqual(parent.code, CliExit.InvalidData);

        assert.strictEqual(tree.stderr, `No node with id "ghost" in ${file}\n`);
        assert.strictEqual(
            tree.stderr,
            attrs.stderr,
            'the mind and node families must word an absent id the same way'
        );
        assert.strictEqual(parent.stderr, `No parent node with id "ghost" in ${file}\n`);
        assert.ok(!tree.stderr.includes('Unexpected failure'));
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - mind move appends when --position is past the last sibling', () => {
    // Documented in --help rather than refused: the model clamps, so the caller
    // gets the append they asked for instead of a silent reorder somewhere else.
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);

    try {
        capture(() => {
            runMind(file, 'move', { 'node-id': 'jm-a1', 'parent-id': 'root', 'position': '99' }, WRITE);
        });
        const after = JSON.parse(readFileSync(file, 'utf8'));
        assert.deepStrictEqual(after.nodes.root.children, ['jm-a2', 'jm-a1']);
        assert.ok(mindHelp.includes('appends'), 'the clamping must be stated in --help');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
