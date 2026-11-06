/**
 * @fileoverview End-to-end test: build a mind map entirely through the CLI,
 * then verify the result with the public API.
 *
 * @remarks
 * Every other suite calls commands as functions. This one spawns the real
 * process, so it covers what function-level tests cannot: argument parsing,
 * exit codes crossing a process boundary, and — the point of the exercise —
 * whether the file the CLI writes is a file the API can read back with the
 * structure that was asked for.
 *
 * Node can run the TypeScript sources directly when `erasableSyntaxOnly` is on,
 * which it is. That keeps this suite off the build output: CI runs tests before
 * build, and requiring dist/ would have meant reordering the pipeline.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { JmMindJsonSerializer } from '../../src/serialization/json.ts';
import { JmMind } from '../../src/model/mind.ts';
import { JmNodeContent } from '../../src/model/data/node-content.ts';
import { JmEdgeType } from '../../src/model/data/edge.ts';
import { validateMindData } from '../../src/serialization/validation.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '../../src/cli/index.ts');

/** Result of one CLI invocation. */
interface CliRun {
    code: number;
    stdout: string;
    stderr: string;
}

/**
 * Runs the CLI as a real child process.
 *
 * @param args - Arguments after the program name.
 * @returns Exit code and both streams.
 */
function runCli(args: string[]): CliRun {
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
 * Runs the CLI and requires it to succeed.
 *
 * @param args - Arguments after the program name.
 * @returns Parsed JSON from stdout.
 */
function runCliJson(args: string[]): Record<string, unknown> {
    const run = runCli(args);
    assert.strictEqual(run.code, 0, `expected success, got ${run.code}: ${run.stderr}`);
    return JSON.parse(run.stdout) as Record<string, unknown>;
}

test('e2e - build a 20+ node map through the CLI and read it back with the API', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jsmind-e2e-'));
    const file = join(dir, 'project.json');

    // ---- 1. Start from nothing -------------------------------------------
    const created = runCli(['create', file, '--title', '项目计划', '--name', 'E2E', '--author', 'tester']);
    assert.strictEqual(created.code, 0, created.stderr);

    // ---- 2. Discover the root id the way an agent would ------------------
    // No hardcoded 'root': the point is that context tells you the id.
    const outline = runCliJson(['context', file, '--json', '--depth', '0']);
    assert.ok(Array.isArray(outline));
    const rootEntry = (outline as { id: string; level: number; text: string }[])[0];
    assert.strictEqual(rootEntry.text, '项目计划');
    const rootId = rootEntry.id;

    // ---- 3. Build the tree -----------------------------------------------
    // 5 phases x 3 tasks + root = 16 nodes from this section alone.
    const phases = [
        { name: '需求分析', tasks: ['用户访谈', '竞品调研', '需求文档'] },
        { name: '技术设计', tasks: ['架构选型', '接口设计', '数据建模'] },
        { name: '开发实现', tasks: ['后端接口', '前端页面', '联调'] },
        { name: '测试验证', tasks: ['单元测试', '集成测试', '验收'] },
        { name: '发布上线', tasks: ['灰度', '监控', '复盘'] },
    ];

    const phaseIds: string[] = [];
    const taskIds: Record<string, string[]> = {};

    for (const phase of phases) {
        const added = runCliJson([
            'mind', 'add-child', file,
            '--parent-id', rootId,
            '--text', phase.name,
            '--json',
        ]);
        const phaseId = added.id as string;
        phaseIds.push(phaseId);
        taskIds[phaseId] = [];

        for (const task of phase.tasks) {
            const sub = runCliJson([
                'mind', 'add-child', file,
                '--parent-id', phaseId,
                '--text', task,
                '--json',
            ]);
            taskIds[phaseId].push(sub.id as string);
        }
    }

    // ---- 4. Exercise the attribute commands ------------------------------
    runCli(['node', 'set-side', file, '--node-id', phaseIds[0], '--side', 'left']);
    runCli(['node', 'set-folded', file, '--node-id', phaseIds[1], '--folded', 'true']);
    runCli(['node', 'set-text', file, '--node-id', taskIds[phaseIds[4]][0], '--text', '5% 灰度']);

    // ---- 5. Add a relation that is not parent-child ----------------------
    const edge = runCliJson([
        'mind', 'add-edge', file,
        '--source-id', taskIds[phaseIds[0]][0],
        '--target-id', taskIds[phaseIds[2]][0],
        '--label', '催生了',
        '--json',
    ]);

    // ---- 6. The CLI must agree the result is valid -----------------------
    const validated = runCli(['validate', file]);
    assert.strictEqual(validated.code, 0, validated.stderr);

    // ---- 7. Now read the file back with the API --------------------------
    const doc = JSON.parse(readFileSync(file, 'utf8'));

    // The validator and the deserialiser must agree on this document.
    const check = validateMindData(doc);
    assert.strictEqual(check.valid, true, JSON.stringify(check.errors));

    const mind = new JmMindJsonSerializer().deserialize(doc);

    // ---- 8. Assert the structure the CLI was asked to build --------------
    assert.strictEqual(mind.root.content.value, '项目计划');
    assert.strictEqual(mind.root.children.length, phases.length);

    let total = 1;
    phases.forEach((phase, index) => {
        const node = mind.findNodeById(phaseIds[index]);
        assert.ok(node, `phase ${phase.name} should exist`);
        assert.strictEqual(node.content.value, phase.name);
        assert.strictEqual(node.parent?.id, rootId);
        assert.strictEqual(node.children.length, phase.tasks.length);

        node.children.forEach((child, childIndex) => {
            assert.strictEqual(child.id, taskIds[phaseIds[index]][childIndex]);
            total += 1;
        });
        total += 1;
    });

    // 1 root + 5 phases + 15 tasks.
    assert.strictEqual(total, 21, 'the map should hold 21 nodes');
    assert.ok(total >= 20, 'the point of the fixture is 20+ nodes');

    // Attribute commands landed on the right nodes.
    assert.strictEqual(mind.findNodeById(phaseIds[0])?.side, -1, 'left is -1');
    assert.strictEqual(mind.findNodeById(phaseIds[1])?.folded, true);
    assert.strictEqual(mind.findNodeById(taskIds[phaseIds[4]][0])?.content.value, '5% 灰度');

    // The edge is not part of the tree.
    const edges = mind.getEdges(taskIds[phaseIds[0]][0]);
    assert.strictEqual(edges.length, 1);
    assert.strictEqual(edges[0].id, edge.id);
    assert.strictEqual(edges[0].targetNodeId, taskIds[phaseIds[2]][0]);
    assert.strictEqual(edges[0].label, '催生了');

    // ---- 9. Round-trip: API output must re-validate ----------------------
    const again = new JmMindJsonSerializer().serialize(mind);
    const recheck = validateMindData(again);
    assert.strictEqual(recheck.valid, true, 'serialize output must validate');

    rmSync(dir, { recursive: true, force: true });
});

