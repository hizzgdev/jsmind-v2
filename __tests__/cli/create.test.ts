/**
 * @fileoverview Tests for the create command.
 */

import { test, mock } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runCreate } from '../../src/cli/commands/create.ts';
import { runValidate } from '../../src/cli/commands/validate.ts';
import { CliError, CliExit } from '../../src/cli/exit.ts';

/**
 * Creates a scratch directory.
 *
 * @returns The directory path.
 */
function scratch(): string {
    return mkdtempSync(join(tmpdir(), 'jsmind-create-'));
}

/**
 * Captures what a command writes.
 *
 * @param run - Callback that triggers the command.
 * @returns What was written to stdout.
 */
function capture(run: () => void): { out: string; err: string } {
    const out: string[] = [];
    const err: string[] = [];
    const o = mock.method(process.stdout, 'write', (chunk: string | Uint8Array) => {
        out.push(String(chunk));
        return true;
    });
    const e = mock.method(process.stderr, 'write', (chunk: string | Uint8Array) => {
        err.push(String(chunk));
        return true;
    });
    try {
        run();
    } finally {
        o.mock.restore();
        e.mock.restore();
    }
    return { out: out.join(''), err: err.join('') };
}

test('create - produces a file that validates immediately', () => {
    const dir = scratch();
    const file = join(dir, 'new.json');

    let code = -1;
    capture(() => {
        code = runCreate({ file, text: '根节点', force: false, dryRun: false });
    });

    assert.strictEqual(code, CliExit.Ok);
    assert.ok(existsSync(file));

    // The whole point: what create emits must pass the same checker everything
    // else uses, without a hand-written fix-up step.
    let vcode = -1;
    capture(() => {
        vcode = runValidate(file, false);
    });
    assert.strictEqual(vcode, CliExit.Ok);
    rmSync(dir, { recursive: true, force: true });
});

test('create - the document has one root with the given text', () => {
    const dir = scratch();
    const file = join(dir, 'new.json');

    capture(() => {
        runCreate({ file, text: '起点', name: '我的图', author: 'someone', force: false, dryRun: false });
    });

    const doc = JSON.parse(readFileSync(file, 'utf8'));
    assert.strictEqual(doc.format, 'jsmind_v2');
    assert.strictEqual(doc.root, 'root');
    assert.strictEqual(doc.nodes.root.content.value, '起点');
    assert.strictEqual(doc.nodes.root.parent, null);
    assert.deepStrictEqual(doc.nodes.root.children, []);
    assert.deepStrictEqual(doc.edges, {});
    assert.strictEqual(doc.meta.name, '我的图');
    assert.strictEqual(doc.meta.author, 'someone');
    rmSync(dir, { recursive: true, force: true });
});

test('create - refuses to overwrite without --force', () => {
    const dir = scratch();
    const file = join(dir, 'new.json');
    writeFileSync(file, '{"keep":"me"}');

    assert.throws(
        () => {
            capture(() => {
                runCreate({ file, text: 'x', force: false, dryRun: false });
            });
        },
        (err: unknown) => {
            assert.ok(err instanceof CliError);
            // Wrong command for the situation, not bad data: exit 2.
            assert.strictEqual(err.exit, CliExit.Usage);
            assert.ok(err.message.includes('already exists'));
            return true;
        }
    );

    assert.strictEqual(readFileSync(file, 'utf8'), '{"keep":"me"}', 'existing file must survive');
    rmSync(dir, { recursive: true, force: true });
});

test('create - --force replaces the file', () => {
    const dir = scratch();
    const file = join(dir, 'new.json');
    writeFileSync(file, '{"old":true}');

    capture(() => {
        runCreate({ file, text: '新的', force: true, dryRun: false });
    });

    const doc = JSON.parse(readFileSync(file, 'utf8'));
    assert.strictEqual(doc.nodes.root.content.value, '新的');
    rmSync(dir, { recursive: true, force: true });
});

test('create - --dry-run prints the document and writes nothing', () => {
    const dir = scratch();
    const file = join(dir, 'new.json');

    const { out } = capture(() => {
        runCreate({ file, text: '只看不写', force: false, dryRun: true });
    });

    assert.ok(!existsSync(file), 'dry-run must not create the file');
    const printed = JSON.parse(out);
    assert.strictEqual(printed.nodes.root.content.value, '只看不写');
    rmSync(dir, { recursive: true, force: true });
});

test('create - omitting name and author leaves the defaults intact', () => {
    const dir = scratch();
    const file = join(dir, 'new.json');
    writeFileSync(file, '{}');

    capture(() => {
        runCreate({ file, text: 'x', force: true, dryRun: false });
    });

    const doc = JSON.parse(readFileSync(file, 'utf8'));
    // Defaults come from the model, not from this command; asserting they are
    // present catches a regression where create silently blanks the metadata.
    assert.ok(typeof doc.meta.name === 'string');
    assert.ok(typeof doc.meta.author === 'string');
    rmSync(dir, { recursive: true, force: true });
});
