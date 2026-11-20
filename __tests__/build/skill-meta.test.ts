/**
 * @fileoverview `scripts/check-skill-meta.mjs` keeps the skill's claims checkable.
 *
 * The skill frontmatter says two things a machine can compare: the CLI version
 * it was written against, and the range of CLI versions whose behaviour it
 * describes. The range is a claim, and the check exists to fail when the tree
 * leaves it. That makes the range evaluator load-bearing: a silently wrong
 * answer there is a green build on a stale page, which is exactly the failure
 * the check was added to prevent.
 *
 * The tests below drive the script as a process against throwaway trees, one
 * claim per tree, so what is pinned is the answer a reader gets (exit status
 * and message) rather than an internal function's shape. They cover every
 * supported comparator, the x-range that used to widen silently, the syntax
 * that must be refused, and the structural frontmatter problems. The last test
 * runs the script against this repository, so the committed skill has to satisfy
 * its own check.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/check-skill-meta.mjs');

type Missing = 'frontmatter' | 'name' | 'display_name' | 'version' | 'cli';

interface Tree {
    /** The `metadata.jsmind.cli` range under test. */
    cli?: string;
    /** `package.json`'s version, the thing the range has to cover. */
    packageVersion?: string;
    /** The skill's own `version:` field. */
    skillVersion?: string;
    /** The `name:` field, to break the directory-name agreement. */
    name?: string;
    /** Leave one part of the frontmatter out entirely. */
    missing?: Missing;
}

/**
 * Builds a `SKILL.md` with the frontmatter shape the real one has.
 *
 * @param tree - Which claim to put in it.
 * @returns File contents.
 */
function skillText(tree: Tree): string {
    if (tree.missing === 'frontmatter') {
        return '# jsmind\n\nNo frontmatter here.\n';
    }
    const lines = ['---'];
    if (tree.missing !== 'name') {
        lines.push(`name: ${tree.name ?? 'jsmind'}`);
    }
    if (tree.missing !== 'display_name') {
        lines.push('display_name: jsMind mind maps');
    }
    if (tree.missing !== 'version') {
        lines.push(`version: ${tree.skillVersion ?? '2.0.1'}`);
    }
    lines.push('metadata:', '  jsmind:');
    if (tree.missing !== 'cli') {
        lines.push(`    cli: "${tree.cli ?? '>=2.0.1 <3'}"`);
    }
    lines.push('---', '', '# jsmind', '');
    return lines.join('\n');
}

/**
 * Writes one tree to a throwaway directory and hands it to the test body.
 *
 * @param tree - The claims to write.
 * @param body - Receives the tree's root.
 */
