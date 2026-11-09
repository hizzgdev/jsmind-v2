/**
 * @fileoverview An agent's whole path, through the CLI and nothing else.
 *
 * @remarks
 * The M1 acceptance criterion is that an agent goes from a topic to a mind map
 * file plus an image **without writing JSON by hand**. Every other suite checks a
 * piece of that: `cli-workflow` covers the commands, `render` covers geometry,
 * the export tests cover the image. None of them checks that the pieces add up to
 * something an agent can actually do.
 *
 * So this test is deliberately shaped like the job rather than like the code:
 *
 *   1. Start from a sentence, not from a document.
 *   2. Ask where things are instead of assuming - the root id is discovered the
 *      same way an agent would discover it.
 *   3. Build down several levels, because a flat map does not exercise layout.
 *   4. Mark what matters, since style is how the map says "this is the risk".
 *   5. Validate before believing anything.
 *   6. Render, and check the image is a plausible image.
 *
 * What it does not do: judge whether the result looks good. That needs a viewer,
 * and M1 says the agent decides it at run time. CI only guarantees the pipeline
 * runs and produces a file.
 *
 * Runs against `dist/cli.js` because the export needs a browser, which is the
 * reason this lives in the UI suite and not in `e2e/`.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '../../dist/cli.js');

/** Result of one CLI invocation, with how long it took. */
interface CliRun {
    code: number;
    stdout: string;
    stderr: string;
    ms: number;
}

/**
 * Runs the CLI as a real child process.
 *
 * @param args - Arguments after the program name.
 * @returns Exit code, both streams, and elapsed milliseconds.
 */
function runCli(args: string[]): CliRun {
    const started = Date.now();
    const result = spawnSync(process.execPath, [CLI, ...args], {
        encoding: 'utf8',
        // The export launches a browser; give it room on a slow runner.
        timeout: 120000,
    });
    return {
        code: result.status ?? -1,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        ms: Date.now() - started,
    };
}

