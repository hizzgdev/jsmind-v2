/**
 * `jsmind node *` — node attribute commands.
 *
 * @remarks
 * These map to `JmNode`'s writable fields (`content` / `folded` / `side` /
 * `style`), not to `JmMind` methods. That split is not cosmetic: `id`,
 * `parent` and `children` are on the model's readonly list, so moving a node or
 * changing its parent goes through `mind` instead. Everything here is a plain
 * field assignment.
 *
 * @packageDocumentation
 */

import { JmNodeContent } from '../../model/data/node-content.ts';
import type { JmMind } from '../../model/mind.ts';
import type { JmNodeStyle } from '../../model/data/style.ts';
import { JmMindJsonSerializer } from '../../serialization/json.ts';
import { runMutation } from '../mutate.ts';
import { readJsonFile, requireOption, type WriteOptions } from '../io.ts';
import { loadMindOrThrow, parseSide, report } from '../shared.ts';
import { CliExit, usageError, dataError } from '../exit.ts';

/** Subcommands this group understands. */
const SUBCOMMANDS = ['set-text', 'set-folded', 'set-side', 'set-style'] as const;

/**
 * Parses a boolean flag value written as a word.
 *
 * @param raw - `true` / `false` as given on the command line.
 * @returns The boolean.
 * @throws {@link CliError} With `Usage` for anything else.
 */
function parseBoolean(raw: string): boolean {
    if (raw === 'true') {
        return true;
    }
    if (raw === 'false') {
        return false;
    }
    throw usageError(`Expected true or false, got "${raw}"`);
}

/**
 * Tones accepted for `style.tone`.
 *
 * @remarks
 * Duplicated from the validator on purpose. The validator would reject a bad
 * value too, but only after the write, wrapped in a rollback message and
 * pointing at a JSON path. Catching it here names the flag the user typed.
 */
const TONE_WORDS = ['default', 'primary', 'success', 'warning', 'danger', 'info'];

/** Font weights accepted for `style.fontWeight`. Not validated by the schema. */
const FONT_WEIGHT_WORDS = ['normal', 'bold'];

/** Line patterns accepted for `style.borderStyle` and `style.incoming.pattern`. */
const LINE_PATTERN_WORDS = ['solid', 'dashed', 'dotted'];

/** Curves accepted for `style.incoming.curve`. */
const LINE_CURVE_WORDS = ['straight', 'bezier'];

/**
 * Builds a parser that accepts one of a fixed set of words.
 *
 * @param flag - Flag name, used in the error message.
 * @param words - Accepted values.
 * @returns A parser from the raw argument to that word.
 */
function parseWord(flag: string, words: string[]): (raw: string) => string {
    return (raw: string): string => {
        if (!words.includes(raw)) {
            throw usageError(`--${flag} must be one of ${words.join(', ')}, got "${raw}"`);
        }
        return raw;
    };
}

/**
 * Parses a positive number.
 *
 * @param flag - Flag name, used in the error message.
 * @returns A parser from the raw argument to the number.
 */
function parsePositive(flag: string): (raw: string) => number {
    return (raw: string): number => {
        const value = Number(raw);
        if (!Number.isFinite(value) || value <= 0) {
            throw usageError(`--${flag} must be a positive number, got "${raw}"`);
        }
        return value;
    };
}

/**
 * A style field reachable from the command line.
 *
 * @remarks
 * `path` is the route into {@link JmNodeStyle}. It is two segments for
 * `incoming.*` fields, because `incoming` is itself an object.
 */
interface StyleField {
    /** Flag name without the leading `--`. */
    flag: string;
    /** Route into the style object. */
    path: [keyof JmNodeStyle] | ['incoming', 'color' | 'width' | 'pattern' | 'curve'];
    /** Turns the raw argument into the value to store. */
    parse: (raw: string) => unknown;
}