function withTree(tree: Tree, body: (root: string) => void): void {
    const root = mkdtempSync(join(tmpdir(), 'skill-meta-'));
    try {
        const skillPath = join(root, 'skills', 'jsmind', 'SKILL.md');
        mkdirSync(dirname(skillPath), { recursive: true });
        writeFileSync(skillPath, skillText(tree));
        const pkg = { version: tree.packageVersion ?? '2.0.1' };
        writeFileSync(join(root, 'package.json'), `${JSON.stringify(pkg, null, 4)}\n`);
        body(root);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

/**
 * Runs the script against a tree.
 *
 * @param root - Tree to check, or null to use the script's default root.
 * @param args - Extra arguments.
 * @returns The completed process.
 */
function run(root: string | null, ...args: string[]) {
    const argv = root === null ? [SCRIPT, ...args] : [SCRIPT, '--root', root, ...args];
    return spawnSync(process.execPath, argv, { encoding: 'utf8' });
}

/**
 * Asserts that a version is or is not covered by a range.
 *
 * @param range - Range from the frontmatter.
 * @param version - `package.json` version.
 * @param covered - Expected answer.
 */
function assertCoverage(range: string, version: string, covered: boolean): void {
    withTree({ cli: range, packageVersion: version }, root => {
        const result = run(root);
        const label = `${range} against ${version}`;
        if (covered) {
            assert.equal(result.status, 0, `${label}: ${result.stderr}`);
            assert.ok(result.stdout.includes(`covers package.json ${version}`), label);
            return;
        }
        assert.equal(result.status, 1, `${label}: ${result.stdout}`);
        assert.match(result.stderr, /does not cover package\.json version/);
    });
}

describe('check-skill-meta', () => {
    it('accepts the range the skill ships with', () => {
        withTree({}, root => {
            const result = run(root);
            assert.equal(result.status, 0, result.stderr);
            assert.match(result.stdout, /jsmind skill: version 2\.0\.1, CLI range ">=2\.0\.1 <3" covers/);
        });
    });

    it('reads a partial version as an x-range, not as "any major"', () => {
        // The bug this pins: `2.3.x` used to expand to "any 2.x", so 2.0.1
        // counted as covered and a stale page passed.
        assertCoverage('2.3.x', '2.0.1', false);
        assertCoverage('2.3.*', '2.0.1', false);
        assertCoverage('2.3', '2.0.1', false);
        assertCoverage('2.3.x', '2.3.4', true);
        assertCoverage('2.3.x', '2.4.0', false);
        assertCoverage('2.3', '2.3.0', true);
        assertCoverage('2', '2.9.9', true);
        assertCoverage('2', '3.0.0', false);
        assertCoverage('1.x', '1.0.0', true);
    });

    it('applies the comparators at their boundaries', () => {
        assertCoverage('>=2.0.1', '2.0.1', true);
        assertCoverage('>=2.0.1', '2.0.0', false);
        assertCoverage('>2.0.1', '2.0.1', false);
        assertCoverage('>2.0.1', '2.0.2', true);
        assertCoverage('<3', '2.99.99', true);
        assertCoverage('<3', '3.0.0', false);
        assertCoverage('<=2.0.1', '2.0.1', true);
        assertCoverage('<=2.0.1', '2.0.2', false);
        assertCoverage('=2.0.1', '2.0.1', true);
        assertCoverage('=2.0.1', '2.0.2', false);
        assertCoverage('2.0.1', '2.0.1', true);
        assertCoverage('2.0.1', '2.0.2', false);
    });

    it('follows semver for caret, including the 0.x rules', () => {
        assertCoverage('^2.0.1', '2.9.9', true);
        assertCoverage('^2.0.1', '3.0.0', false);
        assertCoverage('^2.0.1', '2.0.0', false);
        assertCoverage('^2', '2.0.0', true);
        assertCoverage('^0.2.3', '0.2.9', true);
        assertCoverage('^0.2.3', '0.3.0', false);
        assertCoverage('^0.0.3', '0.0.3', true);
        assertCoverage('^0.0.3', '0.0.4', false);
        assertCoverage('^0', '0.9.0', true);
        assertCoverage('^0', '1.0.0', false);
    });

    it('follows semver for tilde', () => {
        assertCoverage('~2.0.1', '2.0.9', true);
        assertCoverage('~2.0.1', '2.1.0', false);
        assertCoverage('~2.0', '2.0.0', true);
        assertCoverage('~2', '2.9.9', true);
        assertCoverage('~2', '3.0.0', false);
    });

    it('intersects space-separated comparators', () => {
        assertCoverage('>=2.0.1 <2.2', '2.1.0', true);
        assertCoverage('>=2.0.1 <2.2', '2.2.0', false);
        assertCoverage('>=2.0.1 <2.2', '2.0.0', false);
    });

    it('orders prereleases below their release without excluding them', () => {
        assertCoverage('>=2.0.1 <3', '2.0.2-rc.1', true);
        assertCoverage('>=2.0.1 <3', '2.0.1-rc.1', false);
        assertCoverage('>=2.0.1-rc.2 <3', '2.0.1-rc.1', false);
        assertCoverage('>2.0.1', '2.0.1', false);
    });

    it('refuses range syntax it cannot evaluate instead of passing it', () => {
        const unsupported = ['>=2 <3 || >=4', '1.2.3 - 2.3.4', '2.x.3', '*', '>=2.3.x', 'nonsense'];
        for (const cli of unsupported) {
            withTree({ cli }, root => {
                const result = run(root);
                assert.equal(result.status, 1, `${cli}: ${result.stdout}`);
                assert.match(result.stderr, /unsupported range syntax/);
                assert.doesNotMatch(result.stdout, /covers/);
            });
        }
    });

    it('reports a fresh clone saying the wrong thing about itself', () => {
        const cases: Array<{ tree: Tree; message: RegExp }> = [
            { tree: { missing: 'frontmatter' }, message: /no YAML frontmatter/ },
            { tree: { missing: 'display_name' }, message: /missing display_name/ },
            { tree: { missing: 'version' }, message: /missing or non-semver version/ },
            { tree: { missing: 'cli' }, message: /missing metadata\.jsmind\.cli range/ },
            { tree: { name: 'js-mind' }, message: /name is "js-mind", but the directory is jsmind/ },
            { tree: { skillVersion: '2.0' }, message: /missing or non-semver version: "2\.0"/ },
        ];
        for (const { tree, message } of cases) {
            withTree(tree, root => {
                const result = run(root);
                assert.equal(result.status, 1, `${JSON.stringify(tree)}: ${result.stdout}`);
                assert.match(result.stderr, message);
            });
        }
    });

    it('names a package version it cannot read as a version', () => {
        withTree({ packageVersion: 'not-a-version' }, root => {
            const result = run(root);
            assert.equal(result.status, 1);
            assert.match(result.stderr, /package\.json version is not a semantic version: not-a-version/);
        });
    });

    it('reports a tree it cannot read instead of throwing', () => {
        const root = mkdtempSync(join(tmpdir(), 'skill-meta-empty-'));
        try {
            const result = run(root);
            assert.equal(result.status, 1);
            assert.match(result.stderr, /skills\/jsmind\/SKILL\.md: cannot read: ENOENT/);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('rejects arguments it does not understand', () => {
        withTree({}, root => {
            const unknown = run(root, '--fix');
            assert.equal(unknown.status, 2);
            assert.match(unknown.stderr, /unknown argument: --fix/);
            assert.match(unknown.stderr, /usage: node scripts\/check-skill-meta\.mjs/);

            const dangling = run(root, '--root');
            assert.equal(dangling.status, 2);
            assert.match(dangling.stderr, /--root needs a directory/);
        });
    });

    it('this repository satisfies its own frontmatter claim', () => {
        const result = run(null);
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /covers package\.json/);
    });
});
