/**
 * `jsmind context` — the agent's discovery step.
 *
 * @remarks
 * This is the only command allowed to fuzzy-match, because it is what an agent
 * runs before it knows any ids. Everything downstream takes ids only.
 *
 * Two constraints shape the output: ids come first so they can be copied
 * straight into the next command, and node text is flattened to one line so a
 * multi-line label cannot break the tree's shape.
 *
 * @packageDocumentation
 */

import { JmMindJsonSerializer } from '../../serialization/json.ts';
import type { JmNode } from '../../model/data/node.ts';
import type { JmMind } from '../../model/mind.ts';
import { readJsonFile } from '../io.ts';
import { describeStyle, formatSide, loadMindOrThrow } from '../shared.ts';
import { CliExit, dataError } from '../exit.ts';

/** Default number of levels shown below the root. */
const DEFAULT_DEPTH = 2;

/** Default truncation width for node text. */
const DEFAULT_MAX_TEXT = 40;

/** Options accepted by the context command. */
export interface ContextOptions {
    file: string;
    focus?: string;
    depth: number;
    maxText: number;
    fullText: boolean;
    idsOnly: boolean;
    asJson: boolean;
}

/**
 * Collapses a label to a single line.
 *
 * @param text - Raw node text.
 * @returns Text with every run of whitespace squeezed to one space.
 */
function flatten(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

/**
 * Truncates text to the configured width.
 *
 * @param text - Already flattened text.
 * @param maxText - Maximum characters.
 * @param fullText - When true, no truncation happens.
 * @returns The text, ending in an ellipsis when it was cut.
 */
function clip(text: string, maxText: number, fullText: boolean): string {
    if (fullText || text.length <= maxText) {
        return text;
    }
    // -1 so the ellipsis is inside the budget rather than on top of it.
    return `${text.slice(0, Math.max(0, maxText - 1))}…`;
}

/**
 * Reads a node's label as a string.
 *
 * @param node - Node to read.
 * @returns The text, or an empty string for non-text content.
 */
function textOf(node: JmNode): string {
    const value = node.content.value;
    return typeof value === 'string' ? value : '';
}

/**
 * Walks the tree depth-first, collecting ids by depth.
 *
 * @param root - Where to start.
 * @param depth - Levels to descend (0 = root only).
 * @returns Entries in display order.
 */
function outline(root: JmNode, depth: number): { node: JmNode; level: number }[] {
    const out: { node: JmNode; level: number }[] = [];

    const walk = (node: JmNode, level: number): void => {
        if (level > depth) {
            return;
        }
        out.push({ node, level });
        for (const child of node.children) {
            walk(child, level + 1);
        }
    };

    walk(root, 0);
    return out;
}

/**
 * Finds nodes whose text contains the focus string, case-insensitively.
 *
 * @param nodes - Every node to consider.
 * @param focus - Needle.
 * @returns Matches in document order.
 */
function matchNodes(nodes: JmNode[], focus: string): JmNode[] {
    const needle = focus.toLowerCase();
    return nodes.filter(node => flatten(textOf(node)).toLowerCase()
        .includes(needle));
}

/**
 * Collects every node reachable from the root.
 *
 * @param root - Root node.
 * @returns All nodes in depth-first order.
 */
function allNodes(root: JmNode): JmNode[] {
    const out: JmNode[] = [];
    const walk = (node: JmNode): void => {
        out.push(node);
        for (const child of node.children) {
            walk(child);
        }
    };
    walk(root);
    return out;
}

/**
 * Ranks suggestions for a focus string that matched nothing.
 *
 * @remarks
 * Scored by how many characters of the needle appear in order in the label —
 * a cheap resemblance measure that needs no dictionary and still puts the
 * obviously-closest candidates first.
 *
 * @param nodes - Candidates.
 * @param focus - The needle that missed.
 * @returns Up to five nodes, closest first.
 */
function suggest(nodes: JmNode[], focus: string): JmNode[] {
    const needle = focus.toLowerCase();

    const scored = nodes
        .map(node => {
            const label = flatten(textOf(node)).toLowerCase();
            let cursor = 0;
            let hits = 0;
            for (const char of needle) {
                const at = label.indexOf(char, cursor);
                if (at >= 0) {
                    hits += 1;
                    cursor = at + 1;
                }
            }
            return { node, hits };
        })
        .filter(entry => entry.hits > 0)
        .sort((a, b) => b.hits - a.hits || a.node.id.localeCompare(b.node.id))
        .map(entry => entry.node);

    if (scored.length > 0) {
        return scored.slice(0, 5);
    }

    // Nothing resembles the needle at all. Returning an empty list would leave
    // the agent with no ids and no next move, so fall back to the top of the
    // tree: shallow nodes are the most likely starting points for a second
    // attempt, and they are always cheap to show.
    return nodes.slice(0, 8);
}

/**
 * Flattens a nested style block to dotted keys.
 *
 * @param style - Style object, possibly nested.
 * @param prefix - Key prefix accumulated so far.
 * @returns Stringified values keyed by dotted path.
 * @remarks
 * A dotted key is the flag that set it, so a value shown here can be changed or
 * cleared by writing that same spelling back.
 */
function flattenStyle(style: Record<string, unknown>, prefix = ''): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(style)) {
        const path = prefix === '' ? key : `${prefix}.${key}`;
        if (value !== null && typeof value === 'object') {
            Object.assign(out, flattenStyle(value as Record<string, unknown>, path));
        } else {
            out[path] = String(value);
        }
    }
    return out;
}

