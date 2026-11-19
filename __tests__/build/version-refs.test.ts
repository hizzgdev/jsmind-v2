/**
 * @fileoverview `scripts/check-version-refs.mjs` keeps the version out of prose.
 *
 * `package.json` is the only source of the version: the docs read it at build
 * time, the README reads npm, the release scripts read it back. A literal
 * `2.0.x` in a page is a second source, and it goes stale on the next release -
 * which is how a tag ends up pointing at a tree whose documentation describes
 * the previous one.
 *
 * The tests below pin down which trees the script watches on a throwaway
 * repository, and finish by running it against this repository, so a literal
 * committed into `docs/`, `skills/`, `src/` or a top-level README fails the
 * suite instead of waiting for review to notice.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/check-version-refs.mjs');

/**
 * git exports GIT_DIR and friends to pre-push hooks. Inheriting them makes a
 * nested `git` command read and write *this* repository's index while its cwd
 * points at a fixture repo, so every git call below runs with a clean
 * environment and resolves its repository from the filesystem instead.
 */
function cleanEnvironment(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
        if (key.startsWith('GIT_')) {
            delete env[key];
        }
    }
    return env;
}

function run(cwd: string, ...args: string[]) {
    return spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8', env: cleanEnvironment() });
}

function makeRepository(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'version-refs-'));
    execFileSync('git', ['init', '-q'], { cwd: dir, env: cleanEnvironment() });
    const names = Object.keys(files);
    for (const name of names) {
        const path = join(dir, name);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, files[name]);
    }
    if (names.length > 0) {
        execFileSync('git', ['add', '--', ...names], { cwd: dir, env: cleanEnvironment() });
    }
    return dir;
}

function withRepository(files: Record<string, string>, body: (dir: string) => void) {
    const dir = makeRepository(files);
    try {
        body(dir);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

describe('check-version-refs', () => {
    it('reports a hard-coded version as file:line: content', () => {
        withRepository({
            'docs/zh/guide/index.md': '# 指南\n\n当前的 2.0.1 预览版已经包括：\n',
        }, (dir) => {
            const result = run(dir);
            assert.equal(result.status, 1);
            assert.match(result.stderr, /docs\/zh\/guide\/index\.md:3: 当前的 2\.0\.1 预览版已经包括：/);
        });
    });

    it('watches the trees a reader meets the version in', () => {
        withRepository({
            'README.md': 'Install with the 2.0.1 preview.\n',
            'README.zh.md': '安装 2.0.1 预览版。\n',
            'skills/jsmind/SKILL.md': 'This skill matches 2.0.1.\n',
            'src/cli/shared.ts': 'const banner = "jsmind 2.0.1";\n',
            'example/probe.json': '{"version": "2.0.1"}\n',
        }, (dir) => {
            const result = run(dir);
            assert.equal(result.status, 1);
            assert.match(result.stderr, /README\.md:1:/);
            assert.match(result.stderr, /README\.zh\.md:1:/);
            assert.match(result.stderr, /skills\/jsmind\/SKILL\.md:1:/);
            assert.match(result.stderr, /src\/cli\/shared\.ts:1:/);
            // example/ is not a place the version is documented.
            assert.doesNotMatch(result.stderr, /example\/probe\.json/);
        });
    });

    it('leaves the version, the fixtures and the decision records alone', () => {
        withRepository({
            'package.json': '{\n    "version": "2.0.1"\n}\n',
            'package-lock.json': '{"version": "2.0.1"}\n',
            '__tests__/sample/map.json': '{"meta": {"version": "2.0.1"}}\n',
            'team/development/npm-release.md': '已发布 2.0.1 之后。\n',
        }, (dir) => {
            const result = run(dir);
            assert.equal(result.status, 0, result.stderr);
        });
    });

    it('accepts the spellings that cannot go stale', () => {
        withRepository({
            'docs/en/guide/index.md': 'The current 2.x preview, npm tag `v2-preview`, `npm i jsmind@2`, Node 22.12.0, 12.0.1, 2.0.\n',
            'README.md': '[![npm v2-preview](https://img.shields.io/npm/v/jsmind/v2-preview)](https://www.npmjs.com/package/jsmind?activeTab=versions)\n',
            'docs/en/index.md': '<script setup>\nimport pkg from \'../../package.json\'\n</script>\n\nv{{ pkg.version }}\n',
        }, (dir) => {
            const result = run(dir);
            assert.equal(result.status, 0, result.stderr);
        });
    });

    it('ignores untracked files', () => {
        withRepository({'docs/index.md': '# docs\n'}, (dir) => {
            writeFileSync(join(dir, 'docs/draft.local.md'), 'thoughts about 2.0.1\n');
            assert.equal(run(dir).status, 0);
        });
    });

    it('rejects unknown arguments', () => {
        withRepository({}, (dir) => {
            const result = run(dir, '--fix');
            assert.equal(result.status, 2);
            assert.match(result.stderr, /unknown argument/);
        });
    });

    it('this repository has no hard-coded 2.x version reference', () => {
        const result = run(ROOT);
        assert.equal(result.status, 0, result.stderr);
    });
});
