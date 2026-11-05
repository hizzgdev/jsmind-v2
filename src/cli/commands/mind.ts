/**
 * `jsmind mind *` — structure and edge commands.
 *
 * @remarks
 * Each command is a thin wrapper over a `JmMind` method. Locators are ids only:
 * pointing at a node by path or by text is deliberately not offered, because
 * both are ambiguous in a document the agent has not read.
 *
 * @packageDocumentation
 */

import { JmMindJsonSerializer } from '../../serialization/json.ts';
import { JmNodeSide, type JmNode } from '../../model/data/node.ts';
import { JmNodeContent } from '../../model/data/node-content.ts';
import { JmEdgeType } from '../../model/data/edge.ts';
import type { JmMind } from '../../model/mind.ts';
import { runMutation } from '../mutate.ts';
import { readJsonFile, requireOption, optionalOption, type WriteOptions } from '../io.ts';
import { CliExit, usageError, dataError } from '../exit.ts';

/** Subcommands this group understands. */
const SUBCOMMANDS = [
    'find',
    'add-child',
    'add-node',
    'move',
    'remove-node',
    'add-edge',
    'remove-edge',
    'edges',
] as const;

/**
 * Human-readable side names accepted on the command line.
 *
 * @remarks
 * The JSON stores numbers; the CLI takes words. Passing `--side left` reads
 * better than `--side -1`, and the conversion happens here, in one place.
 */
const SIDE_NAMES: Record<string, JmNodeSide> = {
    left: JmNodeSide.SideB,
    center: JmNodeSide.Center,
    right: JmNodeSide.SideA,
};

/**
 * Converts a `--side` value to the numeric enum.
 *
 * @param raw - Value from the command line.
 * @returns The numeric side.
 * @throws {@link CliError} With `Usage` for an unknown name.
 */
function parseSide(raw: string): JmNodeSide {
    const value = SIDE_NAMES[raw];
    if (value === undefined) {
        throw usageError(`--side must be left, center or right, got "${raw}"`);
    }
    return value;
}

/**
 * Parses an optional integer option.
 *
 * @param values - Parsed options.
 * @param name - Option name without dashes.
 * @returns The number, or undefined when absent.
 * @throws {@link CliError} With `Usage` when present but not an integer.
 */
function optionalInt(values: Record<string, unknown>, name: string): number | undefined {
    const raw = values[name];
    if (raw === undefined) {
        return undefined;
    }
    const value = Number(raw);
    if (!Number.isInteger(value)) {
        throw usageError(`--${name} must be an integer, got "${String(raw)}"`);
    }
    return value;
}

/**
 * Reports a node as JSON.
 *
 * @param node - Node to describe.
 * @returns Plain object for output.
 */
function describeNode(node: JmNode): Record<string, unknown> {
    // parent and children hold live JmNode references, not ids: serialising them
    // as-is walks straight back into the tree and blows the stack. Every id
    // crossing this boundary has to be extracted explicitly.
    return {
        id: node.id,
        text: node.content.value,
        parent: node.parent === null ? null : node.parent.id,
        children: node.children.map(child => child.id),
        folded: node.folded,
        side: node.side,
    };
}

/**
 * Runs a `mind` subcommand.
 *
 * @param file - Mind map file.
 * @param subcommand - Which subcommand.
 * @param values - Parsed options.
 * @param options - Dry-run / backup / output settings.
 * @returns Exit code.
 */
