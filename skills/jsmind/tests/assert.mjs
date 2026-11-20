#!/usr/bin/env node
/**
 * Checks one fixture's result, mechanically.
 *
 * The two fixtures next to this file describe a task in words and the tree that
 * answers it. An agent reads the prompt and builds the map; this script says
 * whether the map is the one the prompt asked for. It is the difference between
 * "the agent said it worked" and "the tree has the nodes it was told to build".
 *
 * What it can check, and what it cannot:
 *
 *   - Structure — root label, first-level branches, their children, sides, and
 *     labels that must be gone. Read back through `context --json`, which is the
 *     same command the skill tells the agent to use, so the assertion does not
 *     depend on the on-disk schema.
 *   - `validate` passing, and the PNG existing with PNG bytes.
 *   - NOT the four picture checks. "Text is not crushed" and "lines do not
 *     cross" need a pair of eyes on the image, and a script that claimed to
 *     check them would be lying. The fixture run is done when this passes and
 *     someone has looked at the PNG.
 *
 * Usage:
 *     node skills/jsmind/tests/assert.mjs build  <map.json> <out.png>
 *     node skills/jsmind/tests/assert.mjs change <map.json> <out.png>
 *
 * `--cli <path>` (or `JSMIND_CLI`) points the check at a different CLI binary;
 * the default is this checkout's `dist/cli.js`, which means `npm run build` has
 * to have run.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(join(HERE, '..', '..', '..'));
const DEFAULT_CLI = join(REPO_ROOT, 'dist', 'cli.js');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** A real rendered map is far bigger than this; an empty file is not a picture. */
const MIN_PNG_BYTES = 5000;

/**
 * Normalises a label for comparison.
 *
 * @param text - Label as written.
 * @returns Lower-cased, whitespace-collapsed text.
 * @remarks
 * Case and spacing are presentation: an agent that writes "In-memory" where the
 * fixture says "in-memory" has understood the task. Wording is not.
 */
function normalise(text) {
    return String(text ?? '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Splits argv into the fixture name, the paths, and the CLI override.
 *
 * @param argv - `process.argv.slice(2)`.
 * @returns Parsed arguments.
 */
function parseArgs(argv) {
    const positional = [];
    let cli = process.env.JSMIND_CLI ?? DEFAULT_CLI;
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === '--cli') {
            cli = argv[index + 1];
            index += 1;
            continue;
        }
        positional.push(argv[index]);
    }
    const [fixture, map, png] = positional;
    if (fixture === undefined || map === undefined || png === undefined) {
        console.error('usage: node skills/jsmind/tests/assert.mjs <build|change> <map.json> <out.png>');
        process.exit(2);
    }
    return {fixture, map, png, cli};
}

/**
 * Runs the CLI and returns its exit code and stdout.
 *
 * @param cli - Path to the CLI binary.
 * @param args - Arguments after the binary.
 * @returns Exit status and captured stdout.
 */
