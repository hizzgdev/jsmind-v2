/**
 * @fileoverview The decisions behind `npm run release:prepare` and
 * `npm run release:publish`, tested without a repository, a network or gh.
 *
 * `scripts/release/checks.mjs` holds every preflight rule as a pure function:
 * given the facts (branch, sha, tag list, CI run list), it returns either
 * `null` or the sentence that stops the release. The scripts around it only
 * gather those facts, so the rules themselves are testable here - and the one
 * rule the whole flow exists for is that a tag is only cut on merged master.
 *
 * `scripts/release/notes.mjs` is tested the same way: the release notes are
 * `git log` grouped by prefix under a fixed template, not composed by hand.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** The scripts are plain .mjs; a dynamic specifier keeps tsc out of it. */
async function load(name: string) {
    return import(pathToFileURL(join(ROOT, 'scripts/release', name)).href);
}

const checks = await load('checks.mjs');
const notes = await load('notes.mjs');
const lib = await load('lib.mjs');

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const THIRD_SHA = 'c'.repeat(40);

describe('version arithmetic', () => {
    it('bumps a patch without touching minor or major', () => {
        assert.equal(checks.bumpVersion('2.0.1', 'patch'), '2.0.2');
        assert.equal(checks.bumpVersion('2.9.9', 'patch'), '2.9.10');
    });

    it('bumps a minor and resets the patch', () => {
        assert.equal(checks.bumpVersion('2.0.9', 'minor'), '2.1.0');
    });

    it('refuses a kind that is not patch or minor', () => {
        assert.throws(() => checks.bumpVersion('2.0.1', 'major'), /unknown release kind/);
    });

    it('names the tag the way the released ones are named', () => {
        assert.equal(checks.tagName('2.0.2'), 'v2.0.2');
    });

    it('reads the release kind from the version it follows', () => {
        assert.equal(checks.releaseKind('2.0.2', '2.0.1'), 'patch');
        assert.equal(checks.releaseKind('2.1.0', '2.0.9'), 'minor');
        assert.equal(checks.releaseKind('2.0.2', ''), 'patch');
    });
});

describe('preflight checks', () => {
    it('accepts a clean tree and names the files that make it dirty', () => {
        assert.equal(checks.checkCleanWorktree(''), null);
        assert.equal(checks.checkCleanWorktree('   \n'), null);
        assert.match(checks.checkCleanWorktree(' M docs/en/index.md\n'), /docs\/en\/index\.md/);
    });

    it('only releases from master', () => {
        assert.equal(checks.checkOnMaster('master'), null);
        assert.match(checks.checkOnMaster('feat/view'), /feat\/view/);
    });

    it('stops when master and origin/master are different commits', () => {
        assert.equal(checks.checkSyncedWithOrigin(SHA, SHA), null);
        assert.match(checks.checkSyncedWithOrigin(SHA, OTHER_SHA), /not in sync/);
    });

    it('requires the CI run for exactly the commit being released', () => {
        const green = [{ headSha: OTHER_SHA, status: 'completed', conclusion: 'success' }];
        assert.match(checks.checkCiSuccess(green, SHA), /no CI run found/);

        const matching = [{ headSha: SHA, status: 'completed', conclusion: 'success' }];
        assert.equal(checks.checkCiSuccess(matching, SHA), null);

        const running = [{ headSha: SHA, status: 'in_progress', conclusion: null }];
        assert.match(checks.checkCiSuccess(running, SHA), /in_progress/);

        const red = [{ headSha: SHA, status: 'completed', conclusion: 'failure' }];
        assert.match(checks.checkCiSuccess(red, SHA), /concluded failure/);

        const both = [
            { headSha: OTHER_SHA, status: 'completed', conclusion: 'success' },
            { headSha: SHA, status: 'completed', conclusion: 'success' },
        ];
        assert.equal(checks.checkCiSuccess(both, SHA), null);
        assert.match(checks.checkCiSuccess(both, THIRD_SHA), /no CI run found/);
    });

    it('never reuses a tag, locally or on origin', () => {
        assert.equal(checks.checkTagAbsent('v2.0.2', { localTags: [], remoteTags: [] }), null);
        // Local-only is the leftover of a run that tagged and then failed to
        // push: the message has to say how to recover, not that it shipped.
        const localOnly = checks.checkTagAbsent('v2.0.2', { localTags: ['v2.0.2'], remoteTags: [] });
        assert.match(localOnly, /already exists locally/);
        assert.match(localOnly, /nothing was released/);
        assert.match(localOnly, /git tag -d v2\.0\.2/);
        assert.match(
            checks.checkTagAbsent('v2.0.2', { localTags: [], remoteTags: ['v2.0.2'] }),
            /already exists on origin/,
        );
        // A tag on origin is released whatever the local repository thinks.
        assert.match(
            checks.checkTagAbsent('v2.0.2', { localTags: ['v2.0.2'], remoteTags: ['v2.0.2'] }),
            /already exists on origin/,
        );
    });

    it('refuses to tag a version that origin/master does not ship', () => {
        assert.equal(checks.checkVersionReleased('2.0.2', '2.0.2'), null);
        assert.match(checks.checkVersionReleased('2.0.2', '2.0.1'), /has to be merged/);
    });

    it('does not list the release commit itself as a change', () => {
        assert.equal(checks.isReleaseCommit('chore(release): 2.0.2'), true);
        assert.equal(checks.isReleaseCommit('chore: tidy the release scripts'), false);
        assert.equal(checks.isReleaseCommit('feat(view): mention chore(release) in a message'), false);
    });
});

