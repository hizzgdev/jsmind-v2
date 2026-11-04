/**
 * @fileoverview Tests for style/theme/format serialization
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
    JmMindJsonSerializer,
    JMIND_FORMAT_V2,
    type SerializedMindMap,
} from '../../src/serialization/json.ts';
import { JmMind } from '../../src/model/mind.ts';
import { JmNodeContent } from '../../src/model/data/node-content.ts';
import { JmEdgeType } from '../../src/model/data/edge.ts';
import { JmTone, JmLineStyleType } from '../../src/model/data/style.ts';

test('json-style - serialize writes the v2 format identifier', () => {
    const serializer = new JmMindJsonSerializer();
    const data = serializer.serialize(new JmMind());

    assert.strictEqual(data.format, JMIND_FORMAT_V2);
    assert.strictEqual(data.format, 'jsmind_v2');
});

test('json-style - serialize omits theme when the mind map has none', () => {
    const serializer = new JmMindJsonSerializer();
    const data = serializer.serialize(new JmMind());

    assert.strictEqual(
        Object.prototype.hasOwnProperty.call(data, 'theme'),
        false,
        'absent theme must not appear as an undefined key'
    );
});

test('json-style - serialize omits node style when the node has none', () => {
    const serializer = new JmMindJsonSerializer();
    const mind = new JmMind();
    mind.addNode(JmNodeContent.createText('Child'), { parentId: mind.root.id });

    const data = serializer.serialize(mind);

    for (const node of Object.values(data.nodes)) {
        assert.strictEqual(
            Object.prototype.hasOwnProperty.call(node, 'style'),
            false,
            `node ${node.id} should have no style key`
        );
    }
});

test('json-style - serialize carries node style', () => {
    const serializer = new JmMindJsonSerializer();
    const mind = new JmMind();

    const node = mind.addNode(
        JmNodeContent.createText('Warn'),
        { parentId: mind.root.id },
        {
            style: {
                tone: JmTone.Warning,
                fontSize: 18,
                fontWeight: 'bold',
                borderWidth: 2,
                borderStyle: JmLineStyleType.Dashed,
                incoming: { color: '#ff8800', width: 3, style: JmLineStyleType.Dotted },
            },
        }
    );

    const data = serializer.serialize(mind);
    const serialized = data.nodes[node.id];

    assert.ok(serialized.style, 'style should be serialized');
    assert.strictEqual(serialized.style.tone, JmTone.Warning);
    assert.strictEqual(serialized.style.fontSize, 18);
    assert.strictEqual(serialized.style.fontWeight, 'bold');
    assert.strictEqual(serialized.style.borderWidth, 2);
    assert.strictEqual(serialized.style.borderStyle, JmLineStyleType.Dashed);
    assert.deepStrictEqual(serialized.style.incoming, {
        color: '#ff8800',
        width: 3,
        style: JmLineStyleType.Dotted,
    });
});

test('json-style - serialize carries theme', () => {
    const serializer = new JmMindJsonSerializer();
    const mind = new JmMind();
    mind.theme = 'default';

    assert.strictEqual(serializer.serialize(mind).theme, 'default');

    mind.theme = {
        name: 'default',
        tones: { [JmTone.Primary]: { fill: '#123456' } },
    };
    const inline = serializer.serialize(mind).theme;
    assert.ok(typeof inline === 'object', 'inline theme should serialize as an object');
    assert.strictEqual(inline.name, 'default');
});

test('json-style - serialize carries edge style', () => {
    const serializer = new JmMindJsonSerializer();
    const mind = new JmMind();

    const a = mind.addNode(JmNodeContent.createText('A'), { parentId: mind.root.id });
    const b = mind.addNode(JmNodeContent.createText('B'), { parentId: mind.root.id });
    const edge = mind.addEdge(a.id, b.id, JmEdgeType.Link, {
        label: 'relates',
        style: { color: '#00aa00', width: 2, style: JmLineStyleType.Dashed },
    });

    const serialized = serializer.serialize(mind).edges[edge.id];
    assert.ok(serialized.style, 'edge style should be serialized');
    assert.deepStrictEqual(serialized.style, {
        color: '#00aa00',
        width: 2,
        style: JmLineStyleType.Dashed,
    });
});

test('json-style - deserialize restores theme and styles', () => {
    const serializer = new JmMindJsonSerializer();

    const source: SerializedMindMap = {
        format: JMIND_FORMAT_V2,
        theme: { name: 'default', background: '#fafafa' },
        meta: { id: 'm1', name: 'Styled', author: '', version: '2.0.0' },
        root: 'root',
        nodes: {
            root: {
                id: 'root',
                content: { type: 'text', value: 'Root' },
                parent: null,
                children: ['n1'],
                folded: false,
                side: 1,
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
                style: {
                    tone: JmTone.Success,
                    fontSize: 16,
                    incoming: { color: '#00ff00', width: 1 },
                },
            },
        },
        edges: {},
    };

    const mind = serializer.deserialize(source);

    assert.deepStrictEqual(mind.theme, source.theme, 'theme should round-trip');
    assert.strictEqual(mind._nodes['n1'].style?.tone, JmTone.Success);
    assert.strictEqual(mind._nodes['n1'].style?.fontSize, 16);
    assert.deepStrictEqual(mind._nodes['n1'].style?.incoming, {
        color: '#00ff00',
        width: 1,
    });
});

test('json-style - serialized style does not share nested objects with the model', () => {
    const serializer = new JmMindJsonSerializer();
    const mind = new JmMind();

    const node = mind.addNode(
        JmNodeContent.createText('X'),
        { parentId: mind.root.id },
        { style: { incoming: { color: '#111111' } } }
    );

    const serialized = serializer.serialize(mind);

    // Mutating the live model must not reach back into the snapshot.
    node.style!.incoming!.color = '#999999';
    assert.strictEqual(
        serialized.nodes[node.id].style!.incoming!.color,
        '#111111',
        'snapshot should be detached from the live model'
    );
});

test('json-style - round trip is byte-for-byte identical', () => {
    // The S1 acceptance criterion: a JSON carrying style and theme, read in and
    // written back out, must come out byte-for-byte the same.
    const serializer = new JmMindJsonSerializer();

    const original: SerializedMindMap = {
        format: JMIND_FORMAT_V2,
        theme: {
            name: 'default',
            background: '#ffffff',
            tones: { [JmTone.Primary]: { fill: '#e8f3ff', text: '#1a5fb4' } },
            node: { radius: 6, fontSize: 15 },
            line: { width: 3, style: JmLineStyleType.Solid },
        },
        meta: { id: 'm2', name: 'Round trip', author: 'me', version: '2.0.0' },
        root: 'root',
        nodes: {
            root: {
                id: 'root',
                content: { type: 'text', value: 'Root' },
                parent: null,
                children: ['n1'],
                folded: false,
                side: 1,
                data: { pinned: true },
                style: { tone: JmTone.Primary, fontSize: 20 },
            },
            n1: {
                id: 'n1',
                content: { type: 'text', value: 'Child' },
                parent: 'root',
                children: [],
                folded: false,
                side: -1,
                data: {},
                style: {
                    tone: JmTone.Danger,
                    borderStyle: JmLineStyleType.Dotted,
                    incoming: { color: '#d97069', width: 2, style: JmLineStyleType.Dashed },
                },
            },
        },
        edges: {},
    };

    const firstPass = JSON.stringify(serializer.serialize(serializer.deserialize(original)), null, 2);
    const secondPass = JSON.stringify(
        serializer.serialize(serializer.deserialize(JSON.parse(firstPass))),
        null,
        2
    );

    assert.strictEqual(secondPass, firstPass, 'repeated round trips must be byte-for-byte stable');
    assert.deepStrictEqual(
        JSON.parse(firstPass),
        original,
        'the round-tripped data must equal the original'
    );
});

test('json-style - legacy data without format or theme still deserializes', () => {
    // Files written before the format/theme fields existed must keep working.
    const serializer = new JmMindJsonSerializer();

    const legacy: SerializedMindMap = {
        meta: { id: 'm3', name: 'Legacy', author: '', version: '2.0.0' },
        root: 'root',
        nodes: {
            root: {
                id: 'root',
                content: { type: 'text', value: 'Root' },
                parent: null,
                children: [],
                folded: false,
                side: 1,
                data: {},
            },
        },
        edges: {},
    };

    const mind = serializer.deserialize(legacy);
    assert.strictEqual(mind.theme, undefined, 'no theme in, no theme out');
    assert.strictEqual(mind._nodes['root'].style, undefined);

    // Re-serializing adds the format identifier; that is expected and harmless.
    assert.strictEqual(serializer.serialize(mind).format, JMIND_FORMAT_V2);
});
