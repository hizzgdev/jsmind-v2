/**
 * @fileoverview Tests for the create command.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { runCreate, createHelp } from '../../src/cli/commands/create.ts';
import { HELP } from '../../src/cli/index.ts';
import { runValidate } from '../../src/cli/commands/validate.ts';
import { CliError, CliExit } from '../../src/cli/exit.ts';
import { scratch, capture } from './helpers.ts';

test('create - produces a file that validates immediately', () => {
    const dir = scratch();
    const file = join(dir, 'new.json');

    let code = -1;
    capture(() => {
        code = runCreate({ file, title: '根节点', force: false, dryRun: false, backup: false });
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
        runCreate({ file, title: '起点', name: '我的图', author: 'someone', force: false, dryRun: false, backup: false });
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
                runCreate({ file, title: 'x', force: false, dryRun: false, backup: false });
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
        runCreate({ file, title: '新的', force: true, dryRun: false, backup: false });
    });

    const doc = JSON.parse(readFileSync(file, 'utf8'));
    assert.strictEqual(doc.nodes.root.content.value, '新的');
    rmSync(dir, { recursive: true, force: true });
});

test('create - --dry-run prints the document and writes nothing', () => {
    const dir = scratch();
    const file = join(dir, 'new.json');

    const { out } = capture(() => {
        runCreate({ file, title: '只看不写', force: false, dryRun: true, backup: false });
    });

    assert.ok(!existsSync(file), 'dry-run must not create the file');
    const printed = JSON.parse(out);
    assert.strictEqual(printed.nodes.root.content.value, '只看不写');
    rmSync(dir, { recursive: true, force: true });
});

test('create - name defaults to the title when --name is omitted', () => {
    const dir = scratch();
    const file = join(dir, 'new.json');

    capture(() => {
        runCreate({ file, title: '我的图', force: false, dryRun: false, backup: false });
    });

    const doc = JSON.parse(readFileSync(file, 'utf8'));
    // A map is normally named after its root, so one flag covers the common
    // case; a document saying "jsMind Mindmap" with a different root title
    // would need an explicit --name.
    assert.strictEqual(doc.meta.name, '我的图');
    assert.strictEqual(doc.nodes.root.content.value, '我的图');
    assert.ok(typeof doc.meta.author === 'string', 'author still comes from the defaults');
    rmSync(dir, { recursive: true, force: true });
});

test('create - --name overrides the title for meta.name', () => {
    const dir = scratch();
    const file = join(dir, 'new.json');

    capture(() => {
        runCreate({
            file,
            title: '根节点文字',
            name: '文档名',
            force: false,
            dryRun: false,
            backup: false,
        });
    });

    const doc = JSON.parse(readFileSync(file, 'utf8'));
    assert.strictEqual(doc.meta.name, '文档名');
    assert.strictEqual(doc.nodes.root.content.value, '根节点文字');
    rmSync(dir, { recursive: true, force: true });
});

test('create - --force --backup keeps a copy of the replaced file', () => {
    const dir = scratch();
    const file = join(dir, 'new.json');
    const bak = `${file}.bak`;
    writeFileSync(file, '{"previous":"content"}');

    capture(() => {
        runCreate({ file, title: '覆盖后的', force: true, dryRun: false, backup: true });
    });

    // The flag used to be hardcoded to false, so --backup was silently ignored
    // and the previous file was unrecoverable.
    assert.ok(existsSync(bak), 'the .bak copy must exist');
    assert.strictEqual(JSON.parse(readFileSync(bak, 'utf8')).previous, 'content');
    assert.strictEqual(JSON.parse(readFileSync(file, 'utf8')).nodes.root.content.value, '覆盖后的');
    rmSync(dir, { recursive: true, force: true });
});

test('create - --backup on a fresh path creates no .bak', () => {
    const dir = scratch();
    const file = join(dir, 'new.json');

    capture(() => {
        runCreate({ file, title: '全新的', force: false, dryRun: false, backup: true });
    });

    // Nothing was overwritten, so there is nothing to back up.
    assert.ok(existsSync(file));
    assert.ok(!existsSync(`${file}.bak`), 'no .bak should be produced when nothing was replaced');
    rmSync(dir, { recursive: true, force: true });
});

test('create - without --backup the previous file is not kept', () => {
    const dir = scratch();
    const file = join(dir, 'new.json');
    writeFileSync(file, '{"previous":"content"}');

    capture(() => {
        runCreate({ file, title: '覆盖', force: true, dryRun: false, backup: false });
    });

    assert.ok(!existsSync(`${file}.bak`));
    rmSync(dir, { recursive: true, force: true });
});

test('create - the main help summary names the same flag as createHelp', () => {
    // The summary line and the detailed block are two places in one file, and
    // they have already drifted once: --title landed in createHelp while the
    // summary still said --text. Comparing them here makes that a test failure
    // instead of something a reader has to notice.
    const summary = /jsmind create <file> --(\w[\w-]*)/.exec(HELP);
    const detailed = /jsmind create <file> --(\w[\w-]*)/.exec(createHelp);

    assert.ok(summary, 'the main help should show a create line');
    assert.ok(detailed, 'createHelp should show a usage line');
    assert.strictEqual(summary[1], detailed[1]);
});
