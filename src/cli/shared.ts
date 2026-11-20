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
import type { JmNodeStyle } from '../model/data/style.ts';
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
 * Every word a placement option accepts — every side except `center`.
 *
 * @remarks
 * Derived from the table rather than restated, so an error message cannot drift
 * away from what the parser actually accepts. `center` is left out on purpose:
 * it names the root's own state, not a placement, and `--side center` is
 * answered with its own message rather than lumped in with a typo.
 */
const PLACEMENT_WORDS = Object.entries(SIDE_SYNONYMS)
    .filter(([, value]) => value !== JmNodeSide.Center)
    .map(([word]) => word)
    .join(', ');

/**
 * Converts a numeric side to its display word.
 *
 * @param side - The raw value from a node.
 * @returns `"left"`, `"center"`, or `"right"`.
 * @remarks
 * The model stores sides as −1 / 0 / 1 so a vertical layout can reuse the same
 * values with different words later.  This function is the place that picks the
 * current word, and it is deliberately the only place: if a vertical layout ever
 * lands, changing these three strings changes every caller at once.
 */
export function formatSide(side: JmNodeSide): string {
    if (side === JmNodeSide.SideB) return 'left';
    if (side === JmNodeSide.SideA) return 'right';
    return 'center';
}

/**
 * Converts an explicit side to the numeric enum, rejecting the one value that
 * is not a placement.
 *
 * @param raw - Value from the command line.
 * @returns `left` or `right`.
 * @throws {@link CliError} With `Usage` for an unknown name or for `center`.
 * @remarks
 * `center` is a state, not a choice: only the root is center, and nothing on the
 * command line can create a second one. Accepting it would write a value the
 * arranger never reads, which is exactly the "the file and the picture disagree"
 * failure these commands are built to avoid. The table still holds the word so
 * this function can tell `--side center` apart from a typo and name which
 * mistake it was — the command line only ever accepts the placement words.
 */
export function parsePlacementSide(raw: string): JmNodeSide {
    const side = SIDE_SYNONYMS[raw];
    if (side === undefined) {
        throw usageError(`--side must be one of ${PLACEMENT_WORDS}, got "${raw}"`);
    }
    if (side === JmNodeSide.Center) {
        throw usageError(
            '--side center is not a placement: the root is the only center node. Use --side left or --side right.'
        );
    }
    return side;
}

/**
 * Finds the first-level branch a side would be ignored in.
 *
 * @param parent - Parent of the node that would carry the side (for a node that
 *                 does not exist yet, the parent it is being added under).
 * @returns `null` when `parent` is the root, so a side here is the placement the
 *          arranger reads; otherwise the root's direct child on that path.
 * @remarks
 * A side is the placement of a root child; everything below one inherits it.
 * That is the single judgement both side-writing commands share
 * (`mind add-child --side` and `node set-side`) — the callers differ only in how
 * they phrase it, because their fixes differ: one drops the flag, the other
 * retargets it.
 */
export function ignoredSideBranchUnder(parent: JmNode): JmNode | null {
    if (parent.isRoot()) {
        return null;
    }
    let branch = parent;
    while (branch.parent !== null && !branch.parent.isRoot()) {
        branch = branch.parent;
    }
    return branch;
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
 * Describes a node's style block for output.
 *
 * @param style - The node's overrides, if any.
 * @returns A plain object, or `null` when the node overrides nothing.
 * @remarks
 * A style block records only what differs from the theme, and that shape is
 * carried through unchanged: a field the caller never set is absent here too.
 * Reporting defaults would make every described node longer for information the
 * theme already implies, and this output is read on every discovery step.
 */
export function describeStyle(style: JmNodeStyle | undefined): Record<string, unknown> | null {
    return style === undefined ? null : (structuredClone(style) as Record<string, unknown>);
}

/**
 * Describes a node for output.
 *
 * @remarks
 * `parent` and `children` hold live JmNode references, not ids. Serialising a
 * node as-is walks straight back into the tree and blows the stack, so every id
 * crossing this boundary is extracted explicitly.
 *
 * `side` is emitted as the word `formatSide()` produces (`"left"` / `"center"` /
 * `"right"`), not the internal number. `center` describes the root and is not a
 * placement, so the words a caller can write back are `"left"` and `"right"`.
 *
 * `folded` appears only when `true` — every node defaults to unfolded, and
 * reporting a key the caller never set would add noise to every response.
 *
 * `style` is included only when the node overrides something. A command can set
 * it, so a discovery command has to be able to show it - otherwise the only way
 * to confirm a style change is to render an image and look, which costs a vision
 * call per check and is unreliable at that.
 *
 * @param node - Node to describe.
 * @returns Plain object for output.
 */
export function describeNode(node: JmNode): Record<string, unknown> {
    const described: Record<string, unknown> = {
        id: node.id,
        text: node.content.value,
        parent: node.parent === null ? null : node.parent.id,
        children: node.children.map(child => child.id),
        side: formatSide(node.side),
    };
    // folded only when the node is collapsed — the default is false for every
    // node and reporting it would add a key the caller never asked for.
    if (node.folded) {
        described.folded = true;
    }
    const style = describeStyle(node.style);
    if (style !== null) {
        described.style = style;
    }
    return described;
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
