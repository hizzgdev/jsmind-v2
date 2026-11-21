/**
 * Turn `git log` into the body of a GitHub Release.
 *
 * The whole point is that nobody composes this by hand: the notes are the
 * commits that landed since the previous tag, grouped by Conventional Commits
 * prefix, under a fixed template. The maintainer reads the result and deletes
 * entries that do not belong - they do not write it.
 *
 * **Which commits are listed is decided by the files they touch, not by their
 * prefix.** `package.json` `files` ships `dist/`, and `dist/` is compiled from
 * `src/`, so a commit that changed nothing under `src/` cannot have changed
 * what `npm i jsmind` installs - whatever its subject says. 2.1.0's notes had
 * to be rewritten by hand because the generator trusted the prefix and put
 * `fix(weka): never drop a human comment on a PR` next to a fix to the
 * exported image. The prefix now only decides which group an entry lands in;
 * the type table it comes from is `team/development/commit-types.md`.
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

/**
 * The groups an entry can land in. Only commits that reach the artifact are
 * listed, so the types that cannot reach it (`docs`, `test`, `devops`, ...)
 * never need a group here.
 */
const GROUPS = [
    { title: 'Features', test: /^feat(\(|!|:)/ },
    { title: 'Fixes', test: /^fix(\(|!|:)/ },
    { title: 'Internals', test: /^refactor(\(|!|:)/ },
    { title: 'Other', test: null },
];

/** Everything under this prefix is compiled into `dist/` by rollup. */
export const ARTIFACT_PREFIX = 'src/';

/** `git log --format=commit %H %s --name-only` -> a commit header. */
const RECORD_HEADER = /^commit ([0-9a-f]{40}) ?(.*)$/;

/**
 * `git log --format=commit %H %s --name-only` output ->
 * `[{ sha, subject, files }]`, newest first.
 *
 * The format is part of the contract: without the file list an entry cannot
 * be said to reach the artifact, and guessing "it probably does" is the bug
 * this module exists to remove. A log in another shape is refused rather than
 * read as a list of commits that touch nothing.
 */
export function parseLog(logText) {
    const text = logText.replace(/\r\n/g, '\n')
        .trim();
    if (text === '') {
        return [];
    }

    const entries = [];
    let current = null;
    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        const header = RECORD_HEADER.exec(line);
        if (header) {
            current = { sha: header[1], subject: header[2].trim(), files: [] };
            entries.push(current);
            continue;
        }
        if (line === '') {
            continue;
        }
        if (current === null) {
            throw new Error(
                'not a git log with a file list: read it with '
                + '`git log --format="commit %H %s" --name-only`, '
                + `so each entry knows which files it touched (got: ${JSON.stringify(line)})`,
            );
        }
        current.files.push(line);
    }
    return entries.filter(entry => entry.subject !== '');
}

/** Does any of these files reach `dist/`, i.e. the published package? */
export function reachesArtifact(files) {
    return files.some(file => file.startsWith(ARTIFACT_PREFIX));
}

/**
 * The entries a release page may list: commits that changed the artifact,
 * minus the release commit itself.
 */
export function artifactEntries(entries) {
    return entries.filter(entry => !isReleaseCommit(entry.subject) && reachesArtifact(entry.files));
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

    const groups = groupCommits(artifactEntries(entries));
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