function runCli(cli, args) {
    try {
        const stdout = execFileSync(process.execPath, [cli, ...args], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return {status: 0, stdout};
    } catch (error) {
        return {
            status: typeof error.status === 'number' ? error.status : 1,
            stdout: typeof error.stdout === 'string' ? error.stdout : '',
        };
    }
}

/**
 * Rebuilds the tree from `context --json` output.
 *
 * @param entries - The `nodes` array: `{id, level, text, side?}` in document
 *   order, level 0 first.
 * @returns The root node with `children` arrays.
 */
function treeFromContext(entries) {
    const virtual = {children: []};
    const stack = [virtual];
    for (const entry of entries) {
        while (stack.length > entry.level + 1) {
            stack.pop();
        }
        const node = {id: entry.id, text: entry.text, side: entry.side, children: []};
        stack[stack.length - 1].children.push(node);
        stack.push(node);
    }
    const [root] = virtual.children;
    return root;
}

/**
 * Locates a direct child by label.
 *
 * @param node - Parent.
 * @param text - Expected label.
 * @returns The child, or undefined.
 */
function childByText(node, text) {
    const wanted = normalise(text);
    return node.children.find(child => normalise(child.text) === wanted);
}

/** Collects every label in the tree. */
function allLabels(node) {
    return [normalise(node.text), ...node.children.flatMap(child => allLabels(child))];
}

function main() {
    const {fixture, map, png, cli} = parseArgs(process.argv.slice(2));
    const plan = JSON.parse(readFileSync(join(HERE, `${fixture}.fixture.json`), 'utf8'));

    const checks = [];
    const check = (description, run) => {
        let failure = null;
        try {
            failure = run();
        } catch (error) {
            failure = error.message;
        }
        checks.push({description, failure});
    };

    check(`validate exits 0 for ${map}`, () => {
        const {status, stdout} = runCli(cli, ['validate', map]);
        return status === 0 ? null : `exit ${status}: ${stdout.trim()}`;
    });

    let tree = null;
    check('context --json parses into a tree', () => {
        const {status, stdout} = runCli(cli, ['context', map, '--json', '--depth', '99']);
        if (status !== 0) {
            return `exit ${status}`;
        }
        tree = treeFromContext(JSON.parse(stdout).nodes);
        return tree === null ? 'no root' : null;
    });

    if (tree !== null) {
        check(`root label contains ${JSON.stringify(plan.expect.root)}`, () => {
            return normalise(tree.text).includes(normalise(plan.expect.root))
                ? null
                : `root is ${JSON.stringify(tree.text)}`;
        });

        for (const branch of plan.expect.tree) {
            check(`${JSON.stringify(branch.text)} is a child of the root`, () => {
                return childByText(tree, branch.text) === undefined
                    ? `root's children are ${JSON.stringify(tree.children.map(child => child.text))}`
                    : null;
            });

            const node = childByText(tree, branch.text);
            if (node === undefined) {
                continue;
            }

            if (branch.side !== undefined) {
                check(`${JSON.stringify(branch.text)} is on the ${branch.side}`, () => {
                    return node.side === branch.side
                        ? null
                        : `side is ${JSON.stringify(node.side)}`;
                });
            }

            const want = branch.children.map(normalise).sort();
            check(`children of ${JSON.stringify(branch.text)} are ${JSON.stringify(branch.children)}`, () => {
                const have = node.children.map(child => normalise(child.text)).sort();
                return JSON.stringify(have) === JSON.stringify(want)
                    ? null
                    : `have ${JSON.stringify(node.children.map(child => child.text))}`;
            });
        }

        if (plan.expect.both_sides === true) {
            check('both sides of the root carry a branch', () => {
                const sides = new Set(tree.children.map(child => child.side));
                return sides.has('left') && sides.has('right')
                    ? null
                    : `sides are ${JSON.stringify([...sides])}`;
            });
        }

        for (const gone of plan.expect.absent ?? []) {
            check(`${JSON.stringify(gone)} is gone`, () => {
                return allLabels(tree).includes(normalise(gone))
                    ? `still present`
                    : null;
            });
        }
    }

    check(`${png} is a PNG of at least ${MIN_PNG_BYTES} bytes`, () => {
        let bytes;
        try {
            bytes = readFileSync(png);
        } catch {
            return 'cannot read the file';
        }
        if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
            return 'does not start with the PNG signature';
        }
        return bytes.length >= MIN_PNG_BYTES ? null : `only ${bytes.length} bytes`;
    });

    const failed = checks.filter(entry => entry.failure !== null);
    checks.forEach((entry, index) => {
        if (entry.failure === null) {
            console.log(`ok ${index + 1} - ${entry.description}`);
        } else {
            console.log(`not ok ${index + 1} - ${entry.description}: ${entry.failure}`);
        }
    });
    console.log(`1..${checks.length}`);
    console.log(`# ${checks.length - failed.length} passed, ${failed.length} failed`);
    if (failed.length > 0) {
        console.log('');
        console.log('# Structure only. The four picture checks still need a look at the PNG:');
        console.log('# text not crushed, no side overloaded, nothing folded that must be open,');
        console.log('# no crossing lines.');
        process.exitCode = 1;
    }
}

main();
