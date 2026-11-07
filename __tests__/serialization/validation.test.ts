/**
 * @fileoverview Tests for v2 data validation.
 *
 * One case per error code, plus a clean document that must produce no issues
 * at all. The "no false positives" case matters as much as the rest: a
 * validator that rejects valid data is worse than none.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
    validateMindData,
    JmValidationCode,
    type JmValidationResult,
} from '../../src/serialization/validation.ts';

/**
 * Builds a minimal valid document.
 *
 * @param overrides - Fields to replace or add at the top level.
 * @returns A document that validates cleanly unless overrides break it.
 */
function validDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        format: 'jsmind_v2',
        meta: { name: 'Test', author: 'someone', version: '1.0' },
        root: 'root',
        nodes: {
            root: {
                id: 'root',
                content: { type: 'text', value: 'Root' },
                parent: null,
                children: ['n1'],
                folded: false,
                side: 0,
                data: {},
            },
            n1: {
                id: 'n1',
                content: { type: 'text', value: 'Child' },
                parent: 'root',
                children: [],
                folded: false,
                side: 1,
                data: {},
            },
        },
        edges: {},
        ...overrides,
    };
}

/**
 * Extracts the codes from a result.
 *
 * @param result - Validation result.
 * @returns Codes in the order found.
 */
function codes(result: JmValidationResult): string[] {
    return result.errors.map(error => error.code);
}

test('validation - a clean document produces no issues', () => {
    const result = validateMindData(validDoc());

    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.errors, [], 'no false positives on valid data');
});

test('validation - a mind map with style and edges validates cleanly', () => {
    const doc = validDoc({
        style: {
            theme: 'default',
            background: '#fafafa',
            tones: { primary: { fillColor: '#dbeafe' } },
            node: { radius: 8 },
            line: { width: 3, pattern: 'dashed' },
            expander: { size: 14 },
        },
        nodes: {
            root: {
                id: 'root',
                content: { type: 'text', value: 'Root' },
                parent: null,
                children: ['n1', 'n2'],
                folded: false,
                side: 0,
                data: {},
                style: { tone: 'primary', fontSize: 22, fontWeight: 'bold' },
            },
            n1: {
                id: 'n1',
                content: { type: 'text', value: 'Child' },
                parent: 'root',
                children: [],
                folded: false,
                side: 1,
                data: {},
                style: {
                    tone: 'warning',
                    borderWidth: 2,
                    borderStyle: 'dotted',
                    incoming: { color: '#d4a944', width: 3, pattern: 'dashed' },
                },
            },
            n2: {
                id: 'n2',
                content: { type: 'text', value: 'Other' },
                parent: 'root',
                children: [],
                folded: false,
                side: -1,
                data: {},
            },
        },
        edges: {
            e1: {
                id: 'e1',
                sourceNodeId: 'n1',
                targetNodeId: 'n2',
                type: 'link',
                label: 'relates',
                style: { color: '#d97069', width: 2, pattern: 'solid' },
            },
        },
    });

    const result = validateMindData(doc);
    assert.strictEqual(result.valid, true, JSON.stringify(result.errors));
});

test('validation - E_FORMAT when format is missing', () => {
    const doc = validDoc();
    delete doc.format;
    assert.deepStrictEqual(codes(validateMindData(doc)), [JmValidationCode.Format]);
});

test('validation - E_FORMAT when format has the wrong value', () => {
    assert.deepStrictEqual(
        codes(validateMindData(validDoc({ format: 'jsmind_v1' }))),
        [JmValidationCode.Format]
    );
});

test('validation - E_META when meta is not an object', () => {
    assert.deepStrictEqual(
        codes(validateMindData(validDoc({ meta: 'nope' }))),
        [JmValidationCode.Meta]
    );
});

test('validation - E_META when a meta field is not a string', () => {
    const doc = validDoc({ meta: { name: 'Test', author: 42, version: '1.0' } });
    assert.deepStrictEqual(codes(validateMindData(doc)), [JmValidationCode.Meta]);
});

test('validation - E_ROOT_MISSING when root points nowhere', () => {
    assert.deepStrictEqual(
        codes(validateMindData(validDoc({ root: 'absent' }))),
        [JmValidationCode.RootMissing]
    );
});

test('validation - E_NODE_KEY_MISMATCH when a node key differs from its id', () => {
    const doc = validDoc();
    (doc.nodes as Record<string, Record<string, unknown>>).renamed = {
        id: 'actual-id',
        content: { type: 'text', value: 'x' },
        parent: 'root',
        children: [],
        folded: false,
        side: 1,
        data: {},
    };

    assert.ok(codes(validateMindData(doc)).includes(JmValidationCode.NodeKeyMismatch));
});

