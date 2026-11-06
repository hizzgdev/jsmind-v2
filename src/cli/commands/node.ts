/**
 * `jsmind node *` — node attribute commands.
 *
 * @remarks
 * These map to `JmNode`'s writable fields (`content` / `folded` / `side`), not
 * to `JmMind` methods. That split is not cosmetic: `id`, `parent`, `children`
 * and `data` are on the model's readonly list, so moving a node or changing its
 * parent goes through `mind` instead. Everything here is a plain field
 * assignment.
 *
 * `set-style` is intentionally absent — it lands with the renderer work.
 *
 * @packageDocumentation
 */

import { JmNodeContent } from '../../model/data/node-content.ts';
import type { JmMind } from '../../model/mind.ts';
import { runMutation } from '../mutate.ts';
import { requireOption, type WriteOptions } from '../io.ts';
import { parseSide, report } from '../shared.ts';
import { CliExit, usageError, dataError } from '../exit.ts';

/** Subcommands this group understands. */
const SUBCOMMANDS = ['set-text', 'set-folded', 'set-side'] as const;

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

Why the split: id, parent, children and data are readonly on the model, so they
are only reachable through JmMind methods (\`jsmind mind\`). These four fields are
plain assignments.

Every subcommand validates the result and rolls back on failure.`;
