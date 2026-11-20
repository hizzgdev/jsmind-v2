/**
 * `jsmind mind style *` — document-level style commands.
 *
 * @remarks
 * `mind.style` is the layer between the preset and the individual node: one
 * declaration that every node without an override inherits. The alternative —
 * writing the same override onto every node — is what this group exists to
 * prevent, because it pins the values into the document (a later theme change
 * no longer reaches those nodes) and spends the semantic tones one node at a
 * time.
 *
 * Every field is declared in one table. {@link STYLE_FIELDS} is the list the
 * command accepts, the list `--help` prints and the list the flag parser is
 * built from, so a field cannot be reachable in one and missing from another.
 * The remaining sections (`tones` / `background` / `node` / `line` /
 * `expander`) join that table when they get a writer; until then they are
 * readable through `context` only.
 *
 * @packageDocumentation
 */

import type { JmMind } from '../../model/mind.ts';
import { JmTone, type JmStyle } from '../../model/data/style.ts';
import { runMutation } from '../mutate.ts';
import { enumOption, type WriteOptions } from '../io.ts';
import { report } from '../shared.ts';
import { flagToPath, setAtPath } from '../field-path.ts';
import { CliExit, usageError } from '../exit.ts';

/** Actions this group understands. */
const ACTIONS = ['set'] as const;

/**
 * Accepted tone names, read from the model's own enum.
 *
 * @remarks
 * Not restated here: a hand-written copy drifts, and the failure is silent
 * until someone uses the missing value. The same rule `node set-style` follows.
 */
const TONE_WORDS = Object.values(JmTone);

/**
 * One style field this command can write.
 *
 * @remarks
 * The flag name is the only place the field's location is written down; its
 * path into {@link JmStyle} is derived by {@link flagToPath}, so the two cannot
 * disagree.
 */
interface StyleField {
    /** Flag name without leading dashes. Dots mark a level. */
    flag: string;
    /** Validates and converts the raw argument. */
    parse: (raw: unknown) => unknown;
}

/** Every style field the command accepts. */
const STYLE_FIELDS: StyleField[] = [
    {
        flag: 'default-tone',
        parse: raw => enumOption(raw, JmTone.Default, TONE_WORDS, 'default-tone'),
    },
];

/**
 * Reads the field flags into a list of values to write.
 *
 * @param values - Parsed options.
 * @returns Field and value pairs, already parsed and range-checked.
 * @throws {@link CliError} With `Usage` when no field was given.
 * @remarks
 * Touches no file: a bad flag fails before the document is read, so the error
 * names the flag rather than the JSON path the flag could not be applied to.
 */
function parseStyleArgs(values: Record<string, unknown>): { flag: string; value: unknown }[] {
    const set: { flag: string; value: unknown }[] = [];
    for (const field of STYLE_FIELDS) {
        const raw = values[field.flag];
        if (raw === undefined) {
            continue;
        }
        set.push({ flag: field.flag, value: field.parse(raw) });
    }

    if (set.length === 0) {
        throw usageError(
            `style set needs at least one field.\nFields: ${STYLE_FIELDS.map(f => `--${f.flag}`).join(', ')}`
        );
    }

    return set;
}

/**
 * Writes the given fields into a document style declaration.
 *
 * @param current - The document's current style, if the file has one.
 * @param set - Field and value pairs.
 * @returns The new style block.
 * @remarks
 * Copied rather than mutated in place: `runMutation` builds its output from the
 * loaded mind map, and a half-applied argument list must not be able to leave
 * the in-memory document disagreeing with what is written.
 */
function applyStyle(current: JmStyle | undefined, set: { flag: string; value: unknown }[]): JmStyle {
    const style: Record<string, unknown> =
        current === undefined ? {} : (structuredClone(current) as Record<string, unknown>);

    for (const { flag, value } of set) {
        setAtPath(style, flagToPath(flag), value);
    }

    return style as JmStyle;
}

/**
 * Runs a `mind style` subcommand.
 *
 * @param file - Mind map file.
 * @param action - Which action.
 * @param values - Parsed options.
 * @param options - Dry-run / backup / output settings.
 * @returns Exit code.
 */
export function runStyle(
    file: string,
    action: string,
    values: Record<string, unknown>,
    options: WriteOptions
): number {
    if (!(ACTIONS as readonly string[]).includes(action)) {
        throw usageError(`Unknown style action: ${action}\nKnown: ${ACTIONS.join(', ')}`);
    }

    const asJson = values.json === true;
    const set = parseStyleArgs(values);

    // Report what the mutation produced rather than the arguments: under
    // --dry-run nothing was written, so re-reading the file would show the old
    // value and the agent would see its own edit disappear.
    const applied = runMutation(file, options, (mind: JmMind) => {
        mind.style = applyStyle(mind.style, set);
        return structuredClone(mind.style);
    });

    const summary = set.map(({ flag, value }) => `${flag}=${String(value)}`).join(' ');
    report(asJson, `set style of ${file}: ${summary}`, { style: applied });
    return CliExit.Ok;
}

/**
 * The field table, printed by both the group help and the `set` help.
 *
 * @remarks
 * One copy, for the same reason `node set-style` keeps one: two hand-written
 * copies is how a flag goes missing from one of them.
 */
const STYLE_FIELDS_HELP = `set fields (any combination, applied in one write). Accepted tone names are read
from the model's own enum, so this list cannot fall behind it:

  --default-tone <tone>       ${TONE_WORDS.join(' | ')}

The nested sections (tones / background / node / line / expander) have no writer
yet — read them through \`context\`. Each gets a dotted flag (\`--node.radius\`) in
this table when it gets one.

A node's own \`style.tone\` still wins over \`defaultTone\`; use it to single out one
node, and this command to change what the rest of the map looks like.`;

/**
 * Describes the `mind style` command group for `--help`.
 */
export const styleHelp = `jsmind mind style <action> <file> [options]

Document-level style: one declaration every node without an override inherits.

  set <file> --default-tone <tone>   Choose the tone untoned nodes wear

${STYLE_FIELDS_HELP}

Every action validates the result and rolls back on failure, and honours
--dry-run / --backup / --output like the other mutating commands.`;

/**
 * Resolves the action's own help text.
 *
 * @param action - Action as typed, if one was given.
 * @returns The `set` block, or the group block for anything else.
 * @remarks
 * The third level of the help ladder, for the same reason `node set-style` has
 * one: the field table is longer than the action list that introduces it.
 */
export function styleActionHelp(action: string | undefined): string {
    if (action !== 'set') {
        return styleHelp;
    }
    return `jsmind mind style set <file> --default-tone <tone>

${STYLE_FIELDS_HELP}

The value is written once and every node without an explicit tone follows it,
lines included. Pass \`default\` to go back to the built-in look.`;
}
