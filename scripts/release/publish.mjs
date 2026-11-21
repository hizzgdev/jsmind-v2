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
 * The release notes are not generated here. They arrive as `releases/<version>.md`
 * in the merged release commit, which is the file the release pull request
 * carried and the author curated; this command sends it to the Release verbatim
 * and refuses when it is missing, untracked, or headed for another version. A
 * second generation at publish time would mean the reviewed text and the shipped
 * text could differ, which is what the file exists to make impossible.
 *
 * `--notes-file <path>` overrides that with a file you name, for a re-run or a
 * hand-fix. It is an explicit exception, not the normal path.
 */

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import {
    checkCleanWorktree,
    checkNotesForPublish,
    checkOnMaster,
    checkSyncedWithOrigin,
    checkTagAbsent,
    checkVersionReleased,
    notesPathFor,
    tagName,
} from './checks.mjs';
import { capture, fail, git, note, readPackage, repoRoot, step } from './lib.mjs';

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

/** Is this path in the commit the tag will name? An untracked file is not. */
function isTracked(path) {
    try {
        git(['ls-files', '--error-unmatch', path], { stdio: ['ignore', 'ignore', 'ignore'] });
        return true;
    }
    catch {
        return false;
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

    const notesRelative = notesPathFor(version);
    const notesAbsolute = join(root, notesRelative);
    const notesPath = options.notesFile
        ? (isAbsolute(options.notesFile) ? options.notesFile : resolve(process.cwd(), options.notesFile))
        : notesAbsolute;

    const notesProblem = options.notesFile
        ? (existsSync(notesPath) ? null : `--notes-file ${options.notesFile} does not exist.`)
        : checkNotesForPublish({
            path: notesRelative,
            exists: existsSync(notesAbsolute),
            tracked: isTracked(notesRelative),
            content: existsSync(notesAbsolute) ? readFileSync(notesAbsolute, 'utf8') : '',
            version,
        });
    if (notesProblem) {
        fail(notesProblem, `Write ${notesRelative} in the release pull request, or pass --notes-file <path>.`);
    }
    note(options.notesFile ? `using notes from ${options.notesFile}` : `${notesRelative} is committed`);

    step('Release notes');
    console.log('');
    console.log(readFileSync(notesPath, 'utf8'));

    step(`Tagging ${tag}`);
    try {
        git(['tag', tag]);
    }
    catch (error) {
        fail(`git tag ${tag} failed; nothing was released.`, error.message);
    }
    try {
        git(['push', 'origin', tag]);
    }
    catch (error) {
        // The tag is local-only now, which the next run reports as a tag that
        // needs deleting rather than a version that shipped.
        fail(
            `git push origin ${tag} failed, so nothing was released. The tag exists locally.`,
            `${error.message}\nDelete it and run this command again:\n  git tag -d ${tag}\n  npm run release:publish`,
        );
    }
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