test('agent workflow - a topic becomes a validated file and an image, CLI only', {
    // The export alone can spend most of a minute on a cold runner.
    timeout: 180000,
}, () => {
    const dir = mkdtempSync(join(tmpdir(), 'jsmind-agent-'));
    const file = join(dir, 'map.json');
    const png = join(dir, 'map.png');
    const timings: [string, number][] = [];

    /** Records the duration of a step for the summary at the end. */
    function step(label: string, run: CliRun): CliRun {
        timings.push([label, run.ms]);
        assert.strictEqual(run.code, 0, `${label} failed (${run.code}): ${run.stderr}`);
        return run;
    }

    /**
     * Runs the CLI and parses its JSON, recording the time it took.
     *
     * @param label - Step name for the timing summary.
     * @param args - Arguments after the program name.
     * @returns Parsed stdout.
     */
    function json(label: string, args: string[]): Record<string, unknown> {
        const run = step(label, runCli(args));
        return JSON.parse(run.stdout) as Record<string, unknown>;
    }

    try {
        // ---- 1. From a topic, not from a document ---------------------------
        // The agent's input is a sentence. Everything below has to be reachable
        // from here without anyone opening a text editor.
        step('create', runCli([
            'create', file,
            '--title', 'Hermes 接入方式',
            '--name', 'agent-e2e',
            '--author', 'ci',
        ]));

        // ---- 2. Discover the root rather than assume it ---------------------
        // An agent does not know the root id in advance. This mirrors the
        // instruction the skill gives: ask, do not guess.
        const outline = step('context', runCli([
            'context', file, '--json', '--depth', '0',
        ]));
        const rootId = (JSON.parse(outline.stdout) as { id: string }[])[0].id;
        assert.ok(rootId, 'the outline must report a root id');

        // ---- 3. Build down several levels -----------------------------------
        // Four levels and enough siblings that the layout has to make choices.
        // A root with three children would pass without exercising anything.
        const branches: { name: string; leaves: string[]; tone?: string }[] = [
            { name: 'HTTP API', leaves: ['REST 端点', '鉴权', '限流'] },
            { name: 'MCP server', leaves: ['工具注册', 'stdio 传输', '权限'], tone: 'primary' },
            { name: 'Skill', leaves: ['触发条件', '检查清单', '禁止事项'], tone: 'accent' },
            { name: 'CLI', leaves: ['读写命令', '校验', '导出'], tone: 'success' },
        ];

        let nodeCount = 1;
        const styledIds: string[] = [];

        for (const branch of branches) {
            const added = json('add-child', [
                'mind', 'add-child', file,
                '--parent-id', rootId,
                '--text', branch.name,
                '--json',
            ]);
            const branchId = added.id as string;
            nodeCount += 1;

            if (branch.tone !== undefined) {
                step('set-style', runCli([
                    'node', 'set-style', file,
                    '--node-id', branchId,
                    '--tone', branch.tone,
                ]));
                styledIds.push(branchId);
            }

            for (const leaf of branch.leaves) {
                json('add-child', [
                    'mind', 'add-child', file,
                    '--parent-id', branchId,
                    '--text', leaf,
                    '--json',
                ]);
                nodeCount += 1;
            }
        }

        // One leaf gets a second level of detail, so the tree is not uniform
        // and the layout has a deep branch to place.
        const deepBranch = json('add-child', [
            'mind', 'add-child', file,
            '--parent-id', rootId,
            '--text', '部署',
            '--json',
        ]);
        nodeCount += 1;
        const deployId = deepBranch.id as string;
        for (const child of ['容器', '反向代理']) {
            const mid = json('add-child', [
                'mind', 'add-child', file,
                '--parent-id', deployId,
                '--text', child,
                '--json',
            ]);
            nodeCount += 1;
            const grandchild = json('add-child', [
                'mind', 'add-child', file,
                '--parent-id', mid.id as string,
                '--text', `${child}配置`,
                '--json',
            ]);
            nodeCount += 1;
            assert.ok(grandchild.id);
        }

        // ---- 4. Mark the important one --------------------------------------
        // Style is the only way the map says "start here". A leaf gets a line
        // style too, which reaches into the nested half of JmNodeStyle.
        const overview = json('context', ['context', file, '--json', '--depth', '2']);
        const entries = overview as { id: string; text?: string }[];
        const mcpEntry = entries.find((e) => e.text === 'MCP server');
        assert.ok(mcpEntry, 'the MCP branch should be in the outline');
        step('set-style-nested', runCli([
            'node', 'set-style', file,
            '--node-id', mcpEntry.id,
            '--font-size', '20',
            '--font-weight', 'bold',
            '--incoming.color', '#7c3aed',
            '--incoming.width', '3',
            '--incoming.pattern', 'dashed',
        ]));

        // ---- 5. Validate before believing anything --------------------------
        const validation = step('validate', runCli(['validate', file, '--json']));
        const report = JSON.parse(validation.stdout) as { valid: boolean; errors?: unknown[] };
        assert.strictEqual(report.valid, true, JSON.stringify(report.errors));

        // The node count the agent built is the count that ended up on disk.
        const finalOutline = json('context-final', ['context', file, '--json', '--depth', '10']);
        assert.strictEqual(
            (finalOutline as unknown[]).length,
            nodeCount,
            'every node the agent added should be in the file'
        );

        // ---- 6. Render it ---------------------------------------------------
        const exported = step('export', runCli([
            'export', file, png,
            '--width', '1200',
            '--height', '800',
            '--json',
        ]));
        const image = JSON.parse(exported.stdout) as {
            output: string;
            width: number;
            height: number;
            bytes: number;
            type: string;
        };

        // "Plausible image" is the only judgement CI makes here. Not "looks
        // good" - that needs eyes - but "is a real PNG of a sane size".
        assert.strictEqual(image.type, 'image/png');
        assert.ok(existsSync(png), 'the export should have written a file');
        const onDisk = statSync(png).size;
        assert.ok(onDisk > 5000, `a ${nodeCount}-node map should not be a ${onDisk}-byte image`);
        assert.strictEqual(image.bytes, onDisk, 'the reported size should match the file');
        assert.ok(image.width >= 400, `width ${image.width} is too small to hold the tree`);
        assert.ok(image.height >= 300, `height ${image.height} is too small to hold the tree`);
        // Chrome refuses a canvas past 268,435,456 px^2, so a runaway layout
        // shows up as a zero-size image rather than an exception.
        assert.ok(image.width * image.height < 268435456, 'canvas ceiling exceeded');
        assert.ok(image.width > image.height, 'this tree is wider than it is tall');

        // The colour that was set has to be in the file the export read.
        const doc = JSON.parse(readFileSync(file, 'utf8')) as {
            nodes: Record<string, { style?: Record<string, unknown> }>;
        };
        const styled = doc.nodes[mcpEntry.id];
        // `tone` was set when the branch was created; this later write merged
        // into it rather than replacing it. Both facts are the assertion.
        assert.deepStrictEqual(styled.style, {
            tone: 'primary',
            fontSize: 20,
            fontWeight: 'bold',
            incoming: { color: '#7c3aed', width: 3, pattern: 'dashed' },
        });
        assert.ok(styledIds.length > 0);

        // ---- 7. Report the cost ---------------------------------------------
        // Printed, not asserted. A wall-clock bound would make this suite fail on
        // a slow runner for reasons unrelated to correctness; the number is here
        // so a regression shows up in the log as a change, which is when someone
        // goes looking.
        const total = timings.reduce((sum, [, ms]) => sum + ms, 0);
        // The export is a browser launch, the rest are file edits. Averaging
        // them together produces a number that describes neither, so they are
        // reported apart - that is also how a regression will look: one of the
        // two moves and the other does not.
        const edits = timings.filter(([label]) => label !== 'export');
        const editTotal = edits.reduce((sum, [, ms]) => sum + ms, 0);
        const perEdit = Math.round(editTotal / edits.length);
        const addedCalls = timings.filter(([label]) => label === 'add-child').length;
        const named = timings
            .filter(([label]) => !['add-child', 'export'].includes(label))
            .map(([label, ms]) => `${label} ${ms}ms`)
            .join(', ');
        process.stdout.write(
            `\n    ${nodeCount} nodes, ${timings.length} commands\n` +
            `    edits: ${edits.length} commands, ${editTotal}ms total ` +
            `(${perEdit}ms each), of which ${addedCalls} are add-child\n` +
            `    named: ${named}\n` +
            `    export: ${exported.ms}ms (browser launch + render)\n` +
            `    everything: ${total}ms\n` +
            `    image: ${image.width}x${image.height}, ${(onDisk / 1024).toFixed(1)} KB\n`
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
