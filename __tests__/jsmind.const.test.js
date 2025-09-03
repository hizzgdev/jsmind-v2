import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_METADATA, DEFAULT_OPTIONS } from '../src/jsmind.const.js';

test('DEFAULT_METADATA', () => {
    const meta = DEFAULT_METADATA;
    assert.ok(meta);
    assert.ok(meta.name);
    assert.ok(meta.version);
    assert.ok(meta.author);
});

test('DEFAULT_OPTIONS', () => {
    assert.ok(DEFAULT_OPTIONS.mind);
});

test('DEFAULT_OPTIONS.mind.nodeIdGenerator', () => {
    const nodeIdGenerator = DEFAULT_OPTIONS.mind.nodeIdGenerator;
    assert.ok(nodeIdGenerator);
    assert.ok(nodeIdGenerator.newId);
    assert.ok(nodeIdGenerator.newId());
    assert.notEqual(nodeIdGenerator.newId(), nodeIdGenerator.newId());
});

test('DEFAULT_OPTIONS.mind.edgeIdGenerator', () => {
    const edgeIdGenerator = DEFAULT_OPTIONS.mind.edgeIdGenerator;
    assert.ok(edgeIdGenerator);
    assert.ok(edgeIdGenerator.newId);
    assert.ok(edgeIdGenerator.newId());
    assert.notEqual(edgeIdGenerator.newId(), edgeIdGenerator.newId());
});

test('DEFAULT_OPTIONS.mind.rootNodeId', () => {
    const rootNodeId = DEFAULT_OPTIONS.mind.rootNodeId;
    assert.ok(rootNodeId);
    assert.strictEqual(rootNodeId, 'root');
});