test('e2e - collapsed node keeps its subtree', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jsmind-e2e-'));
    const file = join(dir, 'fold.json');

    runCli(['create', file, '--title', '折叠测试']);
    const a = runCliJson(['mind', 'add-child', file, '--parent-id', 'root', '--text', 'A', '--json']);
    runCliJson(['mind', 'add-child', file, '--parent-id', a.id as string, '--text', 'A1', '--json']);
    runCli(['node', 'set-folded', file, '--node-id', a.id as string, '--folded', 'true']);

    // Folding is a view state: the children must still be in the document,
    // otherwise reopening the map loses them.
    const mind = new JmMindJsonSerializer().deserialize(
        JSON.parse(readFileSync(file, 'utf8'))
    );
    const node = mind.findNodeById(a.id as string);
    assert.strictEqual(node?.folded, true);
    assert.strictEqual(node?.children.length, 1);
    assert.strictEqual(node?.children[0].content.value, 'A1');

    rmSync(dir, { recursive: true, force: true });
});

test('e2e - a broken file stops the CLI from editing it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jsmind-e2e-'));
    const file = join(dir, 'broken.json');

    // Hand-write invalid data, then confirm the CLI refuses to build on it
    // rather than quietly producing a worse file.
    writeFileSync(
        file,
        JSON.stringify({
            format: 'jsmind_v2',
            meta: { name: 'x', author: 'y', version: '1' },
            root: 'root',
            nodes: {
                root: { id: 'root', content: { type: 'text', value: 'r' }, parent: null, children: ['ghost'], folded: false, side: 0, data: {} },
            },
            edges: {},
        })
    );

    const before = readFileSync(file, 'utf8');
    const attempt = runCli([
        'mind', 'add-child', file, '--parent-id', 'root', '--text', '不该出现',
    ]);

    assert.strictEqual(attempt.code, 1, 'invalid data is exit 1');
    assert.ok(attempt.stderr.includes('Refusing to modify'), attempt.stderr);
    assert.strictEqual(readFileSync(file, 'utf8'), before, 'the file must be untouched');

    rmSync(dir, { recursive: true, force: true });
});

