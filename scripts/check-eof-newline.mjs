#!/usr/bin/env node
/**
 * Require every tracked text file to end with a newline.
 *
 * A text file without a final newline is not a POSIX text file: `tail`, `cat`
 * and diff tooling chain badly, and git prints the noisy
 * "\ No newline at end of file" marker in every diff that touches the last
 * line. ESLint's `@stylistic/eol-last` enforces this for the file types it can
 * parse (TypeScript, JS, JSON, CSS); Markdown, Python, shell, YAML, HTML and
 * extension-less config files have no ESLint language plugin, so this script
 * checks the whole tracked set with the same rule.
 *
 * `git ls-files` is the source of the file list, so the repository itself
 * decides what counts: untracked scratch files and `tmp/` never fail the
 * check, while a file added to the index is checked before it is ever pushed.
 * Empty files and binaries are skipped — a binary has no end-of-line concept,
 * and a zero-byte file cannot violate one.
 *
 * Usage:
 *     node scripts/check-eof-newline.mjs          # report violations, exit 1
 *     node scripts/check-eof-newline.mjs --fix    # append the missing newline
 *
 * Both modes are wired into package.json: `npm run format-check` runs the check
 * (pre-push and CI run it too), and `npm run format` runs `--fix`.
 */

import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Same heuristic git uses: a NUL byte in the first 8000 bytes means binary.
const BINARY_SNIFF_LENGTH = 8000;
const NEWLINE_BYTE = 0x0a;
const NEWLINE = Buffer.from([NEWLINE_BYTE]);
const KNOWN_FLAGS = new Set(['--fix']);

function repoRoot() {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
}

function trackedFiles(root) {
    const raw = execFileSync('git', ['ls-files', '-z'], {
        cwd: root,
        encoding: 'buffer',
        maxBuffer: 64 * 1024 * 1024,
    });
    return raw.toString('utf8').split('\0')
        .filter(Boolean);
}

function isBinary(data) {
    return data.subarray(0, BINARY_SNIFF_LENGTH)
        .includes(0);
}

function main(argv) {
    const unknown = argv.filter(flag => !KNOWN_FLAGS.has(flag));
    if (unknown.length > 0) {
        console.error(`check-eof-newline: unknown argument(s): ${unknown.join(' ')}`);
        console.error('usage: node scripts/check-eof-newline.mjs [--fix]');
        return 2;
    }
    const fix = argv.includes('--fix');
    const root = repoRoot();
    const missing = [];
    let fixed = 0;

    for (const file of trackedFiles(root)) {
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
        if (isBinary(data) || data[data.length - 1] === NEWLINE_BYTE) {
            continue;
        }
        if (fix) {
            writeFileSync(path, Buffer.concat([data, NEWLINE]));
            fixed += 1;
            console.log(`fixed: ${file}`);
        }
        else {
            missing.push(file);
        }
    }

    if (missing.length > 0) {
        console.error(`${missing.length} tracked text file(s) do not end with a newline:`);
        for (const file of missing) {
            console.error(`  ${file}`);
        }
        console.error('Run `npm run format` to append the missing newline.');
        return 1;
    }

    if (fix) {
        console.log(`check-eof-newline: ${fixed} file(s) fixed`);
    }
    return 0;
}

process.exit(main(process.argv.slice(2)));