test('validation - E_EDGE_KEY_MISMATCH when an edge key differs from its id', () => {
    const doc = validDoc({
        edges: {
            wrongKey: {
                id: 'rightKey',
                sourceNodeId: 'root',
                targetNodeId: 'n1',
                type: 'link',
                label: null,
            },
        },
    });

    assert.ok(codes(validateMindData(doc)).includes(JmValidationCode.EdgeKeyMismatch));
});

test('validation - E_NODE_PARENT_MISSING when parent points at an absent node', () => {
    const doc = validDoc();
    const nodes = doc.nodes as Record<string, Record<string, unknown>>;
    nodes.n1.parent = 'ghost';
    // Clear the parent's children so the only broken reference is n1.parent;
    // otherwise the disagreement rule fires too and the case stops isolating
    // the code under test.
    nodes.root.children = [];

    assert.deepStrictEqual(codes(validateMindData(doc)), [JmValidationCode.NodeParentMissing]);
});

test('validation - E_NODE_CHILD_MISSING when children lists an absent node', () => {
    const doc = validDoc();
    (doc.nodes as Record<string, Record<string, unknown>>).root.children = ['n1', 'ghost'];

    assert.deepStrictEqual(codes(validateMindData(doc)), [JmValidationCode.NodeChildMissing]);
});

test('validation - E_EDGE_NODE_MISSING when an edge endpoint is absent', () => {
    const doc = validDoc({
        edges: {
            e1: {
                id: 'e1',
                sourceNodeId: 'root',
                targetNodeId: 'ghost',
                type: 'link',
                label: null,
            },
        },
    });

    assert.deepStrictEqual(codes(validateMindData(doc)), [JmValidationCode.EdgeNodeMissing]);
});

test('validation - E_MULTIPLE_ROOTS when two nodes have a null parent', () => {
    const doc = validDoc({
        nodes: {
            root: {
                id: 'root',
                content: { type: 'text', value: 'Root' },
                parent: null,
                children: [],
                folded: false,
                side: 0,
                data: {},
            },
            n1: {
                id: 'n1',
                content: { type: 'text', value: 'Orphan' },
                parent: null,
                children: [],
                folded: false,
                side: 1,
                data: {},
            },
        },
    });

    assert.deepStrictEqual(codes(validateMindData(doc)), [JmValidationCode.MultipleRoots]);
});

test('validation - E_ROOT_PARENT_SET when the root has a parent', () => {
    const doc = validDoc();
    (doc.nodes as Record<string, Record<string, unknown>>).root.parent = 'n1';
    (doc.nodes as Record<string, Record<string, unknown>>).n1.children = ['root'];

    assert.ok(codes(validateMindData(doc)).includes(JmValidationCode.RootParentSet));
});

test('validation - E_PARENT_CHILD_MISMATCH when the two sides disagree', () => {
    // The node claims a child, but the child claims a different parent. This is
    // the silent failure the rule exists for: the tree renders, but the node
    // never attaches where the document says it should.
    const doc = validDoc();
    const nodes = doc.nodes as Record<string, Record<string, unknown>>;
    nodes.n1.parent = null;
    nodes.root.children = ['n1'];

    assert.ok(codes(validateMindData(doc)).includes(JmValidationCode.ParentChildMismatch));
});

/**
 * Builds a document with a cycle a -> b -> c -> a plus a node d hanging off it.
 *
 * @returns A document whose only structural fault is the cycle.
 */
function cycleDoc(): Record<string, unknown> {
    const node = (id: string, parent: string, children: string[]) => ({
        id,
        content: { type: 'text', value: id },
        parent,
        children,
        folded: false,
        side: 0,
        data: {},
    });

    return validDoc({
        root: 'a',
        nodes: {
            a: node('a', 'b', ['c', 'd']),
            b: node('b', 'c', ['a']),
            c: node('c', 'a', ['b']),
            d: node('d', 'a', []),
        },
    });
}

test('validation - E_CYCLE when parent links loop', () => {
    assert.ok(codes(validateMindData(cycleDoc())).includes(JmValidationCode.Cycle));
});

test('validation - E_CYCLE blames the cycle, not a node pointing into it', () => {
    // Walking up from d (d -> a -> b -> c -> a) does revisit a node, but that
    // node is a, not d. Reporting at d would claim "following parent from this
    // node returns to it", which is false: it returns to a.
    const result = validateMindData(cycleDoc());
    const cycleIssues = result.errors.filter(issue => issue.code === JmValidationCode.Cycle);

    assert.strictEqual(cycleIssues.length, 1, 'one cycle should produce one issue');
    assert.strictEqual(cycleIssues[0].path, 'nodes/a', 'blamed node must be a cycle member');
    assert.ok(
        cycleIssues[0].message.includes('returns to it'),
        'message should describe a self-return'
    );
});

