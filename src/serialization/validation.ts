/**
 * Validation for v2 mind map data.
 *
 * @remarks
 * Every check returns a coded issue instead of throwing. A caller (the CLI, a
 * host application, an agent) branches on `code`; the `message` is for humans
 * to read and must never be parsed.
 *
 * @packageDocumentation
 */

import { JmTone } from '../model/data/style.ts';
import { JSMIND_THEME_PRESETS } from '../model/data/style.ts';
import { JmLinePattern } from '../model/data/style.ts';
import { JmNodeSide } from '../model/data/node.ts';
import { JmNodeContentType } from '../model/data/node-content.ts';

/**
 * Error codes for v2 data validation.
 *
 * @remarks
 * Codes are stable identifiers. Messages may be reworded at any time; these
 * may not.
 *
 * @public
 */
export const JmValidationCode = {
    /** Top-level `format` missing or not "jsmind_v2". */
    Format: 'E_FORMAT',
    /** `meta` missing or its fields are not strings. */
    Meta: 'E_META',
    /** `root` does not point at an existing node. */
    RootMissing: 'E_ROOT_MISSING',
    /** A `nodes` key differs from the `id` of its value. */
    NodeKeyMismatch: 'E_NODE_KEY_MISMATCH',
    /** An `edges` key differs from the `id` of its value. */
    EdgeKeyMismatch: 'E_EDGE_KEY_MISMATCH',
    /** A node's `parent` points at a node that is not present. */
    NodeParentMissing: 'E_NODE_PARENT_MISSING',
    /** A node's `children` lists an id that is not present. */
    NodeChildMissing: 'E_NODE_CHILD_MISSING',
    /** An edge endpoint points at a node that is not present. */
    EdgeNodeMissing: 'E_EDGE_NODE_MISSING',
    /** More than one node has `parent === null`. */
    MultipleRoots: 'E_MULTIPLE_ROOTS',
    /** The root node has a non-null `parent`. */
    RootParentSet: 'E_ROOT_PARENT_SET',
    /** `parent.children` and `child.parent` disagree. */
    ParentChildMismatch: 'E_PARENT_CHILD_MISMATCH',
    /** Following `parent` links returns to where it started. */
    Cycle: 'E_CYCLE',
    /** `content.type` is not a known content type. */
    ContentType: 'E_CONTENT_TYPE',
    /** `side` is not a known side value. */
    Side: 'E_SIDE',
    /** `style.tone` is not one of the six tones. */
    Tone: 'E_TONE',
    /** A line pattern is not solid/dashed/dotted. */
    LineStyle: 'E_LINE_STYLE',
    /** A numeric style value is out of range. */
    StyleRange: 'E_STYLE_RANGE',
    /** `style.theme` names a preset that does not exist. */
    ThemeUnknown: 'E_THEME_UNKNOWN',
} as const;

export type JmValidationCode = typeof JmValidationCode[keyof typeof JmValidationCode];

/**
 * One validation problem.
 *
 * @public
 */
export interface JmValidationIssue {
    /** Stable machine-readable code. Branch on this. */
    code: JmValidationCode;
    /** Location within the document, e.g. `nodes/jm-c1/style/tone`. */
    path: string;
    /** Human-readable description. Never parse this. */
    message: string;
}

/**
 * Outcome of a validation pass.
 *
 * @public
 */
export interface JmValidationResult {
    /** True when `errors` is empty. */
    valid: boolean;
    /** Every problem found, in document order. */
    errors: JmValidationIssue[];
}

/** Numeric side values accepted for a node. */
const SIDE_VALUES: ReadonlySet<number> = new Set(Object.values(JmNodeSide));

/** Line patterns accepted for `borderStyle` and `incoming.pattern`. */
const LINE_PATTERNS: ReadonlySet<string> = new Set(Object.values(JmLinePattern));

/** Tones accepted for `style.tone`. */
const TONES: ReadonlySet<string> = new Set(Object.values(JmTone));

/** Content types accepted for `content.type`. */
const CONTENT_TYPES: ReadonlySet<string> = new Set(Object.values(JmNodeContentType));

/**
 * Collects issues while walking the document.
 *
 * @private
 */
class IssueList {
    readonly errors: JmValidationIssue[] = [];

    add(code: JmValidationCode, path: string, message: string): void {
        this.errors.push({ code, path, message });
    }
}

/**
 * Narrows to a plain object.
 *
 * @param value - Value to test.
 * @returns True for non-null, non-array objects.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads a string field, or null when absent or not a string.
 *
 * @param holder - Object to read from.
 * @param key - Field name.
 * @returns The string, or null.
 */
