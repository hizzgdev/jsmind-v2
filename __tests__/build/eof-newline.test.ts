/**
 * @fileoverview `scripts/check-eof-newline.mjs` turns "every text file ends
 * with a newline" from a habit into a checked invariant.
 *
 * The script is the half of the rule ESLint cannot reach: `@stylistic/eol-last`
 * covers the types a language plugin can parse (TypeScript, JS, JSON, CSS),
 * while Markdown, Python, shell, YAML, HTML and extension-less config files
 * have none. The tests below pin down which files the script treats as text
 * on a throwaway repository, and finish by running it against this repository:
 * a file committed without a final newline fails the suite instead of waiting
 * for someone to notice the "\ No newline at end of file" marker in review.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/check-eof-newline.mjs');

function run(cwd: string, ...args: string[]) {
    return spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });
}

function makeRepository(files: Record<string, Buffer | string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'eof-newline-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    const names = Object.keys(files);
    for (const name of names) {
        writeFileSync(join(dir, name), files[name]);
    }
    if (names.length > 0) {
        execFileSync('git', ['add', '--', ...names], { cwd: dir });
    }
    return dir;
}

function withRepository(files: Record<string, Buffer | string>, body: (dir: string) => void) {
    const dir = makeRepository(files);
    try {
        body(dir);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

describe('check-eof-newline', () => {
    it('fails on a tracked text file without a final newline', () => {
        withRepository({
            'notes.md': 'hello',
            'fine.md': 'hello\n',
            'empty.txt': '',
            'logo.bin': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]),
        }, (dir) => {
            const result = run(dir);
            assert.equal(result.status, 1);
            assert.match(result.stderr, /notes\.md/);
            // Terminated, empty and binary files are not violations.
            assert.doesNotMatch(result.stderr, /fine\.md|empty\.txt|logo\.bin/);
        });
    });

    it('fixes the newline in place with --fix', () => {
        withRepository({'nginx.conf': 'server { listen 80; }'}, (dir) => {
            assert.equal(run(dir, '--fix').status, 0);
            assert.equal(readFileSync(join(dir, 'nginx.conf'), 'utf8'), 'server { listen 80; }\n');
            assert.equal(run(dir).status, 0);
        });
    });

    it('ignores untracked files', () => {
        withRepository({'tracked.md': 'hi\n'}, (dir) => {
            writeFileSync(join(dir, 'draft.local.md'), 'still writing');
            assert.equal(run(dir).status, 0);
        });
    });

    it('rejects unknown arguments', () => {
        withRepository({}, (dir) => {
            const result = run(dir, '--check');
            assert.equal(result.status, 2);
            assert.match(result.stderr, /unknown argument/);
        });
    });

    it('this repository ends every tracked text file with a newline', () => {
        const result = run(ROOT);
        assert.equal(result.status, 0, result.stderr);
    });
});
