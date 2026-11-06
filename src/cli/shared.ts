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
import { JsMindError } from '../common/error.ts';
import type { JmValidationIssue } from '../serialization/validation.ts';
import { formatIssues } from './format.ts';
import { dataError, usageError } from './exit.ts';

/**
 * Synonyms accepted for each side, and the value they normalise to.
 *
 * @remarks
 * The model deliberately names its sides A and B rather than left and right, so
 * the values stay usable if a vertical layout ever arrives. The command line
 * cannot be that abstract — nobody types `--side b` — so the words live here, in
 * one table, and every accepted spelling normalises to the same numeric value.
 *
 * When a vertical layout lands, `up` and `down` are added to this table pointing
 * at the existing values. The words change; the data does not.
 *
 * Current mapping, per the JmNodeSide comments in the model:
 *
 * | word   | value | model name |
 * |--------|-------|------------|
 * | left   | -1    | SideB      |
 * | center | 0     | Center     |
 * | right  | 1     | SideA      |
 */
const SIDE_SYNONYMS: Record<string, JmNodeSide> = {
    left: JmNodeSide.SideB,
    center: JmNodeSide.Center,
    right: JmNodeSide.SideA,
};

/**
 * Every spelling the `--side` option accepts.
 *
 * @remarks
 * Derived from the table rather than restated, so an error message cannot drift
 * away from what the parser actually accepts.
 */
const SIDE_WORDS = Object.keys(SIDE_SYNONYMS).join(', ');

/**
 * Converts a `--side` value to the numeric enum.
 *
 * @param raw - Value from the command line.
 * @returns The normalised side.
 * @throws {@link CliError} With `Usage` for an unknown name.
 */
export function parseSide(raw: string): JmNodeSide {
    const value = SIDE_SYNONYMS[raw];
    if (value === undefined) {
        throw usageError(`--side must be one of ${SIDE_WORDS}, got "${raw}"`);
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
 * Loads a mind map, reporting structural faults as data errors.
 *
 * @remarks
 * `deserialize()` already validates — it calls the same `validateMindData()`
 * internally — so validating here first would run the check twice. Measured at
 * 5000 nodes the duplicate pass costs about as much as the real one, roughly
 * 40% of the load time. The catch below is not defensive padding: it is the
 * only way to keep a single validation while still converting the error.
 *
 * Every read path goes through here so a structural fault surfaces as
 * `InvalidData` (exit 1) rather than escaping as a raw `JsMindError` and landing
 * in the generic runtime branch (exit 3).
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
    try {
        return serializer.deserialize(doc as SerializedMindMap);
    } catch (err) {
        if (err instanceof JsMindError) {
            const issues = (err.data as { errors?: JmValidationIssue[] }).errors;
            throw dataError(`${file} does not validate:\n${formatIssues(issues ?? [])}`);
        }
        throw err;
    }
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