describe('release notes', () => {
    const log = [
        'aaa1111 feat(playground): highlight the code editor (#110)',
        'bbb2222 fix(arranger): correct cousin spacing',
        'ccc3333 docs: point the install command at @2',
        'ddd4444 chore(release): 2.0.2',
        'eee5555 merge something without a prefix',
        '',
    ].join('\n');

    it('drops the sha and keeps the subject verbatim', () => {
        const entries = notes.parseLog(log);
        assert.equal(entries.length, 5);
        assert.deepEqual(entries[0], { sha: 'aaa1111', subject: 'feat(playground): highlight the code editor (#110)' });
    });

    it('groups by prefix in a fixed order and skips empty groups', () => {
        const entries = notes.parseLog(log)
            .filter(({ subject }: { subject: string }) => !checks.isReleaseCommit(subject));
        const groups = notes.groupCommits(entries);
        assert.deepEqual(groups.map((group: { title: string }) => group.title), ['Features', 'Fixes', 'Docs', 'Other']);
        assert.deepEqual(groups[0].entries, ['feat(playground): highlight the code editor (#110)']);

        const onlyFixes = notes.groupCommits(notes.parseLog('aaa1111 fix: one thing\n'));
        assert.deepEqual(onlyFixes.map((group: { title: string }) => group.title), ['Fixes']);
    });

    it('renders the fixed template, with the install line and the diff link', () => {
        const text = notes.renderNotes({
            version: '2.0.2',
            kind: 'patch',
            previousTag: 'v2.0.1',
            entries: notes.parseLog(log),
            repositoryUrl: 'https://github.com/hizzgdev/jsmind-v2',
            nodeRange: '>=22.12.0',
        });
        assert.match(text, /^# jsMind 2\.0\.2\n/);
        assert.match(text, /Patch release on the 2\.x preview line \(npm tag `v2-preview`\)/);
        assert.match(text, /## Install\n\n```bash\nnpm i jsmind@2\n```/);
        assert.match(text, /`npm i jsmind` still installs v1 \(0\.9\.x\)/);
        assert.match(text, /### Features\n\n- feat\(playground\): highlight the code editor \(#110\)/);
        assert.match(text, /- Diff: https:\/\/github\.com\/hizzgdev\/jsmind-v2\/compare\/v2\.0\.1\.\.\.v2\.0\.2/);
        assert.match(text, /## Node version\n\nNode\.js `>=22\.12\.0` is required/);
        // The release commit is a chore and must not be presented as a change.
        assert.doesNotMatch(text, /chore\(release\)/);
    });

    it('says so when there is nothing to list', () => {
        const text = notes.renderNotes({
            version: '2.0.2',
            kind: 'patch',
            previousTag: '',
            entries: [],
            repositoryUrl: 'https://github.com/hizzgdev/jsmind-v2',
            nodeRange: '>=22.12.0',
        });
        assert.match(text, /No user-visible changes\./);
        assert.doesNotMatch(text, /## Links\n\n- Diff:/);
    });

    it('changes the intro for a minor release', () => {
        const text = notes.renderNotes({
            version: '2.1.0',
            kind: 'minor',
            previousTag: 'v2.0.9',
            entries: [],
            repositoryUrl: 'https://github.com/hizzgdev/jsmind-v2',
            nodeRange: '>=22.12.0',
        });
        assert.match(text, /Minor release on the 2\.x preview line/);
    });
});

describe('the notes file the release page is built from', () => {
    it('lives at releases/<version>.md', () => {
        assert.equal(checks.notesPathFor('2.1.0'), 'releases/2.1.0.md');
    });

    it('prepare refuses to overwrite notes that may already be curated', () => {
        assert.equal(checks.checkNotesAbsent('releases/2.0.2.md', false), null);
        const problem = checks.checkNotesAbsent('releases/2.0.2.md', true);
        assert.match(problem, /releases\/2\.0\.2\.md already exists/);
        assert.match(problem, /Delete the file to start over/);
    });

    const good = {
        path: 'releases/2.0.2.md',
        exists: true,
        tracked: true,
        content: '# jsMind 2.0.2\n\nPatch release.\n',
        version: '2.0.2',
    };

    it('publish accepts the file the release PR carried', () => {
        assert.equal(checks.checkNotesForPublish(good), null);
        // A leading blank line is not a version mismatch.
        assert.equal(checks.checkNotesForPublish({ ...good, content: '\n  \n# jsMind 2.0.2\n' }), null);
    });

    it('publish refuses a missing file instead of regenerating one', () => {
        const problem = checks.checkNotesForPublish({ ...good, exists: false, content: '' });
        assert.match(problem, /no release notes at releases\/2\.0\.2\.md/);
        assert.match(problem, /not by a regeneration at publish time/);
    });

    it('publish refuses a file the tag would not name', () => {
        const problem = checks.checkNotesForPublish({ ...good, tracked: false });
        assert.match(problem, /is not committed/);
    });

    it('publish refuses notes headed for another version', () => {
        const problem = checks.checkNotesForPublish({ ...good, content: '# jsMind 2.0.1\n' });
        assert.match(problem, /starts with "# jsMind 2\.0\.1"/);
        assert.match(problem, /not "# jsMind 2\.0\.2"/);
    });
});

/**
 * `release:prepare` checks the whole world before it writes: a clean tree, on
 * master, master in sync with origin, green CI from gh, an unused tag. A
 * throwaway repository with a bare origin and a stub `gh` satisfies all five
 * without the network, so the failure paths can be run for real instead of
 * being asserted as strings in the source.
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

const PASSING_CHECKS = {
    'format-check': 'node -e "process.exit(0)"',
    'pack:check': 'node -e "process.exit(0)"',
};

function sandboxRepository(scripts: Record<string, string>) {
    const root = mkdtempSync(join(tmpdir(), 'jsmind-release-'));
    const work = join(root, 'work');
    const origin = join(root, 'origin.git');
    const bin = join(root, 'bin');
    mkdirSync(work);
    mkdirSync(bin);
    const env = cleanEnvironment();
    const git = (...args: string[]): string =>
        execFileSync(
            'git',
            ['-c', 'user.name=sandbox', '-c', 'user.email=sandbox@example.com', ...args],
            { cwd: work, env, encoding: 'utf8' },
        );

    execFileSync('git', ['init', '-q', '--bare', origin], { env });
    git('init', '-q', '-b', 'master');
    // Repository-local identity: the script runs git commands of its own, and
    // without this the commit fails on a machine with no global identity before
    // the failure this test is about is even reached.
    git('config', 'user.name', 'sandbox');
    git('config', 'user.email', 'sandbox@example.com');
    writeFileSync(
        join(work, 'package.json'),
        `${JSON.stringify({ name: 'sandbox', version: '2.0.1', private: true, scripts }, null, 4)}\n`,
    );
    writeFileSync(
        join(work, 'package-lock.json'),
        `${JSON.stringify({
            name: 'sandbox',
            version: '2.0.1',
            lockfileVersion: 3,
            requires: true,
            packages: { '': { name: 'sandbox', version: '2.0.1' } },
        }, null, 4)}\n`,
    );
    git('add', 'package.json', 'package-lock.json');
    git('commit', '-q', '-m', 'chore: initial');
    git('remote', 'add', 'origin', origin);
    git('push', '-q', '-u', 'origin', 'master');

    // The CI and repository facts, answered from the sandbox instead of GitHub.
    writeFileSync(
        join(bin, 'gh'),
        [
            '#!/bin/sh',
            'case "$1" in',
            '  run) printf \'[{"headSha":"%s","status":"completed","conclusion":"success"}]\\n\' "$(git rev-parse HEAD)" ;;',
            '  repo) echo sandbox/example ;;',
            '  *) echo "unexpected gh $*" >&2; exit 1 ;;',
            'esac',
            '',
        ].join('\n'),
    );
    chmodSync(join(bin, 'gh'), 0o755);

    return { root, work, bin, env, git };
}

/** Run `release:prepare patch` in the sandbox until it fails. */
function failedPrepare(options: { scripts?: Record<string, string>; rejectCommit?: boolean } = {}) {
    const sandbox = sandboxRepository(options.scripts ?? PASSING_CHECKS);
    if (options.rejectCommit) {
        const hook = join(sandbox.work, '.git/hooks/pre-commit');
        writeFileSync(hook, '#!/bin/sh\nexit 1\n');
        chmodSync(hook, 0o755);
    }
    const result = spawnSync(process.execPath, [join(ROOT, 'scripts/release/prepare.mjs'), 'patch'], {
        cwd: sandbox.work,
        encoding: 'utf8',
        env: { ...sandbox.env, PATH: `${sandbox.bin}:${process.env.PATH ?? ''}` },
    });
    return { ...sandbox, result };
}

/**
 * The recipe has to be on stderr as three consecutive lines, whatever the
 * indentation - matching only the commands the fix expects keeps git's own
 * advice ("git config --global user.email ...") from passing for a recipe.
 */
function printedRecipe(stderr: string): string[] {
    const recipe: string[] = lib.undoBumpHint('chore/release-2.0.2', '2.0.2');
    const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const block = new RegExp(recipe.map(line => `^[ \t]*${escape(line)}$`).join('\n'), 'm');
    assert.match(stderr, block);
    return recipe;
}

/** Follow the printed recipe and assert it leaves master exactly where it started. */
function assertRecovered(sandbox: ReturnType<typeof failedPrepare>, recipe: string[]) {
    for (const line of recipe) {
        const [command, ...args] = line.split(' ');
        execFileSync(command, args, { cwd: sandbox.work, env: sandbox.env });
    }

    assert.equal(sandbox.git('rev-parse', '--abbrev-ref', 'HEAD').trim(), 'master');
    assert.equal(sandbox.git('status', '--porcelain'), '');
    assert.equal(JSON.parse(readFileSync(join(sandbox.work, 'package.json'), 'utf8')).version, '2.0.1');
    assert.equal(sandbox.git('branch', '--list', 'chore/release-2.0.2').trim(), '');
    // The draft is written before the checks, so a failure leaves it behind;
    // the recipe has to remove it or the next release sees a stale file.
    assert.equal(existsSync(join(sandbox.work, 'releases/2.0.2.md')), false);
    assert.equal(sandbox.git('status', '--porcelain', '--untracked-files=all'), '');
}

describe('the way out of a failed prepare', () => {
    it('prints a recipe that really undoes a bump left staged by a failed commit', () => {
        const sandbox = failedPrepare({ rejectCommit: true });
        try {
            assert.equal(sandbox.result.status, 1, `${sandbox.result.stdout}\n${sandbox.result.stderr}`);
            assert.match(sandbox.result.stderr, /git commit failed/);

            // `git checkout -- <paths>` reads from the index, and the index
            // already held the bump, so it undid nothing and the next
            // `git checkout master` carried the new version onto master.
            assertRecovered(sandbox, printedRecipe(sandbox.result.stderr));
        }
        finally {
            rmSync(sandbox.root, { recursive: true, force: true });
        }
    });

    it('prints the same recipe when the bump never reached the index', () => {
        const sandbox = failedPrepare({
            scripts: { ...PASSING_CHECKS, 'format-check': 'node -e "process.exit(1)"' },
        });
        try {
            assert.equal(sandbox.result.status, 1, `${sandbox.result.stdout}\n${sandbox.result.stderr}`);
            assert.match(sandbox.result.stderr, /format-check or pack:check failed/);

            assertRecovered(sandbox, printedRecipe(sandbox.result.stderr));
        }
        finally {
            rmSync(sandbox.root, { recursive: true, force: true });
        }
    });
});
