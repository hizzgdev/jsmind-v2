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
import {
    JmFontWeight,
    JmLineCurve,
    JmLinePattern,
    JmTone,
    type JmNodeStyle,
} from '../../model/data/style.ts';
import { runMutation } from '../mutate.ts';
import { enumOption, numberOption, requireOption, type WriteOptions } from '../io.ts';
import { describeStyle, parseSide, report } from '../shared.ts';
import { deleteAtPath, flagToPath, setAtPath } from '../field-path.ts';
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
 * Accepted values, read from the model's own enums.
 *
 * @remarks
 * Not restated here. A hand-written copy of these lists drifts: the first
 * version of this file listed six tones while `JmTone` had seven, so `--tone
 * accent` was rejected as a bad value when it was perfectly legal. Nothing
 * failed loudly - the missing entry only showed up when someone used it.
 */
const TONE_WORDS = Object.values(JmTone);
const FONT_WEIGHT_WORDS = Object.values(JmFontWeight);
const LINE_PATTERN_WORDS = Object.values(JmLinePattern);
const LINE_CURVE_WORDS = Object.values(JmLineCurve);

/**
 * One style field reachable from the command line.
 *
 * @remarks
 * The flag name is the only place a field's location is written down. Its path
 * into {@link JmNodeStyle} is derived by {@link flagToPath}, so a field cannot
 * be declared at one place and addressed at another.
 */
interface StyleField {
    /** Flag name without leading dashes. Dots mark a level. */
    flag: string;
    /** Validates and converts the raw argument. */
    parse: (raw: unknown) => unknown;
}

/** Every style field the command accepts. */
const STYLE_FIELDS: StyleField[] = [
    { flag: 'tone', parse: raw => enumOption(raw, JmTone.Default, TONE_WORDS, 'tone') },
    { flag: 'background', parse: raw => String(raw) },
    { flag: 'color', parse: raw => String(raw) },
    { flag: 'border-color', parse: raw => String(raw) },
    { flag: 'border-width', parse: raw => numberOption(raw, 1, 'border-width') },
    {
        flag: 'border-style',
        parse: raw => enumOption(raw, JmLinePattern.Solid, LINE_PATTERN_WORDS, 'border-style'),
    },
    { flag: 'font-size', parse: raw => numberOption(raw, 1, 'font-size') },
    {
        flag: 'font-weight',
        parse: raw => enumOption(raw, JmFontWeight.Normal, FONT_WEIGHT_WORDS, 'font-weight'),
    },
    { flag: 'incoming.color', parse: raw => String(raw) },
    { flag: 'incoming.width', parse: raw => numberOption(raw, 1, 'incoming-width') },
    {
        flag: 'incoming.pattern',
        parse: raw => enumOption(raw, JmLinePattern.Solid, LINE_PATTERN_WORDS, 'incoming.pattern'),
    },
    {
        flag: 'incoming.curve',
        parse: raw => enumOption(raw, JmLineCurve.Bezier, LINE_CURVE_WORDS, 'incoming.curve'),
    },
];

/**
 * Normalises a field name given to `--clear`.
 *
 * @param name - Name as typed: `incoming.color`, `font-size` or `fontSize`.
 * @returns The flag spelling this module compares against.
 * @remarks
 * Both spellings are natural at different moments - reading the file shows
 * `fontSize`, typing the command shows `--font-size` - so both are accepted
 * rather than making the user remember which one `--clear` wants.
 */
function normalizeClearName(name: string): string {
    return name
        .trim()
        .split('.')
        .map(segment =>
            segment
                .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
                .toLowerCase()
        )
        .join('.');
}

/**
 * A validated instruction from the command line, ready to apply.
 *
 * @remarks
 * Parsing and applying are separated so an invalid argument fails before the
 * file is read. The split was not cosmetic: bad flags used to surface only
 * after the document had been loaded and a temporary copy made, which is wasted
 * work and, when the file is also missing, the wrong error.
 */
interface StylePatch {
    /** Drop every override on the node. Excludes the other two. */
    reset: boolean;
    /** Flags whose keys should be removed, restoring the theme's value. */
    clear: string[];
    /** Flags to set, already parsed and range-checked. */
    set: { flag: string; value: unknown }[];
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
        set.push({ flag: field.flag, value: field.parse(raw) });
    }

    const clear: string[] = [];
    const clearRaw = values.clear;
    if (clearRaw !== undefined) {
        if (typeof clearRaw !== 'string') {
            throw usageError('--clear expects a comma-separated list of fields');
        }
        for (const name of clearRaw
            .split(',')
            .map(s => s.trim())
            .filter(s => s !== '')) {
            const normalized = normalizeClearName(name);
            if (!STYLE_FIELDS.some(f => f.flag === normalized)) {
                throw usageError(
                    `--clear does not know "${name}". Known fields: ${STYLE_FIELDS.map(f => f.flag).join(', ')}`
                );
            }
            clear.push(normalized);
        }
    }

    // `--reset` is exhaustive: it says the node should carry no overrides at
    // all, so anything combined with it is either redundant or a contradiction.
    if (values.reset === true) {
        const conflicting = [...set.map(s => s.flag), ...(clear.length > 0 ? ['clear'] : [])];
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

    const style: Record<string, unknown> =
        current === undefined ? {} : (structuredClone(current) as Record<string, unknown>);

    for (const flag of patch.clear) {
        deleteAtPath(style, flagToPath(flag));
    }
    for (const { flag, value } of patch.set) {
        setAtPath(style, flagToPath(flag), value);
    }

    return Object.keys(style).length === 0 ? undefined : (style as JmNodeStyle);
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
            // Report what the mutation produced, not the arguments: `--clear` and
            // `--reset` remove fields, so the result is not derivable from the
            // flags. Reading the file again to find out would also be wrong under
            // --dry-run, where nothing was written and the reread returns the old
            // value.
            const applied = runMutation(file, options, (mind: JmMind) => {
                const node = mind.findNodeById(nodeId);
                if (node === null) {
                    throw dataError(`No node with id "${nodeId}" in ${file}`);
                }
                node.style = applyStyle(node.style, patch);
                return describeStyle(node.style);
            });
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
 * Describes the `node` command group for `--help`.
 */
export const nodeHelp = `jsmind node <subcommand> <file> --node-id <id> [options]

Node attributes (JmNode writable fields). Structure goes through \`jsmind mind\`.

  set-text     --node-id <id> --text <text>       Change the label
  set-folded   --node-id <id> --folded true|false Collapse or expand
  set-side     --node-id <id> --side left|center|right
  set-style    --node-id <id> [style fields]      Override the theme for one node

set-style fields (any combination, applied in one write). A dot marks a level, so
--incoming.color addresses \`style.incoming.color\`. Accepted values are read from
the model's own enums, so this list cannot fall behind them:

  --tone <value>              ${TONE_WORDS.join(' | ')}
  --background <color>
  --color <color>
  --border-color <color>
  --border-width <number>     positive
  --border-style <value>      ${LINE_PATTERN_WORDS.join(' | ')}
  --font-size <number>        positive
  --font-weight <value>       ${FONT_WEIGHT_WORDS.join(' | ')}
  --incoming.color <color>
  --incoming.width <number>   positive
  --incoming.pattern <value>  ${LINE_PATTERN_WORDS.join(' | ')}
  --incoming.curve <value>    ${LINE_CURVE_WORDS.join(' | ')}

Clearing, when the theme's value should come back:

  --clear <fields>            Comma-separated field names in the same spelling
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
