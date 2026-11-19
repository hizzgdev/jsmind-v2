/**
 * @fileoverview The jsmind agent skill ships twice — `skills/jsmind/SKILL.md`
 * for the agent, `skills/jsmind/SKILL.zh.md` for a human reader — and the two
 * are a 1:1 translation of the same rules. Nothing kept them in step, so a rule
 * could be corrected in one file and left wrong in the other, which is how the
 * English copy ended up telling an agent to change the side of a node that has
 * none.
 *
 * `scripts/check-skill-parity.mjs` turns "keep both copies in step" into a
 * checked invariant. The tests below pin down what it treats as drift on a
 * throwaway pair of files — a heading that only one side gained, a code block
 * that grew on one side, a flag that was edited in one copy — and pin down the
 * noise it must ignore: example ids and example labels legitimately differ,
 * because each file records its own run. The suite finishes by running the
 * check against this repository.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/check-skill-parity.mjs');
const FENCE = '```';

const BODY = [
    '# skill',
    '',
    '## bans',
    '',
    '### 1. context before any edit',
    '',
    'Run it first.',
    '',
    '```',
    '$ jsmind context map.json --depth 2',
    'root   Title {side=center}',
    '```',
    '',
    '### 2. validate after the round',
    '',
    '```',
    '$ jsmind validate map.json',
    'map.json: valid',
    '```',
    '',
].join('\n');

const BODY_ZH = [
    '# 技能',
    '',
    '## 禁令',
    '',
    '### 1. 改动前 context',
    '',
    '先跑它。',
    '',
    '```',
    '$ jsmind context map.json --depth 2',
    'root   标题 {side=center}',
    '```',
    '',
    '### 2. 改动后 validate',
    '',
    '```',
    '$ jsmind validate map.json',
    'map.json: valid',
    '```',
    '',
].join('\n');

function run(...args: string[]) {
    return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
}

function withPair(english: string, chinese: string, body: (dir: string) => void) {
    const dir = mkdtempSync(join(tmpdir(), 'skill-parity-'));
    try {
        writeFileSync(join(dir, 'SKILL.md'), english);
        writeFileSync(join(dir, 'SKILL.zh.md'), chinese);
        body(dir);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

describe('check-skill-parity', () => {
    it('accepts a translated pair that differs only in wording and example ids', () => {
        withPair(BODY, BODY_ZH, (dir) => {
            const result = run('--dir', dir);
            assert.equal(result.status, 0, result.stderr);
        });
    });

    it('ignores example ids and quoted labels, compares the command around them', () => {
        const english = BODY.replace('$ jsmind context map.json', '$ jsmind mind add-child map.json --parent-id jm-aaa111 --text "Model"');
        const chinese = BODY_ZH.replace('$ jsmind context map.json', '$ jsmind mind add-child map.json --parent-id jm-bbb222 --text "模型"');
        withPair(english, chinese, (dir) => {
            assert.equal(run('--dir', dir).status, 0);
        });
    });

    it('fails when one copy gains a heading the other does not have', () => {
        const english = [BODY, '### 3. export and look', '', FENCE, '$ jsmind export map.json out.png', FENCE, ''].join('\n');
        withPair(english, BODY_ZH, (dir) => {
            const result = run('--dir', dir);
            assert.equal(result.status, 1);
            assert.match(result.stderr, /headings differ/);
        });
    });

    it('fails when a code block grows on one side only', () => {
        const chinese = BODY_ZH.replace('map.json: valid\n', 'map.json: valid\nextra line\n');
        withPair(BODY, chinese, (dir) => {
            const result = run('--dir', dir);
            assert.equal(result.status, 1);
            assert.match(result.stderr, /code blocks differ/);
        });
    });

    it('fails when a flag is edited in one copy and not the other', () => {
        const chinese = BODY_ZH.replace('$ jsmind validate map.json', '$ jsmind validate map.json --json');
        withPair(BODY, chinese, (dir) => {
            const result = run('--dir', dir);
            assert.equal(result.status, 1);
            assert.match(result.stderr, /commands differ/);
            assert.match(result.stderr, /--json/);
        });
    });

    it('fails on an unclosed code fence instead of counting it', () => {
        withPair([BODY, FENCE, ''].join('\n'), BODY_ZH, (dir) => {
            const result = run('--dir', dir);
            assert.equal(result.status, 1);
            assert.match(result.stderr, /unclosed code fence/);
        });
    });

    it('rejects unknown arguments and a missing pair', () => {
        assert.equal(run('--fix').status, 2);
        assert.equal(run('--dir').status, 2);
        const empty = mkdtempSync(join(tmpdir(), 'skill-parity-empty-'));
        try {
            assert.equal(run('--dir', empty).status, 2);
        }
        finally {
            rmSync(empty, { recursive: true, force: true });
        }
    });

    it('this repository ships the two skill copies in step', () => {
        const result = run();
        assert.equal(result.status, 0, result.stderr);
    });
});
