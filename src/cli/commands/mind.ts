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
import type {
    JmNode,
    JmNodeSide,
    NodeCreationOptions,
    NodeDestinationOptions,
} from '../../model/data/node.ts';
import { JmNodeContent } from '../../model/data/node-content.ts';
import { JmEdgeType } from '../../model/data/edge.ts';
import type { JmMind } from '../../model/mind.ts';
import { runMutation } from '../mutate.ts';
import {
    booleanOption,
    optionalIntOption,
    optionalOption,
    readJsonFile,
    requireOption,
    type WriteOptions,
} from '../io.ts';
import { CliExit, usageError, dataError } from '../exit.ts';
import { runSetStyle, STYLE_OPTIONS, STYLE_FIELDS_HELP } from './style.ts';
import {
    formatSide,
    ignoredSideBranchUnder,
    parsePlacementSide,
    report,
    describeNode,
    describeEdge,
    loadMindOrThrow,
} from '../shared.ts';

/** Subcommands this group understands. */
const SUBCOMMANDS = [
    'find',
    'add-child',
    'move',
    'remove-node',
    'add-edge',
    'remove-edge',
    'list-edges',
    'set-style',
] as const;

/** One of the words that selects a `mind` subcommand. */
type MindSubcommand = (typeof SUBCOMMANDS)[number];

/**
 * Options each `mind` subcommand reads, beyond the global ones.
 *
 * @remarks
 * Typed against {@link MindSubcommand}, so a subcommand added above without a
 * line here does not compile. This is the table `../options.ts` builds its
 * allow-list from: a flag named for a sibling subcommand (`--side` on `move`)
 * is reported as unknown instead of being dropped in silence.
 *
 * `add-child` takes `--side`; `move` does not, because a side belongs to a
 * first-level node and moving one under a different parent does not change it.
 */
export const MIND_OPTIONS: Record<MindSubcommand, readonly string[]> = {
    'find': ['node-id'],
    'list-edges': ['node-id'],
    'add-child': ['parent-id', 'text', 'side', 'position', 'folded'],
    'move': ['node-id', 'parent-id', 'position'],
    'remove-node': ['node-id'],
    'add-edge': ['source-id', 'target-id', 'type', 'label'],
    'remove-edge': ['edge-id'],
    // The document-style fields, owned by `./style.ts`: one list, joined to the
    // `mind` group here, so `mind set-style` is keyed like every sibling.
    'set-style': STYLE_OPTIONS,
};

/**
 * Resolves a node id, failing as invalid data when the document has no such node.
 *
 * @remarks
 * The model signals an absent id with `JsMindError`, which the top level can only
 * read as a crash: exit 3, `Unexpected failure`, and an instruction to stop and
 * ask a human. An id that is not in the document is none of those things - the
 * caller fixes it by editing the command line - so every mutating subcommand
 * resolves its ids through here before the model sees them, and the failure
 * carries {@link CliExit.InvalidData} instead.
 *
 * `role` only changes the wording. `--node-id ghost` and `--parent-id ghost` are
 * different mistakes, and the message names which one was made.
 *
 * @param mind - Loaded mind map.
 * @param nodeId - Id taken from the command line.
 * @param file - Path, for the message.
 * @param role - Noun for the option this id came from, defaulting to `node`.
 * @returns The node with that id.
 * @throws {@link CliError} With `InvalidData` when no node has that id.
 */
function requireNode(mind: JmMind, nodeId: string, file: string, role = 'node'): JmNode {
    const node = mind.findNodeById(nodeId);
    if (node === null) {
        throw dataError(`No ${role} with id "${nodeId}" in ${file}`);
    }
    return node;
}

/**
 * Refuses a subcommand this group does not have.
 *
 * @param subcommand - Word taken from the command line.
 * @throws {@link CliError} With `Usage` when the group has no such subcommand.
 * @remarks
 * Exported because the dispatcher has to run it before it judges the words that
 * follow. `mind style set f.json` supplies three words, and the plain
 * "unexpected arguments" complaint would name the file instead of the
 * subcommand that no longer exists — the caller needs to be told that `style`
 * is not a subcommand, not that `f.json` is surplus.
 */
