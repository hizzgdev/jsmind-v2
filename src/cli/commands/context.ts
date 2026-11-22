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
import { JmTone, type JmStyle } from '../../model/data/style.ts';
import { readJsonFile } from '../io.ts';
import { describeStyle, formatSide, loadMindOrThrow } from '../shared.ts';
import { CliExit, dataError, usageError } from '../exit.ts';

/** Default number of levels shown below the root. */
const DEFAULT_DEPTH = 2;

/** Default truncation width for node text. */
const DEFAULT_MAX_TEXT = 40;

/**
 * Options `context` reads, beyond the global ones.
 *
 * @remarks
 * Declared for the allow-list in `../options.ts`. `--json` is not here: it is
 * global, like every output-format switch.
 */
export const CONTEXT_OPTIONS = [
    'focus',
    'depth',
    'max-text',
    'full-text',
    'ids-only',
    'highlight',
] as const;

/** Options accepted by the context command. */
export interface ContextOptions {
    file: string;
    focus?: string;
    depth: number;
    maxText: number;
    fullText: boolean;
    idsOnly: boolean;
    asJson: boolean;
    /**
     * Labels to locate by exact text, in the order they were given.
     *
     * @remarks
     * Repeated `--highlight` flags arrive here as a list. Locating by text is
     * the one thing an agent knows before it knows any id; it does not change
     * what any later command targets, so ids are still what gets copied out.
     */
    highlight?: string[];
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
 * A node together with its depth in the printed tree.
 *
 * @remarks
 * Both outputs report nodes through this pair, so a node described in the
 * `highlighted` block and the same node in `nodes` cannot drift apart: one
 * function builds both.
 */
interface ContextEntry {
    /** The node itself. */
    node: JmNode;
    /** 0 for the root, 1 for a direct child of the root, and so on. */
    level: number;
}

/**
 * Depth of a node, counted from the root.
 *
 * @param node - Node to measure.
 * @returns Levels between the root and this node.
 */
function depthOf(node: JmNode): number {
    let level = 0;
    let cursor: JmNode | null = node.parent;
    while (cursor !== null) {
        level += 1;
        cursor = cursor.parent;
    }
    return level;
}

/**
 * Renders the id chain from the root down to a node.
 *
 * @param node - Deepest node in the chain.
 * @returns Ids quoted and joined with `/`, e.g. `"root"/"jm-a1"`.
 * @remarks
 * The full chain rather than the bare id: a bare id cannot be checked against
 * anything on screen, while the path shows where the label was found.
 */
function idPath(node: JmNode): string {
    const chain: string[] = [];
    let cursor: JmNode | null = node;
    while (cursor !== null) {
        chain.unshift(`"${cursor.id}"`);
        cursor = cursor.parent;
    }
    return chain.join('/');
}

/**
 * One requested highlight and what it resolved to.
 */
interface Highlight {
    /** The text the caller asked for, echoed unchanged. */
    text: string;
    /** The first node carrying that exact label, or `null` on a miss. */
    entry: ContextEntry | null;
    /** How many nodes carry that exact label. */
    matches: number;
}

/**
 * Resolves label requests against the whole document.
 *
 * @param nodes - Every node, in document order.
 * @param requests - Labels to look up, already de-duplicated.
 * @returns One result per request, in the order asked.
 * @remarks
 * Matching is exact and case-sensitive against the label as printed (flattened
 * whitespace): a near-miss is reported as a miss rather than guessed at, since
 * the caller's next move is an id and a guessed id edits the wrong node.
 *
 * The search is the whole document, not the levels `--depth` prints. That is
 * the point of the flag: the target may be deeper than a readable tree.
 *
 * A label carried by more than one node resolves to the first in document
 * order. The count travels with the result so callers can tell a unique hit
 * from an ambiguous one and go narrow it down with `--focus`.
 */
function resolveHighlights(nodes: JmNode[], requests: string[]): Highlight[] {
    return requests.map(text => {
        const hits = nodes.filter(node => flatten(textOf(node)) === text);
        const first = hits[0];
        return {
            text,
            entry: first === undefined ? null : { node: first, level: depthOf(first) },
            matches: hits.length,
        };
    });
}

/**
 * Walks the tree depth-first, collecting ids by depth.
 *
 * @param root - Where to start.
 * @param depth - Levels to descend (0 = root only).
 * @returns Entries in display order.
 */
function outline(root: JmNode, depth: number): ContextEntry[] {
    const out: ContextEntry[] = [];

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
 * Sections of `mind.style` that can carry a value, in the order the type
 * declares them.
 *
 * @remarks
 * Every field of the declaration except `theme`, which is reported separately
 * as the preset this block inherits from. Listing them lets the summary say
 * *what* the file sets without restating every value — the agent then knows
 * which part of the theme to go and read.
 */
const STYLE_SECTIONS = ['defaultTone', 'background', 'tones', 'node', 'line', 'expander'] as const;

/**
 * A document style as the discovery output reports it.
 */
interface DocumentStyleSummary {
    /** Preset the document inherits from, resolved (`"default"` when unnamed). */
    theme: string;
    /** Tone every node without one of its own wears, resolved. */
    defaultTone: string;
    /** Sections the document actually overrides. */
    overrides: string[];
}

/**
 * Reads the document-level style into the shape both outputs print.
 *
 * @param style - The document's style declaration.
 * @returns Theme name, resolved default tone, and the overridden sections.
 * @remarks
 * `theme` and `defaultTone` are reported resolved rather than as stored: the
 * question discovery answers is "what does this file look like", and a reader
 * should not have to know that an absent `theme` means `"default"`. The
 * overrides list stays as stored, because that is where the values are.
 */
function describeMindStyle(style: JmStyle): DocumentStyleSummary {
    return {
        theme: style.theme ?? 'default',
        defaultTone: style.defaultTone ?? JmTone.Default,
        overrides: STYLE_SECTIONS.filter(section => style[section] !== undefined),
    };
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
function renderTree(entries: ContextEntry[], options: ContextOptions): string[] {
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
 * Describes one node for `--json`.
 *
 * @param entry - The node and its depth.
 * @param options - Truncation settings.
 * @returns The node object both the tree and the highlighted block carry.
 * @remarks
 * One builder for both sections: `highlighted` exists so a caller does not have
 * to search `nodes` afterwards, and that only holds if the two are the same
 * shape.
 *
 * `parentId` is always present — `null` on the root. `level` can be inferred
 * from the depth of a label in the text form, but the array in `--json` is
 * flat, so a parent link is the only way to read the structure without
 * rebuilding it from the order of the levels.
 */
function describeEntry(entry: ContextEntry, options: ContextOptions): Record<string, unknown> {
    const { node, level } = entry;
    const described: Record<string, unknown> = {
        id: node.id,
        parentId: node.parent === null ? null : node.parent.id,
        level,
        text: options.idsOnly
            ? undefined
            : clip(flatten(textOf(node)), options.maxText, options.fullText),
    };
    // Same rule as the text output: side only for the root and its direct
    // children. Deeper nodes keep whatever side is stored; it is just not
    // printed, and it is not rewritten when a parent moves.
    if (level <= 1) {
        described.side = formatSide(node.side);
    }
    if (node.folded) {
        described.folded = true;
    }
    // Only when the node overrides something. A style block records the
    // difference from the theme, so a node that overrode nothing would
    // contribute the same absent entry every time - length for information the
    // theme already implies, on an output an agent reads at every step.
    const style = describeStyle(node.style);
    if (style !== null) {
        described.style = style;
    }
    return described;
}

/**
 * Width of a string in terminal columns.
 *
 * @param text - Text to measure.
 * @returns Columns the text occupies when printed.
 * @remarks
 * Node labels here are mostly CJK, and a CJK character occupies two columns.
 * Padding by `String.length` would leave the arrows in the highlighted block
 * ragged against the labels they follow — the one thing a column is for. The
 * ranges below are the wide/fullwidth blocks that turn up in real labels plus
 * the emoji planes; anything outside them is one column.
 */
function displayWidth(text: string): number {
    let width = 0;
    for (const char of text) {
        const code = char.codePointAt(0) ?? 0;
        width += isWide(code) ? 2 : 1;
    }
    return width;
}

/**
 * Whether a code point occupies two terminal columns.
 *
 * @param code - Code point to test.
 * @returns True for East Asian wide/fullwidth characters and emoji.
 */
function isWide(code: number): boolean {
    return (
        (code >= 0x1100 && code <= 0x115f) ||
        (code >= 0x2e80 && code <= 0xa4cf) ||
        (code >= 0xac00 && code <= 0xd7a3) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xfe30 && code <= 0xfe6f) ||
        (code >= 0xff00 && code <= 0xff60) ||
        (code >= 0xffe0 && code <= 0xffe6) ||
        (code >= 0x1f300 && code <= 0x1f64f) ||
        (code >= 0x1f900 && code <= 0x1f9ff) ||
        (code >= 0x20000 && code <= 0x3fffd)
    );
}

/**
 * Renders the highlighted block for the text output.
 *
 * @param highlights - Resolved requests, in the order asked.
 * @returns Lines of `"text" -> "root"/"id"`, or `"text" -> (no match)`.
 * @remarks
 * The requested text is echoed exactly as typed rather than taken from the
 * node, so a miss stays legible: the caller sees which spelling found nothing.
 * The arrows line up on the widest label in the block, including labels that
 * happen to be CJK.
 */
function renderHighlights(highlights: Highlight[]): string[] {
    const quoted = highlights.map(hit => `"${hit.text}"`);
    const width = Math.max(...quoted.map(text => displayWidth(text)));

    return highlights.map((hit, index) => {
        const pad = ' '.repeat(width - displayWidth(quoted[index]));
        const label = `${quoted[index]}${pad}`;
        if (hit.entry === null) {
            return `  ${label} -> (no match)`;
        }
        const more = hit.matches > 1 ? ` (+${hit.matches - 1} more)` : '';
        return `  ${label} -> ${idPath(hit.entry.node)}${more}`;
    });
}

/**
 * Builds the `highlighted` object for `--json`.
 *
 * @param highlights - Resolved requests, in the order asked.
 * @param options - Truncation settings.
 * @returns Request → node object, or `null` when the label matched nothing.
 * @remarks
 * A miss keeps its key with `null` rather than being dropped: "asked and found
 * nothing" and "never asked" are different answers, and only one of them means
 * the map has no such node.
 *
 * `matches` appears only when a label is shared by more than one node, the same
 * way `folded` appears only when it is true: the first match is what an id
 * points at, and the count is the signal that the label alone cannot identify
 * the target.
 */
function highlightPayload(
    highlights: Highlight[],
    options: ContextOptions
): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    for (const hit of highlights) {
        if (hit.entry === null) {
            payload[hit.text] = null;
            continue;
        }
        const described = describeEntry(hit.entry, options);
        if (hit.matches > 1) {
            described.matches = hit.matches;
        }
        payload[hit.text] = described;
    }
    return payload;
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
    // Read once, before the two output paths diverge: both report the same
    // document style, and neither should be able to forget it.
    const documentStyle =
        mind.style === undefined ? undefined : describeMindStyle(mind.style);

    // --highlight: locate labels by their text. Resolved here rather than in
    // the emitters because the answer does not depend on which levels the tree
    // is about to print — the search always covers the whole document.
    const requested = [...new Set(options.highlight ?? [])];
    if (requested.some(text => text.length === 0)) {
        throw usageError('--highlight needs a text to match');
    }
    const highlights = resolveHighlights(every, requested);

    // --focus: show matches and their surrounding structure.
    if (options.focus !== undefined && options.focus.length > 0) {
        if (highlights.length > 0) {
            // `--focus` already answers where a label sits, together with its
            // ancestors and a fuzzy fallback. Running both would print two
            // different answers to the same question, and a caller reading only
            // the first would conclude the map has one shape.
            throw usageError(
                '--focus and --highlight answer the same question; use one of them'
            );
        }
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
        const entries: ContextEntry[] = [];
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

        emit(entries, options, documentStyle, []);
        return CliExit.Ok;
    }

    emit(outline(root, options.depth), options, documentStyle, highlights);
    return CliExit.Ok;
}

/**
 * Writes entries in the requested shape.
 *
 * @param entries - Nodes with depth.
 * @param options - Output settings.
 * @param documentStyle - The document-level style summary, when the file
 *   declares one.
 * @param highlights - Resolved `--highlight` requests; empty when the flag was
 *   not given.
 * @remarks
 * The document style leads both outputs: it applies to the whole map, so it
 * belongs above the tree rather than beside one node. A file that declares no
 * `style` prints exactly what it printed before this existed — an unchanged
 * document keeps an unchanged output.
 *
 * The highlighted block leads everything, in both modes: it is the answer to
 * the question the caller asked, and the tree is the fallback. A run without
 * `--highlight` prints nothing new in either mode.
 */
function emit(
    entries: ContextEntry[],
    options: ContextOptions,
    documentStyle: DocumentStyleSummary | undefined,
    highlights: Highlight[]
): void {
    if (options.asJson) {
        const payload: Record<string, unknown> = {};
        if (highlights.length > 0) {
            payload.highlighted = highlightPayload(highlights, options);
        }
        payload.nodes = entries.map(entry => describeEntry(entry, options));
        if (documentStyle !== undefined) {
            payload.style = documentStyle;
        }
        process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
        return;
    }

    if (highlights.length > 0) {
        process.stdout.write('highlighted:\n');
        for (const line of renderHighlights(highlights)) {
            process.stdout.write(`${line}\n`);
        }
        // A blank line between the answer and the map it was found in, then the
        // tree under its own heading so the two sections cannot be confused.
        process.stdout.write('\nfullmap:\n');
    }

    // Not under --ids-only: that flag asks for ids and nothing else, and a
    // header would break the one shape a script can consume without parsing.
    if (documentStyle !== undefined && !options.idsOnly) {
        const overrides =
            documentStyle.overrides.length > 0 ? documentStyle.overrides.join(',') : 'none';
        process.stdout.write(
            `style: theme=${documentStyle.theme} defaultTone=${documentStyle.defaultTone} overrides=${overrides}\n`
        );
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

  --focus <text>      Fuzzy-match node text; shows matches with their ancestors
  --highlight <text>  Exact-match a label and print its id path (repeatable)
  --depth <n>         Levels below the root to show (default ${DEFAULT_DEPTH})
  --max-text <n>      Truncate labels at n characters (default ${DEFAULT_MAX_TEXT})
  --full-text         Do not truncate
  --ids-only          Print ids only
  --json              Machine-readable output

Ids are printed in a left-aligned column so they can be copied into the next
command. Multi-line labels are flattened, and truncation ends in an ellipsis.
Each line may end with a {…} block. side is shown only for the root and the
root's direct children. folded appears when the node is collapsed, and style
overrides appear when the node differs from the theme.

--highlight takes a label you already know and answers with the id: the text
is compared exactly against the whole document (not truncated, not just the
levels --depth prints) and a miss prints (no match) rather than a guess. Repeat
the flag for several labels; each gets its own line. The block leads the
output, above the tree, and a label carried by more than one node resolves to
the first in document order and is marked as shared. It is a locator: later
commands still take --node-id / --parent-id. --focus and --highlight answer the
same question, so only one of them may be given.

A file that declares its own style is announced above the tree:
  style: theme=default defaultTone=primary overrides=defaultTone,tones,node
--json returns { nodes: [...] } instead of a bare array, and adds that same
summary as a style block. Neither appears when the file carries no style, and
the line is suppressed under --ids-only. Every node in --json carries
parentId (null on the root), so the flat array states the structure instead of
leaving it to be inferred from level; under --highlight it also carries the
requested labels as a highlighted block, first.

When --focus matches nothing, the closest candidates are listed instead.`;
