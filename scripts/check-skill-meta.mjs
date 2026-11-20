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
 * small. It supports the comparators a deliberate range needs — `>=`, `>`,
 * `<=`, `<`, `=`, `^`, `~`, x-ranges, and space-separated intersections — and
 * refuses anything else loudly instead of passing it. An unsupported range is a
 * broken assertion, not a green build.
 *
 * Usage:
 *     node scripts/check-skill-meta.mjs          # report problems, exit 1
 *
 * Wired into CI as its own step, unconditional: `skills/` is prose, so a
 * documentation-only change skips the library checks — and this is exactly the
 * change that can stale the range.
 */

import { readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
const SKILL_FILE = join('skills', 'jsmind', 'SKILL.md');
const SKILL_DIR_NAME = basename(dirname(SKILL_FILE));

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
 * Parses `x.y.z` into comparable parts, filling a missing minor or patch.
 *
 * @param text - Version string.
 * @returns Parts, or null when the text is not a version.
 */
function parseVersion(text) {
    const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(text.trim());
    if (match === null) {
        return null;
    }
    return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

/**
 * Compares two parsed versions.
 *
 * @returns Negative, zero, or positive, like any comparator.
 */
function compare(left, right) {
    for (let index = 0; index < 3; index += 1) {
        if (left[index] !== right[index]) {
            return left[index] - right[index];
        }
    }
    return 0;
}

/**
 * Expands one range token into half-open comparator pairs.
 *
 * @param token - One space-separated part of the range.
 * @returns Comparator functions (version → boolean), or null when unsupported.
 */
function tokenComparators(token) {
    const caret = /^\^(\d+(?:\.\d+){0,2})$/.exec(token);
    if (caret !== null) {
        const floor = parseVersion(caret[1]);
        // A caret on major 0 would need the 0.x rules; nothing here asks for it,
        // and guessing is worse than refusing.
        if (floor === null || floor[0] === 0) {
            return null;
        }
        return [version => compare(version, floor) >= 0, version => version[0] === floor[0]];
    }

    const tilde = /^~(\d+(?:\.\d+){0,2})$/.exec(token);
    if (tilde !== null) {
        const floor = parseVersion(tilde[1]);
        if (floor === null) {
            return null;
        }
        return [
            version => compare(version, floor) >= 0,
            version => version[0] === floor[0] && version[1] === floor[1],
        ];
    }

    // x-ranges: `2`, `2.x`, `2.*` mean "any 2.x", which is a floor plus a cap.
    const xRange = /^(\d+)(?:\.(?:\d+|[xX*]))?(?:\.(?:[xX*]))?$/.exec(token);
    if (xRange !== null) {
        const major = Number(xRange[1]);
        return [version => version[0] >= major, version => version[0] === major];
    }

    const operator = /^(>=|<=|>|<|=)?(.+)$/.exec(token);
    if (operator === null) {
        return null;
    }
    const bound = parseVersion(operator[2]);
    if (bound === null) {
        return null;
    }
    switch (operator[1] ?? '=') {
        case '>=':
            return [version => compare(version, bound) >= 0];
        case '>':
            return [version => compare(version, bound) > 0];
        case '<=':
            return [version => compare(version, bound) <= 0];
        case '<':
            return [version => compare(version, bound) < 0];
        default:
            return [version => compare(version, bound) === 0];
    }
}

/**
 * Tests a version against a range expression.
 *
 * @param version - Version string from `package.json`.
 * @param range - Range expression from the frontmatter.
 * @returns True when the version satisfies every comparator.
 * @throws When the range uses syntax this checker does not implement.
 */
function satisfies(version, range) {
    const parsed = parseVersion(version);
    if (parsed === null) {
        throw new Error(`package.json version is not a version: ${version}`);
    }
    if (range.includes('||')) {
        throw new Error(`unsupported range syntax (||): ${range}`);
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
            throw new Error(`unsupported range syntax: ${token}`);
        }
        comparators.push(...expanded);
    }
    return comparators.every(predicate => predicate(parsed));
}

function main() {
    const problems = [];
    const add = (file, line, message) => {
        problems.push(`${file}${line === null ? '' : `:${line}`}: ${message}`);
    };

    const skillText = readFileSync(join(ROOT, SKILL_FILE), 'utf8');
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

    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
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

main();
