#!/usr/bin/env node
/**
 * Refuse a pull request whose type claims an effect the diff does not have.
 *
 * A type is only useful if it means something a machine can check. `feat` used
 * to mean "the author picked this prefix", so `scripts/release/notes.mjs`
 * listed a webhook fix next to a fix to the exported image and the 2.1.0
 * release notes had to be rewritten by hand. The rule is
 * `team/development/commit-types.md`: a type describes the effect on the
 * shipped artifact, `package.json` `files` ships `dist/`, and `dist/` is
 * compiled from `src/`.
 *
 * **The table is the single source of truth, so this script reads it.**
 * The type names and their paths come out of the markdown table at run time,
 * which means adding a type or narrowing a path is one edit in the document.
 * The four checked rows are the narrow ones (`feat`, `fix`, `refactor`,
 * `docs`); every other type is left alone on purpose, because the catch-all
 * `team` has to stay usable for a change that genuinely spans several kinds,
 * and a path requirement on it would leave mixed pull requests with no legal
 * type at all. A type that is not in the table at all is reported as a
 * warning, not a failure: the historical `build` / `ci` prefixes, and
 * whatever a dependency bot writes, must not turn a PR red for a reason this
 * check is not about.
 *
 * Because the table is read, a table that stops parsing has to stop the
 * check loudly rather than quietly pass everything - see `loadTypeRows`.
 *
 * Usage:
 *     node scripts/check-commit-type.mjs --base <sha> --head <sha>
 *     node scripts/check-commit-type.mjs --files <path> [...] [--title <title>]
 *
 * `--table <path>` points the check at another copy of the table; the tests
 * use it to prove that a table it cannot read fails instead of passing. CI
 * always reads `team/development/commit-types.md`.
 *
 * The title comes from `--title` or, in Actions, from `PR_TITLE`. Exit 0 is a
 * pass, 1 a violation, 2 bad usage.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TABLE = fileURLToPath(new URL('../team/development/commit-types.md', import.meta.url));

/**
 * The types whose meaning is narrow enough to compare with a diff. Their paths
 * are not written here: they come from the table.
 */
export const CHECKED_TYPES = ['feat', 'fix', 'refactor', 'docs'];

/** `<type>(<scope>)!:` - the scope and the breaking marker are both optional. */
const TITLE = /^([a-z][a-z0-9-]*)(?:\(([^()]*)\))?(!)?:[ \t]+(\S.*)$/;
/** `| \`feat\` | meaning | \`path\`, \`path\` |` */
const TABLE_ROW = /^\|\s*`([a-z][a-z0-9-]*)`\s*\|[^|]*\|([^|]*)\|\s*$/;
const BACKTICKED = /`([^`]+)`/g;
/** A failed check lists the diff, but a 300-file diff does not need 300 lines. */
const MAX_LISTED = 20;
const USAGE = [
    'usage: node scripts/check-commit-type.mjs --base <sha> --head <sha>',
    '       node scripts/check-commit-type.mjs --files <path> [...] [--title <title>]',
].join('\n');

/** `{a,b}` inside a path spec: `docs/{zh,en}/guide` -> two specs. */
function expandBraces(spec) {
    const open = spec.indexOf('{');
    if (open === -1) {
        return [spec];
    }
    const close = spec.indexOf('}', open);
    if (close === -1) {
        return [spec];
    }
    const head = spec.slice(0, open);
    const tail = spec.slice(close + 1);
    return spec.slice(open + 1, close)
        .split(',')
        .flatMap(option => expandBraces(`${head}${option}${tail}`));
}

/**
 * The path specs in one table cell. Everything in backticks is a path; prose
 * in the same cell is ignored.
 */
export function parsePaths(cell) {
    const specs = [];
    for (const match of cell.matchAll(BACKTICKED)) {
        specs.push(...expandBraces(match[1]));
    }
    return specs;
}

/**
 * The type rows of the table: `[{ type, paths }]`.
 *
 * Deliberately dumb about markdown and deliberately strict about the shape it
 * needs: a row is three cells with the type in the first one, in backticks.
 */
export function parseTable(markdown) {
    const rows = [];
    for (const line of markdown.split('\n')) {
        const match = TABLE_ROW.exec(line);
        if (match) {
            rows.push({ type: match[1], paths: parsePaths(match[2]) });
        }
    }
    return rows;
}

/**
 * Does `file` fall under a path spec from the table?
 *
 * `x/**` and a bare directory (`docs/zh/guide`) are prefixes; a spec with an
 * extension (`package.json`, `AGENTS.md`) is one file. A single `*` inside a
 * segment is matched as a prefix up to the star, which is all this table uses.
 */
export function matchesPath(file, spec) {
    if (spec.endsWith('/**')) {
        return file.startsWith(spec.slice(0, -2));
    }
    const star = spec.indexOf('*');
    if (star !== -1) {
        return file.startsWith(spec.slice(0, star));
    }
    if (/\.[a-z0-9]+$/.test(spec)) {
        return file === spec;
    }
    return file.startsWith(`${spec}/`);
}

function describePaths(paths) {
    return paths.map(path => `\`${path}\``)
        .join(', ');
}

