#!/usr/bin/env node
/**
 * Stage 1 of the release flow: `npm run release:prepare -- <patch|minor> [--dry-run]`
 *
 * Bumps the version on a branch, opens the pull request with the release notes
 * as its body, and stops. A human reviews and merges it; stage 2
 * (`release:publish`) cuts the tag on the merged master. Nothing here tags or
 * publishes.
 *
 * Every preflight check runs before the first write, and any of them failing
 * stops the command - a release that starts from a dirty tree or from a master
 * behind origin is the kind of mistake that only shows up after the tag exists,
 * when it can no longer be fixed.
 *
 * `--dry-run` runs the checks and prints the branch name, version and release
 * notes without touching the repository. That is how the guards are verified
 * from a clean clone: make the tree dirty, or leave the clone one commit behind
 * origin, and the same command has to refuse.
 *
 * The decisions themselves live in `checks.mjs`; this file only gathers facts.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    bumpVersion,
    checkCiSuccess,
    checkCleanWorktree,
    checkOnMaster,
    checkSyncedWithOrigin,
    checkTagAbsent,
    releaseKind,
    tagName,
} from './checks.mjs';
import { capture, fail, git, note, readPackage, repoRoot, run, step, undoBumpHint } from './lib.mjs';
import { parseLog, renderNotes } from './notes.mjs';

const USAGE = 'usage: npm run release:prepare -- <patch|minor> [--dry-run]';
const KINDS = new Set(['patch', 'minor']);

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

function ghJson(args) {
    try {
        return JSON.parse(capture('gh', args));
    }
    catch (error) {
        fail(
            'could not read the CI status from GitHub.',
            `gh is required and must be authenticated for this repository.\n${error.message}\n\nRun \`gh auth status\` and try again.`,
        );
    }
}

function repositoryUrl() {
    try {
        const name = capture('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
        return `https://github.com/${name}`;
    }
    catch {
        // Not fatal: the notes only lose the diff link.
        return 'https://github.com/hizzgdev/jsmind-v2';
    }
}

function main(argv) {
    const dryRun = argv.includes('--dry-run');
    const positional = argv.filter(arg => !arg.startsWith('-'));
    const unknown = argv.filter(arg => arg.startsWith('-') && arg !== '--dry-run');

    if (unknown.length > 0 || positional.length !== 1 || !KINDS.has(positional[0])) {
        console.error(USAGE);
        return 2;
    }
    const kind = positional[0];

    const root = repoRoot();
    const pkg = readPackage(root);

    step('Preflight checks');

    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    const head = git(['rev-parse', 'HEAD']);
    // Tracked changes only: an untracked scratch file cannot reach a commit
    // this script makes, so it must not block a release.
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

    const runs = ghJson([
        'run',
        'list',
        '--workflow',
        'ci.yml',
        '--branch',
        'master',
        '--limit',
        '20',
        '--json',
        'headSha,status,conclusion',
    ]);
    const ciProblem = checkCiSuccess(runs, head);
    if (ciProblem) {
        fail(ciProblem);
    }
    note(`CI on ${head.slice(0, 7)} is green`);

    const version = pkg.version;
    const target = bumpVersion(version, kind);
    const tag = tagName(target);
    const previousTag = latestTag();

    const tagProblem = checkTagAbsent(tag, {
        localTags: git(['tag', '--list', tag]).split('\n').filter(Boolean),
        remoteTags: remoteTagNames(tag),
    });
    if (tagProblem) {
        fail(tagProblem);
    }
    note(`${version} -> ${target}; tag ${tag} is unused`);

    const releaseBranch = `chore/release-${target}`;
    const undo = () => undoBumpHint(releaseBranch).join('\n  ');
    const existingBranch = git(['ls-remote', '--heads', 'origin', `refs/heads/${releaseBranch}`])
        .split('\n')
        .filter(Boolean);
    if (existingBranch.length > 0) {
        fail(`branch ${releaseBranch} already exists on origin.`, `Delete it, or release a different version.`);
    }

    const logRange = previousTag ? `${previousTag}..HEAD` : 'HEAD';
    const entries = parseLog(git(['log', '--oneline', '--no-merges', logRange]));
    const notes = renderNotes({
        version: target,
        kind: releaseKind(target, previousTag ? previousTag.replace(/^v/, '') : ''),
        previousTag,
        entries,
        repositoryUrl: repositoryUrl(),
        nodeRange: pkg.engines?.node ?? '>=22.12.0',
    });

    const checklist = [
        '',
        '---',
        '',
        '## Release checklist',
        '',
        '- [ ] CI is green on this pull request',
        `- [ ] \`package.json\` says ${target} — it is the only place the version is written`,
        '- [ ] The docs home page reads that version at build time and the README badge reads npm; neither needs a commit',
        '- [ ] Merge to master',
        '- [ ] `git checkout master && git pull`, then `npm run release:publish`',
        '',
    ].join('\n');
    const pullRequestBody = `${notes}${checklist}`;

    step('Release plan');
    note(`version:  ${version} -> ${target} (${kind})`);
    note(`branch:   ${releaseBranch}`);
    note(`tag:      ${tag} (cut later, on merged master, by release:publish)`);
    note(`notes:    ${previousTag ? `${previousTag}..HEAD` : 'entire history'}, ${entries.length} commit(s)`);
    console.log('');
    console.log(pullRequestBody);

    if (dryRun) {
        step('Dry run: stopping before any change');
        note('Remove --dry-run to bump the version, push the branch and open the pull request.');
        return 0;
    }

    step(`Bumping ${version} -> ${target}`);
    git(['checkout', '-b', releaseBranch]);
    try {
        run('npm', ['version', target, '--no-git-tag-version']);
    }
    catch {
        fail(
            `npm version ${target} --no-git-tag-version failed.`,
            `Nothing was committed. Undo with:\n  ${undo()}`,
        );
    }

    step('Checking the bump');
    try {
        run('npm', ['run', 'format-check']);
        run('npm', ['run', 'pack:check']);
    }
    catch {
        fail(
            'format-check or pack:check failed on the bumped tree.',
            `package.json and package-lock.json are bumped on ${releaseBranch} and nothing is committed.\nFix the failure and commit by hand, or undo with:\n  ${undo()}`,
        );
    }

    step('Commit and push');
    git(['add', 'package.json', 'package-lock.json']);
    try {
        git(['commit', '-m', `chore(release): ${target}`]);
    }
    catch (error) {
        fail(
            `git commit failed on ${releaseBranch}.`,
            `${error.message}\npackage.json and package-lock.json are bumped and staged. Commit by hand, or undo with:\n  ${undo()}`,
        );
    }
    try {
        git(['push', '-u', 'origin', releaseBranch]);
    }
    catch (error) {
        fail(
            `git push failed. The release commit is on ${releaseBranch}; no pull request was opened.`,
            `${error.message}\nThe branch is ready locally. Retry with:\n  git push -u origin ${releaseBranch}\nthen open the pull request with the release plan printed above.`,
        );
    }
    note(`pushed ${releaseBranch}`);

    const tmp = join(root, 'tmp');
    mkdirSync(tmp, { recursive: true });
    const bodyPath = join(tmp, `release-pr-${tag}.md`);
    writeFileSync(bodyPath, pullRequestBody);
    note(`pull request body written to ${bodyPath}`);

    step('Opening the pull request');
    let prUrl;
    try {
        prUrl = capture('gh', [
            'pr',
            'create',
            '--base',
            'master',
            '--head',
            releaseBranch,
            '--title',
            `chore(release): ${target}`,
            '--body-file',
            bodyPath,
        ]);
    }
    catch (error) {
        fail(
            `gh pr create failed. The branch ${releaseBranch} is pushed.`,
            `${error.message}\nOpen the pull request by hand:\n  gh pr create --base master --head ${releaseBranch} --title "chore(release): ${target}" --body-file ${bodyPath}`,
        );
    }
    note(prUrl);

    step('Next');
    console.log('   1. Review the pull request, wait for CI, merge it.');
    console.log('   2. On master, run `npm run release:publish`.');
    console.log('   The tag is cut there, on merged master — not here.');
    return 0;
}

process.exit(main(process.argv.slice(2)));
