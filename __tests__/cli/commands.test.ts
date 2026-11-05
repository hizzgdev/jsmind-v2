/**
 * @fileoverview Tests for the CLI commands.
 *
 * Commands are called as functions rather than spawned as subprocesses: the
 * behaviour under test is what a command decides (exit code, output, file
 * bytes), and calling it directly keeps the assertions about the decision
 * rather than about process plumbing.
 *
 * Every case runs against a temporary copy so one command's write cannot leak
 * into the next.
 */

import { test, mock } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { runValidate } from '../../src/cli/commands/validate.ts';
import { runContext } from '../../src/cli/commands/context.ts';
import { runMind } from '../../src/cli/commands/mind.ts';
import { runNode } from '../../src/cli/commands/node.ts';
import { CliError, CliExit } from '../../src/cli/exit.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, '../e2e/fixtures/valid-styled.json');

/**
 * Creates a scratch directory containing a copy of the fixture.
 *
 * @returns The directory path.
 */
function scratch(): string {
    return mkdtempSync(join(tmpdir(), 'jsmind-cli-'));
}

/**
 * Captures everything a command writes to stdout and stderr.
 *
 * @param run - Callback that triggers the command.
 * @returns What was written.
 */
function capture(run: () => void): { out: string; err: string } {
    const out: string[] = [];
    const err: string[] = [];
    const outMock = mock.method(process.stdout, 'write', (chunk: string | Uint8Array) => {
        out.push(String(chunk));
        return true;
    });
    const errMock = mock.method(process.stderr, 'write', (chunk: string | Uint8Array) => {
        err.push(String(chunk));
        return true;
    });
    try {
        run();
    } finally {
        outMock.mock.restore();
        errMock.mock.restore();
    }
    return { out: out.join(''), err: err.join('') };
}

/** Write options that touch the real file. */
const WRITE = { dryRun: false, backup: false };

test('cli - validate exits 0 on a valid file', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);

    let code = -1;
    capture(() => {
        code = runValidate(file, false);
    });

    assert.strictEqual(code, CliExit.Ok);
    rmSync(dir, { recursive: true, force: true });
});

test('cli - validate exits 1 and prints the code on a broken file', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    doc.nodes['jm-b1'].parent = 'ghost';
    doc.nodes['jm-a1'].children = [];
    writeFileSync(file, JSON.stringify(doc));

    const { err } = capture(() => {
        runValidate(file, false);
    });

    assert.ok(err.includes('E_NODE_PARENT_MISSING'), `expected the code in output, got: ${err}`);
    rmSync(dir, { recursive: true, force: true });
});

test('cli - validate --json emits the full issue list', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    doc.nodes['jm-b1'].parent = 'ghost';
    writeFileSync(file, JSON.stringify(doc));

    let code = -1;
    const { out } = capture(() => {
        code = runValidate(file, true);
    });

    assert.strictEqual(code, CliExit.InvalidData);
    const parsed = JSON.parse(out);
    assert.strictEqual(parsed.valid, false);
    assert.ok(Array.isArray(parsed.errors));
    assert.ok(parsed.errors.some((issue: { code: string }) => issue.code === 'E_NODE_PARENT_MISSING'));
    rmSync(dir, { recursive: true, force: true });
});

test('cli - validate exits 3 when the file does not exist', () => {
    const dir = scratch();
    assert.throws(
        () => {
            capture(() => {
                runValidate(join(dir, 'absent.json'), false);
            });
        },
        (err: unknown) => {
            assert.ok(err instanceof CliError);
            assert.strictEqual(err.exit, CliExit.IoError);
            return true;
        }
    );
    rmSync(dir, { recursive: true, force: true });
});

test('cli - unparseable JSON is a data error, not an IO error', () => {
    // A reachable file with unreadable content is the caller's data problem:
    // exit 1 tells it to fix the file, exit 3 would send it to a human.
    const dir = scratch();
    const file = join(dir, 'm.json');
    writeFileSync(file, '{ this is not json');

    assert.throws(
        () => {
            capture(() => {
                runValidate(file, false);
            });
        },
        (err: unknown) => {
            assert.ok(err instanceof CliError);
            assert.strictEqual(err.exit, CliExit.InvalidData, 'should be exit 1, not 3');
            assert.ok(err.message.includes('Not valid JSON'));
            return true;
        }
    );
    rmSync(dir, { recursive: true, force: true });
});

