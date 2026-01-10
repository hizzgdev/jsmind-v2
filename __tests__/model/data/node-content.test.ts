import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JmNodeContentType, JmNodeContent } from '../../../src/model/data/node-content.ts';

describe('JmNodeContentType', () => {
    it('should be an object with Text property', () => {
        assert.ok(JmNodeContentType);
        assert.strictEqual(typeof JmNodeContentType, 'object');
        assert.strictEqual(JmNodeContentType.Text, 'text');
    });

    it('should have correct enum structure', () => {
        assert.ok(Object.keys(JmNodeContentType).includes('Text'));
        assert.strictEqual(Object.keys(JmNodeContentType).length, 1);
    });
});

describe('JmNodeContent', () => {
    describe('constructor', () => {
        it('should create content with valid type and string value', () => {
            const content = new JmNodeContent(JmNodeContentType.Text, 'Hello World');
            assert.ok(content);
            assert.strictEqual(content.type, JmNodeContentType.Text);
            assert.strictEqual(content.value, 'Hello World');
        });

        it('should create content with null value', () => {
            const content = new JmNodeContent(JmNodeContentType.Text, null);
            assert.ok(content);
            assert.strictEqual(content.type, JmNodeContentType.Text);
            assert.strictEqual(content.value, null);
        });

        it('should create content with undefined value', () => {
            const content = new JmNodeContent(JmNodeContentType.Text, undefined);
            assert.ok(content);
            assert.strictEqual(content.type, JmNodeContentType.Text);
            assert.strictEqual(content.value, undefined);
        });

        it('should create content with object value', () => {
            const objValue = { key: 'value', number: 42 };
            const content = new JmNodeContent(JmNodeContentType.Text, objValue);
            assert.ok(content);
            assert.strictEqual(content.type, JmNodeContentType.Text);
            assert.deepStrictEqual(content.value, objValue);
        });
    });

    describe('instance methods', () => {
        it('hasType should return true for matching type', () => {
            const content = new JmNodeContent(JmNodeContentType.Text, 'Hello');
            assert.ok(content.hasType(JmNodeContentType.Text));
        });

        it('isText should return true for text type', () => {
            const content = new JmNodeContent(JmNodeContentType.Text, 'Hello World');
            assert.ok(content.isText());
        });

        it('should have correct property access', () => {
            const content = new JmNodeContent(JmNodeContentType.Text, 'Test Value');
            assert.strictEqual(content.type, JmNodeContentType.Text);
            assert.strictEqual(content.value, 'Test Value');
        });
    });

    describe('static methods', () => {
        describe('createText', () => {
            it('should create text content with string', () => {
                const content = JmNodeContent.createText('Hello World');
                assert.ok(content instanceof JmNodeContent);
                assert.strictEqual(content.type, JmNodeContentType.Text);
                assert.strictEqual(content.value, 'Hello World');
            });

            it('should create text content with empty string', () => {
                const content = JmNodeContent.createText('');
                assert.ok(content instanceof JmNodeContent);
                assert.strictEqual(content.type, JmNodeContentType.Text);
                assert.strictEqual(content.value, '');
            });
        });

        describe('fromObject', () => {
            it('should create content from object with type and string value', () => {
                const obj = { type: JmNodeContentType.Text, value: 'Hello World' };
                const content = JmNodeContent.fromObject(obj);
                assert.ok(content instanceof JmNodeContent);
                assert.strictEqual(content.type, JmNodeContentType.Text);
                assert.strictEqual(content.value, 'Hello World');
            });

            it('should create content from object with undefined type', () => {
                const obj = {value: 'Hello World' } as unknown as { type: JmNodeContentType, value: unknown };
                assert.throws(
                    () => JmNodeContent.fromObject(obj),
                    (error: Error) => error.message === 'Invalid content type: undefined');
            });

            it('should create content from object with undefined value', () => {
                const obj = { type: JmNodeContentType.Text} as unknown as { type: JmNodeContentType, value: unknown };
                const content = JmNodeContent.fromObject(obj);
                assert.ok(content instanceof JmNodeContent);
                assert.strictEqual(content.type, JmNodeContentType.Text);
                assert.strictEqual(content.value, undefined);
            });

            it('should create content from object with object value', () => {
                const objValue = { key: 'value', number: 42 };
                const obj = { type: JmNodeContentType.Text, value: objValue };
                const content = JmNodeContent.fromObject(obj);
                assert.ok(content instanceof JmNodeContent);
                assert.strictEqual(content.type, JmNodeContentType.Text);
                assert.deepStrictEqual(content.value, objValue);
            });
        });
    });

    describe('equality comparison', () => {
        it('should have same type and value for identical contents', () => {
            const content1 = new JmNodeContent(JmNodeContentType.Text, 'Hello');
            const content2 = new JmNodeContent(JmNodeContentType.Text, 'Hello');
            assert.strictEqual(content1.type, content2.type);
            assert.strictEqual(content1.value, content2.value);
        });

        it('should have different values for different contents', () => {
            const content1 = new JmNodeContent(JmNodeContentType.Text, 'Hello');
            const content3 = new JmNodeContent(JmNodeContentType.Text, 'World');
            assert.strictEqual(content1.type, content3.type);
            assert.notStrictEqual(content1.value, content3.value);
        });
    });
});

