#!/usr/bin/env node
/**
 * Stage 2 of the release flow: `npm run release:publish [--notes-file <path>]`
 *
 * The version bump is already merged; this cuts the tag on merged master, pushes
 * it, and creates the GitHub Release. The Release is what triggers
 * `.github/workflows/npm-publish.yml`, which stages the package on the
 * `v2-preview` dist-tag. Approval is still a human step with 2FA: nothing here
 * publishes to npm, and nothing here can.
 *
 * The central check is that the version in `package.json` and the version on
 * `origin/master` are the same. Tagging a local commit that was never merged is
 * how a tag ends up pointing at a tree whose docs still describe the previous
 * release - npm cannot see the difference, the repository and the release page
 * can.
 *
 * `--notes-file <path>` uses notes you edited by hand instead of the generated
 * ones. The generator writes its output to `tmp/release-notes-<tag>.md` so you
 * can look at it first.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import {
    checkCleanWorktree,
    checkOnMaster,
    checkSyncedWithOrigin,
    checkTagAbsent,
    checkVersionReleased,
    releaseKind,
    tagName,
} from './checks.mjs';
import { capture, fail, git, note, readPackage, repoRoot, step } from './lib.mjs';
import { parseLog, renderNotes } from './notes.mjs';

const USAGE = 'usage: npm run release:publish [--notes-file <path>]';

function parseArguments(argv) {
    const options = { notesFile: '' };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--notes-file') {
            options.notesFile = argv[index + 1] ?? '';
            index += 1;
        }
        else {
            return null;
        }
    }
    return options;
}

function latestTag() {
    const tags = git(['tag', '--list', 'v*', '--sort=-v:refname'])
        .split('\n')
        .filter(Boolean);
    return tags[0] ?? '';
}

function remoteTagNames(tag) {
    return git(['ls-remote', '--tags', 'origin', `refs/tags/${tag}`])
        .split('\n')
        .filter(Boolean)
        .map(line => line.split('\t')[1]?.replace('refs/tags/', '') ?? '')
        .filter(name => name !== '');
}

function repositoryUrl() {
    try {
        const name = capture('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
        return `https://github.com/${name}`;
    }
    catch {
        return 'https://github.com/hizzgdev/jsmind-v2';
    }
}

function main(argv) {
    const options = parseArguments(argv);
    if (!options) {
        console.error(USAGE);
        return 2;
    }

    const root = repoRoot();
    const pkg = readPackage(root);
    const version = pkg.version;
    const tag = tagName(version);

    step('Preflight checks');

    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    const head = git(['rev-parse', 'HEAD']);
    const status = git(['status', '--porcelain', '--untracked-files=no']);

    const localProblem = checkCleanWorktree(status) ?? checkOnMaster(branch);
    if (localProblem) {
        fail(localProblem);
    }
    note(`on master at ${head.slice(0, 7)}, working tree clean`);

    git(['fetch', '--quiet', 'origin', 'master']);
    const originMaster = git(['rev-parse', 'origin/master']);
    const syncProblem = checkSyncedWithOrigin(head, originMaster);
    if (syncProblem) {
        fail(syncProblem);
    }
    note(`master is in sync with origin/master (${originMaster.slice(0, 7)})`);

    // The version the tag will name has to be in the history the tag points at,
    // not in a commit that never landed.
    const originMasterPackage = JSON.parse(git(['show', 'origin/master:package.json']));
    const releasedProblem = checkVersionReleased(version, originMasterPackage.version);
    if (releasedProblem) {
        fail(releasedProblem);
    }
    note(`${version} is what origin/master ships`);

    const tagProblem = checkTagAbsent(tag, {
        localTags: git(['tag', '--list', tag]).split('\n').filter(Boolean),
        remoteTags: remoteTagNames(tag),
    });
    if (tagProblem) {
        fail(tagProblem);
    }
    note(`tag ${tag} is unused`);

    const tmp = join(root, 'tmp');
    mkdirSync(tmp, { recursive: true });
    const notesPath = options.notesFile
        ? (isAbsolute(options.notesFile) ? options.notesFile : resolve(process.cwd(), options.notesFile))
        : join(tmp, `release-notes-${tag}.md`);

    if (!existsSync(notesPath)) {
        const previousTag = latestTag();
        const logRange = previousTag ? `${previousTag}..HEAD` : 'HEAD';
        const entries = parseLog(git(['log', '--oneline', '--no-merges', logRange]));
        const notes = renderNotes({
            version,
            kind: releaseKind(version, previousTag ? previousTag.replace(/^v/, '') : ''),
            previousTag,
            entries,
            repositoryUrl: repositoryUrl(),
            nodeRange: pkg.engines?.node ?? '>=22.12.0',
        });
        writeFileSync(notesPath, notes);
        note(`release notes generated from ${previousTag ? `${previousTag}..HEAD` : 'history'} (${entries.length} commit(s))`);
    }
    else {
        note(`using notes from ${notesPath}`);
    }

    step('Release notes');
    console.log('');
    console.log(readFileSync(notesPath, 'utf8'));

    step(`Tagging ${tag}`);
    git(['tag', tag]);
    git(['push', 'origin', tag]);
    note(`pushed tag ${tag}`);

    step('Creating the GitHub Release');
    let releaseUrl;
    try {
        releaseUrl = capture('gh', [
            'release',
            'create',
            tag,
            '--title',
            `jsMind ${version}`,
            '--notes-file',
            notesPath,
            '--latest',
        ]);
    }
    catch (error) {
        fail(
            `gh release create failed, but tag ${tag} is already pushed.`,
            `${error.message}\nRetry the release by hand:\n  gh release create ${tag} --title "jsMind ${version}" --notes-file ${notesPath} --latest`,
        );
    }
    note(releaseUrl);

    const repo = repositoryUrl();
    step('Staged publishing is next');
    console.log(`   Workflow: ${repo}/actions/workflows/npm-publish.yml`);
    console.log('   The Release triggers it; it runs the tests, checks the pack contents, and stages');
    console.log('   the package on the v2-preview tag. It does not publish — approval is yours.');
    console.log('');
    console.log('   Then, with 2FA:');
    console.log('     npm stage approve');
    console.log('   and check the tags:');
    console.log('     npm dist-tag ls jsmind');
    console.log(`       latest: 0.9.x`);
    console.log(`       v2-preview: ${version}`);
    console.log('');
    console.log('   If latest is not 0.9.x, stop: something published without --tag.');
    return 0;
}

process.exit(main(process.argv.slice(2)));