test('validation - E_CYCLE reports each disjoint cycle separately', () => {
    // Two independent cycles must produce two issues, not one. Stopping at the
    // first would hide the second entirely.
    const node = (id: string, parent: string, children: string[]) => ({
        id,
        content: { type: 'text', value: id },
        parent,
        children,
        folded: false,
        side: 0,
        data: {},
    });

    const doc = validDoc({
        root: 'a',
        nodes: {
            a: node('a', 'b', ['b']),
            b: node('b', 'a', ['a']),
            x: node('x', 'y', ['y']),
            y: node('y', 'x', ['x']),
        },
    });

    const cycleIssues = validateMindData(doc).errors.filter(
        issue => issue.code === JmValidationCode.Cycle
    );

    assert.strictEqual(cycleIssues.length, 2, 'both cycles should be reported');
    assert.deepStrictEqual(
        cycleIssues.map(issue => issue.path).sort(),
        ['nodes/a', 'nodes/x'],
        'each cycle blamed at its own smallest member'
    );
});

test('validation - E_NODES_MISSING when nodes is absent', () => {
    const doc = validDoc();
    delete doc.nodes;

    assert.deepStrictEqual(codes(validateMindData(doc)), [JmValidationCode.NodesMissing]);
});

test('validation - both missing containers are reported, not just the first', () => {
    // The early return after a missing `nodes` must not swallow the far simpler
    // fact that `edges` is missing too.
    const doc = validDoc();
    delete doc.nodes;
    delete doc.edges;

    assert.deepStrictEqual(
        codes(validateMindData(doc)).sort(),
        [JmValidationCode.EdgesMissing, JmValidationCode.NodesMissing].sort()
    );
});

test('validation - a malformed parent is not also counted as a second root', () => {
    // A parent of the wrong type is undetermined, not root-like. Counting it as
    // a null parent would report E_MULTIPLE_ROOTS for the same broken field,
    // blaming a second, unrelated rule.
    const doc = validDoc();
    const nodes = doc.nodes as Record<string, Record<string, unknown>>;
    nodes.n1.parent = 42;

    const result = validateMindData(doc);
    const got = codes(result);

    assert.ok(got.includes(JmValidationCode.NodeParentMissing), 'the real fault is reported');
    assert.ok(
        !got.includes(JmValidationCode.MultipleRoots),
        `malformed parent must not produce E_MULTIPLE_ROOTS, got ${JSON.stringify(got)}`
    );
});

test('validation - E_EDGES_MISSING when edges is absent', () => {
    const doc = validDoc();
    delete doc.edges;

    assert.deepStrictEqual(codes(validateMindData(doc)), [JmValidationCode.EdgesMissing]);
});

test('validation - E_EDGE_TYPE when an edge type is unknown', () => {
    const doc = validDoc({
        edges: {
            e1: {
                id: 'e1',
                sourceNodeId: 'root',
                targetNodeId: 'n1',
                type: 'hyperlink',
                label: null,
            },
        },
    });

    assert.deepStrictEqual(codes(validateMindData(doc)), [JmValidationCode.EdgeType]);
});

test('validation - a known edge type passes', () => {
    const doc = validDoc({
        edges: {
            e1: {
                id: 'e1',
                sourceNodeId: 'root',
                targetNodeId: 'n1',
                type: 'link',
                label: null,
            },
        },
    });

    assert.deepStrictEqual(validateMindData(doc).errors, []);
});

test('validation - E_CONTENT_TYPE when content.type is unknown', () => {
    const doc = validDoc();
    (doc.nodes as Record<string, Record<string, unknown>>).n1.content = {
        type: 'video',
        value: 'x',
    };

    assert.deepStrictEqual(codes(validateMindData(doc)), [JmValidationCode.ContentType]);
});

test('validation - E_SIDE when side is out of range', () => {
    const doc = validDoc();
    (doc.nodes as Record<string, Record<string, unknown>>).n1.side = 5;

    assert.deepStrictEqual(codes(validateMindData(doc)), [JmValidationCode.Side]);
});

test('validation - E_NON_ROOT_SIDE_CENTER when a child sits at side 0', () => {
    const doc = validDoc();
    (doc.nodes as Record<string, Record<string, unknown>>).n1.side = 0;

    assert.deepStrictEqual(codes(validateMindData(doc)), [JmValidationCode.NonRootSideCenter]);
});