/** The sentence a red check prints. It names the rule, not just the mismatch. */
function mismatch(type, paths, files) {
    const what = {
        docs: '`docs` names documentation a user of the artifact reads, but none of the changed files is one',
        default: `\`${type}\` names a change to the shipped artifact, but no changed file is one`,
    };
    const why = {
        docs: 'Requirements, design notes, conventions and team process are not `docs`; they are `team`.',
        default: 'A type describes the effect on what `npm i jsmind` installs: `package.json` `files`\nships `dist/`, and only `src/` is compiled into it.',
    };
    const list = files.length === 0
        ? '(none)'
        : files.slice(0, MAX_LISTED).join('\n  ') + (files.length > MAX_LISTED ? `\n  ... and ${files.length - MAX_LISTED} more` : '');
    return [
        `${what[type] ?? what.default} (expected one of: ${describePaths(paths)}).`,
        '',
        why[type] ?? why.default,
        'The rule and the type table are in `team/development/commit-types.md`.',
        '',
        `Changed files (${files.length}):`,
        `  ${list}`,
        '',
        'Give this pull request the type its diff actually has (`team`, `tooling`, `devops`,',
        '`deps`, `skill`, `test`, `release`, ...), or move the production change into it.',
    ].join('\n');
}

/**
 * @returns {{ type: string|null, errors: string[], warnings: string[] }}
 */
export function checkTitleType({ title, files, rows }) {
    const errors = [];
    const warnings = [];

    const parsed = TITLE.exec(title.trim());
    if (!parsed) {
        errors.push([
            `the pull request title ${JSON.stringify(title)} has no type.`,
            '',
            'A type is a claim about what the change does to the shipped artifact, and this check',
            'reads it from the title. Write `<type>(<scope>): <subject>`, with the type from',
            '`team/development/commit-types.md`.',
        ].join('\n'));
        return { type: null, errors, warnings };
    }

    const type = parsed[1];
    const row = rows.find(candidate => candidate.type === type);
    if (!row) {
        warnings.push([
            `\`${type}\` is not one of the commit types in team/development/commit-types.md.`,
            'It is not checked against the diff. Historical `build` / `ci` / `chore` prefixes and',
            'dependency bots pass this way; `deps` is the type a dependency bump should carry.',
        ].join('\n'));
        return { type, errors, warnings };
    }

    if (!CHECKED_TYPES.includes(type)) {
        return { type, errors, warnings };
    }

    const matched = files.some(file => row.paths.some(spec => matchesPath(file, spec)));
    if (!matched) {
        errors.push(mismatch(type, row.paths, files));
    }
    return { type, errors, warnings };
}

/**
 * git exports GIT_DIR and friends to hooks, which would point this check at a
 * different repository than the working tree. Resolve from the filesystem.
 */
function git(args) {
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
        if (key.startsWith('GIT_')) {
            delete env[key];
        }
    }
    return execFileSync('git', args, { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function changedFiles(base, head) {
    return git(['diff', '--name-only', `${base}...${head}`])
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
}

/**
 * The table, or a failure. Reading the table is what keeps the document the
 * single source; it is also why the shape of the table matters to a machine,
 * and why a table that no longer parses must fail instead of checking nothing.
 */
function loadTypeRows(tablePath) {
    let markdown;
    try {
        markdown = readFileSync(tablePath, 'utf8');
    }
    catch (error) {
        console.error(`check-commit-type: cannot read the type table at ${tablePath}: ${error.message}`);
        return null;
    }

    const rows = parseTable(markdown);
    const missing = CHECKED_TYPES.filter(type => !rows.some(row => row.type === type && row.paths.length > 0));
    if (missing.length > 0) {
        console.error(`check-commit-type: the table in team/development/commit-types.md has no path row for: ${missing.join(', ')}.`);
        console.error('');
        console.error('This check reads that table, so a row it needs has to keep its shape:');
        console.error('  | `type` | meaning | `path`, `path` |');
        console.error('Fix the table, or update scripts/check-commit-type.mjs - silently passing');
        console.error('every pull request is the one outcome not allowed here.');
        return null;
    }
    return rows;
}

function main(argv) {
    let title = process.env.PR_TITLE ?? '';
    let files = null;
    let base = '';
    let head = '';
    let table = TABLE;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--title') {
            title = argv[index + 1] ?? '';
            index += 1;
        }
        else if (arg === '--base') {
            base = argv[index + 1] ?? '';
            index += 1;
        }
        else if (arg === '--head') {
            head = argv[index + 1] ?? '';
            index += 1;
        }
        else if (arg === '--table') {
            table = argv[index + 1] ?? '';
            index += 1;
        }
        else if (arg === '--files') {
            files = files ?? [];
            while (index + 1 < argv.length && !argv[index + 1].startsWith('--')) {
                files.push(argv[index + 1]);
                index += 1;
            }
        }
        else {
            console.error(`check-commit-type: unknown argument ${JSON.stringify(arg)}`);
            console.error(USAGE);
            return 2;
        }
    }

    if (title.trim() === '') {
        console.error('check-commit-type: no pull request title (--title or PR_TITLE).');
        console.error(USAGE);
        return 2;
    }

    if (files === null) {
        if (!base || !head) {
            console.error('check-commit-type: pass --files, or --base and --head for the diff.');
            console.error(USAGE);
            return 2;
        }
        try {
            files = changedFiles(base, head);
        }
        catch (error) {
            // Passing here would mean "the diff could not be read, so the type
            // is fine" - the one answer a gate must never give.
            console.error(`check-commit-type: could not diff ${base}...${head}: ${error.message}`);
            return 1;
        }
    }

    const rows = loadTypeRows(table);
    if (rows === null) {
        return 1;
    }

    const { type, errors, warnings } = checkTitleType({ title, files, rows });
    for (const warning of warnings) {
        console.error(`check-commit-type: warning: ${warning}`);
    }
    if (errors.length > 0) {
        for (const error of errors) {
            console.error(`check-commit-type: ${error}`);
        }
        return 1;
    }
    console.log(`check-commit-type: \`${type}\` is consistent with the ${files.length} changed file(s).`);
    return 0;
}

process.exit(main(process.argv.slice(2)));
