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

test('validation - E_CYCLE when parent links loop', () => {
    const doc = validDoc({
        root: 'a',
        nodes: {
            a: {
                id: 'a',
                content: { type: 'text', value: 'A' },
                parent: 'b',
                children: ['b'],
                folded: false,
                side: 0,
                data: {},
            },
            b: {
                id: 'b',
                content: { type: 'text', value: 'B' },
                parent: 'a',
                children: ['a'],
                folded: false,
                side: 0,
                data: {},
            },
        },
    });

    assert.ok(codes(validateMindData(doc)).includes(JmValidationCode.Cycle));
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
