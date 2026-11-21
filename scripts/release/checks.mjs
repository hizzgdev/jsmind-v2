/**
 * The decisions behind `release:prepare` and `release:publish`, as pure
 * functions.
 *
 * Every one of these returns `null` when the condition holds and a sentence
 * explaining the failure when it does not. Keeping them free of filesystem,
 * git and gh access is what makes the release flow testable: the scripts below
 * gather the facts, these say whether the facts allow a release.
 *
 * The rule they exist to enforce: **a tag is only ever cut on merged master.**
 * Bumping the version in a branch and tagging that branch instead produces a
 * tag whose tree still carries the previous version everywhere that matters -
 * npm cannot tell, the repository and the release page can.
 */

const PLAIN_VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const RELEASE_COMMIT = /^chore\(release\):/;

function parseVersion(version) {
    const match = PLAIN_VERSION.exec(version);
    if (!match) {
        throw new Error(`not a plain x.y.z version: ${JSON.stringify(version)}`);
    }
    return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/**
 * The next version for a release kind. Breaking changes ride the minor on this
 * line (see team/development/npm-release.md 1.3), so `patch` is bug fixes only
 * and `minor` is everything that can break a seed user.
 */
export function bumpVersion(version, kind) {
    const { major, minor, patch } = parseVersion(version);
    if (kind === 'patch') {
        return `${major}.${minor}.${patch + 1}`;
    }
    if (kind === 'minor') {
        return `${major}.${minor + 1}.0`;
    }
    throw new Error(`unknown release kind: ${JSON.stringify(kind)} (expected patch or minor)`);
}

export function tagName(version) {
    return `v${version}`;
}

/** `patch` or `minor`, decided by comparing against the previous release. */
export function releaseKind(version, previousVersion) {
    if (!previousVersion) {
        return 'patch';
    }
    const next = parseVersion(version);
    const previous = parseVersion(previousVersion);
    if (next.major !== previous.major) {
        return 'major';
    }
    return next.minor !== previous.minor ? 'minor' : 'patch';
}

/**
 * Tracked changes only. An untracked draft in the tree cannot reach a commit
 * the script creates, so it must not stop a release; an unstaged edit to a
 * tracked file can, and does.
 */
export function checkCleanWorktree(porcelain) {
    const changes = porcelain.trim();
    if (changes === '') {
        return null;
    }
    return `the working tree has uncommitted changes to tracked files:\n${changes}\n\nCommit or stash them first.`;
}

export function checkOnMaster(branch) {
    if (branch === 'master') {
        return null;
    }
    return `releases are cut from master, but HEAD is on ${JSON.stringify(branch)}.\nSwitch to master and pull.`;
}

export function checkSyncedWithOrigin(head, originMaster) {
    if (head === originMaster) {
        return null;
    }
    return `master is not in sync with origin/master (HEAD ${head.slice(0, 7)}, origin/master ${originMaster.slice(0, 7)}).\nRun \`git pull --ff-only\` before releasing.`;
}

/**
 * The last master CI run must be a success. `runs` is what
 * `gh run list --workflow ci.yml --branch master --json headSha,status,conclusion`
 * returns, newest first.
 */
export function checkCiSuccess(runs, headSha) {
    const run = runs.find(candidate => candidate.headSha === headSha);
    if (!run) {
        return `no CI run found for master at ${headSha.slice(0, 7)}.\nWait for CI on the latest master commit before releasing.`;
    }
    if (run.status !== 'completed') {
        return `the CI run for master at ${headSha.slice(0, 7)} is ${run.status}.\nWait for it to finish.`;
    }
    if (run.conclusion !== 'success') {
        return `the CI run for master at ${headSha.slice(0, 7)} concluded ${run.conclusion}.\nmaster must be green before a release: fix it and merge the fix first.`;
    }
    return null;
}

/**
 * A version is released once. An existing tag - local or on origin - is final,
 * with one exception worth its own message: a tag that exists locally but not
 * on origin is what a run that failed between `git tag` and `git push` leaves
 * behind, and calling that "released" would send the maintainer to bump the
 * version of a release that never happened.
 */
export function checkTagAbsent(tag, { localTags, remoteTags }) {
    if (remoteTags.includes(tag)) {
        return `tag ${tag} already exists on origin; that version has been released.\nA published version cannot be replaced — release the next one.`;
    }
    if (localTags.includes(tag)) {
        return `tag ${tag} already exists locally but not on origin.\nIf an earlier run failed while pushing it, nothing was released: delete it with \`git tag -d ${tag}\` and run again.`;
    }
    return null;
}

/**
 * `publish` tags what master already contains, not what the working tree says:
 * the version in `package.json` and the version on `origin/master` have to be
 * the same commit's worth of truth. This is the check that makes "the tag
 * points at an unmerged release commit" unreachable.
 */
export function checkVersionReleased(localVersion, originMasterVersion) {
    if (localVersion === originMasterVersion) {
        return null;
    }
    return `package.json says ${localVersion} but origin/master says ${originMasterVersion}.\nThe version bump has to be merged before its tag can be cut.`;
}

/** Release commits describe the release itself; they are not changed content. */
export function isReleaseCommit(subject) {
    return RELEASE_COMMIT.test(subject);
}

/**
 * The curated release notes live in the tree, one file per version, and
 * `publish` sends that file to GitHub verbatim. The reason is that the notes
 * are not a projection of `git log`: the entries are chosen by what a user of
 * the shipped artifact can feel, and the breaking-change paragraphs are written
 * from behaviour, not from a subject line. A projection can be regenerated at
 * will; this file cannot, so it is the source and the release page is its copy.
 */
export function notesPathFor(version) {
    return `releases/${version}.md`;
}

/**
 * `prepare` must not write over notes somebody may already have curated: the
 * file existing means this version was staged before, and a fresh draft would
 * silently throw that judgement away.
 */
export function checkNotesAbsent(path, exists) {
    if (!exists) {
        return null;
    }
    return `${path} already exists, so ${path.replace(/^releases\//, '').replace(/\.md$/, '')} was staged before.\nDelete the file to start over, or release a different version.`;
}

/**
 * The file `publish` sends is the one the release pull request carried: present,
 * tracked (an untracked file is not in the commit the tag will name), and headed
 * with the version it claims to describe. Anything else means the reviewed text
 * and the shipped text would differ, which is the failure this whole file exists
 * to prevent.
 */
export function checkNotesForPublish({ path, exists, tracked, content, version }) {
    if (!exists) {
        return `no release notes at ${path}.\nA release is described by a file in the tree, not by a regeneration at publish time: write ${notesPathFor(version)} (or pass --notes-file).`;
    }
    if (!tracked) {
        return `${path} exists but is not committed, so the tag would not name it.\nCommit the notes before publishing; the release page is built from that file.`;
    }
    const heading = (content.split('\n').find(line => line.trim() !== '') ?? '').trim();
    const expected = `# jsMind ${version}`;
    if (heading !== expected) {
        return `${path} starts with "${heading}", not "${expected}".\nThe file names the version it describes; publishing ${version} from notes for another version is how a release page ends up wrong.`;
    }
    return null;
}