/** Every style field the command accepts. */
const STYLE_FIELDS: StyleField[] = [
    { flag: 'tone', path: ['tone'], parse: parseWord('tone', TONE_WORDS) },
    { flag: 'background', path: ['background'], parse: raw => raw },
    { flag: 'color', path: ['color'], parse: raw => raw },
    { flag: 'border-color', path: ['borderColor'], parse: raw => raw },
    { flag: 'border-width', path: ['borderWidth'], parse: parsePositive('border-width') },
    {
        flag: 'border-style',
        path: ['borderStyle'],
        parse: parseWord('border-style', LINE_PATTERN_WORDS),
    },
    { flag: 'font-size', path: ['fontSize'], parse: parsePositive('font-size') },
    {
        flag: 'font-weight',
        path: ['fontWeight'],
        parse: parseWord('font-weight', FONT_WEIGHT_WORDS),
    },
    { flag: 'incoming-color', path: ['incoming', 'color'], parse: raw => raw },
    { flag: 'incoming-width', path: ['incoming', 'width'], parse: parsePositive('incoming-width') },
    {
        flag: 'incoming-pattern',
        path: ['incoming', 'pattern'],
        parse: parseWord('incoming-pattern', LINE_PATTERN_WORDS),
    },
    {
        flag: 'incoming-curve',
        path: ['incoming', 'curve'],
        parse: parseWord('incoming-curve', LINE_CURVE_WORDS),
    },
];

/**
 * Writes a property into a style block, creating `incoming` when needed.
 *
 * @param style - Style object, mutated in place.
 * @param path - Route into it.
 * @param value - Value to store.
 */
function writeAt(style: JmNodeStyle, path: StyleField['path'], value: unknown): void {
    if (path.length === 1) {
        (style as Record<string, unknown>)[path[0]] = value;
        return;
    }
    if (style.incoming === undefined) {
        style.incoming = {};
    }
    (style.incoming as Record<string, unknown>)[path[1]] = value;
}

/**
 * Deletes a property from a style block.
 *
 * @param style - Style object, mutated in place.
 * @param path - Route into it.
 * @remarks
 * Removing the key is what restores the theme's value. There is no sentinel
 * value for "unset": the style block records only overrides, so the absence of
 * a key is the override's absence.
 */
function deleteAt(style: JmNodeStyle, path: StyleField['path']): void {
    if (path.length === 1) {
        delete (style as Record<string, unknown>)[path[0]];
        return;
    }
    if (style.incoming === undefined) {
        return;
    }
    delete (style.incoming as Record<string, unknown>)[path[1]];
    if (Object.keys(style.incoming).length === 0) {
        delete style.incoming;
    }
}

/**
 * Normalises a field name for `--clear`.
 *
 * @param name - A field name as typed, either `fontSize` or `font-size`.
 * @returns The kebab-case form used by {@link STYLE_FIELDS}.
 * @remarks
 * Both spellings are accepted because both are natural at different moments.
 * Reading the file shows `fontSize`; typing the command shows `--font-size`.
 * Making the user remember which one `--clear` wants would be a trap.
 */
function normalizeFieldName(name: string): string {
    return name
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase();
}

/**
 * A validated instruction from the command line, ready to apply.
 *
 * @remarks
 * Parsing and applying are separated so an invalid argument fails before the
 * file is read. The split was not cosmetic: bad flags used to surface only
 * after the document had been loaded and a temp copy made, which is wasted work
 * and, when the file is also missing, the wrong error.
 */
interface StylePatch {
    /** Drop every override on the node. Excludes the other two. */
    reset: boolean;
    /** Fields whose keys should be removed, restoring the theme's value. */
    clear: StyleField['path'][];
    /** Fields to set, already parsed and range-checked. */
    set: { path: StyleField['path']; value: unknown }[];
}

/**
 * Validates the style flags and turns them into a patch.
 *
 * @param values - Parsed options.
 * @returns The patch to apply.
 * @throws {@link CliError} With `Usage` when the flags do not make sense.
 * @remarks
 * Touches no file. Every check here is about the arguments alone.
 */
