/**
 * @fileoverview Tests for nested field paths.
 *
 * These are plain object operations, so they are tested directly rather than
 * through a command: the interesting cases (a path through a non-object, a
 * container left empty by a removal) are hard to stage through a flag and
 * obvious here.
 */

import { test } from 'node:test';
import assert from 'node:assert';

import { deleteAtPath, flagToPath, getAtPath, pathToFlag, setAtPath } from '../../src/cli/field-path.ts';

test('field-path - flagToPath splits levels on dots', () => {
    assert.deepStrictEqual(flagToPath('incoming.color'), ['incoming', 'color']);
    assert.deepStrictEqual(flagToPath('a.b.c'), ['a', 'b', 'c']);
});

test('field-path - flagToPath camelCases the words within one level', () => {
    assert.deepStrictEqual(flagToPath('font-size'), ['fontSize']);
    assert.deepStrictEqual(flagToPath('border-color'), ['borderColor']);
    assert.deepStrictEqual(flagToPath('incoming.font-weight'), ['incoming', 'fontWeight']);
});

test('field-path - flagToPath leaves a single word alone', () => {
    assert.deepStrictEqual(flagToPath('tone'), ['tone']);
});

test('field-path - pathToFlag round-trips every flag this CLI uses', () => {
    const flags = [
        'tone',
        'background',
        'border-color',
        'font-size',
        'font-weight',
        'incoming.color',
        'incoming.width',
        'incoming.pattern',
        'incoming.curve',
    ];
    for (const flag of flags) {
        assert.strictEqual(pathToFlag(flagToPath(flag)), flag, flag);
    }
});

test('field-path - getAtPath reads through levels', () => {
    const target = { incoming: { color: '#f00' }, tone: 'danger' };
    assert.strictEqual(getAtPath(target, ['incoming', 'color']), '#f00');
    assert.strictEqual(getAtPath(target, ['tone']), 'danger');
});

test('field-path - getAtPath returns undefined for anything missing', () => {
    const target = { incoming: { color: '#f00' } };
    assert.strictEqual(getAtPath(target, ['incoming', 'width']), undefined);
    assert.strictEqual(getAtPath(target, ['shadow', 'blur']), undefined);
    // A level that holds a primitive cannot be descended into.
    assert.strictEqual(getAtPath({ tone: 'danger' }, ['tone', 'x']), undefined);
});

test('field-path - setAtPath creates intermediate objects', () => {
    const target: Record<string, unknown> = {};
    setAtPath(target, ['incoming', 'color'], '#00f');
    assert.deepStrictEqual(target, { incoming: { color: '#00f' } });
});

test('field-path - setAtPath keeps siblings at every level', () => {
    const target: Record<string, unknown> = { incoming: { width: 3 }, tone: 'danger' };
    setAtPath(target, ['incoming', 'color'], '#00f');
    assert.deepStrictEqual(target, { incoming: { width: 3, color: '#00f' }, tone: 'danger' });
});

test('field-path - setAtPath refuses to descend through a primitive', () => {
    const target: Record<string, unknown> = { incoming: 'not an object' };
    assert.throws(() => setAtPath(target, ['incoming', 'color'], '#00f'), /Cannot descend/);
});

test('field-path - setAtPath rejects an empty path', () => {
    assert.throws(() => setAtPath({}, [], 1), /non-empty path/);
});

test('field-path - deleteAtPath removes only the leaf', () => {
    const target: Record<string, unknown> = { incoming: { color: '#f00', width: 3 } };
    assert.strictEqual(deleteAtPath(target, ['incoming', 'color']), true);
    assert.deepStrictEqual(target, { incoming: { width: 3 } });
});

test('field-path - deleteAtPath drops a container it emptied', () => {
    // Leaving `{ incoming: {} }` behind would mean the same thing to the theme
    // resolver but would still serialise, which is what this prevents.
    const target: Record<string, unknown> = { incoming: { color: '#f00' }, tone: 'danger' };
    assert.strictEqual(deleteAtPath(target, ['incoming', 'color']), true);
    assert.deepStrictEqual(target, { tone: 'danger' });
});

test('field-path - deleteAtPath reports whether it removed anything', () => {
    const target: Record<string, unknown> = { tone: 'danger' };
    assert.strictEqual(deleteAtPath(target, ['fontSize']), false);
    assert.strictEqual(deleteAtPath(target, ['incoming', 'color']), false);
    assert.deepStrictEqual(target, { tone: 'danger' });
});

test('field-path - deleteAtPath on an empty path is a no-op', () => {
    const target: Record<string, unknown> = { tone: 'danger' };
    assert.strictEqual(deleteAtPath(target, []), false);
    assert.deepStrictEqual(target, { tone: 'danger' });
});

test('field-path - a write followed by a delete returns the object to its prior shape', () => {
    const target: Record<string, unknown> = { tone: 'danger' };
    setAtPath(target, ['incoming', 'pattern'], 'dashed');
    setAtPath(target, ['incoming', 'width'], 2);
    deleteAtPath(target, ['incoming', 'pattern']);
    deleteAtPath(target, ['incoming', 'width']);
    assert.deepStrictEqual(target, { tone: 'danger' });
});