export function assertMindSubcommand(subcommand: string): void {
    if (!(SUBCOMMANDS as readonly string[]).includes(subcommand)) {
        throw usageError(
            `Unknown mind subcommand: ${subcommand}\nKnown: ${SUBCOMMANDS.join(', ')}`
        );
    }
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
    assertMindSubcommand(subcommand);

    // `mind.style` is a field of the mind rather than a tree edit, so it lives
    // in its own module — but it dispatches like any other subcommand, with no
    // third word and no nested level of its own.
    if (subcommand === 'set-style') {
        return runSetStyle(file, values, options);
    }

    const asJson = values.json === true;

    // Read-only subcommands do not need the mutation pipeline.
    if (subcommand === 'find') {
        const nodeId = requireOption(values, 'node-id');
        const doc = readJsonFile(file);
        const mind = loadMindOrThrow(new JmMindJsonSerializer(), doc, file);
        const node = mind.findNodeById(nodeId);
        if (node === null) {
            throw dataError(`No node with id "${nodeId}" in ${file}`);
        }
        process.stdout.write(`${JSON.stringify(describeNode(node), null, 2)}\n`);
        return CliExit.Ok;
    }

    if (subcommand === 'list-edges') {
        const nodeId = requireOption(values, 'node-id');
        const doc = readJsonFile(file);
        const mind = loadMindOrThrow(new JmMindJsonSerializer(), doc, file);
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
            const position = optionalIntOption(values, 'position');
            const sideRaw = optionalOption(values, 'side');
            // Argument errors surface before the file is read: a bad flag should
            // not depend on whether the document happens to load.
            const side: JmNodeSide | undefined =
                sideRaw === undefined ? undefined : parsePlacementSide(sideRaw);
            const folded = booleanOption(values, 'folded');
            const created = runMutation(file, options, (mind: JmMind) => {
                const parent = requireNode(mind, parentId, file, 'parent node');
                // Only a root child has a side the arranger reads; anywhere else
                // the write would change the file and not the picture.
                if (side !== undefined) {
                    const ignored = ignoredSideBranchUnder(parent);
                    if (ignored !== null) {
                        throw usageError(
                            '--side applies only when the parent is the root node. A node added ' +
                                `under "${parentId}" would sit in the "${ignored.content.value}" ` +
                                `branch (first-level node "${ignored.id}"), where a side is ` +
                                'inherited instead of set. Drop --side.'
                        );
                    }
                }
                const dest: NodeDestinationOptions = { parentId };
                if (position !== undefined) {
                    dest.position = position;
                }
                if (side !== undefined) {
                    dest.side = side;
                }
                const creation: NodeCreationOptions = {};
                if (folded !== undefined) {
                    creation.folded = folded;
                }
                const node = mind.addNode(JmNodeContent.createText(text), dest, creation);
                return node.id;
            });
            const placed: string[] = [];
            if (side !== undefined) {
                placed.push(`side=${formatSide(side)}`);
            }
            if (folded !== undefined) {
                placed.push(`folded=${folded}`);
            }
            const note = placed.length === 0 ? '' : ` (${placed.join(', ')})`;
            const payload: Record<string, unknown> = { id: created };
            if (side !== undefined) {
                payload.side = formatSide(side);
            }
            if (folded !== undefined) {
                payload.folded = folded;
            }
            report(asJson, `added ${created} under ${parentId}${note}`, payload);
            return CliExit.Ok;
        }

        case 'move': {
            const nodeId = requireOption(values, 'node-id');
            const parentId = requireOption(values, 'parent-id');
            const position = optionalIntOption(values, 'position');
            runMutation(file, options, (mind: JmMind) => {
                // Resolve both ends first: the model reports a missing id as a
                // library error, and a missing parent as a different string than
                // a missing node, so neither reaches the top level as a crash.
                const node = requireNode(mind, nodeId, file);
                const parent = requireNode(mind, parentId, file, 'parent node');
                if (node.id === parent.id) {
                    throw dataError(`Cannot move "${nodeId}" under itself in ${file}`);
                }
                if (parent.isDescendant(node)) {
                    throw dataError(
                        `Cannot move "${nodeId}" under "${parentId}" in ${file}: ` +
                            `"${parentId}" is a descendant of "${nodeId}"`
                    );
                }
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
                const node = requireNode(mind, nodeId, file);
                if (node.isRoot()) {
                    throw dataError(`Cannot remove the root node "${nodeId}" in ${file}`);
                }
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
                requireNode(mind, sourceId, file, 'source node');
                requireNode(mind, targetId, file, 'target node');
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
 * Describes the `mind` command group for `--help`.
 */
export const mindHelp = `jsmind mind <subcommand> <file> [options]

Structure and edges (mirrors JmMind methods), and the document's style. Locators
are ids only.

  find          --node-id <id>                       Show one node
  list-edges    --node-id <id>                       Edges touching a node
  add-child     --parent-id <id> --text <text>       Add a child node
                [--side left|right] [--position <n>] [--folded true|false]
  move          --node-id <id> --parent-id <id>      Reparent (JmMind.moveNode)
                [--position <n>]
  remove-node   --node-id <id>                       Remove the node, its whole
                                                     subtree, and every edge touching any of them
  add-edge      --source-id <id> --target-id <id>    Add a relation (JmMind.addEdge)
                [--type link] [--label <text>]
  remove-edge   --edge-id <id>                       Remove a relation
  set-style     --default-tone <tone>                The tone every untoned node inherits (mind.style)

--side applies only when the parent is the root node. A side is the placement of
a root child, and every node below one inherits it, so a side written anywhere
else changes the file and not the picture. On any other parent --side is a usage
error naming the first-level branch the new node would land in. Only the root is
center, so --side takes left or right.

--position is an index among the target parent's children. A value at or past
the end appends (the model clamps it), and omitting --position appends too. The
root's children are counted across both sides: the index addresses the root's
children array, not one side's list.

--folded creates the node collapsed.

${STYLE_FIELDS_HELP}`;
