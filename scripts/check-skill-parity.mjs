#!/usr/bin/env node
/**
 * Keep the two copies of the jsmind agent skill in step.
 *
 * `skills/jsmind/SKILL.md` and `skills/jsmind/SKILL.zh.md` are a 1:1 translation
 * pair: the English file is what an agent loads, the Chinese file is the same
 * rules for a human reader. Nothing in the build notices when one is edited and
 * the other is not, and a rule that is only half translated means the Chinese
 * reader acts on a rule the English file no longer holds — the two drifted once
 * already, silently.
 *
 * What is compared, and why each part is a real signal:
 *
 *   headings  the sequence of heading levels. A section added, removed or
 *             re-levelled on one side only shows up here.
 *   fences    the code blocks, in order, with the number of lines in each.
 *             The example sessions are verbatim CLI runs, so a block that
 *             grows on one side only is drift, not translation. This is also
 *             how the unfenced usage list (a block of command shapes, not a
 *             run) is covered without parsing it.
 *   commands  every `$ …` line, normalized. Example ids and quoted labels are
 *             expected to differ — the two files come from separate real runs —
 *             so `jm-…` collapses to `<id>` and `"…"` to `<text>` before the
 *             comparison. What survives is the command itself: subcommand,
 *             paths, flags, flag values.
 *
 * Usage:
 *     node scripts/check-skill-parity.mjs                 # check this checkout
 *     node scripts/check-skill-parity.mjs --dir <path>    # check another pair
 *
 * Exit codes: 0 in step, 1 drifted, 2 bad usage. `npm test` runs it against
 * this repository, so drift fails the suite instead of waiting for a reviewer
 * to notice that one file moved and the other did not.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ENGLISH = 'SKILL.md';
const CHINESE = 'SKILL.zh.md';

/**
 * Example ids and example labels differ between the two files on purpose: each
 * one records a separate run. Normalizing them away is what leaves the command
 * itself comparable.
 */
function normalizeCommand(command) {
    return command
        .replace(/jm-[a-z0-9]+/g, '<id>')
        .replace(/"[^"]*"/g, '<text>')
        .replace(/\(\s*[\d.]+ (?:KB|MB)\s*\)/g, '(<size>)')
        .replace(/\s+/g, ' ')
        .trim();
}

function parse(text) {
    const headings = [];
    const blocks = [];
    const commands = [];
    let block = null;

    for (const raw of text.split('\n')) {
        const line = raw.replace(/\s+$/, '');
        const fence = /^```(.*)$/.exec(line);
        if (fence) {
            if (block) {
                blocks.push({ language: block.language, lines: block.lines.length });
                block = null;
            }
            else {
                block = { language: fence[1].trim(), lines: [] };
            }
            continue;
        }
        if (block) {
            block.lines.push(line);
            const command = /^\$ (.*)$/.exec(line);
            if (command) {
                commands.push(normalizeCommand(command[1]));
            }
            continue;
        }
        const heading = /^(#{1,6}) /.exec(line);
        if (heading) {
            headings.push(heading[1].length);
        }
    }

    return { headings, blocks, commands, unclosed: block !== null };
}

function describeHeadings(levels) {
    return levels.map(level => (typeof level === 'string' ? level : `h${level}`))
        .join(' ');
}

function firstDifference(left, right) {
    const shared = Math.min(left.length, right.length);
    for (let index = 0; index < shared; index += 1) {
        if (left[index] !== right[index]) {
            return index;
        }
    }
    return left.length === right.length ? -1 : shared;
}

function compare(label, left, right, key, render, complaints) {
    const leftKeys = left.map(key);
    const rightKeys = right.map(key);
    const at = firstDifference(leftKeys, rightKeys);
    if (at === -1) {
        return;
    }
    complaints.push(`${label} differ from index ${at + 1}:`);
    complaints.push(`  ${ENGLISH}: ${leftKeys.length} (${render(leftKeys)})`);
    complaints.push(`  ${CHINESE}: ${rightKeys.length} (${render(rightKeys)})`);
    // `at` is the position where they part, which is one past the end when one
    // list is a prefix of the other. Say that instead of printing undefined.
    const show = (keys, index) => render([index < keys.length ? keys[index] : '(ends here)']);
    complaints.push(`  at that position: ${show(leftKeys, at)} vs ${show(rightKeys, at)}`);
}

function main(argv) {
    let dir = join(ROOT, 'skills/jsmind');
    const rest = [];
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === '--dir') {
            const value = argv[index + 1];
            if (!value) {
                console.error('check-skill-parity: --dir needs a path');
                return 2;
            }
            dir = value;
            index += 1;
        }
        else {
            rest.push(argv[index]);
        }
    }
    if (rest.length > 0) {
        console.error(`check-skill-parity: unknown argument(s): ${rest.join(' ')}`);
        console.error('usage: node scripts/check-skill-parity.mjs [--dir <path>]');
        return 2;
    }

    const paths = [join(dir, ENGLISH), join(dir, CHINESE)];
    const missing = paths.filter(path => !existsSync(path));
    if (missing.length > 0) {
        console.error(`check-skill-parity: missing ${missing.join(', ')}`);
        return 2;
    }

    const english = parse(readFileSync(paths[0], 'utf8'));
    const chinese = parse(readFileSync(paths[1], 'utf8'));
    if (english.unclosed || chinese.unclosed) {
        const which = english.unclosed ? ENGLISH : CHINESE;
        console.error(`check-skill-parity: ${which} has an unclosed code fence`);
        return 1;
    }

    const complaints = [];
    compare('headings', english.headings, chinese.headings, level => level, describeHeadings, complaints);
    compare(
        'code blocks',
        english.blocks,
        chinese.blocks,
        block => `${block.language || 'plain'}:${block.lines}`,
        keys => keys.join(' '),
        complaints,
    );
    compare('commands', english.commands, chinese.commands, command => command, keys => JSON.stringify(keys), complaints);

    if (complaints.length > 0) {
        console.error(`${ENGLISH} and ${CHINESE} have drifted apart:`);
        for (const line of complaints) {
            console.error(`  ${line}`);
        }
        console.error('Both files carry the same rules. Edit the one that is behind.');
        return 1;
    }

    console.log(
        `check-skill-parity: ${english.headings.length} headings, `
        + `${english.blocks.length} code blocks, ${english.commands.length} commands in step`,
    );
    return 0;
}

process.exit(main(process.argv.slice(2)));
