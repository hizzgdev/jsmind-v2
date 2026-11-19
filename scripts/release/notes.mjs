/**
 * Turn `git log` into the body of a GitHub Release.
 *
 * The whole point is that nobody composes this by hand: the notes are the
 * commits that landed since the previous tag, grouped by Conventional Commits
 * prefix, under a fixed template. The maintainer reads the result and deletes
 * entries that do not belong - they do not write it.
 *
 * Subjects are kept verbatim, minus the commit sha. They are already the
 * sentence a reader wants ("highlight the code editor and match its type size
 * to the read-only blocks (#110)"), and rewriting them is how a release note
 * starts disagreeing with `git log`.
 *
 * `{{ pkg.version }}`-style interpolation is not used: this script runs in
 * Node, not VitePress.
 */

import { isReleaseCommit } from './checks.mjs';

const GROUPS = [
    { title: 'Features', test: /^feat(\(|!|:)/ },
    { title: 'Fixes', test: /^fix(\(|!|:)/ },
    { title: 'Docs', test: /^docs(\(|!|:)/ },
    { title: 'Chores', test: /^chore(\(|!|:)/ },
    { title: 'Other', test: null },
];

/** `git log --oneline` lines -> `[{ sha, subject }]`, newest first. */
export function parseLog(logText) {
    return logText
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map((line) => {
            const space = line.indexOf(' ');
            return space === -1
                ? { sha: line, subject: '' }
                : { sha: line.slice(0, space), subject: line.slice(space + 1).trim() };
        })
        .filter(entry => entry.subject !== '');
}

/** Group subjects under their prefix, dropping groups that came out empty. */
export function groupCommits(entries) {
    const buckets = GROUPS.map(group => ({ title: group.title, test: group.test, entries: [] }));
    for (const { subject } of entries) {
        const match = buckets.find(bucket => bucket.test === null || bucket.test.test(subject));
        match.entries.push(subject);
    }
    return buckets
        .map(({ title, entries }) => ({ title, entries }))
        .filter(group => group.entries.length > 0);
}

function intro(kind) {
    if (kind === 'minor') {
        return 'Minor release on the 2.x preview line (npm tag `v2-preview`). The minor carries breaking changes, so read the list below before upgrading.';
    }
    if (kind === 'major') {
        return 'Release on the 2.x preview line (npm tag `v2-preview`).';
    }
    return 'Patch release on the 2.x preview line (npm tag `v2-preview`). Bug fixes only — breaking changes ride the minor, so a patch is safe to take.';
}

/**
 * @param {object} input
 * @param {string} input.version            the version being released
 * @param {'patch'|'minor'|'major'} input.kind
 * @param {string} input.previousTag        the tag the diff starts from, or ''
 * @param {Array} input.entries             `parseLog` output
 * @param {string} input.repositoryUrl      https://github.com/owner/repo
 * @param {string} input.nodeRange          `engines.node` from package.json
 * @param {string} [input.docsUrl]
 */
export function renderNotes({
    version,
    kind,
    previousTag,
    entries,
    repositoryUrl,
    nodeRange,
    docsUrl = 'https://hizzgdev.github.io/jsmind-v2/docs/',
}) {
    const lines = [`# jsMind ${version}`, '', intro(kind), '', '## Install', '', '```bash', 'npm i jsmind@2', '```', '', '`npm i jsmind` still installs v1 (0.9.x).', '', '## What changed', ''];

    // The release commit is part of the range but not part of the change; drop
    // it here so no caller has to remember to.
    const groups = groupCommits(entries.filter(({ subject }) => !isReleaseCommit(subject)));
    if (groups.length === 0) {
        lines.push('No user-visible changes.');
        lines.push('');
    }
    else {
        for (const group of groups) {
            lines.push(`### ${group.title}`, '');
            for (const subject of group.entries) {
                lines.push(`- ${subject}`);
            }
            lines.push('');
        }
    }

    lines.push('## Links', '');
    if (previousTag) {
        lines.push(`- Diff: ${repositoryUrl}/compare/${previousTag}...${tagName(version)}`);
    }
    lines.push(`- npm versions: https://www.npmjs.com/package/jsmind?activeTab=versions`);
    lines.push(`- Docs: ${docsUrl}`);
    lines.push('');
    lines.push('## Node version', '');
    lines.push(`Node.js \`${nodeRange}\` is required (\`engines.node\` in package.json). npm only warns when the range is not met, so this is worth checking before installing.`);
    lines.push('');
    return lines.join('\n');
}

export function tagName(version) {
    return `v${version}`;
}
