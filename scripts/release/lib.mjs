/**
 * Plumbing shared by the release scripts.
 *
 * `scripts/release/prepare.mjs` and `scripts/release/publish.mjs` are the two
 * commands the release flow is made of; everything they have in common - how to
 * run git, how to read `package.json`, how to print a failure - lives here. The
 * decisions themselves are in `checks.mjs`, which is pure so the checks can be
 * tested without a repository, a network, or gh.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * git exports GIT_DIR and friends to hooks. Trusting them would point the
 * release scripts at a different repository than the working tree they run in,
 * so every git call below resolves its repository from the filesystem.
 */
export function gitEnvironment() {
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
        if (key.startsWith('GIT_')) {
            delete env[key];
        }
    }
    return env;
}

/** Run git and return its stdout, trimmed. Throws if git exits non-zero. */
export function git(args, options = {}) {
    return execFileSync('git', args, {
        encoding: 'utf8',
        env: gitEnvironment(),
        maxBuffer: 16 * 1024 * 1024,
        ...options,
    })
        .trim();
}

/**
 * Is this path in the commit the tag will name? `git ls-files --error-unmatch`
 * exits 1 for a path it does not know and 0 for one it carries.
 *
 * The stdout is deliberately not ignored. `git()` trims whatever
 * `execFileSync` returns, and an ignored stdout makes that `null`, so the trim
 * throws a `TypeError` - which a `catch` around the call cannot tell apart from
 * "git said no". That is how a `releases/<version>.md` committed on master came
 * to be refused as uncommitted, with the check unable to ever pass. Capturing
 * the path it echoes back costs one string and keeps the helper's contract.
 *
 * Only exit 1 is a verdict. Anything else (git missing, not a repository) is a
 * broken environment rather than an answer about this path, and has to surface
 * instead of being read as "not tracked".
 */
export function isTracked(path) {
    try {
        git(['ls-files', '--error-unmatch', path]);
        return true;
    }
    catch (error) {
        if (error.status === 1) {
            return false;
        }
        throw error;
    }
}

/** Run a command with its output going straight to the terminal. */
export function run(command, args, options = {}) {
    execFileSync(command, args, {
        stdio: 'inherit',
        env: gitEnvironment(),
        ...options,
    });
}

/** Run a command and capture its stdout, trimmed. */
export function capture(command, args, options = {}) {
    return execFileSync(command, args, {
        encoding: 'utf8',
        env: gitEnvironment(),
        maxBuffer: 16 * 1024 * 1024,
        ...options,
    })
        .trim();
}

export function repoRoot() {
    return git(['rev-parse', '--show-toplevel']);
}

export function readPackage(root) {
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
}

export function step(message) {
    console.log(`\n== ${message}`);
}

export function note(message) {
    console.log(`   ${message}`);
}

/**
 * The way out of a half-finished `release:prepare`: the version bump lives in
 * `package.json` and `package-lock.json`, the release notes in
 * `releases/<version>.md`, and by the time a step fails they may be in the
 * working tree only (npm version, format-check) or already staged (the commit
 * itself). `git checkout -- <paths>` restores from the index, so it silently
 * does nothing in the staged case and the bump then follows you onto master.
 * `git restore --staged --worktree` covers both. The notes file needs its own
 * two steps because it is a new path: `git rm --cached` unstages an addition
 * that a failed commit left behind, and `rm -f` removes the copy on disk -
 * `--ignore-unmatch` keeps both harmless when the file was never written. One
 * recipe, tested against real git, not three hand-written copies that drift.
 */
export function undoBumpHint(branch, version) {
    const notes = `releases/${version}.md`;
    return [
        'git restore --staged --worktree package.json package-lock.json',
        `git rm -q --cached --ignore-unmatch ${notes}`,
        `rm -f ${notes}`,
        'git checkout master',
        `git branch -d ${branch}`,
    ];
}

/** Stop the whole command: a failed preflight check is not a warning. */
export function fail(message, hint) {
    console.error(`\nrelease: ${message}`);
    if (hint) {
        for (const line of hint.split('\n')) {
            console.error(`         ${line}`);
        }
    }
    process.exit(1);
}
