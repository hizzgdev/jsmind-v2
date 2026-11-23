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

import { test } from 'node:test';
import assert from 'node:assert';
import { writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runValidate } from '../../src/cli/commands/validate.ts';
import { runContext } from '../../src/cli/commands/context.ts';
import { runMind, assertMindSubcommand } from '../../src/cli/commands/mind.ts';
import { runSetStyle } from '../../src/cli/commands/style.ts';
import { runNode } from '../../src/cli/commands/node.ts';
import {
    JmFontWeight,
    JmLineCurve,
    JmLinePattern,
    JmTone,
} from '../../src/model/data/style.ts';
import { CliError, CliExit } from '../../src/cli/exit.ts';
import { scratch, capture } from './helpers.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, '../e2e/fixtures/valid-styled.json');

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

test('cli - list-edges reports invalid structure as a data error too', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    doc.nodes.root.content = null;
    writeFileSync(file, JSON.stringify(doc));

    assert.throws(
        () => {
            capture(() => {
                runMind(file, 'list-edges', { 'node-id': 'root' }, WRITE);
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
    // The fixture carries a document style, so the output opens with its
    // summary line and the tree follows.
    assert.match(lines[0], /^style: theme=default defaultTone=default overrides=/);
    assert.ok(lines.length >= 4, `expected a style line plus root and children, got ${lines.length}`);
    assert.ok(lines[1].startsWith('root'), `first tree line should lead with the root id: ${lines[1]}`);
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

    const { out } = capture(() => {
        runMind(file, 'add-child', { 'parent-id': 'root', 'text': '新节点' }, WRITE);
    });

    // The reply is where the next command gets its --parent-id, so the id has
    // to be legible in it rather than a bare token between two words.
    assert.match(
        out,
        /^added node \(id jm-[0-9a-z]+\) under root\n$/,
        'the reply should say it added a node and name its id'
    );

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

test('cli - mind add-child places by --side and --position and can create a folded node', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);

    const { out } = capture(() => {
        runMind(
            file,
            'add-child',
            {
                'parent-id': 'root',
                'text': '左分支',
                'side': 'left',
                'position': '1',
                'folded': 'true',
                'json': true,
            },
            WRITE
        );
    });

    const reported = JSON.parse(out) as { id: string; side: string; folded: boolean };
    assert.strictEqual(reported.side, 'left', 'the echo must name the side it wrote');
    assert.strictEqual(reported.folded, true, 'the echo must name the fold it wrote');

    const after = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepStrictEqual(
        after.nodes.root.children,
        ['jm-a1', reported.id, 'jm-a2'],
        '--position is an index into the root children array, across both sides'
    );
    assert.strictEqual(after.nodes[reported.id].side, -1, 'left should serialise as -1');
    assert.strictEqual(after.nodes[reported.id].folded, true);

    const context = capture(() => {
        runContext({
            file,
            depth: 3,
            maxText: 40,
            fullText: false,
            idsOnly: false,
            asJson: false,
        });
    });
    const line = context.out.split('\n').find(item => item.startsWith(reported.id))!;
    assert.match(line, /\{side=left folded\}/, `context must show the placement: ${line}`);
    rmSync(dir, { recursive: true, force: true });
});

test('cli - mind add-child appends when --position is past the end', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);

    const { out } = capture(() => {
        runMind(
            file,
            'add-child',
            { 'parent-id': 'root', 'text': '尾巴', 'position': '99', 'json': true },
            WRITE
        );
    });
    const created = (JSON.parse(out) as { id: string }).id;

    const after = JSON.parse(readFileSync(file, 'utf8'));
    assert.strictEqual(after.nodes.root.children.at(-1), created, 'a position past the end appends');
    assert.strictEqual(after.nodes.root.children.length, 3, 'the fixture had two root children');
    rmSync(dir, { recursive: true, force: true });
});

test('cli - mind add-child --side rejects a parent below the root and names the branch', () => {
    for (const parentId of ['jm-a1', 'jm-b1']) {
        const dir = scratch();
        const file = join(dir, 'm.json');
        copyFileSync(FIXTURE, file);
        const before = readFileSync(file, 'utf8');

        assert.throws(
            () => {
                capture(() => {
                    runMind(
                        file,
                        'add-child',
                        { 'parent-id': parentId, 'text': 'x', 'side': 'left' },
                        WRITE
                    );
                });
            },
            (err: unknown) => {
                assert.ok(err instanceof CliError);
                assert.strictEqual(err.exit, CliExit.Usage, 'an impossible placement is a usage error');
                assert.ok(
                    err.message.includes('数据准备') && err.message.includes('"jm-a1"'),
                    `the error must name the first-level branch: ${err.message}`
                );
                return true;
            }
        );

        assert.strictEqual(readFileSync(file, 'utf8'), before, 'the refused write must not land');
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - mind add-child --side rejects center', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    const before = readFileSync(file, 'utf8');

    assert.throws(
        () => {
            capture(() => {
                runMind(file, 'add-child', { 'parent-id': 'root', 'text': 'x', 'side': 'center' }, WRITE);
            });
        },
        (err: unknown) => {
            assert.ok(err instanceof CliError);
            assert.strictEqual(err.exit, CliExit.Usage);
            assert.ok(err.message.includes('center'), 'the error must say why center is refused');
            return true;
        }
    );

    assert.strictEqual(readFileSync(file, 'utf8'), before);
    rmSync(dir, { recursive: true, force: true });
});

test('cli - mind add-child --folded accepts only the two words', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);

    assert.throws(
        () => {
            capture(() => {
                runMind(file, 'add-child', { 'parent-id': 'root', 'text': 'x', 'folded': 'yes' }, WRITE);
            });
        },
        (err: unknown) => {
            assert.ok(err instanceof CliError);
            assert.strictEqual(err.exit, CliExit.Usage);
            assert.ok(err.message.includes('true or false'));
            return true;
        }
    );
    rmSync(dir, { recursive: true, force: true });
});

