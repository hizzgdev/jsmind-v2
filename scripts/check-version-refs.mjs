#!/usr/bin/env node
/**
 * Refuse to hard-code a 2.x patch version in prose or source.
 *
 * `package.json` is the only source of the version: the docs flow from it at
 * build time, the README reads npm, and the release scripts read it back. A
 * literal `2.0.1` written into a page is a second source of truth, and it goes
 * stale on the next release - which is exactly how a tag ends up pointing at a
 * tree whose documentation still describes the previous release. npm cannot
 * see the difference, the repository and the release page can.
 *
 * So the rule is mechanical: in the places a reader meets the version, the
 * patch number must not be a literal. Write `2.x`, the npm badge, or
 * `{{ pkg.version }}`.
 *
 * The one exception is a `Since:` marker. `Since: 2.1.0` records when a
 * feature appeared, not which version is current, so its patch number is a
 * historical fact and cannot go stale. Banning triples there would force the
 * annotation to drop the patch digit and say less than the marker is meant to
 * say. Those markers are therefore stripped before the scan; every other
 * occurrence of a `2.x.y` literal is still reported.
 *
 * Watched trees: `docs/`, `skills/`, `src/`, and any top-level `README*.md`.
 * The scan starts from `git ls-files`, so untracked scratch files never fail
 * the check and a file is checked the moment it is staged.
 *
 * Deliberately outside the watch list:
 *   - `package.json` / `package-lock.json` - the one place the version lives.
 *   - `__tests__/` - a fixture's `meta.version` is sample data, not prose.
 *   - `team/` - internal decision records that argue about released versions
 *     and must be able to name them.
 *
 * Only the 2.x shape is matched. v1's `0.9.x` never moves, so naming it is not
 * a staleness risk, and `@2` / `v2-preview` are ranges and tags rather than
 * patch numbers.
 *
 * Usage:
 *     node scripts/check-version-refs.mjs          # report violations, exit 1
 *
 * Wired into CI as its own step; it runs on every change, not only docs ones,
 * because `src/` and `skills/` are watched too.
 */

import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

// Same heuristic git uses: a NUL byte in the first 8000 bytes means binary.
const BINARY_SNIFF_LENGTH = 8000;
const WATCHED_PREFIXES = ['docs/', 'skills/', 'src/'];
const README_PATTERN = /^README.*\.md$/;
// `\b` on both sides, so `12.0.1` does not match and `v2.0.1` does.
const VERSION_LITERAL = /\b2\.\d+\.\d+\b/g;
// `Since: 2.1.0` is when a feature appeared, not which release is current, so
// it is the one place a full triple belongs. Stripped before the scan.
const SINCE_ANNOTATION = /Since:\s*\d+\.\d+\.\d+/g;

/**
 * git exports GIT_DIR and friends to hooks. Trusting them would let a hook
 * point this check at a different repository than the working tree it runs in,
 * so resolve the repository from the filesystem instead.
 */
function gitEnvironment() {
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
        if (key.startsWith('GIT_')) {
            delete env[key];
        }
    }
    return env;
}

function git(args, options) {
    return execFileSync('git', args, { env: gitEnvironment(), ...options });
}

function repoRoot() {
    return git(['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
}

function trackedFiles(root) {
    const raw = git(['ls-files', '-z'], {
        cwd: root,
        encoding: 'buffer',
        maxBuffer: 64 * 1024 * 1024,
    });
    return raw.toString('utf8').split('\0')
        .filter(Boolean);
}

function isWatched(file) {
    if (WATCHED_PREFIXES.some(prefix => file.startsWith(prefix))) {
        return true;
    }
    // Only the top-level READMEs: a README inside docs/ is already watched.
    return !file.includes('/') && README_PATTERN.test(basename(file));
}

function isBinary(data) {
    return data.subarray(0, BINARY_SNIFF_LENGTH)
        .includes(0);
}

/** Every `file:line: content` line in one file. */
function violationsIn(file, text) {
    const found = [];
    const lines = text.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
        const raw = lines[index].replace(/\r$/, '');
        // Drop the `Since:` markers first: a triple there is a date, not a
        // claim about the current release. The report quotes the line as
        // written, so it can be found in the file it names.
        const scanned = raw.replace(SINCE_ANNOTATION, 'Since:');
        VERSION_LITERAL.lastIndex = 0;
        if (VERSION_LITERAL.test(scanned)) {
            found.push(`${file}:${index + 1}: ${raw.trim()}`);
        }
    }
    return found;
}

function main(argv) {
    if (argv.length > 0) {
        console.error(`check-version-refs: unknown argument(s): ${argv.join(' ')}`);
        console.error('usage: node scripts/check-version-refs.mjs');
        return 2;
    }

    const root = repoRoot();
    const violations = [];

    for (const file of trackedFiles(root)) {
        if (!isWatched(file)) {
            continue;
        }
        const path = join(root, file);
        let stat;
        try {
            stat = lstatSync(path);
        }
        catch {
            // Tracked but deleted from the worktree: not this check's business.
            continue;
        }
        if (!stat.isFile() || stat.size === 0) {
            continue;
        }
        const data = readFileSync(path);
        if (isBinary(data)) {
            continue;
        }
        violations.push(...violationsIn(file, data.toString('utf8')));
    }

    if (violations.length > 0) {
        console.error(`${violations.length} hard-coded 2.x version reference(s):`);
        for (const violation of violations) {
            console.error(`  ${violation}`);
        }
        console.error('');
        console.error('The version lives in package.json only. Write `2.x`, or let the');
        console.error('README badge and the docs `{{ pkg.version }}` block show it.');
        console.error('A `Since:` marker is the exception: it records when a feature');
        console.error('appeared, so a full triple there is a fact, not a second source.');
        return 1;
    }

    return 0;
}

process.exit(main(process.argv.slice(2)));
