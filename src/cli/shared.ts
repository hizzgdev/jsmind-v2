/**
 * Helpers shared by more than one command group.
 *
 * @remarks
 * Only things that are genuinely identical between groups live here. When two
 * call sites look alike but answer different questions, they stay separate —
 * merging those is how a shared helper turns into a function with a mode flag.
 *
 * @packageDocumentation
 */

import { JmNodeSide } from '../model/data/node.ts';
import { JmNodeContent } from '../model/data/node-content.ts';
import type { JmNode } from '../model/data/node.ts';
import type { JmMindJsonSerializer, SerializedMindMap } from '../serialization/json.ts';
import { validateMindData } from '../serialization/validation.ts';
import { formatIssues } from './format.ts';
import { dataError, usageError } from './exit.ts';

/**
 * Human-readable side names accepted on the command line.
 *
 * @remarks
 * The JSON stores numbers; the CLI takes words. `--side left` reads better than
 * `--side -1`, and the conversion happens in exactly one place.
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
export function parseSide(raw: string): JmNodeSide {
    const value = SIDE_NAMES[raw];
    if (value === undefined) {
        throw usageError(`--side must be left, center or right, got "${raw}"`);
    }
    return value;
}

/**
 * Writes a command result in the shape the caller asked for.
 *
 * @param asJson - Emit JSON instead of prose.
 * @param prose - Human-readable summary.
 * @param payload - Machine-readable result.
 */
export function report(asJson: boolean, prose: string, payload: Record<string, unknown>): void {
    process.stdout.write(asJson ? `${JSON.stringify(payload, null, 2)}\n` : `${prose}\n`);
}

/**
 * Describes a node for output.
 *
 * @remarks
 * `parent` and `children` hold live JmNode references, not ids. Serialising a
 * node as-is walks straight back into the tree and blows the stack, so every id
 * crossing this boundary is extracted explicitly.
 *
 * @param node - Node to describe.
 * @returns Plain object for output.
 */
export function describeNode(node: JmNode): Record<string, unknown> {
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
 * Describes an edge for output.
 *
 * @param edge - Edge to describe.
 * @returns Plain object for output.
 */
export function describeEdge(edge: {
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
 * Loads a mind map, refusing documents that do not validate.
 *
 * @remarks
 * Every read path goes through here so that a structural fault surfaces as
 * `InvalidData` (exit 1) rather than escaping as a raw `JsMindError` and landing
 * in the generic runtime branch (exit 3). Validating before deserialising also
 * means the deserialiser only ever sees documents whose shape it can trust.
 *
 * @param serializer - Serializer to use.
 * @param doc - Parsed document.
 * @param file - Path, for the error message.
 * @returns The loaded mind map.
 * @throws {@link CliError} With `InvalidData` when the document is invalid.
 */
export function loadMindOrThrow(
    serializer: JmMindJsonSerializer,
    doc: unknown,
    file: string
): ReturnType<JmMindJsonSerializer['deserialize']> {
    const check = validateMindData(doc);
    if (!check.valid) {
        throw dataError(`${file} does not validate:\n${formatIssues(check.errors)}`);
    }
    return serializer.deserialize(doc as SerializedMindMap);
}

/**
 * Builds a text content object for a new node.
 *
 * @param text - Label text.
 * @returns A JmNodeContent of type text.
 */
export function textContent(text: string): JmNodeContent {
    return JmNodeContent.createText(text);
}