test('validation - the root keeps side 0 without complaint', () => {
    // The root is the only node that legitimately has no side: it is the point
    // everything is positioned relative to.
    const doc = validDoc();
    assert.strictEqual((doc.nodes as Record<string, Record<string, unknown>>).root.side, 0);

    assert.strictEqual(validateMindData(doc).valid, true);
});

test('validation - a node with no parent may still not use side 0', () => {
    // A missing parent is already reported; the node is still not the root, so
    // side 0 is still wrong. Two independent faults, two codes.
    const doc = validDoc();
    const nodes = doc.nodes as Record<string, Record<string, unknown>>;
    nodes.n1.parent = undefined;
    nodes.n1.side = 0;

    const reported = codes(validateMindData(doc));
    assert.ok(reported.includes(JmValidationCode.NodeParentMissing), 'parent fault reported');
    assert.ok(reported.includes(JmValidationCode.NonRootSideCenter), 'side fault reported');
});

test('validation - E_TONE when a node tone is unknown', () => {
    const doc = validDoc();
    (doc.nodes as Record<string, Record<string, unknown>>).n1.style = { tone: 'puce' };

    assert.deepStrictEqual(codes(validateMindData(doc)), [JmValidationCode.Tone]);
});

test('validation - E_TONE when a palette override names an unknown tone', () => {
    const doc = validDoc({ style: { tones: { chartreuse: { fillColor: '#fff' } } } });

    assert.deepStrictEqual(codes(validateMindData(doc)), [JmValidationCode.Tone]);
});

test('validation - E_LINE_STYLE when a border pattern is unknown', () => {
    const doc = validDoc();
    (doc.nodes as Record<string, Record<string, unknown>>).n1.style = { borderStyle: 'wavy' };

    assert.deepStrictEqual(codes(validateMindData(doc)), [JmValidationCode.LineStyle]);
});

test('validation - E_LINE_STYLE when an incoming pattern is unknown', () => {
    const doc = validDoc();
    (doc.nodes as Record<string, Record<string, unknown>>).n1.style = {
        incoming: { pattern: 'zigzag' },
    };

    assert.deepStrictEqual(codes(validateMindData(doc)), [JmValidationCode.LineStyle]);
});

test('validation - E_STYLE_RANGE when fontSize is not positive', () => {
    const doc = validDoc();
    (doc.nodes as Record<string, Record<string, unknown>>).n1.style = { fontSize: -2 };

    assert.deepStrictEqual(codes(validateMindData(doc)), [JmValidationCode.StyleRange]);
});

test('validation - E_STYLE_RANGE when borderWidth is zero', () => {
    const doc = validDoc();
    (doc.nodes as Record<string, Record<string, unknown>>).n1.style = { borderWidth: 0 };

    assert.deepStrictEqual(codes(validateMindData(doc)), [JmValidationCode.StyleRange]);
});

test('validation - E_THEME_UNKNOWN when the named theme does not exist', () => {
    const doc = validDoc({ style: { theme: 'solarized' } });

    assert.deepStrictEqual(codes(validateMindData(doc)), [JmValidationCode.ThemeUnknown]);
});

test('validation - E_THEME_UNKNOWN when the theme is not a string', () => {
    const doc = validDoc({ style: { theme: 42 } });

    assert.deepStrictEqual(codes(validateMindData(doc)), [JmValidationCode.ThemeUnknown]);
});

test('validation - non-object input reports E_FORMAT instead of throwing', () => {
    for (const value of [null, undefined, 42, 'text', [], true]) {
        const result = validateMindData(value);
        assert.strictEqual(result.valid, false, `${JSON.stringify(value)} should be invalid`);
        assert.strictEqual(result.errors[0].code, JmValidationCode.Format);
    }
});

test('validation - every issue carries a code, a path and a message', () => {
    const doc = validDoc({ format: 'nope', meta: { name: 1, author: 2, version: 3 } });
    const result = validateMindData(doc);

    assert.ok(result.errors.length > 0);
    for (const issue of result.errors) {
        assert.strictEqual(typeof issue.code, 'string');
        assert.ok(issue.code.startsWith('E_'), `code ${issue.code} should be namespaced`);
        assert.strictEqual(typeof issue.path, 'string');
        assert.strictEqual(typeof issue.message, 'string');
        assert.ok(issue.message.length > 0, 'message should not be empty');
        assert.ok(issue.message.endsWith('.'), 'message should read as a sentence');
    }
});

test('validation - reports every issue, not just the first', () => {
    const doc = validDoc({
        format: 'nope',
        meta: { name: 1, author: 2, version: 3 },
        root: 'ghost',
    });
    const result = validateMindData(doc);

    assert.ok(result.errors.length >= 4, `expected several issues, got ${result.errors.length}`);
    assert.ok(result.valid === false);
});
