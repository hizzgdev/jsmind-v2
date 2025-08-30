/**
 * @fileoverview Tests for JsMind serialization system
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { JmMind } from '../src/jsmind.mind.js';
import { JmNodeContent } from '../src/jsmind.node.content.js';
import { JmMindSerializationManager } from '../src/jsmind.serialization.manager.js';
import { JmMindJsonSerializer } from '../src/impl/jsmind.json.serializer.js';
import { JmMindFreeMindSerializer } from '../src/impl/jsmind.freemind.serializer.js';

test('JmMindSerializationManager - singleton pattern', (_t) => {
    const manager1 = JmMindSerializationManager.getInstance();
    const manager2 = JmMindSerializationManager.getInstance();
    assert.strictEqual(manager1, manager2, 'Should return the same instance');
});

test('JmMindSerializationManager - static method context and properties', (_t) => {
    // Test that static method works correctly
    const manager = JmMindSerializationManager.getInstance();

    // Verify the instance is created
    assert.ok(manager, 'Should create an instance');
    assert.strictEqual(manager.constructor.name, 'JmMindSerializationManager', 'Should be correct type');

    // Test that static property is set correctly
    assert.strictEqual(JmMindSerializationManager._instance, manager, 'Static _instance should reference the created instance');

    // Test that calling getInstance again returns the same instance
    const manager2 = JmMindSerializationManager.getInstance();
    assert.strictEqual(manager2, manager, 'Should return the same instance on subsequent calls');
    assert.strictEqual(JmMindSerializationManager._instance, manager2, 'Static _instance should still reference the same instance');
});

test('JmMindSerializationManager - static method this binding', (_t) => {
    // Test that 'this' in static method refers to the class constructor
    const getInstanceRef = JmMindSerializationManager.getInstance;

    // Call getInstance through a reference to verify 'this' binding
    const manager = getInstanceRef.call(JmMindSerializationManager);

    assert.ok(manager, 'Should work when called through reference');
    assert.strictEqual(manager.constructor.name, 'JmMindSerializationManager', 'Should create correct type');

    // Verify it's the same instance
    const directCall = JmMindSerializationManager.getInstance();
    assert.strictEqual(manager, directCall, 'Should return same instance regardless of how called');
});

test('JmMindSerializationManager - static property isolation', (_t) => {
    // Test that static properties are isolated to the class
    const originalInstance = JmMindSerializationManager._instance;

    // Create a new instance of the class (not through getInstance)
    const newInstance = new JmMindSerializationManager();

    // Static property should not be affected by creating new instances
    assert.strictEqual(JmMindSerializationManager._instance, originalInstance, 'Static _instance should not change when creating new instances');

    // New instance should be different from the singleton
    assert.notStrictEqual(newInstance, originalInstance, 'New instance should be different from singleton');
});

test('JmMindSerializationManager - register and get serializer', (t) => {
    const manager = JmMindSerializationManager.getInstance();
    const jsonSerializer = new JmMindJsonSerializer();

    manager.registerSerializer(jsonSerializer);
    const retrieved = manager.getSerializer('json');

    assert.strictEqual(retrieved, jsonSerializer, 'Should return the registered serializer');
    assert.strictEqual(manager.isFormatSupported('json'), true, 'Should support json format');
});

test('JmMindSerializationManager - get supported formats', (t) => {
    const manager = JmMindSerializationManager.getInstance();

    // Should have default serializers automatically
    const formats = manager.getSupportedFormats();

    assert(Array.isArray(formats), 'Should return an array');
    assert(formats.includes('json'), 'Should include json format');
    assert(formats.includes('freemind'), 'Should include freemind format');
});

test('JmMindSerializationManager - unsupported format error', (t) => {
    const manager = JmMindSerializationManager.getInstance();

    assert.throws(() => {
        manager.getSerializer('unsupported');
    }, /Format 'unsupported' is not supported/, 'Should throw error for unsupported format');
});

test('JmMind - serialization integration', (t) => {
    const mindOptions = {
        nodeIdGenerator: { newId: () => 'test' },
        edgeIdGenerator: { newId: () => 'test' }
    };

    const mind = new JmMind(mindOptions);

    // Add a child node
    const childContent = JmNodeContent.createText('Child Node');
    mind.addChildNode(mind.root.id, childContent);

    // Test serialization
    const jsonData = mind.serialize('json');

    assert(jsonData, 'Should serialize to JSON');
    assert(jsonData.meta, 'Should include metadata');
    assert(jsonData.root, 'Should include root node');
    assert(jsonData.nodes, 'Should include nodes');
    assert(jsonData.edges, 'Should include edges');

    // Test that serialization manager is available
    assert.ok(mind.serializationManager, 'Should have serialization manager');
    assert.strictEqual(typeof mind.serializationManager.serialize, 'function', 'Serialization manager should have serialize method');
});

test('JmMind - serialization manager access', (t) => {
    const mindOptions = {
        nodeIdGenerator: { newId: () => 'test' },
        edgeIdGenerator: { newId: () => 'test' }
    };

    const mind = new JmMind(mindOptions);

    // Test that we can access the serialization manager directly
    assert.ok(mind.serializationManager, 'Should have serialization manager');

    // Test that we can use the manager to serialize
    const jsonData = mind.serializationManager.serialize(mind, 'json');
    assert.ok(jsonData, 'Should serialize through manager');
    assert.ok(jsonData.meta, 'Should have metadata');
    assert.ok(jsonData.root, 'Should have root node');
});

test('JmMindJsonSerializer - serialize and deserialize', (t) => {
    const serializer = new JmMindJsonSerializer();

    // Create a simple mind map
    const mindOptions = {
        nodeIdGenerator: { newId: () => 'test' },
        edgeIdGenerator: { newId: () => 'test' }
    };

    const mind = new JmMind(mindOptions);
    const childContent = JmNodeContent.createText('Child Node');
    mind.addChildNode(mind.root.id, childContent);

    // Test serialization
    const jsonData = serializer.serialize(mind);

    assert(jsonData.meta, 'Should include metadata');
    assert(jsonData.root, 'Should include root node');
    assert(jsonData.nodes, 'Should include nodes');
    assert(jsonData.edges, 'Should include edges');

    // Test validation
    assert(serializer.validate(jsonData), 'Should validate correct data');
    assert(!serializer.validate(null), 'Should not validate null');
    assert(!serializer.validate({}), 'Should not validate empty object');

    // Test deserialization
    const deserializedMind = serializer.deserialize(jsonData);

    assert(deserializedMind, 'Should deserialize successfully');
    assert(deserializedMind.meta, 'Should have metadata');
    assert(deserializedMind.root, 'Should have root node');
});

test('JmMindFreeMindSerializer - placeholder implementation', (t) => {
    const serializer = new JmMindFreeMindSerializer();

    assert.strictEqual(serializer.getFormatName(), 'freemind', 'Should return freemind format name');

    // Test that methods throw appropriate errors
    const mindOptions = {
        nodeIdGenerator: { newId: () => 'test' },
        edgeIdGenerator: { newId: () => 'test' }
    };

    const mind = new JmMind(mindOptions);

    assert.throws(() => {
        serializer.serialize(mind);
    }, /FreeMind serialization is not yet implemented/, 'Should throw error for serialize');

    assert.throws(() => {
        serializer.deserialize({});
    }, /FreeMind deserialization is not yet implemented/, 'Should throw error for deserialize');

    assert.strictEqual(serializer.validate({}), false, 'Should not validate any data yet');
});

test('JmMindSerializationManager - automatic default serializers', (t) => {
    // Get a fresh manager instance
    const manager = JmMindSerializationManager.getInstance();

    // Should have default serializers automatically
    assert.strictEqual(manager.isFormatSupported('json'), true, 'Should support JSON format');
    assert.strictEqual(manager.isFormatSupported('freemind'), true, 'Should support FreeMind format');

    // Test that we can register additional serializers
    const customSerializer = new JmMindJsonSerializer();
    // Override the format name for testing
    customSerializer.getFormatName = () => 'custom';

    manager.registerSerializer(customSerializer);
    assert.strictEqual(manager.isFormatSupported('custom'), true, 'Should support custom format');
});

test('JmMindSerializationManager - automatic registration on first access', (t) => {
    // Get the manager instance which should automatically register default serializers
    const manager = JmMindSerializationManager.getInstance();

    // Should have default serializers immediately
    assert.strictEqual(manager.isFormatSupported('json'), true, 'Should support JSON format');
    assert.strictEqual(manager.isFormatSupported('freemind'), true, 'Should support FreeMind format');

    // Create a JmMind instance - no manual registration needed
    const mindOptions = {
        nodeIdGenerator: { newId: () => 'test' },
        edgeIdGenerator: { newId: () => 'test' }
    };

    const mind = new JmMind(mindOptions);

    // Serializers should be immediately available without any manual setup
    assert.ok(mind.serializationManager, 'Should have serialization manager');
    assert.strictEqual(typeof mind.serializationManager.serialize, 'function', 'Serialization manager should have serialize method');
});