test('cli - find reports invalid structure as a data error, not a crash', () => {
    // find bypasses the mutation pipeline, so it has to validate on its own;
    // otherwise a JsMindError escapes and lands in the generic exit-3 branch.
    const dir = scratch();
    const file = join(dir, 'm.json');
    const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    doc.nodes['jm-b1'].parent = 'ghost';
    doc.nodes['jm-a1'].children = [];
    writeFileSync(file, JSON.stringify(doc));

    assert.throws(
        () => {
            capture(() => {
                runMind(file, 'find', { 'node-id': 'jm-b1' }, WRITE);
            });
        },
        (err: unknown) => {
            assert.ok(err instanceof CliError);
            assert.strictEqual(err.exit, CliExit.InvalidData, 'should be exit 1, not 3');
            assert.ok(err.message.includes('E_NODE_PARENT_MISSING'));
            return true;
        }
    );
    rmSync(dir, { recursive: true, force: true });
});

test('cli - edges reports invalid structure as a data error too', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    doc.nodes.root.content = null;
    writeFileSync(file, JSON.stringify(doc));

    assert.throws(
        () => {
            capture(() => {
                runMind(file, 'edges', { 'node-id': 'root' }, WRITE);
            });
        },
        (err: unknown) => {
            assert.ok(err instanceof CliError);
            assert.strictEqual(err.exit, CliExit.InvalidData);
            return true;
        }
    );
    rmSync(dir, { recursive: true, force: true });
});

test('cli - context shows the tree with ids in a left column', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);

    let code = -1;
    const { out } = capture(() => {
        code = runContext({
            file,
            depth: 1,
            maxText: 40,
            fullText: false,
            idsOnly: false,
            asJson: false,
        });
    });

    assert.strictEqual(code, CliExit.Ok);
    const lines = out.trim().split('\n');
    assert.ok(lines.length >= 3, `expected at least root plus two children, got ${lines.length}`);
    assert.ok(lines[0].startsWith('root'), `first line should lead with the root id: ${lines[0]}`);
    rmSync(dir, { recursive: true, force: true });
});

test('cli - context --focus keeps ancestors of a match', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);

    const { out } = capture(() => {
        runContext({
            file,
            focus: '清洗',
            depth: 2,
            maxText: 40,
            fullText: false,
            idsOnly: false,
            asJson: false,
        });
    });

    // The match is jm-b1; its ancestors root and jm-a1 explain where it sits.
    assert.ok(out.includes('jm-b1'));
    assert.ok(out.includes('jm-a1'), 'the parent should be shown for context');
    rmSync(dir, { recursive: true, force: true });
});

test('cli - context --focus suggests candidates when nothing matches', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);

    let code = -1;
    const { err } = capture(() => {
        code = runContext({
            file,
            focus: 'zzzzz-no-such-text',
            depth: 2,
            maxText: 40,
            fullText: false,
            idsOnly: false,
            asJson: false,
        });
    });

    assert.strictEqual(code, CliExit.Ok, 'a miss is not a data error');
    assert.ok(err.includes('No node matches'));
    assert.ok(err.includes('root'), 'must offer candidates rather than a bare not-found');
    rmSync(dir, { recursive: true, force: true });
});

test('cli - context truncates long text with an ellipsis', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    doc.nodes.root.content.value = 'x'.repeat(120);
    writeFileSync(file, JSON.stringify(doc));

    const { out } = capture(() => {
        runContext({
            file,
            depth: 0,
            maxText: 20,
            fullText: false,
            idsOnly: false,
            asJson: false,
        });
    });

    assert.ok(out.includes('…'), 'truncation must be visible');
    assert.ok(!out.includes('x'.repeat(120)), 'the full text must not appear');
    rmSync(dir, { recursive: true, force: true });
});

test('cli - mind add-child writes and validates', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);

    capture(() => {
        runMind(file, 'add-child', { 'parent-id': 'root', 'text': '新节点' }, WRITE);
    });

    const after = JSON.parse(readFileSync(file, 'utf8'));
    const rootChildren = after.nodes.root.children;
    assert.ok(rootChildren.length > 2, 'the new child should be listed under the root');

    // And the file must still validate after the write.
    let code = -1;
    capture(() => {
        code = runValidate(file, false);
    });
    assert.strictEqual(code, CliExit.Ok);
    rmSync(dir, { recursive: true, force: true });
});

