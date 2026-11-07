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
import { JmEdgeType } from '../model/data/edge.ts';
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
    /** The top-level `nodes` object is absent or not an object. */
    NodesMissing: 'E_NODES_MISSING',
    /** The top-level `edges` object is absent or not an object. */
    EdgesMissing: 'E_EDGES_MISSING',
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
    /** A non-root node uses `side: 0`, which belongs to the root alone. */
    NonRootSideCenter: 'E_NON_ROOT_SIDE_CENTER',
    /** `parent.children` and `child.parent` disagree. */
    ParentChildMismatch: 'E_PARENT_CHILD_MISMATCH',
    /** Following `parent` links returns to where it started. */
    Cycle: 'E_CYCLE',
    /** `content.type` is not a known content type. */
    ContentType: 'E_CONTENT_TYPE',
    /** `edge.type` is not a known edge type. */
    EdgeType: 'E_EDGE_TYPE',
    /** `side` is not a known side value. */
    Side: 'E_SIDE',
    /** `style.tone` is not one of the known tones. */
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

/** Edge types accepted for `edge.type`. */
const EDGE_TYPES: ReadonlySet<string> = new Set(Object.values(JmEdgeType));

/** Numeric side values accepted for a node. */
const SIDE_VALUES: ReadonlySet<number> = new Set(Object.values(JmNodeSide));

/** Line patterns accepted for `borderStyle` and `incoming.pattern`. */
const LINE_PATTERNS: ReadonlySet<string> = new Set(Object.values(JmLinePattern));

/** Tones accepted for `style.tone`. */
const TONES: ReadonlySet<string> = new Set(Object.values(JmTone));