/**
 * Summarises a node's state for the text output — side (when it is meaningful),
 * folded, and any style overrides.
 *
 * @param node - Node to summarise.
 * @param level - Depth in the printed tree: 0 is the root, 1 is a direct child
 *   of the root.
 * @returns A ` {side=left tone=danger}` suffix, or an empty string when the
 *   node has nothing to report.
 * @remarks
 * `side` is only meaningful for the root and the root's direct children, so it
 * is shown only when `level` is 0 or 1.  Deeper nodes inherit layout from their
 * ancestor on the root; printing `side` there would look like a fact the agent
 * should act on.  `folded` appears only when the node is collapsed, and style
 * overrides appear when the node differs from the theme.  After a parent is
 * moved to the other side, descendants are left alone: their stored `side` is
 * not rewritten, and it is not printed either.
 */
function stateSummary(node: JmNode, level: number): string {
    const parts: string[] = [];

    // side is only meaningful for the root and the root's direct children.
    if (level <= 1) {
        const sideLabel = formatSide(node.side);
        parts.push(`side=${sideLabel}`);
    }

    if (node.folded) {
        parts.push('folded');
    }

    const style = describeStyle(node.style);
    if (style !== null) {
        for (const [key, value] of Object.entries(flattenStyle(style))) {
            parts.push(`${key}=${value}`);
        }
    }

    if (parts.length === 0) {
        return '';
    }
    return ` {${parts.join(' ')}}`;
}

/**
 * Renders entries as aligned text.
 *
 * @param entries - Nodes with their depth.
 * @param options - Truncation settings.
 * @returns Lines ready to print.
 */
function renderTree(
    entries: { node: JmNode; level: number }[],
    options: ContextOptions
): string[] {
    const width = Math.max(...entries.map(entry => entry.node.id.length), 2);

    return entries.map(({ node, level }) => {
        const id = node.id.padEnd(width);
        if (options.idsOnly) {
            return id.trimEnd();
        }
        const label = clip(flatten(textOf(node)), options.maxText, options.fullText);
        // Three spaces per level, after the id column.
        return `${id}   ${'  '.repeat(level)}${label}${stateSummary(node, level)}`;
    });
}

/**
 * Runs the context command.
 *
 * @param options - Parsed options.
 * @returns Exit code.
 */