function str(holder: Record<string, unknown>, key: string): string | null {
    const value = holder[key];
    return typeof value === 'string' ? value : null;
}

/**
 * Validates v2 data against every rule in the format specification.
 *
 * @remarks
 * Never throws for malformed input: anything structurally wrong becomes an
 * issue with a code. The one thing it cannot represent is a non-object root,
 * which it reports as `E_FORMAT` since nothing can be read from it.
 *
 * @param data - Candidate data, typically parsed JSON.
 * @returns Every issue found; `valid` is true only when the list is empty.
 *
 * @public
 */
export function validateMindData(data: unknown): JmValidationResult {
    const issues = new IssueList();

    if (!isRecord(data)) {
        issues.add(JmValidationCode.Format, '', 'Data is not an object.');
        return { valid: false, errors: issues.errors };
    }

    // ---- format ----
    if (data.format !== 'jsmind_v2') {
        issues.add(
            JmValidationCode.Format,
            'format',
            `Expected format "jsmind_v2", got ${JSON.stringify(data.format) ?? 'nothing'}.`
        );
    }

    // ---- meta ----
    const meta = data.meta;
    if (!isRecord(meta)) {
        issues.add(JmValidationCode.Meta, 'meta', 'Missing "meta" object.');
    } else {
        for (const key of ['name', 'author', 'version'] as const) {
            if (typeof meta[key] !== 'string') {
                issues.add(
                    JmValidationCode.Meta,
                    `meta/${key}`,
                    `"meta.${key}" must be a string.`
                );
            }
        }
    }

    // ---- nodes / edges containers ----
    const nodes = data.nodes;
    const edges = data.edges;

    if (!isRecord(nodes)) {
        issues.add(JmValidationCode.RootMissing, 'nodes', 'Missing "nodes" object.');
        return { valid: false, errors: issues.errors };
    }
    if (!isRecord(edges)) {
        issues.add(JmValidationCode.EdgeKeyMismatch, 'edges', 'Missing "edges" object.');
    }

    const nodeIds = new Set(Object.keys(nodes));

    // ---- root ----
    const rootId = str(data, 'root');
    if (!rootId) {
        issues.add(JmValidationCode.RootMissing, 'root', '"root" must be a non-empty string.');
    } else if (!nodeIds.has(rootId)) {
        issues.add(
            JmValidationCode.RootMissing,
            'root',
            `"root" points at "${rootId}", which is not in "nodes".`
        );
    }

    // ---- node keys ----
    for (const [key, node] of Object.entries(nodes)) {
        if (!isRecord(node)) {
            issues.add(
                JmValidationCode.NodeKeyMismatch,
                `nodes/${key}`,
                `Node under key "${key}" is not an object.`
            );
            continue;
        }
        if (node.id !== key) {
            issues.add(
                JmValidationCode.NodeKeyMismatch,
                `nodes/${key}`,
                `Key "${key}" does not match the node's own id ${JSON.stringify(node.id)}.`
            );
        }
    }

    // ---- edge keys ----
    if (isRecord(edges)) {
        for (const [key, edge] of Object.entries(edges)) {
            if (!isRecord(edge)) {
                issues.add(
                    JmValidationCode.EdgeKeyMismatch,
                    `edges/${key}`,
                    `Edge under key "${key}" is not an object.`
                );
                continue;
            }
            if (edge.id !== key) {
                issues.add(
                    JmValidationCode.EdgeKeyMismatch,
                    `edges/${key}`,
                    `Key "${key}" does not match the edge's own id ${JSON.stringify(edge.id)}.`
                );
            }
        }
    }

    // ---- per-node checks ----
    const parentOf = new Map<string, string | null>();

    for (const [key, node] of Object.entries(nodes)) {
        if (!isRecord(node)) {
            continue;
        }
        const at = `nodes/${key}`;

        // content
        const content = node.content;
        if (!isRecord(content)) {
            issues.add(JmValidationCode.ContentType, `${at}/content`, 'Missing "content" object.');
        } else {
            const type = content.type;
            if (typeof type !== 'string' || !CONTENT_TYPES.has(type)) {
                issues.add(
                    JmValidationCode.ContentType,
                    `${at}/content/type`,
                    `Unknown content type ${JSON.stringify(type)}. Expected one of ${[...CONTENT_TYPES].join(', ')}.`
                );
            }
        }

        // parent reference
        const parent = node.parent;
        if (parent === null) {
            parentOf.set(key, null);
        } else if (typeof parent === 'string') {
            parentOf.set(key, parent);
            if (!nodeIds.has(parent)) {
                issues.add(
                    JmValidationCode.NodeParentMissing,
                    `${at}/parent`,
                    `Parent "${parent}" is not in "nodes".`
                );
            }
        } else {
            issues.add(
                JmValidationCode.NodeParentMissing,
                `${at}/parent`,
                '"parent" must be a node id or null.'
            );
            parentOf.set(key, null);
        }

        // children references
        const children = node.children;
        if (!Array.isArray(children)) {
            issues.add(
                JmValidationCode.NodeChildMissing,
                `${at}/children`,
                '"children" must be an array.'
            );
        } else {
            for (const childId of children) {
                if (typeof childId !== 'string' || !nodeIds.has(childId)) {
                    issues.add(
                        JmValidationCode.NodeChildMissing,
                        `${at}/children`,
                        `Child ${JSON.stringify(childId)} is not in "nodes".`
                    );
                }
            }
        }

        // side is a number in the JSON, per the format spec: -1 left, 0 centre,
        // 1 right. No name conversion happens at this layer.
        const side = node.side;
        if (typeof side !== 'number' || !SIDE_VALUES.has(side)) {
            issues.add(
                JmValidationCode.Side,
                `${at}/side`,
                `"side" must be -1, 0 or 1, got ${JSON.stringify(side)}.`
            );
        }

        // per-node style
        validateNodeStyle(node.style, `${at}/style`, issues);
    }

    // ---- parent/children agreement ----
    for (const [key, node] of Object.entries(nodes)) {
        if (!isRecord(node) || !Array.isArray(node.children)) {
            continue;
        }
        for (const childId of node.children) {
            if (typeof childId !== 'string') {
                continue;
            }
            const child = nodes[childId];
            if (!isRecord(child)) {
                continue;
            }
            if (child.parent !== key) {
                issues.add(
                    JmValidationCode.ParentChildMismatch,
                    `nodes/${childId}/parent`,
                    `Listed as a child of "${key}", but its parent is ${JSON.stringify(child.parent)}.`
                );
            }
        }
    }

    // ---- exactly one root ----
    const roots = [...parentOf.entries()].filter(([, parent]) => parent === null).map(([id]) => id);
    if (roots.length > 1) {
        issues.add(
            JmValidationCode.MultipleRoots,
            'nodes',
            `${roots.length} nodes have a null parent: ${roots.join(', ')}. Exactly one is allowed.`
        );
    }
    if (rootId && parentOf.has(rootId) && parentOf.get(rootId) !== null) {
        issues.add(
            JmValidationCode.RootParentSet,
            `nodes/${rootId}/parent`,
            'The root node must have a null parent.'
        );
    }

    // ---- cycles ----
    for (const startId of nodeIds) {
        if (hasParentCycle(startId, parentOf)) {
            issues.add(
                JmValidationCode.Cycle,
                `nodes/${startId}`,
                'Following "parent" from this node returns to it.'
            );
            // One report per cycle is enough; the remaining nodes in it would
            // produce the same message.
            break;
        }
    }

    // ---- edges ----
    if (isRecord(edges)) {
        for (const [key, edge] of Object.entries(edges)) {
            if (!isRecord(edge)) {
                continue;
            }
            const at = `edges/${key}`;
            for (const field of ['sourceNodeId', 'targetNodeId'] as const) {
                const endpoint = edge[field];
                if (typeof endpoint !== 'string' || !nodeIds.has(endpoint)) {
                    issues.add(
                        JmValidationCode.EdgeNodeMissing,
                        `${at}/${field}`,
                        `Edge endpoint ${JSON.stringify(endpoint)} is not in "nodes".`
                    );
                }
            }
            validateLineStyle(edge.style, `${at}/style`, issues);
        }
    }

    // ---- mind map style ----
    validateMindStyle(data.style, issues);

    return { valid: issues.errors.length === 0, errors: issues.errors };
}