test('e2e - a map built by the API is readable and editable by the CLI', () => {
    // The other direction. The forward test proves the CLI writes something the
    // API understands; this proves the API writes something the CLI
    // understands. Either side can drift on its own assumptions about the
    // format, and only a test that crosses the boundary catches it.
    const dir = mkdtempSync(join(tmpdir(), 'jsmind-e2e-'));
    const file = join(dir, 'from-api.json');

    // ---- 1. Build entirely through the API ------------------------------
    const mind = new JmMind({ name: 'API 建的图', author: 'api' });
    mind.root.content = JmNodeContent.createText('API 根节点');

    const backend = mind.addChildNode('后端', mind.root.id);
    const frontend = mind.addChildNode('前端', mind.root.id);
    const dbTask = mind.addChildNode('建表', backend.id);
    const apiTask = mind.addChildNode('写接口', backend.id);
    const pageTask = mind.addChildNode('写页面', frontend.id);

    // An API-side attribute, so the CLI has to read a non-default fold state.
    frontend.folded = true;
    backend.side = -1;

    // A non-hierarchical edge, with a label.
    const edge = mind.addEdge(dbTask.id, pageTask.id, JmEdgeType.Link, { label: '连接' });

    const doc = new JmMindJsonSerializer().serialize(mind);
    writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);

    // The API's own output must be valid before the CLI is asked to read it.
    assert.strictEqual(validateMindData(doc).valid, true);

    // ---- 2. The CLI must accept it --------------------------------------
    const validated = runCli(['validate', file]);
    assert.strictEqual(validated.code, 0, `CLI rejected API output: ${validated.stderr}`);

    // ---- 3. The CLI must see the same tree the API built ----------------
    const outline = runCliJson(['context', file, '--json', '--depth', '3']) as {
        id: string;
        level: number;
        text: string;
    }[];

    assert.strictEqual(outline.length, 6, `expected 6 nodes, saw ${outline.length}`);
    const texts = outline.map(entry => entry.text);
    for (const expected of ['API 根节点', '后端', '前端', '建表', '写接口', '写页面']) {
        assert.ok(texts.includes(expected), `the CLI should see "${expected}"`);
    }

    // Same ids — the CLI must not be re-deriving them.
    const apiIds = [mind.root.id, backend.id, frontend.id, dbTask.id, apiTask.id, pageTask.id];
    for (const id of apiIds) {
        assert.ok(outline.some(entry => entry.id === id), `the CLI should report id ${id}`);
    }

    // ---- 4. The CLI must find the edge the API created ------------------
    const edges = runCliJson(['mind', 'list-edges', file, '--node-id', dbTask.id, '--json']) as {
        id: string;
        source: string;
        target: string;
        label: string;
    }[];
    assert.strictEqual(edges.length, 1);
    assert.strictEqual(edges[0].id, edge.id);
    assert.strictEqual(edges[0].target, pageTask.id);
    assert.strictEqual(edges[0].label, '连接');

    // ---- 5. The CLI must be able to edit what the API produced ----------
    runCliJson(['mind', 'add-child', file, '--parent-id', pageTask.id, '--text', 'CLI 加的', '--json']);
    runCli(['node', 'set-text', file, '--node-id', apiTask.id, '--text', 'CLI 改的']);
    runCli(['node', 'set-folded', file, '--node-id', backend.id, '--folded', 'true']);

    // ---- 6. ...and that edit must still be readable by the API ----------
    const after = new JmMindJsonSerializer().deserialize(
        JSON.parse(readFileSync(file, 'utf8'))
    );

    const pageNode = after.findNodeById(pageTask.id);
    assert.strictEqual(pageNode?.children.length, 1, 'the CLI-added child should be there');
    assert.strictEqual(pageNode?.children[0].content.value, 'CLI 加的');
    assert.strictEqual(after.findNodeById(apiTask.id)?.content.value, 'CLI 改的');
    assert.strictEqual(after.findNodeById(backend.id)?.folded, true);

    // Attributes the CLI never touched must survive the round trip.
    assert.strictEqual(after.findNodeById(frontend.id)?.folded, true, 'untouched fold state kept');
    assert.strictEqual(after.findNodeById(backend.id)?.side, -1, 'untouched side kept');
    assert.strictEqual(after.findNodeById(dbTask.id)?.content.value, '建表', 'untouched text kept');

    // And the map metadata the API set must still be there.
    assert.strictEqual(after.meta.name, 'API 建的图');
    assert.strictEqual(after.meta.author, 'api');

    assert.strictEqual(validateMindData(JSON.parse(readFileSync(file, 'utf8'))).valid, true);

    rmSync(dir, { recursive: true, force: true });
});

test('e2e - CLI rejects an API map that the API allowed to become invalid', () => {
    // Guarding the boundary from the other side: if something writes a document
    // the validator would reject, the CLI must say so with exit 1 rather than
    // half-reading it.
    const dir = mkdtempSync(join(tmpdir(), 'jsmind-e2e-'));
    const file = join(dir, 'dangling.json');

    const mind = new JmMind({ name: 'going bad' });
    mind.root.content = JmNodeContent.createText('根');
    const child = mind.addChildNode('子', mind.root.id);
    const doc = new JmMindJsonSerializer().serialize(mind);

    // Point a child at a parent that is not in the document.
    (doc.nodes[child.id] as { parent: string | null }).parent = 'not-a-real-id';

    writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);

    const validated = runCli(['validate', file]);
    assert.strictEqual(validated.code, 1, 'invalid data is exit 1');
    assert.ok(validated.stderr.includes('E_NODE_PARENT_MISSING'), validated.stderr);

    // And a read command must refuse rather than return a partial tree.
    const outline = runCli(['context', file, '--json']);
    assert.strictEqual(outline.code, 1, 'context must not read a broken document');

    rmSync(dir, { recursive: true, force: true });
});