test('cli - mind add-node no longer exists', () => {
    // Merged into add-child; the preview release keeps no alias, so the name has
    // to fail as an unknown subcommand rather than quietly doing the old thing.
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);

    assert.throws(
        () => {
            capture(() => {
                runMind(file, 'add-node', { 'parent-id': 'root', 'text': 'x' }, WRITE);
            });
        },
        (err: unknown) => {
            assert.ok(err instanceof CliError);
            assert.strictEqual(err.exit, CliExit.Usage);
            assert.ok(err.message.includes('Unknown mind subcommand: add-node'));
            return true;
        }
    );
    rmSync(dir, { recursive: true, force: true });
});

test('cli - node set-side refuses the root and deeper nodes', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    const before = readFileSync(file, 'utf8');

    // A deeper node: the write used to succeed and print a confirmation while
    // the picture stayed exactly as it was.
    assert.throws(
        () => {
            capture(() => {
                runNode(file, 'set-side', { 'node-id': 'jm-b1', 'side': 'left' }, WRITE);
            });
        },
        (err: unknown) => {
            assert.ok(err instanceof CliError);
            assert.strictEqual(err.exit, CliExit.Usage);
            assert.ok(
                err.message.includes('数据准备') && err.message.includes('Set the side on "jm-a1"'),
                `the error must name the branch to act on: ${err.message}`
            );
            return true;
        }
    );

    // The root has no side to set: it is center by definition.
    assert.throws(
        () => {
            capture(() => {
                runNode(file, 'set-side', { 'node-id': 'root', 'side': 'left' }, WRITE);
            });
        },
        (err: unknown) => {
            assert.ok(err instanceof CliError);
            assert.strictEqual(err.exit, CliExit.Usage);
            assert.ok(err.message.includes('always center'));
            return true;
        }
    );

    assert.strictEqual(readFileSync(file, 'utf8'), before, 'neither refusal may write');
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

test('cli - mind find JSON uses side as word and folded only when true', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const { out } = capture(() => {
            runMind(file, 'find', { 'node-id': 'jm-b1' }, WRITE);
        });
        const node = JSON.parse(out);
        assert.equal(node.side, 'right', 'side must be a word, not a number');
        assert.equal(node.folded, true);

        const { out: out2 } = capture(() => {
            runMind(file, 'find', { 'node-id': 'jm-a1' }, WRITE);
        });
        const open = JSON.parse(out2);
        assert.ok(!('folded' in open), 'unfolded node carries no folded key');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
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

test('cli - an unknown --side word is offered only the placement words', () => {
    // `center` stays in the lookup table so `--side center` can be answered with
    // its own reason, but it is not a placement: listing it among the accepted
    // values would send the caller into a second rejection straight away.
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);

    // Prototype keys are unknown words too. They are the trap the table lookup
    // used to fall into: `SIDE_SYNONYMS[raw]` answers with an inherited value
    // instead of `undefined`, so without an own-property check these reach the
    // data-error path (exit 1) instead of the usage error asserted here.
    const attempts: Array<() => void> = [
        () => runMind(file, 'add-child', { 'parent-id': 'root', 'text': 'x', 'side': 'middle' }, WRITE),
        () => runNode(file, 'set-side', { 'node-id': 'jm-a1', 'side': 'middle' }, WRITE),
        () => runMind(file, 'add-child', { 'parent-id': 'root', 'text': 'x', 'side': 'constructor' }, WRITE),
        () => runNode(file, 'set-side', { 'node-id': 'jm-a1', 'side': 'constructor' }, WRITE),
        () => runMind(file, 'add-child', { 'parent-id': 'root', 'text': 'x', 'side': 'toString' }, WRITE),
        () => runMind(file, 'add-child', { 'parent-id': 'root', 'text': 'x', 'side': '__proto__' }, WRITE),
    ];

    for (const attempt of attempts) {
        assert.throws(
            () => {
                capture(attempt);
            },
            (err: unknown) => {
                assert.ok(err instanceof CliError);
                assert.strictEqual(err.exit, CliExit.Usage);
                assert.match(err.message, /must be one of left, right/);
                assert.ok(
                    !err.message.includes('center'),
                    `the candidate list must not offer center: ${err.message}`
                );
                return true;
            }
        );
    }
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

// ---------------------------------------------------------------------------
// node set-style
//
// The fixture already carries a spread of overrides: root has fontSize and
// fontWeight, jm-a1 has a nested incoming block, jm-b1 has border properties.
// Each case below starts from that copy, so the assertions are about what the
// command changed rather than what it wrote from nothing.
// ---------------------------------------------------------------------------

/** Runs one set-style against a fresh copy and returns the node's style after. */
function styleAfter(nodeId: string, values: Record<string, unknown>): unknown {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        capture(() => {
            runNode(file, 'set-style', { 'node-id': nodeId, ...values }, WRITE);
        });
        const after = JSON.parse(readFileSync(file, 'utf8'));
        return after.nodes[nodeId].style;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

test('cli - node set-style sets one field', () => {
    assert.deepStrictEqual(styleAfter('jm-a2', { tone: 'info' }), {
        tone: 'info',
        fontWeight: 'bold',
    });
});

test('cli - node set-style applies several fields in one write', () => {
    assert.deepStrictEqual(styleAfter('jm-b1', { 'tone': 'success', 'font-size': '16' }), {
        tone: 'success',
        borderWidth: 2,
        borderStyle: 'dotted',
        fontSize: 16,
    });
});

test('cli - node set-style creates a style block on a node that had none', () => {
    // Every node in the shared fixture already carries a style block, so this
    // case strips one first. Without it, "creates" is untested and only
    // "merges" is - and those are different code paths through writeAt.
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const doc = JSON.parse(readFileSync(file, 'utf8'));
        assert.ok(doc.nodes['jm-b1'].style !== undefined, 'fixture precondition');
        delete doc.nodes['jm-b1'].style;
        writeFileSync(file, JSON.stringify(doc, null, 4));

        capture(() => {
            runNode(file, 'set-style', { 'node-id': 'jm-b1', 'font-weight': 'bold' }, WRITE);
        });

        const after = JSON.parse(readFileSync(file, 'utf8'));
        assert.deepStrictEqual(after.nodes['jm-b1'].style, { fontWeight: 'bold' });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - node set-style writes nested incoming fields without dropping siblings', () => {
    // jm-a1 starts with incoming { color, width, pattern }. Changing the pattern
    // must leave the other two alone.
    assert.deepStrictEqual(styleAfter('jm-a1', { 'incoming.pattern': 'solid' }), {
        tone: 'success',
        incoming: { color: '#4fb681', width: 3, pattern: 'solid' },
    });
});

test('cli - node set-style creates the incoming block when it does not exist', () => {
    assert.deepStrictEqual(styleAfter('jm-a2', { 'incoming.curve': 'straight' }), {
        tone: 'danger',
        fontWeight: 'bold',
        incoming: { curve: 'straight' },
    });
});

test('cli - node set-style --clear removes only the named fields', () => {
    assert.deepStrictEqual(styleAfter('root', { clear: 'fontSize' }), {
        tone: 'primary',
        fontWeight: 'bold',
    });
});

test('cli - node set-style --clear accepts camelCase field names', () => {
    // The file shows fontSize; the flag is --font-size. --clear takes either.
    assert.deepStrictEqual(styleAfter('root', { clear: 'fontSize,fontWeight' }), {
        tone: 'primary',
    });
});

test('cli - node set-style --clear accepts kebab-case field names too', () => {
    assert.deepStrictEqual(styleAfter('root', { clear: 'font-size,font-weight' }), {
        tone: 'primary',
    });
});

test('cli - node set-style --clear drops the style block once it is empty', () => {
    // An empty object and a missing property resolve the same way, but only the
    // missing one serialises to nothing.
    assert.strictEqual(styleAfter('jm-a2', { clear: 'tone,fontWeight' }), undefined);
});

test('cli - node set-style --clear drops incoming once its last field goes', () => {
    assert.deepStrictEqual(
        styleAfter('jm-a1', { clear: 'incoming.color,incoming.width,incoming.pattern' }),
        { tone: 'success' }
    );
});

test('cli - node set-style --reset removes every override', () => {
    assert.strictEqual(styleAfter('jm-b1', { reset: true }), undefined);
});

test('cli - node set-style reports the style it left behind as JSON', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const { out } = capture(() => {
            runNode(file, 'set-style', { 'node-id': 'jm-a2', 'tone': 'info', 'json': true }, WRITE);
        });
        assert.deepStrictEqual(JSON.parse(out), {
            id: 'jm-a2',
            style: { tone: 'info', fontWeight: 'bold' },
        });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - node set-style does not touch the file under --dry-run', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const before = readFileSync(file, 'utf8');
        capture(() => {
            runNode(file, 'set-style', { 'node-id': 'jm-a2', 'tone': 'info' }, {
                dryRun: true,
                backup: false,
            });
        });
        assert.strictEqual(readFileSync(file, 'utf8'), before);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - node set-style rejects an unknown tone as a usage error', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        assert.throws(
            () => {
                capture(() => {
                    runNode(file, 'set-style', { 'node-id': 'jm-a2', 'tone': 'banana' }, WRITE);
                });
            },
            (err: unknown) => {
                assert.ok(err instanceof CliError);
                assert.strictEqual(err.exit, CliExit.Usage);
                assert.match(err.message, /--tone must be one of/);
                return true;
            }
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - node set-style rejects an unknown font weight', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        assert.throws(
            () => {
                capture(() => {
                    runNode(file, 'set-style', { 'node-id': 'jm-a2', 'font-weight': 'heavy' }, WRITE);
                });
            },
            (err: unknown) => {
                assert.ok(err instanceof CliError);
                assert.strictEqual(err.exit, CliExit.Usage);
                return true;
            }
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - node set-style rejects a non-positive numeric field', () => {
    for (const value of ['0', '-3', 'abc']) {
        assert.throws(
            () => {
                capture(() => {
                    runNode(join(scratch(), 'unused.json'), 'set-style', {
                        'node-id': 'jm-a2',
                        'font-size': value,
                    }, WRITE);
                });
            },
            (err: unknown) => {
                assert.ok(err instanceof CliError);
                assert.strictEqual(err.exit, CliExit.Usage);
                return true;
            },
            `font-size ${value} should be rejected before the file is read`
        );
    }
});

test('cli - node set-style with no field at all is a usage error', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        assert.throws(
            () => {
                capture(() => {
                    runNode(file, 'set-style', { 'node-id': 'jm-a2' }, WRITE);
                });
            },
            (err: unknown) => {
                assert.ok(err instanceof CliError);
                assert.strictEqual(err.exit, CliExit.Usage);
                assert.match(err.message, /at least one field/);
                return true;
            }
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - node set-style rejects --reset combined with a field', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        assert.throws(
            () => {
                capture(() => {
                    runNode(file, 'set-style', { 'node-id': 'jm-a2', 'reset': true, 'tone': 'info' }, WRITE);
                });
            },
            (err: unknown) => {
                assert.ok(err instanceof CliError);
                assert.strictEqual(err.exit, CliExit.Usage);
                assert.match(err.message, /cannot be combined/);
                return true;
            }
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - node set-style rejects an unknown --clear field', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        assert.throws(
            () => {
                capture(() => {
                    runNode(file, 'set-style', { 'node-id': 'jm-a2', 'clear': 'banana' }, WRITE);
                });
            },
            (err: unknown) => {
                assert.ok(err instanceof CliError);
                assert.strictEqual(err.exit, CliExit.Usage);
                assert.match(err.message, /does not know/);
                return true;
            }
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - node set-style on a missing node is an invalid-data error', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        assert.throws(
            () => {
                capture(() => {
                    runNode(file, 'set-style', { 'node-id': 'nope', 'tone': 'info' }, WRITE);
                });
            },
            (err: unknown) => {
                assert.ok(err instanceof CliError);
                assert.strictEqual(err.exit, CliExit.InvalidData);
                return true;
            }
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});


// ---------------------------------------------------------------------------
// Discovery reads back what the mutation wrote
// ---------------------------------------------------------------------------

test('cli - context reports the style of a node that overrides the theme', () => {
    // The gap this closes: set-style could write a field that no discovery
    // command echoed, so the only way to confirm a style change was to render an
    // image and look at it.
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const { out } = capture(() => {
            runContext({
                file,
                depth: 3,
                maxText: 40,
                fullText: false,
                idsOnly: false,
                asJson: true,
            });
        });
        const entries = JSON.parse(out).nodes;
        const a1 = entries.find((e: { id: string }) => e.id === 'jm-a1');
        assert.deepStrictEqual(a1.style, {
            tone: 'success',
            incoming: { color: '#4fb681', width: 3, pattern: 'dashed' },
        });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - context omits style for a node that overrides nothing', () => {
    // Reporting an empty object would add a key to every entry, growing the
    // output an agent reads on each discovery step.
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const doc = JSON.parse(readFileSync(file, 'utf8'));
        delete doc.nodes['jm-a1'].style;
        writeFileSync(file, JSON.stringify(doc, null, 4));

        const { out } = capture(() => {
            runContext({
                file,
                depth: 3,
                maxText: 40,
                fullText: false,
                idsOnly: false,
                asJson: true,
            });
        });
        const a1 = JSON.parse(out).nodes.find((e: { id: string }) => e.id === 'jm-a1');
        assert.ok(!('style' in a1), 'a node without overrides carries no style key');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - context shows style in the text output too', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const { out } = capture(() => {
            runContext({
                file,
                depth: 3,
                maxText: 40,
                fullText: false,
                idsOnly: false,
                asJson: false,
            });
        });
        // jm-a1 has a nested incoming block. Dotted keys match the flags, so the
        // value can be written back or cleared without translating.
        assert.match(out, /jm-a1.*\{side=right tone=success incoming\.color=#4fb681 incoming\.width=3 incoming\.pattern=dashed\}/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - context shows folded in the text output', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const { out } = capture(() => {
            runContext({
                file,
                depth: 3,
                maxText: 40,
                fullText: false,
                idsOnly: false,
                asJson: false,
            });
        });
        // jm-b1 is folded and deeper than a root child, so it must not show
        // side. Style overrides still appear.
        assert.match(out, /jm-b1.*\{folded tone=warning borderWidth=2 borderStyle=dotted\}/);
        assert.ok(!/jm-b1.*\{[^}]*\bside=/.test(out), 'deeper nodes must not show side');
        // jm-a1 is not folded — the word must not appear.
        const a1Line = out.split('\n').find(l => l.includes('jm-a1'))!;
        assert.ok(a1Line, 'jm-a1 is present');
        assert.ok(!/\bfolded\b/.test(a1Line), 'unfolded node must not show folded');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - context JSON includes folded only when true', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const { out } = capture(() => {
            runContext({
                file,
                depth: 3,
                maxText: 40,
                fullText: false,
                idsOnly: false,
                asJson: true,
            });
        });
        const entries: { id: string; folded?: boolean }[] = JSON.parse(out).nodes;
        const b1 = entries.find(e => e.id === 'jm-b1')!;
        assert.ok(b1, 'jm-b1 is present');
        assert.equal(b1.folded, true);
        const a1 = entries.find(e => e.id === 'jm-a1')!;
        assert.ok(a1, 'jm-a1 is present');
        assert.ok(!('folded' in a1), 'unfolded node carries no folded key');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - context JSON side is a word, not a number', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const { out } = capture(() => {
            runContext({
                file,
                depth: 3,
                maxText: 40,
                fullText: false,
                idsOnly: false,
                asJson: true,
            });
        });
        const entries: { id: string; side?: string }[] = JSON.parse(out).nodes;
        const root = entries.find(e => e.id === 'root')!;
        assert.ok(root, 'root is present');
        assert.equal(root.side, 'center');
        const a2 = entries.find(e => e.id === 'jm-a2')!;
        assert.ok(a2, 'jm-a2 is present');
        assert.equal(a2.side, 'left');
        const b1 = entries.find(e => e.id === 'jm-b1')!;
        assert.ok(b1, 'jm-b1 is present');
        assert.ok(!('side' in b1), 'nodes below the root\'s direct children omit side');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - context JSON gives every node a parentId', () => {
    // The array is flat and carries only `level`, so a consumer had to rebuild
    // the tree from the order of the levels. The link states it directly.
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const { out } = capture(() => {
            runContext({ file, depth: 3, maxText: 40, fullText: false, idsOnly: false, asJson: true });
        });
        const entries: { id: string; parentId?: string | null; level: number }[] = JSON.parse(
            out
        ).nodes;
        const root = entries.find(entry => entry.id === 'root')!;
        assert.strictEqual(root.parentId, null, 'the root has no parent, and says so');
        const a1 = entries.find(entry => entry.id === 'jm-a1')!;
        assert.strictEqual(a1.parentId, 'root');
        const b1 = entries.find(entry => entry.id === 'jm-b1')!;
        assert.strictEqual(b1.parentId, 'jm-a1', 'a deeper node points at its own parent');
        for (const entry of entries) {
            assert.ok('parentId' in entry, `${entry.id} must carry parentId`);
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - context --highlight answers with the id path and leads the output', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const { out } = capture(() => {
            runContext({
                file,
                depth: 1,
                maxText: 40,
                fullText: false,
                idsOnly: false,
                asJson: false,
                highlight: ['清洗规则'],
            });
        });
        const lines = out.split('\n');
        assert.strictEqual(lines[0], 'highlighted:', 'the answer leads, the tree follows');
        assert.strictEqual(lines[1], '  "清洗规则" -> "root"/"jm-a1"/"jm-b1"');
        const mapAt = lines.indexOf('fullmap:');
        assert.ok(mapAt > 1, 'the tree sits under its own heading');
        assert.ok(lines.slice(mapAt).some(line => line.startsWith('root')), 'the map is still there');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - context --highlight says (no match) instead of guessing', () => {
    // The whole point of the flag is that an id is about to be copied out of
    // it. A candidate list here would be an invitation to copy the wrong one.
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const text = capture(() => {
            runContext({
                file,
                depth: 1,
                maxText: 40,
                fullText: false,
                idsOnly: false,
                asJson: false,
                highlight: ['earth'],
            });
        });
        assert.match(text.out, /^  "earth" -> \(no match\)$/m);
        assert.ok(!text.out.includes('Candidate'), 'no candidates, no suggestion');

        const json = capture(() => {
            runContext({
                file,
                depth: 1,
                maxText: 40,
                fullText: false,
                idsOnly: false,
                asJson: true,
                highlight: ['earth'],
            });
        });
        const payload = JSON.parse(json.out);
        assert.ok('earth' in payload.highlighted, 'a miss keeps its key');
        assert.strictEqual(payload.highlighted.earth, null);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - context --highlight searches the whole document, not just --depth', () => {
    // The label an agent knows is often deeper than a readable tree; that is
    // what makes the flag worth having.
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const { out } = capture(() => {
            runContext({
                file,
                depth: 0,
                maxText: 40,
                fullText: false,
                idsOnly: false,
                asJson: false,
                highlight: ['清洗规则'],
            });
        });
        assert.match(out, /"清洗规则" -> "root"\/"jm-a1"\/"jm-b1"/);
        const tree = out.slice(out.indexOf('fullmap:'));
        assert.ok(!tree.includes('jm-b1'), 'the tree itself stops at the root');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - context --highlight marks a label that several nodes share', () => {
    // A first match with no signal would send the caller to edit one of two
    // nodes and never mention the other.
    const dir = scratch();
    const file = join(dir, 'm.json');
    const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    doc.nodes['jm-dupe'] = { ...doc.nodes['jm-a2'], id: 'jm-dupe' };
    doc.nodes.root.children = [...doc.nodes.root.children, 'jm-dupe'];
    writeFileSync(file, JSON.stringify(doc, null, 4));
    try {
        const text = capture(() => {
            runContext({
                file,
                depth: 1,
                maxText: 40,
                fullText: false,
                idsOnly: false,
                asJson: false,
                highlight: ['模型选择'],
            });
        });
        assert.match(text.out, /"模型选择" -> "root"\/"jm-a2" \(\+1 more\)/);

        const json = capture(() => {
            runContext({
                file,
                depth: 1,
                maxText: 40,
                fullText: false,
                idsOnly: false,
                asJson: true,
                highlight: ['模型选择'],
            });
        });
        const hit = JSON.parse(json.out).highlighted['模型选择'];
        assert.strictEqual(hit.id, 'jm-a2', 'the first in document order');
        assert.strictEqual(hit.matches, 2);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - context --highlight reuses the node shape, parentId included', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const { out } = capture(() => {
            runContext({
                file,
                depth: 3,
                maxText: 40,
                fullText: false,
                idsOnly: false,
                asJson: true,
                highlight: ['清洗规则'],
            });
        });
        const payload = JSON.parse(out);
        const hit = payload.highlighted['清洗规则'];
        const sameNode = payload.nodes.find((entry: { id: string }) => entry.id === hit.id);
        // The same shape, not necessarily the same entry: a hit deeper than
        // --depth is absent from `nodes`, and a shared label adds `matches`.
        assert.deepStrictEqual(hit, sameNode, 'the highlighted value has the same shape as the node');
        assert.strictEqual(hit.parentId, 'jm-a1');
        assert.strictEqual(hit.level, 2);
        assert.ok(!('matches' in hit), 'a unique label carries no count');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - context says nothing about highlighting when the flag is absent', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const text = capture(() => {
            runContext({ file, depth: 1, maxText: 40, fullText: false, idsOnly: false, asJson: false });
        });
        assert.ok(!text.out.includes('highlighted:'), 'no empty section in the text output');
        assert.ok(!text.out.includes('fullmap:'), 'the tree keeps its old shape');

        const json = capture(() => {
            runContext({ file, depth: 1, maxText: 40, fullText: false, idsOnly: false, asJson: true });
        });
        assert.ok(!('highlighted' in JSON.parse(json.out)), 'no key when nothing was asked');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - context --highlight ignores case, and asks one question once', () => {
    // Labels are typed by people: `Customer Service` and `customer service`
    // are one label with two capitalisations, not two labels. A case-sensitive
    // match would answer (no match) and send the caller hunting for a node
    // that is right there. And because matching folds case, asking for both
    // spellings is one question, so the same answer is not printed twice.
    const dir = scratch();
    const file = join(dir, 'm.json');
    const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    doc.nodes['jm-b1'].content.value = 'Customer Service';
    writeFileSync(file, JSON.stringify(doc, null, 4));
    try {
        const text = capture(() => {
            runContext({
                file,
                depth: 1,
                maxText: 40,
                fullText: false,
                idsOnly: false,
                asJson: false,
                highlight: ['customer service', 'CUSTOMER SERVICE'],
            });
        });
        const block = text.out.slice(text.out.indexOf('highlighted:'), text.out.indexOf('fullmap:'));
        const answers = block.split('\n').filter(line => line.includes('->'));
        assert.strictEqual(answers.length, 1, 'two spellings of one label are one question');
        assert.match(answers[0], /"customer service" -> "root"\/"jm-a1"\/"jm-b1"/);

        const json = capture(() => {
            runContext({
                file,
                depth: 1,
                maxText: 40,
                fullText: false,
                idsOnly: false,
                asJson: true,
                highlight: ['CUSTOMER SERVICE'],
            });
        });
        const hit = JSON.parse(json.out).highlighted['CUSTOMER SERVICE'];
        assert.strictEqual(hit.id, 'jm-b1', 'the stored capitalisation is not the needle');
        assert.ok(!('matches' in hit), 'a unique label carries no count');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - context refuses an empty --highlight', () => {
    // An empty needle would compare equal to every node with an empty label,
    // which is a locator answering with a node nobody asked about.
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        assert.throws(
            () => {
                capture(() => {
                    runContext({
                        file,
                        depth: 1,
                        maxText: 40,
                        fullText: false,
                        idsOnly: false,
                        asJson: false,
                        highlight: [''],
                    });
                });
            },
            (err: unknown) => err instanceof CliError && err.exit === CliExit.Usage
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - context --ids-only keeps one bare id per line and refuses --highlight', () => {
    // --ids-only is the one output a script can hand to xargs without parsing,
    // and the highlighted block is headings, quoted paths and a blank line. The
    // two cannot share stdout, so the combination is a usage error rather than
    // a third shape nothing can rely on.
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const { out } = capture(() => {
            runContext({ file, depth: 3, maxText: 40, fullText: false, idsOnly: true, asJson: false });
        });
        assert.deepStrictEqual(
            out.split('\n').filter(line => line !== ''),
            ['root', 'jm-a1', 'jm-b1', 'jm-a2'],
            'each line is exactly one id: no heading, no quoted path, no blank line'
        );

        assert.throws(
            () => {
                capture(() => {
                    runContext({
                        file,
                        depth: 3,
                        maxText: 40,
                        fullText: false,
                        idsOnly: true,
                        asJson: false,
                        highlight: ['清洗规则'],
                    });
                });
            },
            (err: unknown) => err instanceof CliError && err.exit === CliExit.Usage,
            'the two flags ask for different shapes of stdout'
        );

        // The machine-readable path keeps working: the ids are there, the
        // labels are what --ids-only drops.
        const json = capture(() => {
            runContext({
                file,
                depth: 3,
                maxText: 40,
                fullText: false,
                idsOnly: true,
                asJson: true,
                highlight: ['清洗规则'],
            });
        });
        const hit = JSON.parse(json.out).highlighted['清洗规则'];
        assert.strictEqual(hit.id, 'jm-b1');
        assert.ok(!('text' in hit), '--ids-only still drops labels under --json');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - context --json keeps a __proto__ miss as an own key', () => {
    // A label is arbitrary user text, and `__proto__` is the one key plain
    // assignment swallows: the miss would be dropped and read as "never asked",
    // which is exactly the distinction the keep-the-key-with-null rule carries.
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const { out } = capture(() => {
            runContext({
                file,
                depth: 1,
                maxText: 40,
                fullText: false,
                idsOnly: false,
                asJson: true,
                highlight: ['__proto__', 'constructor', 'toString', '清洗规则'],
            });
        });
        const payload = JSON.parse(out);
        assert.deepStrictEqual(
            Object.keys(payload.highlighted),
            ['__proto__', 'constructor', 'toString', '清洗规则'],
            'every request keeps its key, in the order asked'
        );
        assert.strictEqual(
            Object.getOwnPropertyDescriptor(payload.highlighted, '__proto__')?.value,
            null,
            'the miss is an own property, not the prototype'
        );
        assert.strictEqual(payload.highlighted['清洗规则'].id, 'jm-b1');

        const text = capture(() => {
            runContext({
                file,
                depth: 1,
                maxText: 40,
                fullText: false,
                idsOnly: false,
                asJson: false,
                highlight: ['__proto__'],
            });
        });
        assert.match(text.out, /^ {2}"__proto__" -> \(no match\)$/m, 'the text form reports it too');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - context lines the highlight arrows up across CJK and latin labels', () => {
    // The padding exists for the arrows only, and a CJK character is two
    // columns wide: padding by string length would leave the block ragged. One
    // latin miss between two CJK hits exercises both the wide measure and the
    // short line that gets padded.
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const { out } = capture(() => {
            runContext({
                file,
                depth: 1,
                maxText: 40,
                fullText: false,
                idsOnly: false,
                asJson: false,
                highlight: ['清洗规则', 'earth', '模型选择'],
            });
        });
        const block = out.slice(out.indexOf('highlighted:'), out.indexOf('fullmap:'));
        const lines = block.split('\n').filter(line => line.startsWith('  '));
        assert.deepStrictEqual(lines, [
            '  "清洗规则" -> "root"/"jm-a1"/"jm-b1"',
            '  "earth"    -> (no match)',
            '  "模型选择" -> "root"/"jm-a2"',
        ]);
        // Compare columns, not string indexes: one CJK character is one JS
        // character but two terminal columns, so widen each of them before
        // asking indexOf where the arrow starts.
        const columns = (text: string): number =>
            text.replace(/[\u2e80-\u9fff\uff00-\uffef]/g, char => `${char} `).indexOf(' -> ');
        const arrows = lines.map(columns);
        assert.ok(
            arrows.every(at => at === arrows[0]),
            `every arrow starts in the same column: ${JSON.stringify(arrows)}`
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - context text shows side only for the root and its direct children', () => {
    // side is only meaningful on those nodes. Deeper lines may still show
    // folded or style, but they must not carry side=.
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const { out } = capture(() => {
            runContext({
                file,
                depth: 3,
                maxText: 40,
                fullText: false,
                idsOnly: false,
                asJson: false,
            });
        });
        const lines = out.trim().split('\n');
        const byId = (id: string) => lines.find(line => line.startsWith(id));
        const rootLine = byId('root')!;
        const a1Line = byId('jm-a1')!;
        const a2Line = byId('jm-a2')!;
        const b1Line = byId('jm-b1')!;
        assert.ok(rootLine && a1Line && a2Line && b1Line, out);
        assert.match(rootLine, /\{side=center\b/);
        assert.match(a1Line, /\{side=right\b/);
        assert.match(a2Line, /\{side=left\b/);
        assert.ok(!/\bside=/.test(b1Line), `deeper node must omit side: ${b1Line}`);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - context does not rewrite or print descendant sides after set-side', () => {
    // Moving a parent to the left must not "correct" children in the output.
    // Their stored side is left alone, and because they are deeper than a
    // direct child of the root, it is not printed either.
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        capture(() => {
            runNode(file, 'set-side', { 'node-id': 'jm-a1', 'side': 'left' }, WRITE);
        });

        const after = JSON.parse(readFileSync(file, 'utf8'));
        assert.equal(after.nodes['jm-a1'].side, -1, 'parent moved to the left');
        assert.equal(after.nodes['jm-b1'].side, 1, 'descendant side is not rewritten');

        const { out } = capture(() => {
            runContext({
                file,
                depth: 3,
                maxText: 40,
                fullText: false,
                idsOnly: false,
                asJson: false,
            });
        });
        const a1Line = out.split('\n').find(line => line.startsWith('jm-a1'))!;
        const b1Line = out.split('\n').find(line => line.startsWith('jm-b1'))!;
        assert.match(a1Line, /\{side=left\b/);
        assert.ok(!/\bside=/.test(b1Line), `descendant must still omit side: ${b1Line}`);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - node set-style --dry-run reports what it would have written', () => {
    // Regression: the first implementation reread the file to build its report,
    // which under --dry-run returned the old value - reporting a change that had
    // not happened. Reporting what the mutation produced is both cheaper and the
    // only correct answer here.
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const { out } = capture(() => {
            runNode(
                file,
                'set-style',
                { 'node-id': 'jm-a2', 'tone': 'info', 'json': true },
                { dryRun: true, backup: false }
            );
        });

        const after = JSON.parse(readFileSync(file, 'utf8'));
        assert.strictEqual(after.nodes['jm-a2'].style.tone, 'danger', 'the file must be untouched');

        // Under --dry-run, runMutation prints the whole document that would have
        // been written and *then* the command reports. Two JSON documents end to
        // end, so `out` is not parseable as a whole - every mutating command
        // behaves this way, not just this one. The report is the last document.
        const report = out.slice(out.lastIndexOf('\n{') + 1);
        assert.deepStrictEqual(JSON.parse(report).style, { tone: 'info', fontWeight: 'bold' });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - node set-style accepts dotted flags for nested fields', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        capture(() => {
            runNode(file, 'set-style', { 'node-id': 'jm-a2', 'incoming.color': '#123456' }, WRITE);
        });
        const after = JSON.parse(readFileSync(file, 'utf8'));
        assert.deepStrictEqual(after.nodes['jm-a2'].style, {
            tone: 'danger',
            fontWeight: 'bold',
            incoming: { color: '#123456' },
        });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});


// ---------------------------------------------------------------------------
// The accepted values come from the model, not a copy
// ---------------------------------------------------------------------------

test('cli - node set-style accepts every tone the model defines', () => {
    // Regression: the first version restated the tone list by hand and left one
    // out, so a legal value was rejected as invalid. Walking the enum means a
    // tone added to the model is covered here without anyone remembering.
    for (const tone of Object.values(JmTone)) {
        const dir = scratch();
        const file = join(dir, 'm.json');
        copyFileSync(FIXTURE, file);
        try {
            capture(() => {
                runNode(file, 'set-style', { 'node-id': 'jm-a2', 'tone': tone }, WRITE);
            });
            const after = JSON.parse(readFileSync(file, 'utf8'));
            assert.strictEqual(after.nodes['jm-a2'].style.tone, tone, `tone ${tone} should be accepted`);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }
});

test('cli - node set-style accepts every font weight the model defines', () => {
    for (const weight of Object.values(JmFontWeight)) {
        const dir = scratch();
        const file = join(dir, 'm.json');
        copyFileSync(FIXTURE, file);
        try {
            capture(() => {
                runNode(file, 'set-style', { 'node-id': 'jm-a2', 'font-weight': weight }, WRITE);
            });
            const after = JSON.parse(readFileSync(file, 'utf8'));
            assert.strictEqual(after.nodes['jm-a2'].style.fontWeight, weight);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }
});

test('cli - node set-style accepts every line pattern and curve the model defines', () => {
    for (const pattern of Object.values(JmLinePattern)) {
        const dir = scratch();
        const file = join(dir, 'm.json');
        copyFileSync(FIXTURE, file);
        try {
            capture(() => {
                runNode(file, 'set-style', { 'node-id': 'jm-a2', 'incoming.pattern': pattern }, WRITE);
            });
            const after = JSON.parse(readFileSync(file, 'utf8'));
            assert.strictEqual(after.nodes['jm-a2'].style.incoming.pattern, pattern);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }

    for (const curve of Object.values(JmLineCurve)) {
        const dir = scratch();
        const file = join(dir, 'm.json');
        copyFileSync(FIXTURE, file);
        try {
            capture(() => {
                runNode(file, 'set-style', { 'node-id': 'jm-a2', 'incoming.curve': curve }, WRITE);
            });
            const after = JSON.parse(readFileSync(file, 'utf8'));
            assert.strictEqual(after.nodes['jm-a2'].style.incoming.curve, curve);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }
});

test('cli - mind move rejects a negative position', () => {
    // `position` has no negative meaning: omitting it appends, and the model
    // clamps anything below zero to zero. Accepting -5 silently would move the
    // node to the front when the caller expected something else.
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        assert.throws(
            () => {
                capture(() => {
                    runMind(file, 'move', { 'node-id': 'jm-a1', 'parent-id': 'root', 'position': '-5' }, WRITE);
                });
            },
            (err: unknown) => {
                assert.ok(err instanceof CliError);
                assert.strictEqual(err.exit, CliExit.Usage);
                assert.match(err.message, /non-negative integer/);
                return true;
            }
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

// ---------------------------------------------------------------------------
// mind set-style — the document-level defaultTone
//
// The fixture declares a style block but no defaultTone, so every case below
// starts from a document that predates the field. That is the interesting
// state: the feature has to leave those files alone until asked.
// ---------------------------------------------------------------------------

test('cli - mind set-style writes defaultTone and keeps the rest of the style block', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const before = JSON.parse(readFileSync(file, 'utf8')).style;
        capture(() => {
            runSetStyle(file, { 'default-tone': 'primary' }, WRITE);
        });

        const after = JSON.parse(readFileSync(file, 'utf8')).style;
        assert.deepStrictEqual(after, { ...before, defaultTone: 'primary' });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - mind set-style creates the style block on a document that has none', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const doc = JSON.parse(readFileSync(file, 'utf8'));
        delete doc.style;
        writeFileSync(file, JSON.stringify(doc, null, 2));

        capture(() => {
            runSetStyle(file, { 'default-tone': 'warning' }, WRITE);
        });

        assert.deepStrictEqual(JSON.parse(readFileSync(file, 'utf8')).style, {
            defaultTone: 'warning',
        });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - mind set-style does not touch the file under --dry-run', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const before = readFileSync(file, 'utf8');
        const { out } = capture(() => {
            runSetStyle(file, { 'default-tone': 'danger', 'json': true }, { dryRun: true, backup: false });
        });

        assert.strictEqual(readFileSync(file, 'utf8'), before, 'dry-run must not write');
        // runMutation prints the document that would have been written, then the
        // command reports. The report is the last document on the stream.
        const report = out.slice(out.lastIndexOf('\n{') + 1);
        assert.strictEqual(JSON.parse(report).style.defaultTone, 'danger');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - mind set-style keeps a backup when asked', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const before = readFileSync(file, 'utf8');
        capture(() => {
            runSetStyle(file, { 'default-tone': 'info' }, { dryRun: false, backup: true });
        });

        assert.strictEqual(readFileSync(`${file}.bak`, 'utf8'), before, 'the backup is the original');
        assert.strictEqual(
            JSON.parse(readFileSync(file, 'utf8')).style.defaultTone,
            'info',
            'the file itself carries the change'
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - mind set-style rejects an unknown tone as a usage error naming the flag', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        assert.throws(
            () => {
                capture(() => {
                    runSetStyle(file, { 'default-tone': 'banana' }, WRITE);
                });
            },
            (err: unknown) => {
                assert.ok(err instanceof CliError);
                assert.strictEqual(err.exit, CliExit.Usage);
                assert.match(err.message, /--default-tone must be one of/);
                return true;
            }
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - mind set-style needs at least one field', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        assert.throws(
            () => {
                capture(() => {
                    runSetStyle(file, {}, WRITE);
                });
            },
            (err: unknown) => {
                assert.ok(err instanceof CliError);
                assert.strictEqual(err.exit, CliExit.Usage);
                assert.match(err.message, /at least one field/);
                return true;
            }
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - mind has no `style` subcommand left to nest an action under', () => {
    // The rename leaves no alias behind: the document style is `set-style`, one
    // word like every sibling, and `mind style set` fails on `style`.
    assert.throws(
        () => {
            assertMindSubcommand('style');
        },
        (err: unknown) => {
            assert.ok(err instanceof CliError);
            assert.strictEqual(err.exit, CliExit.Usage);
            assert.match(err.message, /Unknown mind subcommand: style/);
            return true;
        }
    );
});

// ---------------------------------------------------------------------------
// Discovery of the document-level style
// ---------------------------------------------------------------------------

test('cli - context announces the document style above the tree', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const { out } = capture(() => {
            runContext({ file, depth: 1, maxText: 40, fullText: false, idsOnly: false, asJson: false });
        });

        assert.match(
            out.split('\n')[0],
            /^style: theme=default defaultTone=default overrides=background,tones,node,line,expander$/,
            'the summary names the preset, the resolved tone and what is overridden'
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - context stays quiet about a document that declares no style', () => {
    // The summary is a report of what is in the file, not a restatement of the
    // built-in theme: a file that says nothing prints nothing new.
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const doc = JSON.parse(readFileSync(file, 'utf8'));
        delete doc.style;
        writeFileSync(file, JSON.stringify(doc, null, 2));

        const text = capture(() => {
            runContext({ file, depth: 1, maxText: 40, fullText: false, idsOnly: false, asJson: false });
        });
        assert.ok(
            text.out.split('\n')[0].startsWith('root'),
            'the tree starts on the first line when there is no document style'
        );

        const json = capture(() => {
            runContext({ file, depth: 1, maxText: 40, fullText: false, idsOnly: false, asJson: true });
        });
        assert.ok(!('style' in JSON.parse(json.out)), 'no style block without a document style');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - context --ids-only prints no style line', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const { out } = capture(() => {
            runContext({ file, depth: 1, maxText: 40, fullText: false, idsOnly: true, asJson: false });
        });
        assert.ok(!out.startsWith('style:'), '--ids-only answers with ids and nothing else');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - context --json reads back the defaultTone the CLI wrote', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        capture(() => {
            runSetStyle(file, { 'default-tone': 'accent' }, WRITE);
        });

        const { out } = capture(() => {
            runContext({ file, depth: 1, maxText: 40, fullText: false, idsOnly: false, asJson: true });
        });
        const payload = JSON.parse(out);
        assert.deepStrictEqual(payload.style, {
            theme: 'default',
            defaultTone: 'accent',
            overrides: ['defaultTone', 'background', 'tones', 'node', 'line', 'expander'],
        });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - context refuses a document whose defaultTone is unknown, naming the path', () => {
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const doc = JSON.parse(readFileSync(file, 'utf8'));
        doc.style.defaultTone = 'banana';
        writeFileSync(file, JSON.stringify(doc, null, 2));

        assert.throws(
            () => {
                capture(() => {
                    runContext({ file, depth: 1, maxText: 40, fullText: false, idsOnly: false, asJson: true });
                });
            },
            (err: unknown) => {
                assert.ok(err instanceof CliError);
                assert.strictEqual(err.exit, CliExit.InvalidData);
                assert.match(err.message, /E_TONE {2}style\/defaultTone/);
                return true;
            }
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - a document without defaultTone is written back byte-identically', () => {
    // The feature must not graft `defaultTone: "default"` onto files that never
    // asked for it. The fixture is hand-formatted, so the first write normalises
    // it; the question is whether a second identical write changes anything.
    const dir = scratch();
    const file = join(dir, 'm.json');
    copyFileSync(FIXTURE, file);
    try {
        const original = JSON.parse(readFileSync(file, 'utf8'));
        const noop = (): void => {
            capture(() => {
                runNode(file, 'set-folded', { 'node-id': 'jm-b1', 'folded': 'true' }, WRITE);
            });
        };

        noop();
        const once = readFileSync(file, 'utf8');
        noop();

        assert.strictEqual(readFileSync(file, 'utf8'), once, 'the second write is byte-identical');
        assert.ok(!once.includes('defaultTone'), 'no defaultTone may appear in a file that had none');
        assert.deepStrictEqual(
            JSON.parse(once).style,
            original.style,
            'the document style block survives the round trip unchanged'
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