/** Content types accepted for `content.type`. */
const CONTENT_TYPES: ReadonlySet<string> = new Set(Object.values(JmNodeContentType));

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
    const errors: JmValidationIssue[] = [];

    if (!isRecord(data)) {
        errors.push({
            code: JmValidationCode.Format,
            path: '',
            message: 'Data is not an object.',
        });
        return { valid: false, errors };
    }

    // ---- format ----
    if (data.format !== 'jsmind_v2') {
        errors.push({
            code: JmValidationCode.Format,
            path: 'format',
            message: `Expected format "jsmind_v2", got ${JSON.stringify(data.format) ?? 'nothing'}.`,
        });
    }

    // ---- meta ----
    const meta = data.meta;
    if (!isRecord(meta)) {
        errors.push({
            code: JmValidationCode.Meta,
            path: 'meta',
            message: 'Missing "meta" object.',
        });
    } else {
        for (const key of ['name', 'author', 'version'] as const) {
            if (typeof meta[key] !== 'string') {
                errors.push({
                    code: JmValidationCode.Meta,
                    path: `meta/${key}`,
                    message: `"meta.${key}" must be a string.`,
                });
            }
        }
    }

    // ---- nodes / edges containers ----
    const nodes = data.nodes;
    const edges = data.edges;

    // Both container checks run before the early return: a document missing both
    // should learn about both, not just whichever is checked first.
    if (!isRecord(nodes)) {
        errors.push({
            code: JmValidationCode.NodesMissing,
            path: 'nodes',
            message: 'Missing "nodes" object.',
        });
    }
    if (!isRecord(edges)) {
        errors.push({
            code: JmValidationCode.EdgesMissing,
            path: 'edges',
            message: 'Missing "edges" object.',
        });
    }
    if (!isRecord(nodes)) {
        // Without nodes there is not a single reference in the document that can
        // be resolved, so every later rule would only repeat itself.
        return { valid: false, errors };
    }

    const nodeIds = new Set(Object.keys(nodes));

    // ---- root ----
    const rootId = str(data, 'root');
    if (!rootId) {
        errors.push({
            code: JmValidationCode.RootMissing,
            path: 'root',
            message: '"root" must be a non-empty string.',
        });
    } else if (!nodeIds.has(rootId)) {
        errors.push({
            code: JmValidationCode.RootMissing,
            path: 'root',
            message: `"root" points at "${rootId}", which is not in "nodes".`,
        });
    }

    // ---- node keys ----
    for (const [key, node] of Object.entries(nodes)) {
        if (!isRecord(node)) {
            errors.push({
                code: JmValidationCode.NodeKeyMismatch,
                path: `nodes/${key}`,
                message: `Node under key "${key}" is not an object.`,
            });
            continue;
        }
        if (node.id !== key) {
            errors.push({
                code: JmValidationCode.NodeKeyMismatch,
                path: `nodes/${key}`,
                message: `Key "${key}" does not match the node's own id ${JSON.stringify(node.id)}.`,
            });
        }
    }

    // ---- edge keys ----
    if (isRecord(edges)) {
        for (const [key, edge] of Object.entries(edges)) {
            if (!isRecord(edge)) {
                errors.push({
                    code: JmValidationCode.EdgeKeyMismatch,
                    path: `edges/${key}`,
                    message: `Edge under key "${key}" is not an object.`,
                });
                continue;
            }
            if (edge.id !== key) {
                errors.push({
                    code: JmValidationCode.EdgeKeyMismatch,
                    path: `edges/${key}`,
                    message: `Key "${key}" does not match the edge's own id ${JSON.stringify(edge.id)}.`,
                });
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
            errors.push({
                code: JmValidationCode.ContentType,
                path: `${at}/content`,
                message: 'Missing "content" object.',
            });
        } else {
            const type = content.type;
            if (typeof type !== 'string' || !CONTENT_TYPES.has(type)) {
                errors.push({
                    code: JmValidationCode.ContentType,
                    path: `${at}/content/type`,
                    message: `Unknown content type ${JSON.stringify(type)}. Expected one of ${[...CONTENT_TYPES].join(', ')}.`,
                });
            }
        }

        // parent reference
        const parent = node.parent;
        if (parent === null) {
            parentOf.set(key, null);
        } else if (typeof parent === 'string') {
            parentOf.set(key, parent);
            if (!nodeIds.has(parent)) {
                errors.push({
                    code: JmValidationCode.NodeParentMissing,
                    path: `${at}/parent`,
                    message: `Parent "${parent}" is not in "nodes".`,
                });
            }
        } else {
            errors.push({
                code: JmValidationCode.NodeParentMissing,
                path: `${at}/parent`,
                message: '"parent" must be a node id or null.',
            });
            // Deliberately NOT recorded as null. A malformed parent is
            // undetermined, not root-like: recording it as null makes the root
            // count below report an extra E_MULTIPLE_ROOTS for the same broken
            // field, which is a false positive on a different code.
        }

        // children references
        const children = node.children;
        if (!Array.isArray(children)) {
            errors.push({
                code: JmValidationCode.NodeChildMissing,
                path: `${at}/children`,
                message: '"children" must be an array.',
            });
        } else {
            for (const childId of children) {
                if (typeof childId !== 'string' || !nodeIds.has(childId)) {
                    errors.push({
                        code: JmValidationCode.NodeChildMissing,
                        path: `${at}/children`,
                        message: `Child ${JSON.stringify(childId)} is not in "nodes".`,
                    });
                }
            }
        }

        // side is a number in the JSON, per the format spec: -1 left, 0 centre,
        // 1 right. No name conversion happens at this layer.
        const side = node.side;
        if (typeof side !== 'number' || !SIDE_VALUES.has(side)) {
            errors.push({
                code: JmValidationCode.Side,
                path: `${at}/side`,
                message: `"side" must be -1, 0 or 1, got ${JSON.stringify(side)}.`,
            });
        } else if (side === JmNodeSide.Center && parent !== null) {
            // Centre is not a position, it is the absence of one: it tells the
            // layout to place the node relative to the root, which only the root
            // itself can do. A child carrying it is laid out nowhere and does
            // not paint at all - the data validates, the node silently vanishes
            // from the picture, and nothing downstream says why.
            errors.push({
                code: JmValidationCode.NonRootSideCenter,
                path: `${at}/side`,
                message: 'Only the root may use side 0 (centre); a child must be -1 (left) or 1 (right).',
            });
        }

        // per-node style
        validateNodeStyle(node.style, `${at}/style`, errors);
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
                errors.push({
                    code: JmValidationCode.ParentChildMismatch,
                    path: `nodes/${childId}/parent`,
                    message: `Listed as a child of "${key}", but its parent is ${JSON.stringify(child.parent)}.`,
                });
            }
        }
    }

    // ---- exactly one root ----
    // Nodes with a malformed parent are absent from parentOf entirely, so a
    // broken field cannot masquerade as a second root.
    const roots = [...parentOf.entries()].filter(([, parent]) => parent === null).map(([id]) => id);
    if (roots.length > 1) {
        errors.push({
            code: JmValidationCode.MultipleRoots,
            path: 'nodes',
            message: `${roots.length} nodes have a null parent: ${roots.join(', ')}. Exactly one is allowed.`,
        });
    }
    if (rootId && parentOf.has(rootId) && parentOf.get(rootId) !== null) {
        errors.push({
            code: JmValidationCode.RootParentSet,
            path: `nodes/${rootId}/parent`,
            message: 'The root node must have a null parent.',
        });
    }

    // ---- cycles ----
    // A node whose parent chain runs INTO a cycle but does not belong to one
    // must not be blamed: walking up from D (D -> A -> B -> C -> A) does revisit
    // a node, but it is A, not D. Report the cycle's own members instead.
    const reportedCycles = new Set<string>();

    for (const startId of nodeIds) {
        const cycle = findParentCycle(startId, parentOf);
        if (cycle === null) {
            continue;
        }

        // Same cycle reached from different entry points yields the same member
        // set; sort it so one cycle is reported exactly once, and pick a stable
        // node to hang the issue on.
        const members = [...cycle].sort();
        const key = members.join(',');
        if (reportedCycles.has(key)) {
            continue;
        }
        reportedCycles.add(key);

        errors.push({
            code: JmValidationCode.Cycle,
            path: `nodes/${members[0]}`,
            message: `Following "parent" from this node returns to it (cycle: ${members.join(' -> ')} -> ${members[0]}).`,
        });
    }

    // ---- edges ----
    if (isRecord(edges)) {
        for (const [key, edge] of Object.entries(edges)) {
            if (!isRecord(edge)) {
                continue;
            }
            const at = `edges/${key}`;
            const edgeType = edge.type;
            if (typeof edgeType !== 'string' || !EDGE_TYPES.has(edgeType)) {
                errors.push({
                    code: JmValidationCode.EdgeType,
                    path: `${at}/type`,
                    message: `Unknown edge type ${JSON.stringify(edgeType)}. Expected one of ${[...EDGE_TYPES].join(', ')}.`,
                });
            }

            for (const field of ['sourceNodeId', 'targetNodeId'] as const) {
                const endpoint = edge[field];
                if (typeof endpoint !== 'string' || !nodeIds.has(endpoint)) {
                    errors.push({
                        code: JmValidationCode.EdgeNodeMissing,
                        path: `${at}/${field}`,
                        message: `Edge endpoint ${JSON.stringify(endpoint)} is not in "nodes".`,
                    });
                }
            }
            validateLineStyle(edge.style, `${at}/style`, errors);
        }
    }

    // ---- mind map style ----
    validateMindStyle(data.style, errors);

    return { valid: errors.length === 0, errors };
}

