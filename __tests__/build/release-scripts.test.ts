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