/**
 * Checks whether following parent links from a node returns to it.
 *
 * @param startId - Node to start from.
 * @param parentOf - Parent map built during the walk.
 * @returns True when the chain loops.
 */
function hasParentCycle(startId: string, parentOf: Map<string, string | null>): boolean {
    const seen = new Set<string>();
    let cursor: string | null | undefined = startId;

    while (cursor !== null && cursor !== undefined) {
        if (seen.has(cursor)) {
            return cursor === startId || seen.has(cursor);
        }
        seen.add(cursor);
        cursor = parentOf.get(cursor);
    }

    return false;
}

/**
 * Validates the per-node style block.
 *
 * @param style - Candidate style value.
 * @param at - Path prefix for messages.
 * @param issues - Collector.
 */
function validateNodeStyle(style: unknown, at: string, issues: IssueList): void {
    if (style === undefined) {
        return;
    }
    if (!isRecord(style)) {
        issues.add(JmValidationCode.StyleRange, at, '"style" must be an object.');
        return;
    }

    const tone = style.tone;
    if (tone !== undefined && (typeof tone !== 'string' || !TONES.has(tone))) {
        issues.add(
            JmValidationCode.Tone,
            `${at}/tone`,
            `Unknown tone ${JSON.stringify(tone)}. Expected one of ${[...TONES].join(', ')}.`
        );
    }

    const borderPattern = style.borderStyle;
    if (borderPattern !== undefined) {
        if (typeof borderPattern !== 'string' || !LINE_PATTERNS.has(borderPattern)) {
            issues.add(
                JmValidationCode.LineStyle,
                `${at}/borderStyle`,
                `Unknown line pattern ${JSON.stringify(borderPattern)}. Expected one of ${[...LINE_PATTERNS].join(', ')}.`
            );
        }
    }

    for (const field of ['borderWidth', 'fontSize'] as const) {
        const value = style[field];
        if (value !== undefined && (typeof value !== 'number' || !(value > 0))) {
            issues.add(
                JmValidationCode.StyleRange,
                `${at}/${field}`,
                `"${field}" must be a positive number, got ${JSON.stringify(value)}.`
            );
        }
    }

    if (style.incoming !== undefined) {
        validateLineStyle(style.incoming, `${at}/incoming`, issues);
    }
}