/**
 * Walks parent links from a node and returns the members of the cycle it hits.
 *
 * @remarks
 * Returns the cycle itself, not the starting node. Walking up from a node that
 * merely points *into* a cycle passes through that cycle without belonging to
 * it — the caller needs the members to blame the right nodes and to recognise
 * the same cycle reached from different starting points.
 *
 * @param startId - Node to start from.
 * @param parentOf - Parent map built during the walk.
 * @returns Member ids of the cycle, in traversal order; null when the chain
 *          ends without looping.
 */
function findParentCycle(
    startId: string,
    parentOf: Map<string, string | null>
): string[] | null {
    const path: string[] = [];
    const indexOf = new Map<string, number>();
    let cursor: string | null | undefined = startId;

    while (cursor !== null && cursor !== undefined) {
        const seenAt = indexOf.get(cursor);
        if (seenAt !== undefined) {
            // Everything from the first sighting onwards is the cycle; what came
            // before it is the tail that led in and is not part of it.
            return path.slice(seenAt);
        }
        indexOf.set(cursor, path.length);
        path.push(cursor);
        cursor = parentOf.get(cursor);
    }

    return null;
}

/**
 * Validates the per-node style block.
 *
 * @param style - Candidate style value.
 * @param at - Path prefix for messages.
 * @param errors - Collector.
 */
