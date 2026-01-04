import assert from 'node:assert/strict';
import test from 'node:test';
import { JmNodeContentType, JmNodeContent } from '../../src/model/node-content.ts';

test('JmNodeContentType enum', () => {
    assert.ok(JmNodeContentType);
    assert.strictEqual(typeof JmNodeContentType, 'object');
    assert.strictEqual(JmNodeContentType.Text, 'text');

    // Verify the enum structure
    assert.ok(Object.keys(JmNodeContentType).includes('Text'));
    assert.strictEqual(Object.keys(JmNodeContentType).length, 1);
});

test('JmNodeContent constructor with valid type', () => {
    const content = new JmNodeContent(JmNodeContentType.Text, 'Hello World');
    assert.ok(content);
    assert.strictEqual(content.type, JmNodeContentType.Text);
    assert.strictEqual(content.value, 'Hello World');
});

test('JmNodeContent constructor with null value', () => {
    const content = new JmNodeContent(JmNodeContentType.Text, null);
    assert.ok(content);
    assert.strictEqual(content.type, JmNodeContentType.Text);
    assert.strictEqual(content.value, null);
});

test('JmNodeContent constructor with undefined value', () => {
    const content = new JmNodeContent(JmNodeContentType.Text, undefined);
    assert.ok(content);
    assert.strictEqual(content.type, JmNodeContentType.Text);
    assert.strictEqual(content.value, undefined);
});

test('JmNodeContent constructor with object value', () => {
    const objValue = { key: 'value', number: 42 };
    const content = new JmNodeContent(JmNodeContentType.Text, objValue);
    assert.ok(content);
    assert.strictEqual(content.type, JmNodeContentType.Text);
    assert.deepStrictEqual(content.value, objValue);
});

test('JmNodeContent.hasType with matching type', () => {
    const content = new JmNodeContent(JmNodeContentType.Text, 'Hello');
    assert.ok(content.hasType(JmNodeContentType.Text));
});

test('JmNodeContent.isText with text type', () => {
    const content = new JmNodeContent(JmNodeContentType.Text, 'Hello World');
    assert.ok(content.isText());
});

test('JmNodeContent.isText with non-text type', () => {
    // Since we only have text type currently, this test will always pass
    // but it's good to have for when we add more types
    const content = new JmNodeContent(JmNodeContentType.Text, 'Hello');
    assert.ok(content.isText());
});

test('JmNodeContent.createText with string', () => {
    const content = JmNodeContent.createText('Hello World');
    assert.ok(content instanceof JmNodeContent);
    assert.strictEqual(content.type, JmNodeContentType.Text);
    assert.strictEqual(content.value, 'Hello World');
});

test('JmNodeContent.createText with empty string', () => {
    const content = JmNodeContent.createText('');
    assert.ok(content instanceof JmNodeContent);
    assert.strictEqual(content.type, JmNodeContentType.Text);
    assert.strictEqual(content.value, '');
});

test('JmNodeContent instance methods', () => {
    const content = new JmNodeContent(JmNodeContentType.Text, 'Test Value');

    // Test hasType method
    assert.ok(content.hasType(JmNodeContentType.Text));

    // Test isText method
    assert.ok(content.isText());

    // Test property access
    assert.strictEqual(content.type, JmNodeContentType.Text);
    assert.strictEqual(content.value, 'Test Value');
});

test('JmNodeContent equality comparison', () => {
    const content1 = new JmNodeContent(JmNodeContentType.Text, 'Hello');
    const content2 = new JmNodeContent(JmNodeContentType.Text, 'Hello');
    const content3 = new JmNodeContent(JmNodeContentType.Text, 'World');

    // Same type and value should be equal
    assert.strictEqual(content1.type, content2.type);
    assert.strictEqual(content1.value, content2.value);

    // Different values should not be equal
    assert.notStrictEqual(content1.value, content3.value);

    // Same type but different values
    assert.strictEqual(content1.type, content3.type);
    assert.notStrictEqual(content1.value, content3.value);
});

