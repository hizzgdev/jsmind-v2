import assert from 'node:assert/strict';
import test from 'node:test';
import { JmNodeContentType, JmNodeContent } from '../../src/model/jsmind.node.content.ts';

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

test('JmNodeContent constructor with null type', () => {
    assert.throws(() => {
        new JmNodeContent(null as any, 'Hello');
    }, /Invalid content type: null/);
});

test('JmNodeContent constructor with undefined type', () => {
    assert.throws(() => {
        new JmNodeContent(undefined as any, 'Hello');
    }, /Invalid content type: undefined/);
});

test('JmNodeContent constructor with empty string type', () => {
    assert.throws(() => {
        new JmNodeContent('' as any, 'Hello');
    }, /Invalid content type: /);
});

test('JmNodeContent constructor with invalid type', () => {
    assert.throws(() => {
        new JmNodeContent('invalid_type' as any, 'Hello');
    }, /Invalid content type: invalid_type/);
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

test('JmNodeContent.hasType with non-matching type', () => {
    const content = new JmNodeContent(JmNodeContentType.Text, 'Hello');
    assert.ok(!content.hasType('invalid_type' as any));
});

test('JmNodeContent.hasType with null type', () => {
    const content = new JmNodeContent(JmNodeContentType.Text, 'Hello');
    assert.ok(!content.hasType(null as any));
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

test('JmNodeContent.createText with null', () => {
    const content = JmNodeContent.createText(null as any);
    assert.ok(content instanceof JmNodeContent);
    assert.strictEqual(content.type, JmNodeContentType.Text);
    assert.strictEqual(content.value, null);
});

test('JmNodeContent.createText with undefined', () => {
    const content = JmNodeContent.createText(undefined as any);
    assert.ok(content instanceof JmNodeContent);
    assert.strictEqual(content.type, JmNodeContentType.Text);
    assert.strictEqual(content.value, undefined);
});

test('JmNodeContent.createText with number', () => {
    const content = JmNodeContent.createText(42 as any);
    assert.ok(content instanceof JmNodeContent);
    assert.strictEqual(content.type, JmNodeContentType.Text);
    assert.strictEqual(content.value, 42);
});

test('JmNodeContent.createText with object', () => {
    const obj = { name: 'test', value: 123 };
    const content = JmNodeContent.createText(obj as any);
    assert.ok(content instanceof JmNodeContent);
    assert.strictEqual(content.type, JmNodeContentType.Text);
    assert.deepStrictEqual(content.value, obj);
});

test('JmNodeContent instance methods', () => {
    const content = new JmNodeContent(JmNodeContentType.Text, 'Test Value');

    // Test hasType method
    assert.ok(content.hasType(JmNodeContentType.Text));
    assert.ok(!content.hasType('invalid' as any));

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