function validateNodeStyle(style: unknown, at: string, errors: JmValidationIssue[]): void {
    if (style === undefined) {
        return;
    }
    if (!isRecord(style)) {
        errors.push({
            code: JmValidationCode.StyleRange,
            path: at,
            message: '"style" must be an object.',
        });
        return;
    }

    const tone = style.tone;
    if (tone !== undefined && (typeof tone !== 'string' || !TONES.has(tone))) {
        errors.push({
            code: JmValidationCode.Tone,
            path: `${at}/tone`,
            message: `Unknown tone ${JSON.stringify(tone)}. Expected one of ${[...TONES].join(', ')}.`,
        });
    }

    const borderPattern = style.borderStyle;
    if (borderPattern !== undefined) {
        if (typeof borderPattern !== 'string' || !LINE_PATTERNS.has(borderPattern)) {
            errors.push({
                code: JmValidationCode.LineStyle,
                path: `${at}/borderStyle`,
                message: `Unknown line pattern ${JSON.stringify(borderPattern)}. Expected one of ${[...LINE_PATTERNS].join(', ')}.`,
            });
        }
    }

    for (const field of ['borderWidth', 'fontSize'] as const) {
        const value = style[field];
        if (value !== undefined && (typeof value !== 'number' || !(value > 0))) {
            errors.push({
                code: JmValidationCode.StyleRange,
                path: `${at}/${field}`,
                message: `"${field}" must be a positive number, got ${JSON.stringify(value)}.`,
            });
        }
    }

    if (style.incoming !== undefined) {
        validateLineStyle(style.incoming, `${at}/incoming`, errors);
    }
}

/**
 * Validates a line style block, shared by node `incoming` and edge `style`.
 *
 * @param style - Candidate line style.
 * @param at - Path prefix for messages.
 * @param errors - Collector.
 */
function validateLineStyle(style: unknown, at: string, errors: JmValidationIssue[]): void {
    if (style === undefined) {
        return;
    }
    if (!isRecord(style)) {
        errors.push({
            code: JmValidationCode.LineStyle,
            path: at,
            message: 'Line style must be an object.',
        });
        return;
    }

    if (style.pattern !== undefined) {
        const pattern = style.pattern;
        if (typeof pattern !== 'string' || !LINE_PATTERNS.has(pattern)) {
            errors.push({
                code: JmValidationCode.LineStyle,
                path: `${at}/pattern`,
                message: `Unknown line pattern ${JSON.stringify(pattern)}. Expected one of ${[...LINE_PATTERNS].join(', ')}.`,
            });
        }
    }

    const width = style.width;
    if (width !== undefined && (typeof width !== 'number' || !(width > 0))) {
        errors.push({
            code: JmValidationCode.StyleRange,
            path: `${at}/width`,
            message: `"width" must be a positive number, got ${JSON.stringify(width)}.`,
        });
    }
}

/**
 * Validates the mind map level style declaration.
 *
 * @param style - Candidate style declaration.
 * @param errors - Collector.
 */
function validateMindStyle(style: unknown, errors: JmValidationIssue[]): void {
    if (style === undefined) {
        return;
    }
    if (!isRecord(style)) {
        errors.push({
            code: JmValidationCode.StyleRange,
            path: 'style',
            message: '"style" must be an object.',
        });
        return;
    }

    const themeName = style.theme;
    if (themeName !== undefined) {
        if (typeof themeName !== 'string') {
            errors.push({
                code: JmValidationCode.ThemeUnknown,
                path: 'style/theme',
                message: '"style.theme" must be a string.',
            });
        } else if (!(themeName in JSMIND_THEME_PRESETS)) {
            errors.push({
                code: JmValidationCode.ThemeUnknown,
                path: 'style/theme',
                message: `Unknown theme ${JSON.stringify(themeName)}. Known themes: ${Object.keys(JSMIND_THEME_PRESETS).join(', ')}.`,
            });
        }
    }

    if (style.tones !== undefined) {
        if (!isRecord(style.tones)) {
            errors.push({
                code: JmValidationCode.StyleRange,
                path: 'style/tones',
                message: '"style.tones" must be an object.',
            });
        } else {
            for (const toneName of Object.keys(style.tones)) {
                if (!TONES.has(toneName)) {
                    errors.push({
                        code: JmValidationCode.Tone,
                        path: `style/tones/${toneName}`,
                        message: `Unknown tone ${JSON.stringify(toneName)}.`,
                    });
                }
            }
        }
    }

    for (const section of ['node', 'line', 'expander'] as const) {
        if (style[section] === undefined) {
            continue;
        }
        if (!isRecord(style[section])) {
            errors.push({
                code: JmValidationCode.StyleRange,
                path: `style/${section}`,
                message: `"style.${section}" must be an object.`,
            });
        }
    }
}