export function runContext(options: ContextOptions): number {
    const doc = readJsonFile(options.file);
    // Same loader as every other read path: a structural fault must surface as
    // InvalidData rather than escaping as a raw JsMindError and landing in the
    // generic exit-3 branch.
    const mind: JmMind = loadMindOrThrow(new JmMindJsonSerializer(), doc, options.file);
    const root = mind.findNodeById(mind.root?.id ?? '');

    if (root === null) {
        throw dataError(`Cannot locate the root node in ${options.file}`);
    }

    const every = allNodes(root);

    // --focus: show matches and their surrounding structure.
    if (options.focus !== undefined && options.focus.length > 0) {
        const matches = matchNodes(every, options.focus);

        if (matches.length === 0) {
            const candidates = suggest(every, options.focus);
            if (options.asJson) {
                process.stdout.write(
                    `${JSON.stringify(
                        {
                            matched: false,
                            focus: options.focus,
                            candidates: candidates.map(node => ({
                                id: node.id,
                                text: clip(flatten(textOf(node)), options.maxText, options.fullText),
                            })),
                        },
                        null,
                        2
                    )}\n`
                );
            } else {
                process.stderr.write(`No node matches "${options.focus}".`);
                if (candidates.length > 0) {
                    process.stderr.write(' Candidates from the top of the tree:\n');
                    for (const node of candidates) {
                        const label = clip(flatten(textOf(node)), options.maxText, options.fullText);
                        process.stderr.write(`  ${node.id.padEnd(6)} ${label}\n`);
                    }
                } else {
                    process.stderr.write('\n');
                }
            }
            // A miss is not a data error: the file is fine, the search found
            // nothing. Usage stays 0 so an agent can read the candidates and
            // carry on rather than treating it as a failed run.
            return CliExit.Ok;
        }

        // Show each match plus its ancestors, so the agent sees where it sits.
        const shown = new Set<string>();
        const entries: { node: JmNode; level: number }[] = [];
        for (const match of matches) {
            const chain: JmNode[] = [];
            let cursor: JmNode | null = match;
            while (cursor !== null) {
                chain.unshift(cursor);
                cursor = cursor.parent;
            }
            chain.forEach((node, level) => {
                if (shown.has(node.id)) {
                    return;
                }
                shown.add(node.id);
                entries.push({ node, level });
            });
        }

        emit(entries, options);
        return CliExit.Ok;
    }

    emit(outline(root, options.depth), options);
    return CliExit.Ok;
}

/**
 * Writes entries in the requested shape.
 *
 * @param entries - Nodes with depth.
 * @param options - Output settings.
 */
function emit(entries: { node: JmNode; level: number }[], options: ContextOptions): void {
    if (options.asJson) {
        const payload = entries.map(({ node, level }) => {
            const entry: Record<string, unknown> = {
                id: node.id,
                level,
                text: options.idsOnly
                    ? undefined
                    : clip(flatten(textOf(node)), options.maxText, options.fullText),
            };
            // Same rule as the text output: side only for the root and its
            // direct children. Deeper nodes keep whatever side is stored; it
            // is just not printed, and it is not rewritten when a parent moves.
            if (level <= 1) {
                entry.side = formatSide(node.side);
            }
            if (node.folded) {
                entry.folded = true;
            }
            // Only when the node overrides something. A style block records the
            // difference from the theme, so a node that overrode nothing would
            // contribute the same absent entry every time - length for
            // information the theme already implies, on an output an agent reads
            // at every step.
            const style = describeStyle(node.style);
            if (style !== null) {
                entry.style = style;
            }
            return entry;
        });
        process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
        return;
    }

    for (const line of renderTree(entries, options)) {
        process.stdout.write(`${line}\n`);
    }
}

/** Default depth, re-exported for the dispatcher. */
export { DEFAULT_DEPTH, DEFAULT_MAX_TEXT };

/**
 * Describes the context command for `--help`.
 */
export const contextHelp = `jsmind context <file> [options]

Discovery step: shows the tree so an agent can find the ids it needs.

  --focus <text>    Fuzzy-match node text; shows matches with their ancestors
  --depth <n>       Levels below the root to show (default ${DEFAULT_DEPTH})
  --max-text <n>    Truncate labels at n characters (default ${DEFAULT_MAX_TEXT})
  --full-text       Do not truncate
  --ids-only        Print ids only
  --json            Machine-readable output

Ids are printed in a left-aligned column so they can be copied into the next
command. Multi-line labels are flattened, and truncation ends in an ellipsis.
Each line may end with a {…} block. side is shown only for the root and the
root's direct children. folded appears when the node is collapsed, and style
overrides appear when the node differs from the theme.

When --focus matches nothing, the closest candidates are listed instead.`;