test('cli - mind commands refuse to touch an already-broken file', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    doc.nodes['jm-b1'].parent = 'ghost';
    writeFileSync(file, JSON.stringify(doc));
    const before = readFileSync(file, 'utf8');

    assert.throws(
        () => {
            capture(() => {
                runMind(file, 'add-child', { 'parent-id': 'root', 'text': 'x' }, WRITE);
            });
        },
        (err: unknown) => {
            assert.ok(err instanceof CliError);
            assert.strictEqual(err.exit, CliExit.InvalidData);
            assert.ok(err.message.includes('Refusing to modify'));
            return true;
        }
    );

    assert.strictEqual(readFileSync(file, 'utf8'), before, 'the broken file must be untouched');
    rmSync(dir, { recursive: true, force: true });
});

test('cli - mind remove-node drops the node and keeps the file valid', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);

    capture(() => {
        runMind(file, 'remove-node', { 'node-id': 'jm-b1' }, WRITE);
    });

    const after = JSON.parse(readFileSync(file, 'utf8'));
    assert.strictEqual(after.nodes['jm-b1'], undefined, 'the node should be gone');
    assert.ok(!after.nodes['jm-a1'].children.includes('jm-b1'), 'the parent must forget it too');

    let code = -1;
    capture(() => {
        code = runValidate(file, false);
    });
    assert.strictEqual(code, CliExit.Ok);
    rmSync(dir, { recursive: true, force: true });
});

test('cli - mind find exits 1 for an unknown id', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);

    assert.throws(
        () => {
            capture(() => {
                runMind(file, 'find', { 'node-id': 'nope' }, WRITE);
            });
        },
        (err: unknown) => {
            assert.ok(err instanceof CliError);
            assert.strictEqual(err.exit, CliExit.InvalidData);
            return true;
        }
    );
    rmSync(dir, { recursive: true, force: true });
});

test('cli - node set-text changes the label', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);

    capture(() => {
        runNode(file, 'set-text', { 'node-id': 'jm-a2', 'text': '改过的' }, WRITE);
    });

    const after = JSON.parse(readFileSync(file, 'utf8'));
    assert.strictEqual(after.nodes['jm-a2'].content.value, '改过的');
    rmSync(dir, { recursive: true, force: true });
});

test('cli - node set-side maps words to numbers', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);

    capture(() => {
        runNode(file, 'set-side', { 'node-id': 'jm-a1', 'side': 'left' }, WRITE);
    });

    const after = JSON.parse(readFileSync(file, 'utf8'));
    assert.strictEqual(after.nodes['jm-a1'].side, -1, 'left should serialise as -1');
    rmSync(dir, { recursive: true, force: true });
});

test('cli - node set-side rejects an unknown word as a usage error', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);

    assert.throws(
        () => {
            capture(() => {
                runNode(file, 'set-side', { 'node-id': 'jm-a1', 'side': 'diagonal' }, WRITE);
            });
        },
        (err: unknown) => {
            assert.ok(err instanceof CliError);
            assert.strictEqual(err.exit, CliExit.Usage);
            return true;
        }
    );
    rmSync(dir, { recursive: true, force: true });
});

test('cli - dry-run leaves the file byte-identical', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    const before = readFileSync(file, 'utf8');

    capture(() => {
        runMind(file, 'add-child', { 'parent-id': 'root', 'text': '试运行' }, {
            dryRun: true,
            backup: false,
        });
    });

    assert.strictEqual(readFileSync(file, 'utf8'), before, 'dry-run must not touch the file');
    rmSync(dir, { recursive: true, force: true });
});

test('cli - --output writes elsewhere and leaves the original alone', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    const other = join(dir, 'copy.json');
    copyFileSync(FIXTURE, file);
    const before = readFileSync(file, 'utf8');

    capture(() => {
        runMind(file, 'add-child', { 'parent-id': 'root', 'text': '旁路' }, {
            dryRun: false,
            backup: false,
            output: other,
        });
    });

    assert.strictEqual(readFileSync(file, 'utf8'), before, 'the input must not change');
    const written = JSON.parse(readFileSync(other, 'utf8'));
    assert.ok(written.nodes.root.children.length > 2, 'the copy should carry the new child');
    rmSync(dir, { recursive: true, force: true });
});
