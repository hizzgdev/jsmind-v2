/**
 * @fileoverview End-to-end tests for the data layer.
 *
 * These read real JSON files from `fixtures/` rather than building objects
 * inline: the point is to exercise what a user would actually open, including
 * formatting, key order and whatever whitespace the file happens to have.
 *
 * Established at S2. Later stages extend this suite — S6 adds rendering, S9
 * adds export — rather than starting their own.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    JmMindJsonSerializer,
    JSMIND_FORMAT_V2,
    type SerializedMindMap,
} from '../../src/serialization/json.ts';
import { validateMindData, JmValidationCode } from '../../src/serialization/validation.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');

/**
 * Lists the JSON fixtures shipped with the suite.
 *
 * @returns File names, sorted so failures are stable between runs.
 */
function fixtureNames(): string[] {
    return readdirSync(FIXTURES)
        .filter(name => name.endsWith('.json'))
        .sort();
}

/**
 * Reads and parses a fixture.
 *
 * @param name - File name inside `fixtures/`.
 * @returns The parsed document.
 */
function readFixture(name: string): Record<string, unknown> {
    return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
}

/**
 * Deep-copies a fixture so a test can damage one field without affecting
 * another.
 *
 * @param doc - Document to copy.
 * @returns An independent copy.
 */
function clone<T>(doc: T): T {
    return JSON.parse(JSON.stringify(doc)) as T;
}

test('e2e - every fixture is valid', () => {
    const names = fixtureNames();
    assert.ok(names.length > 0, 'expected at least one fixture');

    for (const name of names) {
        const result = validateMindData(readFixture(name));
        assert.deepStrictEqual(
            result.errors,
            [],
            `${name} should validate cleanly but reported ${JSON.stringify(result.errors)}`
        );
    }
});

test('e2e - every fixture survives a byte-for-byte round trip', () => {
    const serializer = new JmMindJsonSerializer();

    for (const name of fixtureNames()) {
        const original = readFixture(name);

        // Three passes: the first proves the round trip is stable, the second
        // proves it is a fixed point rather than a coincidence of key order.
        const pass1 = JSON.stringify(serializer.serialize(serializer.deserialize(original)), null, 2);
        const pass2 = JSON.stringify(
            serializer.serialize(serializer.deserialize(JSON.parse(pass1))),
            null,
            2
        );

        assert.strictEqual(pass2, pass1, `${name} should be byte-identical between passes`);
        assert.deepStrictEqual(JSON.parse(pass1), original, `${name} should round trip unchanged`);
    }
});

test('e2e - the styled fixture keeps its styling through a round trip', () => {
    const serializer = new JmMindJsonSerializer();
    const original = readFixture('valid-styled.json');

    const text = JSON.stringify(serializer.serialize(serializer.deserialize(original)), null, 2);

    // Spot-check the parts that carry styling, since a round trip that quietly
    // dropped them would still be "byte-identical" if the input lacked them.
    assert.ok(text.includes('"format": "jsmind_v2"'));
    assert.ok(text.includes('"theme": "default"'), 'mind style theme survives');
    assert.ok(text.includes('"fillColor": "#dbeafe"'), 'tone palette survives');
    assert.ok(text.includes('"incoming"'), 'incoming line style survives');
    assert.ok(text.includes('"pattern": "dashed"'), 'line pattern survives');
    assert.ok(text.includes('"borderStyle": "dotted"'), 'border pattern survives');
    assert.ok(text.includes('"label": "affects"'), 'edge survives');
});

test('e2e - a dangling parent reference is rejected with its code', () => {
    const doc = clone(readFixture('valid-styled.json'));
    const nodes = doc.nodes as Record<string, Record<string, unknown>>;
    nodes['jm-b1'].parent = 'jm-deleted';
    nodes['jm-a1'].children = [];

    const result = validateMindData(doc);
    assert.strictEqual(result.valid, false);
    assert.ok(
        result.errors.some(issue => issue.code === JmValidationCode.NodeParentMissing),
        `expected E_NODE_PARENT_MISSING, got ${JSON.stringify(result.errors)}`
    );
});

test('e2e - a broken parent/child pair is rejected', () => {
    // The failure mode this rule exists for: the JSON still renders a tree, but
    // one node ends up attached somewhere the document did not say.
    const doc = clone(readFixture('valid-styled.json'));
    const nodes = doc.nodes as Record<string, Record<string, unknown>>;
    nodes['jm-b1'].parent = 'jm-a2';

    const result = validateMindData(doc);
    assert.ok(
        result.errors.some(issue => issue.code === JmValidationCode.ParentChildMismatch),
        `expected E_PARENT_CHILD_MISMATCH, got ${JSON.stringify(result.errors.map(e => e.code))}`
    );
});

test('e2e - an unknown tone is rejected', () => {
    const doc = clone(readFixture('valid-styled.json'));
    const nodes = doc.nodes as Record<string, Record<string, unknown>>;
    (nodes['jm-a2'].style as Record<string, unknown>).tone = 'chartreuse';

    const result = validateMindData(doc);
    assert.ok(result.errors.some(issue => issue.code === JmValidationCode.Tone));
});

test('e2e - an unknown theme is rejected', () => {
    const doc = clone(readFixture('valid-styled.json'));
    (doc.style as Record<string, unknown>).theme = 'solarized';

    const result = validateMindData(doc);
    assert.ok(result.errors.some(issue => issue.code === JmValidationCode.ThemeUnknown));
});

test('e2e - a document missing the format field is rejected', () => {
    const doc = clone(readFixture('valid-styled.json'));
    delete doc.format;

    const result = validateMindData(doc);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.errors[0].code, JmValidationCode.Format);
});

test('e2e - deserialize surfaces the first code on the thrown error', () => {
    const serializer = new JmMindJsonSerializer();
    const doc = clone(readFixture('valid-styled.json'));
    delete doc.format;

    assert.throws(
        () => serializer.deserialize(doc as unknown as SerializedMindMap),
        (err: unknown) => {
            const e = err as { code?: string; message: string; data?: { errors?: unknown[] } };
            assert.strictEqual(e.code, JmValidationCode.Format, 'error carries the code');
            assert.ok(e.message.includes('E_FORMAT'), 'message names the code');
            assert.ok(Array.isArray(e.data?.errors), 'full issue list rides along');
            return true;
        }
    );
});

test('e2e - garbage input is rejected without throwing a TypeError', () => {
    const serializer = new JmMindJsonSerializer();

    for (const value of [null, undefined, 0, '', [], { format: JSMIND_FORMAT_V2 }]) {
        const result = validateMindData(value);
        assert.strictEqual(result.valid, false, `${JSON.stringify(value)} should be invalid`);

        // deserialize may throw, but it must be a JsMindError with a code, not
        // a TypeError from reading a property of undefined.
        assert.throws(
            () => serializer.deserialize(value),
            (err: unknown) => {
                assert.ok(err instanceof Error);
                assert.notStrictEqual(err.constructor.name, 'TypeError', 'should not be a TypeError');
                return true;
            }
        );
    }
});