/**
 * Validates a line style block, shared by node `incoming` and edge `style`.
 *
 * @param style - Candidate line style.
 * @param at - Path prefix for messages.
 * @param issues - Collector.
 */
function validateLineStyle(style: unknown, at: string, issues: IssueList): void {
    if (style === undefined) {
        return;
    }
    if (!isRecord(style)) {
        issues.add(JmValidationCode.LineStyle, at, 'Line style must be an object.');
        return;
    }

    if (style.pattern !== undefined) {
        const pattern = style.pattern;
        if (typeof pattern !== 'string' || !LINE_PATTERNS.has(pattern)) {
            issues.add(
                JmValidationCode.LineStyle,
                `${at}/pattern`,
                `Unknown line pattern ${JSON.stringify(pattern)}. Expected one of ${[...LINE_PATTERNS].join(', ')}.`
            );
        }
    }

    const width = style.width;
    if (width !== undefined && (typeof width !== 'number' || !(width > 0))) {
        issues.add(
            JmValidationCode.StyleRange,
            `${at}/width`,
            `"width" must be a positive number, got ${JSON.stringify(width)}.`
        );
    }
}

/**
 * Validates the mind map level style declaration.
 *
 * @param style - Candidate style declaration.
 * @param issues - Collector.
 */
function validateMindStyle(style: unknown, issues: IssueList): void {
    if (style === undefined) {
        return;
    }
    if (!isRecord(style)) {
        issues.add(JmValidationCode.StyleRange, 'style', '"style" must be an object.');
        return;
    }

    const themeName = style.theme;
    if (themeName !== undefined) {
        if (typeof themeName !== 'string') {
            issues.add(JmValidationCode.ThemeUnknown, 'style/theme', '"style.theme" must be a string.');
        } else if (!(themeName in JSMIND_THEME_PRESETS)) {
            issues.add(
                JmValidationCode.ThemeUnknown,
                'style/theme',
                `Unknown theme ${JSON.stringify(themeName)}. Known themes: ${Object.keys(JSMIND_THEME_PRESETS).join(', ')}.`
            );
        }
    }

    if (style.tones !== undefined) {
        if (!isRecord(style.tones)) {
            issues.add(JmValidationCode.StyleRange, 'style/tones', '"style.tones" must be an object.');
        } else {
            for (const toneName of Object.keys(style.tones)) {
                if (!TONES.has(toneName)) {
                    issues.add(
                        JmValidationCode.Tone,
                        `style/tones/${toneName}`,
                        `Unknown tone ${JSON.stringify(toneName)}.`
                    );
                }
            }
        }
    }

    for (const section of ['node', 'line', 'expander'] as const) {
        if (style[section] === undefined) {
            continue;
        }
        if (!isRecord(style[section])) {
            issues.add(
                JmValidationCode.StyleRange,
                `style/${section}`,
                `"style.${section}" must be an object.`
            );
        }
    }
}