export function runMind(
    file: string,
    subcommand: string,
    values: Record<string, unknown>,
    options: WriteOptions
): number {
    if (!(SUBCOMMANDS as readonly string[]).includes(subcommand)) {
        throw usageError(
            `Unknown mind subcommand: ${subcommand}\nKnown: ${SUBCOMMANDS.join(', ')}`
        );
    }

    const asJson = values.json === true;

    // Read-only subcommands do not need the mutation pipeline.
    if (subcommand === 'find') {
        const nodeId = requireOption(values, 'node-id');
        const doc = readJsonFile(file);
        const mind = new JmMindJsonSerializer().deserialize(doc as never);
        const node = mind.findNodeById(nodeId);
        if (node === null) {
            throw dataError(`No node with id "${nodeId}" in ${file}`);
        }
        process.stdout.write(`${JSON.stringify(describeNode(node), null, 2)}\n`);
        return CliExit.Ok;
    }

    if (subcommand === 'edges') {
        const nodeId = requireOption(values, 'node-id');
        const doc = readJsonFile(file);
        const mind = new JmMindJsonSerializer().deserialize(doc as never);
        if (mind.findNodeById(nodeId) === null) {
            throw dataError(`No node with id "${nodeId}" in ${file}`);
        }
        const edges = mind.getEdges(nodeId);
        process.stdout.write(`${JSON.stringify(edges.map(describeEdge), null, 2)}\n`);
        return CliExit.Ok;
    }

    switch (subcommand) {
        case 'add-child': {
            const parentId = requireOption(values, 'parent-id');
            const text = requireOption(values, 'text');
            const created = runMutation(file, options, (mind: JmMind) => {
                const node = mind.addChildNode(text, parentId);
                return node.id;
            });
            report(asJson, `added ${created} under ${parentId}`, { id: created });
            return CliExit.Ok;
        }

        case 'add-node': {
            const parentId = requireOption(values, 'parent-id');
            const text = requireOption(values, 'text');
            const position = optionalInt(values, 'position');
            const sideRaw = optionalOption(values, 'side');
            const created = runMutation(file, options, (mind: JmMind) => {
                const dest: { parentId: string; position?: number; side?: JmNodeSide } = {
                    parentId,
                };
                if (position !== undefined) {
                    dest.position = position;
                }
                if (sideRaw !== undefined) {
                    dest.side = parseSide(sideRaw);
                }
                const node = mind.addNode(JmNodeContent.createText(text), dest);
                return node.id;
            });
            report(asJson, `added ${created} under ${parentId}`, { id: created });
            return CliExit.Ok;
        }

        case 'move': {
            const nodeId = requireOption(values, 'node-id');
            const parentId = requireOption(values, 'parent-id');
            const position = optionalInt(values, 'position');
            runMutation(file, options, (mind: JmMind) => {
                const dest: { parentId: string; position?: number } = { parentId };
                if (position !== undefined) {
                    dest.position = position;
                }
                mind.moveNode(nodeId, dest);
                return nodeId;
            });
            report(asJson, `moved ${nodeId} under ${parentId}`, { id: nodeId, parent: parentId });
            return CliExit.Ok;
        }

        case 'remove-node': {
            const nodeId = requireOption(values, 'node-id');
            runMutation(file, options, (mind: JmMind) => {
                mind.removeNode(nodeId);
                return nodeId;
            });
            report(asJson, `removed ${nodeId}`, { id: nodeId });
            return CliExit.Ok;
        }

        case 'add-edge': {
            const sourceId = requireOption(values, 'source-id');
            const targetId = requireOption(values, 'target-id');
            const typeRaw = optionalOption(values, 'type') ?? JmEdgeType.Link;
            const label = optionalOption(values, 'label') ?? null;
            const created = runMutation(file, options, (mind: JmMind) => {
                const edge = mind.addEdge(
                    sourceId,
                    targetId,
                    typeRaw as JmEdgeType,
                    label === null ? undefined : { label }
                );
                return edge.id;
            });
            report(asJson, `added edge ${created}`, { id: created });
            return CliExit.Ok;
        }

        case 'remove-edge': {
            const edgeId = requireOption(values, 'edge-id');
            runMutation(file, options, (mind: JmMind) => {
                if (!mind.removeEdge(edgeId)) {
                    throw dataError(`No edge with id "${edgeId}" in ${file}`);
                }
                return edgeId;
            });
            report(asJson, `removed edge ${edgeId}`, { id: edgeId });
            return CliExit.Ok;
        }

        default:
            throw usageError(`Unhandled mind subcommand: ${subcommand}`);
    }
}

/**
 * Describes an edge for output.
 *
 * @param edge - Edge to describe.
 * @returns Plain object for output.
 */
function describeEdge(edge: {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    type: string;
    label: string | null;
}): Record<string, unknown> {
    return {
        id: edge.id,
        source: edge.sourceNodeId,
        target: edge.targetNodeId,
        type: edge.type,
        label: edge.label,
    };
}

/**
 * Writes a command result in the shape the caller asked for.
 *
 * @param asJson - Emit JSON instead of prose.
 * @param prose - Human-readable summary.
 * @param payload - Machine-readable result.
 */
function report(asJson: boolean, prose: string, payload: Record<string, unknown>): void {
    process.stdout.write(asJson ? `${JSON.stringify(payload, null, 2)}\n` : `${prose}\n`);
}

/**
 * Describes the `mind` command group for `--help`.
 */
export const mindHelp = `jsmind mind <subcommand> <file> [options]

Structure and edges (mirrors JmMind methods). Locators are ids only.

  find          --node-id <id>                       Show one node
  edges         --node-id <id>                       Edges touching a node
  add-child     --parent-id <id> --text <text>       Add a leaf (JmMind.addChildNode)
  add-node      --parent-id <id> --text <text>       Add with placement (JmMind.addNode)
                [--position <n>] [--side left|center|right]
  move          --node-id <id> --parent-id <id>      Reparent (JmMind.moveNode)
                [--position <n>]
  remove-node   --node-id <id>                       Remove subtree (JmMind.removeNode)
  add-edge      --source-id <id> --target-id <id>    Add a relation (JmMind.addEdge)
                [--type link] [--label <text>]
  remove-edge   --edge-id <id>                       Remove a relation

Every mutating subcommand validates the result and rolls back on failure.`;
