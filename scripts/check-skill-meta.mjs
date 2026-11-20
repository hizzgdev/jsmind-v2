#!/usr/bin/env node
/**
 * Keep the jsmind skill's frontmatter honest about the CLI it describes.
 *
 * The skill is a document about a program, and the two drift apart silently:
 * a flag is renamed, a version moves on, and the page still reads as if it
 * works. Three fields in `skills/jsmind/SKILL.md` frontmatter are machine
 * readable, so they can be checked instead of trusted:
 *
 *   version        the skill's own semver. Bumped when the skill changes, and
 *                  initially the CLI version it was written against.
 *   display_name   what a harness shows a user. A missing one is a missing
 *                  label, not a cosmetic detail.
 *   metadata.jsmind.cli
 *                  the range of CLI versions whose behaviour this page
 *                  describes. `package.json` must fall inside it — that is the
 *                  whole point: the page claims a range, and the repository's
 *                  current version either is in it or the page is stale.
 *
 * The range is evaluated here rather than with the `semver` package, because
 * the repository has no runtime dependencies and this check is allowed to be
 * small. Supported, exactly:
 *
 *   1.2.3, =1.2.3          exactly that version
 *   >1.2.3 >=1.2.3 <1.2.3 <=1.2.3
 *   ^1.2.3                 up to the next major, with semver's 0.x rules
 *   ~1.2.3                 up to the next minor
 *   1.2, 1.2.x, 1.2.*      any 1.2.*: a bare partial version is an x-range
 *   1, 1.x, 1.*            any 1.*
 *   >=1.2.3 <2             space-separated: every comparator must hold
 *
 * Everything else is refused with exit 1 rather than read as if it meant
 * something: `||`, hyphen ranges, a bare `*`, a malformed token such as
 * `2.x.3`. An x-range is the trap — `2.3.x` widened to "any 2.x" is a quiet
 * wrong answer, and a green build on a wrong answer is worse than a red build
 * on a right one.
 *
 * Prereleases (`2.0.2-rc.1`) are ordered by semver precedence but are not
 * excluded the way npm's default range semantics exclude them. The question
 * here is whether the tree the page describes is the tree in `package.json`,
 * and a prerelease of a covered version is that tree.
 *
 * Usage:
 *     node scripts/check-skill-meta.mjs               # report problems, exit 1
 *     node scripts/check-skill-meta.mjs --root <dir>  # check a different tree
 *
 * `--root` exists for `__tests__/build/skill-meta.test.ts`. The default root is
 * the repository this script lives in, not the caller's working directory, so
 * the check answers the same question wherever it is run from.
 *
 * Wired into CI as its own step, unconditional: `skills/` is prose, so a
 * documentation-only change skips the library checks — and this is exactly the
 * change that can stale the range.
 */

import { readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
const SKILL_FILE = join('skills', 'jsmind', 'SKILL.md');
const SKILL_DIR_NAME = basename(dirname(SKILL_FILE));

/** A version: three numbers plus optional prerelease identifiers. */
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
/** The same, with the minor and patch digits optional: a partial version. */
const PARTIAL_SEMVER = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
/** A token whose missing parts are wildcards rather than zeroes. */
const X_RANGE = /^(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?$/;

/**
 * Splits a `SKILL.md` into its frontmatter lines and body.
 *
 * @param text - Whole file.
 * @returns The frontmatter lines, or null when there is no frontmatter.
 */
function frontmatterLines(text) {
    const lines = text.split('\n');
    if (lines[0].trimEnd() !== '---') {
        return null;
    }
    for (let index = 1; index < lines.length; index += 1) {
        if (lines[index].trimEnd() === '---') {
            return lines.slice(1, index);
        }
    }
    return null;
}

/**
 * Reads the small YAML subset the skill frontmatter uses.
 *
 * @param lines - Frontmatter lines, without the delimiters.
 * @returns Key path → value, plus the source line (1-based, counting the
 *   opening `---`) of each leaf.
 * @remarks
 * Deliberately not a YAML parser. It handles the shape this file has — plain
 * `key: value`, one level of nesting, and `>-` block scalars — and treats a
 * block scalar as an opaque string. Anything fancier belongs in a test fixture,
 * not in the frontmatter of a skill.
 */
function parseFrontmatter(lines) {
    const values = new Map();
    const locations = new Map();
    const stack = [];

    for (let index = 0; index < lines.length; index += 1) {
        const raw = lines[index].replace(/\r$/, '');
        if (raw.trim() === '' || raw.trimStart().startsWith('#')) {
            continue;
        }
        const match = /^(\s*)([A-Za-z0-9_.-]+):(?:\s+(.*))?$/.exec(raw);
        if (match === null) {
            continue;
        }
        const indent = match[1].length;
        const key = match[2];
        const value = (match[3] ?? '').trim();

        while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
            stack.pop();
        }
        const path = [...stack.map(entry => entry.key), key].join('.');

        if (value === '' || value === '>' || value === '>-' || value === '|' || value === '|-') {
            stack.push({ indent, key });
            if (value === '') {
                continue;
            }
            // Block scalar: collect the more-indented lines that follow.
            const body = [];
            let cursor = index + 1;
            for (; cursor < lines.length; cursor += 1) {
                const line = lines[cursor].replace(/\r$/, '');
                if (line.trim() !== '' && line.length - line.trimStart().length <= indent) {
                    break;
                }
                body.push(line.trim());
            }
            values.set(path, body.join(' ').trim());
            locations.set(path, index + 2);
            index = cursor - 1;
            continue;
        }

        const unquoted = value.replace(/^(['"])(.*)\1$/, '$2');
        values.set(path, unquoted);
        locations.set(path, index + 2);
    }

    return { values, locations };
}

/**
 * Turns prerelease text into identifiers, empty text into null.
 *
 * @param text - The `-rc.1` part without its dash, when present.
 * @returns Identifiers, or null for a release.
 */
function prereleaseOf(text) {
    return text === undefined ? null : text.split('.');
}

/**
 * Reads a partial version: `1`, `1.2`, or `1.2.3`, with optional prerelease.
 *
 * @param text - Version text.
 * @returns The numbers (missing parts filled with zero), how many digits were
 *   given, and the prerelease; or null when the text is not a version.
 */
function parsePartialVersion(text) {
    const match = PARTIAL_SEMVER.exec(text.trim());
    if (match === null) {
        return null;
    }
    const given = match[3] !== undefined ? 3 : match[2] !== undefined ? 2 : 1;
    return {
        numbers: [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)],
        given,
        prerelease: prereleaseOf(match[4]),
    };
}

/**
 * Reads a complete version, the shape `package.json` and the skill carry.
 *
 * @param text - Version text.
 * @returns The version, or null when it is not `major.minor.patch`.
 */
function parseVersion(text) {
    const match = SEMVER.exec(text.trim());
    if (match === null) {
        return null;
    }
    return {
        numbers: [Number(match[1]), Number(match[2]), Number(match[3])],
        given: 3,
        prerelease: prereleaseOf(match[4]),
    };
}

/**
 * Builds a release version from its numbers.
 *
 * @returns A version with no prerelease.
 */
function release(major, minor, patch) {
    return { numbers: [major, minor, patch], given: 3, prerelease: null };
}

/**
 * Compares prerelease identifier lists by semver precedence.
 *
 * @returns Negative, zero, or positive, like any comparator.
 * @remarks A release outranks any of its own prereleases; numeric identifiers
 *   compare numerically and rank below alphanumeric ones.
 */
function comparePrerelease(left, right) {
    if (left === null && right === null) {
        return 0;
    }
    if (left === null) {
        return 1;
    }
    if (right === null) {
        return -1;
    }
    const shared = Math.min(left.length, right.length);
    for (let index = 0; index < shared; index += 1) {
        const leftNumeric = /^\d+$/.test(left[index]);
        const rightNumeric = /^\d+$/.test(right[index]);
        if (leftNumeric && rightNumeric) {
            const difference = Number(left[index]) - Number(right[index]);
            if (difference !== 0) {
                return difference;
            }
            continue;
        }
        if (leftNumeric !== rightNumeric) {
            return leftNumeric ? -1 : 1;
        }
        if (left[index] !== right[index]) {
            return left[index] < right[index] ? -1 : 1;
        }
    }
    return left.length - right.length;
}

/**
 * Compares two versions.
 *
 * @returns Negative, zero, or positive, like any comparator.
 */
function compare(left, right) {
    for (let index = 0; index < 3; index += 1) {
        if (left.numbers[index] !== right.numbers[index]) {
            return left.numbers[index] - right.numbers[index];
        }
    }
    return comparePrerelease(left.prerelease, right.prerelease);
}

/** A `>=` floor. */
function atLeast(version) {
    return { operator: '>=', version };
}

/** A `<` cap: the half-open upper end every expanded range needs. */
function below(version) {
    return { operator: '<', version };
}

/**
 * The exclusive upper end of a caret range.
 *
 * @param floor - The version `^` was written on.
 * @returns The first version the caret does not allow.
 * @remarks The 0.x rules are semver's: `^0.2.3` stops at 0.3.0, `^0.0.3` at
 *   0.0.4, and a bare `^0` allows the whole 0.x line.
 */
function caretUpperBound(floor) {
    const [major, minor, patch] = floor.numbers;
    if (major > 0 || floor.given === 1) {
        return release(major + 1, 0, 0);
    }
    if (minor > 0 || floor.given === 2) {
        return release(0, minor + 1, 0);
    }
    return release(0, 0, patch + 1);
}

/**
 * The exclusive upper end of a tilde range.
 *
 * @param floor - The version `~` was written on.
 * @returns The first version the tilde does not allow.
 */
function tildeUpperBound(floor) {
    const [major, minor] = floor.numbers;
    return floor.given === 1 ? release(major + 1, 0, 0) : release(major, minor + 1, 0);
}

/**
 * Expands a token with no operator: an exact version or an x-range.
 *
 * @param token - One space-separated part of the range.
 * @returns Comparators, or null when the token is not this shape.
 * @remarks `1.2.3` is exact; `1.2` and `1.2.x` are `>=1.2.0 <1.3.0`. Missing
 *   parts are wildcards here, not zeroes — that difference is the whole reason
 *   this function exists.
 */
function bareComparators(token) {
    const exact = parseVersion(token);
    if (exact !== null) {
        return [{ operator: '=', version: exact }];
    }

    const match = X_RANGE.exec(token);
    if (match === null) {
        return null;
    }
    const major = Number(match[1]);
    const minor = match[2];
    const patch = match[3];
    // `2.x.3` names two incompatible shapes at once; refuse rather than pick one.
    if (isWildcard(minor) && !isWildcard(patch)) {
        return null;
    }
    if (isWildcard(minor)) {
        return [atLeast(release(major, 0, 0)), below(release(major + 1, 0, 0))];
    }
    if (isWildcard(patch)) {
        return [atLeast(release(major, Number(minor), 0)), below(release(major, Number(minor) + 1, 0))];
    }
    return [{ operator: '=', version: release(major, Number(minor), Number(patch)) }];
}

/**
 * Reports whether an x-range part is a wildcard.
 *
 * @param part - A captured regex group, or undefined when the part is absent.
 */
function isWildcard(part) {
    return part === undefined || /^[xX*]$/.test(part);
}

/**
 * Expands one range token into comparators.
 *
 * @param token - One space-separated part of the range.
 * @returns Comparators, or null when the token is not supported.
 */
function tokenComparators(token) {
    const caret = /^\^(.+)$/.exec(token);
    if (caret !== null) {
        const floor = parsePartialVersion(caret[1]);
        if (floor === null) {
            return null;
        }
        return [atLeast(floor), below(caretUpperBound(floor))];
    }

    const tilde = /^~(.+)$/.exec(token);
    if (tilde !== null) {
        const floor = parsePartialVersion(tilde[1]);
        if (floor === null) {
            return null;
        }
        return [atLeast(floor), below(tildeUpperBound(floor))];
    }

    const operator = /^(>=|<=|>|<|=)(\S+)$/.exec(token);
    if (operator !== null) {
        if (operator[1] === '=') {
            // `=2.3.x` is the same claim as `2.3.x`.
            return bareComparators(operator[2]);
        }
        if (/[xX*]/.test(operator[2])) {
            // `>=2.3.x` has no half-open reading anyone agrees on.
            return null;
        }
        const bound = parsePartialVersion(operator[2]);
        if (bound === null) {
            return null;
        }
        return [{ operator: operator[1], version: bound }];
    }

    return bareComparators(token);
}

/**
 * Tests a version against a range expression.
 *
 * @param version - Version string from `package.json`.
 * @param range - Range expression from the frontmatter.
 * @returns True when the version satisfies every comparator.
 * @throws When the version is not semver or the range uses unsupported syntax.
 */
function satisfies(version, range) {
    const parsed = parseVersion(version);
    if (parsed === null) {
        throw new Error(
            `package.json version is not a semantic version: ${version} (expected something like 2.0.1)`
        );
    }
    if (range.includes('||')) {
        throw new Error(`unsupported range syntax (|| alternatives): ${range}`);
    }
    if (/\s-\s/.test(range.trim())) {
        throw new Error(`unsupported range syntax (hyphen range): ${range}`);
    }

    const tokens = range
        .split(/\s+/)
        .map(token => token.trim())
        .filter(token => token !== '');
    if (tokens.length === 0) {
        throw new Error('empty range');
    }

    const comparators = [];
    for (const token of tokens) {
        const expanded = tokenComparators(token);
        if (expanded === null) {
            throw new Error(
                `unsupported range syntax: ${token} ` +
                    '(supported: =, <, <=, >, >=, ^, ~, x-ranges, and space-separated intersections)'
            );
        }
        comparators.push(...expanded);
    }

    return comparators.every(comparator => {
        const order = compare(parsed, comparator.version);
        switch (comparator.operator) {
            case '>':
                return order > 0;
            case '>=':
                return order >= 0;
            case '<':
                return order < 0;
            case '<=':
                return order <= 0;
            default:
                return order === 0;
        }
    });
}

/**
 * Reads the command line.
 *
 * @param argv - Arguments after the script name.
 * @returns The root directory to check.
 * @throws When an argument is not one this script knows.
 */
function parseArguments(argv) {
    let root = DEFAULT_ROOT;
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--root') {
            const value = argv[index + 1];
            if (value === undefined) {
                throw new Error('--root needs a directory');
            }
            root = resolve(value);
            index += 1;
            continue;
        }
        throw new Error(`unknown argument: ${argument}`);
    }
    return root;
}

/**
 * Checks one tree.
 *
 * @param root - Repository root to read `skills/jsmind/SKILL.md` and
 *   `package.json` from.
 */
function check(root) {
    const problems = [];
    const add = (file, line, message) => {
        problems.push(`${file}${line === null ? '' : `:${line}`}: ${message}`);
    };

    let skillText;
    try {
        skillText = readFileSync(join(root, SKILL_FILE), 'utf8');
    } catch (error) {
        add(SKILL_FILE, null, `cannot read: ${error.code ?? error.message}`);
        report(problems);
        return;
    }

    const lines = frontmatterLines(skillText);
    if (lines === null) {
        add(SKILL_FILE, 1, 'no YAML frontmatter (expected a `---` block at the top)');
        report(problems);
        return;
    }

    const { values, locations } = parseFrontmatter(lines);
    const at = key => locations.get(key) ?? null;

    const name = values.get('name');
    if (name !== SKILL_DIR_NAME) {
        add(
            SKILL_FILE,
            at('name'),
            `name is ${JSON.stringify(name ?? null)}, but the directory is ${SKILL_DIR_NAME}`
        );
    }

    const displayName = values.get('display_name');
    if (typeof displayName !== 'string' || displayName.trim() === '') {
        add(SKILL_FILE, at('display_name'), 'missing display_name');
    }

    const skillVersion = values.get('version');
    if (skillVersion === undefined || parseVersion(skillVersion) === null) {
        add(
            SKILL_FILE,
            at('version'),
            `missing or non-semver version: ${JSON.stringify(skillVersion ?? null)}`
        );
    }

    const range = values.get('metadata.jsmind.cli');
    if (typeof range !== 'string' || range.trim() === '') {
        add(SKILL_FILE, at('metadata.jsmind.cli'), 'missing metadata.jsmind.cli range');
        report(problems);
        return;
    }

    let pkg;
    try {
        pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    } catch (error) {
        add('package.json', null, `cannot read: ${error.code ?? error.message}`);
        report(problems);
        return;
    }
    if (typeof pkg.version !== 'string') {
        add('package.json', null, 'missing version');
        report(problems);
        return;
    }

    try {
        if (!satisfies(pkg.version, range)) {
            add(
                SKILL_FILE,
                at('metadata.jsmind.cli'),
                `range ${JSON.stringify(range)} does not cover package.json version ` +
                    `${pkg.version} — the skill describes a CLI this repository is not on`
            );
        } else {
            console.log(
                `jsmind skill: version ${skillVersion}, CLI range ${JSON.stringify(range)} ` +
                    `covers package.json ${pkg.version}.`
            );
        }
    } catch (error) {
        add(SKILL_FILE, at('metadata.jsmind.cli'), error.message);
    }

    report(problems);
}

/**
 * Prints problems and sets the exit status.
 *
 * @param problems - Lines ready to print.
 */
function report(problems) {
    if (problems.length === 0) {
        process.exitCode = 0;
        return;
    }
    console.error(`${problems.length} skill metadata problem(s):`);
    for (const problem of problems) {
        console.error(`  ${problem}`);
    }
    console.error('');
    console.error('metadata.jsmind.cli is the range of CLI versions SKILL.md describes.');
    console.error('When package.json moves outside it, the page and the program have');
    console.error('parted ways: re-read the page against `jsmind --help` and widen the');
    console.error('range deliberately, rather than letting it drift.');
    process.exitCode = 1;
}

function main() {
    let root;
    try {
        root = parseArguments(process.argv.slice(2));
    } catch (error) {
        console.error(error.message);
        console.error('usage: node scripts/check-skill-meta.mjs [--root <dir>]');
        process.exitCode = 2;
        return;
    }
    check(root);
}

main();