function parseStyleArgs(values: Record<string, unknown>): StylePatch {
    const set: StylePatch['set'] = [];
    for (const field of STYLE_FIELDS) {
        const raw = values[field.flag];
        if (raw === undefined) {
            continue;
        }
        if (typeof raw !== 'string') {
            throw usageError(`--${field.flag} expects a single value`);
        }
        set.push({ path: field.path, value: field.parse(raw) });
    }

    const clearRaw = values.clear;
    const clear: StyleField['path'][] = [];
    if (clearRaw !== undefined) {
        if (typeof clearRaw !== 'string') {
            throw usageError('--clear expects a comma-separated list of fields');
        }
        for (const name of clearRaw.split(',').map(s => s.trim())
            .filter(s => s !== '')) {
            const field = STYLE_FIELDS.find(f => f.flag === normalizeFieldName(name));
            if (field === undefined) {
                throw usageError(
                    `--clear does not know "${name}". Known fields: ${STYLE_FIELDS.map(f => f.flag).join(', ')}`
                );
            }
            clear.push(field.path);
        }
    }

    // `--reset` is exhaustive: it says the node should carry no overrides at
    // all, so anything combined with it is either redundant or a contradiction.
    if (values.reset === true) {
        const conflicting = set.map(s => STYLE_FIELDS.find(f => f.path === s.path)!.flag);
        if (clear.length > 0) {
            conflicting.push('clear');
        }
        if (conflicting.length > 0) {
            throw usageError(
                `--reset clears every style field, so it cannot be combined with ${conflicting
                    .map(f => `--${f}`)
                    .join(', ')}`
            );
        }
        return { reset: true, clear: [], set: [] };
    }

    if (set.length === 0 && clear.length === 0) {
        throw usageError(
            `set-style needs at least one field, --clear or --reset.\nFields: ${STYLE_FIELDS.map(f => `--${f.flag}`).join(', ')}`
        );
    }

    return { reset: false, clear, set };
}

/**
 * Applies a patch to a node's current style.
 *
 * @param current - The node's current style, if any.
 * @param patch - Validated instruction.
 * @returns The new style, or `undefined` when nothing should be stored.
 * @remarks
 * A style block records only what differs from the theme, so this never merges
 * against theme values - only against the node's own overrides. An empty result
 * becomes `undefined` rather than `{}`: both resolve identically, but only the
 * former serialises to nothing.
 */
function applyStyle(current: JmNodeStyle | undefined, patch: StylePatch): JmNodeStyle | undefined {
    if (patch.reset) {
        return undefined;
    }

    const style: JmNodeStyle = current === undefined ? {} : structuredClone(current);
    for (const path of patch.clear) {
        deleteAt(style, path);
    }
    for (const { path, value } of patch.set) {
        writeAt(style, path, value);
    }

    return Object.keys(style).length === 0 ? undefined : style;
}

/**
 * Describes the style block of a node for the command's output.
 *
 * @param style - The style that was stored, if any.
 * @returns A plain object, or `null` when the node has no overrides.
 */
function describeStyle(style: JmNodeStyle | undefined): Record<string, unknown> | null {
    return style === undefined ? null : (structuredClone(style) as Record<string, unknown>);
}

/**
 * Runs a `node` subcommand.
 *
 * @param file - Mind map file.
 * @param subcommand - Which subcommand.
 * @param values - Parsed options.
 * @param options - Dry-run / backup / output settings.
 * @returns Exit code.
 */
