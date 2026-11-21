/**
 * @fileoverview `scripts/check-commit-type.mjs`: a type is a claim about the
 * shipped artifact, and CI compares it with the diff.
 *
 * The two failures worth a red run are `feat` (or `fix`, `refactor`) on a
 * change that cannot reach `dist/`, and `docs` on a page a user of the
 * artifact never reads. Everything else here exists to keep that gate usable:
 * the catch-all has to stay usable for mixed changes, a prefix this check is
 * not about must not turn a pull request red, and a table the script cannot
 * read has to fail instead of passing every title.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/check-commit-type.mjs');

function run(args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
    const result = spawnSync(process.execPath, [SCRIPT, ...args], {
        cwd: options.cwd ?? ROOT,
        encoding: 'utf8',
        // In Actions the title arrives in PR_TITLE. Clearing it means a
        // developer's shell cannot decide what these assertions see.
        env: { ...process.env, PR_TITLE: '', ...options.env },
    });
    return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

describe('a type has to match the diff', () => {
    it('rejects `feat` when nothing under src/ changed', () => {
        const result = run([
            '--title', 'feat(weka): something',
            '--files', 'team/automations/weka/SOUL.cody.md', 'AGENTS.md',
        ]);
        assert.equal(result.status, 1, result.output);
        assert.match(result.output, /`feat` names a change to the shipped artifact/);
        assert.match(result.output, /`src\/\*\*`/);
        assert.match(result.output, /team\/development\/commit-types\.md/);
        assert.match(result.output, /AGENTS\.md/);
    });

    it('rejects `fix` and `refactor` for the same reason', () => {
        for (const type of ['fix', 'refactor']) {
            const result = run([
                '--title', `${type}(weka): tidy the flow`,
                '--files', 'team/automations/weka/README.md',
            ]);
            assert.equal(result.status, 1, `${type}: ${result.output}`);
            assert.match(result.output, new RegExp(`\`${type}\` names a change to the shipped artifact`));
        }
    });

    it('accepts a production type when src/ changed, docs and tests riding along', () => {
        const result = run([
            '--title', 'feat(cli): report unknown options',
            '--files', 'src/cli/index.ts', 'docs/zh/guide/cli.md', '__tests__/cli/x.test.ts',
        ]);
        assert.equal(result.status, 0, result.output);
    });

    it('rejects `docs` when the change is a requirement or a team convention', () => {
        const result = run(['--title', 'docs(api): state the side rule', '--files', 'docs/requirements/v2-cli.md']);
        assert.equal(result.status, 1, result.output);
        assert.match(result.output, /`docs` names documentation a user of the artifact reads/);
        assert.match(result.output, /docs\/zh\/guide/);
        assert.match(result.output, /they are `team`/);
    });

    it('accepts `docs` for a page a user of the artifact reads', () => {
        for (const file of ['docs/zh/guide/cli.md', 'docs/en/reference/api/export.md']) {
            const result = run(['--title', 'docs(api): state the side rule', '--files', file]);
            assert.equal(result.status, 0, `${file}: ${result.output}`);
        }
    });

    it('leaves every other type alone', () => {
        // The catch-all has to work: a change that spans several kinds has no
        // path of its own, so a path requirement on `team` would leave it
        // with no legal type at all.
        const result = run([
            '--title', 'team(conventions): point at one table',
            '--files', 'AGENTS.md', 'scripts/x.mjs', '.github/workflows/ci.yml',
        ]);
        assert.equal(result.status, 0, result.output);
    });

    it('warns about a type that is not in the table instead of failing', () => {
        // Dependabot writes `build(deps-dev)`. A red pull request for a prefix
        // this check is not about is how a gate gets switched off.
        const result = run(['--title', 'build(deps-dev): bump js-yaml', '--files', 'package-lock.json']);
        assert.equal(result.status, 0, result.output);
        assert.match(result.output, /`build` is not one of the commit types/);
        assert.match(result.output, /commit-types\.md/);
    });

    it('refuses a title with no type at all', () => {
        // The enforcement cannot read a claim that was never made, so an
        // unparseable title is a failure rather than a free pass.
        const result = run(['--title', 'Update the thing', '--files', 'src/cli/index.ts']);
        assert.equal(result.status, 1, result.output);
        assert.match(result.output, /has no type/);
    });

    it('reads the type out of a scope and a breaking marker', () => {
        const result = run(['--title', 'feat(cli)!: drop add-node', '--files', 'src/cli/index.ts']);
        assert.equal(result.status, 0, result.output);
        assert.match(result.output, /`feat` is consistent/);
    });
});

describe('the table is the source, and an unreadable table fails', () => {
    it('fails loudly when a checked row is missing', () => {
        const dir = mkdtempSync(join(tmpdir(), 'jsmind-types-'));
        try {
            const table = join(dir, 'table.md');
            writeFileSync(table, [
                '| type | meaning | paths |',
                '|---|---|---|',
                '| `feat` | new behaviour | `src/**` |',
                '| `fix` | corrected behaviour | `src/**` |',
                '| `refactor` | internals | `src/**` |',
                '',
            ].join('\n'));

            const result = run(['--title', 'docs(api): x', '--files', 'docs/zh/guide/a.md', '--table', table]);
            assert.equal(result.status, 1, result.output);
            assert.match(result.output, /no path row for: docs/);
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('fails when the table cannot be read at all', () => {
        const dir = mkdtempSync(join(tmpdir(), 'jsmind-types-'));
        try {
            const missing = join(dir, 'not-written.md');
            const result = run(['--title', 'docs(api): x', '--files', 'docs/zh/guide/a.md', '--table', missing]);
            assert.equal(result.status, 1, result.output);
            assert.match(result.output, /cannot read the type table/);
            assert.match(result.output, /not-written\.md/);
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('takes the path shapes from the table, not from the script', () => {
        // Every path form the table can hold: a tree, a single star inside a
        // segment, and one exact file. Narrowing or widening a row is meant to
        // be one edit in the document, so the matching has to follow it.
        const dir = mkdtempSync(join(tmpdir(), 'jsmind-types-'));
        try {
            const table = join(dir, 'table.md');
            writeFileSync(table, [
                '| type | meaning | paths |',
                '|---|---|---|',
                '| `feat` | new behaviour | `src/*.ts` |',
                '| `fix` | corrected behaviour | `src/**` |',
                '| `refactor` | internals | `src/**` |',
                '| `docs` | user docs | `docs/README.md` |',
                '',
            ].join('\n'));

            const star = run(['--title', 'feat(api): x', '--files', 'src/entry.ts', '--table', table]);
            assert.equal(star.status, 0, star.output);

            const exact = run(['--title', 'docs(api): x', '--files', 'docs/README.md', '--table', table]);
            assert.equal(exact.status, 0, exact.output);

            const exactMiss = run(['--title', 'docs(api): x', '--files', 'docs/zh/guide/a.md', '--table', table]);
            assert.equal(exactMiss.status, 1, exactMiss.output);
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe('the diff CI passes in', () => {
    it('reads the files from --base/--head when --files is not given', () => {
        const repo = mkdtempSync(join(tmpdir(), 'jsmind-diff-'));
        try {
            const env = { ...process.env };
            for (const key of Object.keys(env)) {
                if (key.startsWith('GIT_')) {
                    delete env[key];
                }
            }
            const git = (...args: string[]) =>
                execFileSync(
                    'git',
                    ['-c', 'user.name=sandbox', '-c', 'user.email=sandbox@example.com', ...args],
                    { cwd: repo, env, encoding: 'utf8' },
                );

            git('init', '-q', '-b', 'master');
            writeFileSync(join(repo, 'AGENTS.md'), 'the base\n');
            git('add', 'AGENTS.md');
            git('commit', '-q', '-m', 'team: initial');
            const base = git('rev-parse', 'HEAD').trim();

            writeFileSync(join(repo, 'team-notes.md'), 'the change\n');
            git('add', 'team-notes.md');
            git('commit', '-q', '-m', 'fix(weka): something');
            const head = git('rev-parse', 'HEAD').trim();

            const rejected = run(['--title', 'fix(weka): something', '--base', base, '--head', head], { cwd: repo });
            assert.equal(rejected.status, 1, rejected.output);
            assert.match(rejected.output, /`fix` names a change to the shipped artifact/);
            assert.match(rejected.output, /team-notes\.md/);

            const accepted = run(['--title', 'team(conventions): something', '--base', base, '--head', head], { cwd: repo });
            assert.equal(accepted.status, 0, accepted.output);

            // A base that is not in the repository: passing here would mean
            // "the diff could not be read, so the type is fine".
            const unreadable = run(['--title', 'feat(cli): x', '--base', '0'.repeat(40), '--head', head], { cwd: repo });
            assert.equal(unreadable.status, 1, unreadable.output);
            assert.match(unreadable.output, /could not diff/);

            // git exports GIT_DIR to hooks. An inherited one would point the
            // diff at another repository, so the check has to drop it.
            const inherited = run(
                ['--title', 'fix(weka): something', '--base', base, '--head', head],
                { cwd: repo, env: { GIT_DIR: '/nonexistent/.git' } },
            );
            assert.equal(inherited.status, 1, inherited.output);
            assert.match(inherited.output, /`fix` names a change to the shipped artifact/);
        }
        finally {
            rmSync(repo, { recursive: true, force: true });
        }
    });
});

describe('bad usage', () => {
    it('asks for a title', () => {
        const result = run(['--files', 'src/x.ts']);
        assert.equal(result.status, 2, result.output);
        assert.match(result.output, /no pull request title/);
    });

    it('asks for the files or the diff', () => {
        const result = run(['--title', 'feat(cli): x']);
        assert.equal(result.status, 2, result.output);
        assert.match(result.output, /pass --files, or --base and --head/);
    });

    it('refuses an unknown argument', () => {
        const result = run(['--titel', 'feat(cli): x']);
        assert.equal(result.status, 2, result.output);
        assert.match(result.output, /unknown argument/);
    });
});
