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
import { runMind } from '../../src/cli/commands/mind.ts';
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
        const entries = JSON.parse(out);
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
        const a1 = JSON.parse(out).find((e: { id: string }) => e.id === 'jm-a1');
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
        // jm-b1 is folded.
        assert.match(out, /jm-b1.*\{side=right folded .+\}/);
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
        const entries: { id: string; folded?: boolean }[] = JSON.parse(out);
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
        const entries: { id: string; side: string }[] = JSON.parse(out);
        const root = entries.find(e => e.id === 'root')!;
        assert.ok(root, 'root is present');
        assert.equal(root.side, 'center');
        const a2 = entries.find(e => e.id === 'jm-a2')!;
        assert.ok(a2, 'jm-a2 is present');
        assert.equal(a2.side, 'left');
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
