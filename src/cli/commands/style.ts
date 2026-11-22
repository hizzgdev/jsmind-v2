/**
 * `jsmind mind set-style` — the document's style.
 *
 * @remarks
 * `mind.style` is the layer between the preset and the individual node: one
 * declaration that every node without an override inherits. The alternative —
 * writing the same override onto every node — is what this command exists to
 * prevent, because it pins the values into the document (a later theme change
 * no longer reaches those nodes) and spends the semantic tones one node at a
 * time.
 *
 * It is a plain `mind` subcommand, not a group of its own: `mind.style` is a
 * field of the mind, so the command that writes it mirrors `node set-style`,
 * which writes `node.style`. One subcommand word, one allow-list entry, and
 * `--help` on the same ladder as every other subcommand — nothing here needs a
 * nested level to explain itself.
 *
 * Every field is declared in one table. {@link STYLE_FIELDS} is the list the
 * command accepts, the list `--help` prints and the list the flag parser is
 * built from, so a field cannot be reachable in one and missing from another.
 * The remaining sections (`tones` / `background` / `node` / `line` /
 * `expander`) join that table when they get a writer, in the dotted shape
 * `node set-style` already uses; until then they are readable through
 * `context` only.
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
 * disagree. A future nested field is written as a dotted flag
 * (`--node.font-size`), which is why nothing here assumes a depth.
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
 * Options the command reads, beyond the global ones.
 *
 * @remarks
 * Read off {@link STYLE_FIELDS} rather than restated, so a field the command
 * accepts is automatically an option it allows. `../options.ts` reaches this
 * list through `MIND_OPTIONS`, the same table every other `mind` subcommand
 * uses.
 */
export const STYLE_OPTIONS: readonly string[] = STYLE_FIELDS.map(field => field.flag);

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
            `set-style needs at least one field.\nFields: ${STYLE_FIELDS.map(f => `--${f.flag}`).join(', ')}`
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
 * Runs `mind set-style`.
 *
 * @param file - Mind map file.
 * @param values - Parsed options.
 * @param options - Dry-run / backup / output settings.
 * @returns Exit code.
 */
export function runSetStyle(
    file: string,
    values: Record<string, unknown>,
    options: WriteOptions
): number {
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
 * The `set-style` field table, printed by both the group help and the
 * subcommand help.
 *
 * @remarks
 * One copy, for the same reason `node set-style` keeps one: `jsmind mind --help`
 * and `jsmind mind set-style --help` both show this table, and two hand-written
 * copies is how a flag goes missing from one of them.
 */
export const STYLE_FIELDS_HELP = `Accepted tone names are read from the model's own enum, so this list cannot fall
behind it:

\`--default-tone\` picks one of the theme's named pairs: a box fill, and the text
colour drawn on it, so labels stay readable on the fill. The colour flags of
\`node set-style\` override a single part instead — \`--background\` does not
adjust the text colour.

  --default-tone <tone>       ${TONE_WORDS.join(' | ')}

A node's own \`style.tone\` wins over \`defaultTone\`. Every node without an explicit
tone follows this one, lines included; pass \`default\` to go back to the built-in
look.`;

/**
 * Describes `mind set-style` for `--help`.
 *
 * @remarks
 * A block of its own, at the same height as `node set-style` — the third word
 * of the command line — because the field table is longer than the line that
 * introduces it in the group block, so the caller gets the table instead of the
 * group list. Both blocks open with their scope, because the two commands share
 * a name and the group is the only thing telling them apart.
 */
export const mindSetStyleHelp = `jsmind mind set-style <file> --default-tone <tone>

The document's style (mind.style): one declaration every node without an
override inherits. Overriding the theme for one node is \`node set-style\`.

${STYLE_FIELDS_HELP}`;