export function runNode(
    file: string,
    subcommand: string,
    values: Record<string, unknown>,
    options: WriteOptions
): number {
    if (!(SUBCOMMANDS as readonly string[]).includes(subcommand)) {
        throw usageError(
            `Unknown node subcommand: ${subcommand}\nKnown: ${SUBCOMMANDS.join(', ')}`
        );
    }

    const nodeId = requireOption(values, 'node-id');
    const asJson = values.json === true;

    switch (subcommand) {
        case 'set-text': {
            const text = requireOption(values, 'text');
            runMutation(file, options, (mind: JmMind) => {
                const node = mind.findNodeById(nodeId);
                if (node === null) {
                    throw dataError(`No node with id "${nodeId}" in ${file}`);
                }
                node.content = new JmNodeContent(node.content.type, text);
                return nodeId;
            });
            report(asJson, `set text of ${nodeId}`, { id: nodeId, text });
            return CliExit.Ok;
        }

        case 'set-folded': {
            const raw = requireOption(values, 'folded');
            const folded = parseBoolean(raw);
            runMutation(file, options, (mind: JmMind) => {
                const node = mind.findNodeById(nodeId);
                if (node === null) {
                    throw dataError(`No node with id "${nodeId}" in ${file}`);
                }
                node.folded = folded;
                return nodeId;
            });
            report(asJson, `set folded of ${nodeId} to ${folded}`, { id: nodeId, folded });
            return CliExit.Ok;
        }

        case 'set-side': {
            const raw = requireOption(values, 'side');
            const side = parseSide(raw);
            runMutation(file, options, (mind: JmMind) => {
                const node = mind.findNodeById(nodeId);
                if (node === null) {
                    throw dataError(`No node with id "${nodeId}" in ${file}`);
                }
                node.side = side;
                return nodeId;
            });
            report(asJson, `set side of ${nodeId} to ${raw}`, { id: nodeId, side: raw });
            return CliExit.Ok;
        }

        case 'set-style': {
            // Validate before touching the file: a bad flag should not depend on
            // whether the document happens to load.
            const patch = parseStyleArgs(values);
            runMutation(file, options, (mind: JmMind) => {
                const node = mind.findNodeById(nodeId);
                if (node === null) {
                    throw dataError(`No node with id "${nodeId}" in ${file}`);
                }
                node.style = applyStyle(node.style, patch);
                return nodeId;
            });
            // Read back rather than echo the arguments: `--clear` and `--reset`
            // remove fields, so what the node now carries is not derivable from
            // the flags alone.
            const applied = readStyle(file, nodeId);
            report(
                asJson,
                applied === null
                    ? `cleared style of ${nodeId}`
                    : `set style of ${nodeId}: ${JSON.stringify(applied)}`,
                { id: nodeId, style: applied }
            );
            return CliExit.Ok;
        }

        default:
            throw usageError(`Unhandled node subcommand: ${subcommand}`);
    }
}

/**
 * Reads a node's style back from the file after a mutation.
 *
 * @param file - Mind map file.
 * @param nodeId - Node to describe.
 * @returns The stored style, or `null` when the node has no overrides.
 */
function readStyle(file: string, nodeId: string): Record<string, unknown> | null {
    const doc = readJsonFile(file);
    const mind = loadMindOrThrow(new JmMindJsonSerializer(), doc, file);
    return describeStyle(mind.findNodeById(nodeId)?.style);
}

/**
 * Describes the `node` command group for `--help`.
 */
export const nodeHelp = `jsmind node <subcommand> <file> --node-id <id> [options]

Node attributes (JmNode writable fields). Structure goes through \`jsmind mind\`.

  set-text     --node-id <id> --text <text>       Change the label
  set-folded   --node-id <id> --folded true|false Collapse or expand
  set-side     --node-id <id> --side left|center|right
  set-style    --node-id <id> [style fields]      Override the theme for one node

set-style fields (any combination, applied in one write):

  --tone <value>              default | primary | success | warning | danger | info
  --background <color>
  --color <color>
  --border-color <color>
  --border-width <number>     positive
  --border-style <value>      solid | dashed | dotted
  --font-size <number>        positive
  --font-weight <value>       normal | bold
  --incoming-color <color>
  --incoming-width <number>   positive
  --incoming-pattern <value>  solid | dashed | dotted
  --incoming-curve <value>    straight | bezier

Clearing, when the theme's value should come back:

  --clear <fields>            Comma-separated field names, as listed above
  --reset                     Drop every override on this node

A style block records only what differs from the theme, so removing a key is what
restores the theme's value. There is no \`unset\` sentinel - an absent key means an
absent override. \`--reset\` cannot be combined with fields or \`--clear\`.

Colours are not checked beyond being strings; the theme accepts any CSS colour.
Tones, patterns and weights are checked here so a bad value names the flag you
typed rather than a JSON path.

Why the split: id, parent and children are readonly on the model, so they are only
reachable through JmMind methods (\`jsmind mind\`). These fields are plain assignments.

Every subcommand validates the result and rolls back on failure.`;
