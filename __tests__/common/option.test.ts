import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_METADATA, DEFAULT_OPTIONS, mergeJsMindOptions, mergeFlatOptions, type JsMindOptions } from '../../src/common/option.ts';

describe('option', () => {
    it('DEFAULT_METADATA', () => {
        const meta = DEFAULT_METADATA;
        assert.ok(meta);
        assert.ok(meta.name);
        assert.ok(meta.version);
        assert.ok(meta.author);
    });

    it('DEFAULT_OPTIONS', () => {
        assert.ok(DEFAULT_OPTIONS.mind);
        assert.ok(DEFAULT_OPTIONS.mind.rootNodeId);
        assert.strictEqual(DEFAULT_OPTIONS.mind.rootNodeId, 'root');
    });

    it('mergeOptions should return default options when no options provided', () => {
        const merged = mergeJsMindOptions();
        assert.deepStrictEqual(merged, DEFAULT_OPTIONS);
    });

    it('mergeOptions should merge partial options with defaults', () => {
        const merged = mergeJsMindOptions({
            mind: {
                rootNodeId: 'custom-root'
            }
        });
        assert.strictEqual(merged.mind.rootNodeId, 'custom-root');
        assert.deepStrictEqual(merged.view, DEFAULT_OPTIONS.view);
        assert.deepStrictEqual(merged.layout, DEFAULT_OPTIONS.layout);
    });

    it('mergeOptions should merge nested options', () => {
        const partialOptions = {
            layout: {
                parentChildSpace: 50
            }
        } as unknown as Partial<JsMindOptions>;
        const merged = mergeJsMindOptions(partialOptions);
        assert.strictEqual(merged.layout.parentChildSpace, 50);
        assert.strictEqual(merged.layout.siblingSpace, DEFAULT_OPTIONS.layout.siblingSpace);
    });

    describe('mergeFlatOptions', () => {
        it('should return default values when userValues is undefined', () => {
            const defaults = { a: 1, b: 2, c: 3 };
            const merged = mergeFlatOptions(defaults);
            assert.deepStrictEqual(merged, defaults);
            // Ensure it's a new object, not a reference
            assert.notStrictEqual(merged, defaults);
        });

        it('should merge user values with default values', () => {
            const defaults = { a: 1, b: 2, c: 3 };
            const userValues = { b: 20, c: 30 };
            const merged = mergeFlatOptions(defaults, userValues);
            assert.strictEqual(merged.a, 1);
            assert.strictEqual(merged.b, 20);
            assert.strictEqual(merged.c, 30);
        });

        it('should preserve default values for properties not in userValues', () => {
            const defaults = { a: 1, b: 2, c: 3 };
            const userValues = { b: 20 };
            const merged = mergeFlatOptions(defaults, userValues);
            assert.strictEqual(merged.a, 1);
            assert.strictEqual(merged.b, 20);
            assert.strictEqual(merged.c, 3);
        });

        it('should handle empty userValues object', () => {
            const defaults = { a: 1, b: 2 };
            const userValues = {};
            const merged = mergeFlatOptions(defaults, userValues);
            assert.deepStrictEqual(merged, defaults);
        });

        it('should work with nested object structures', () => {
            const defaults = {
                padding: {
                    left: 50,
                    right: 50,
                    top: 100,
                    bottom: 100
                },
                theme: 'default'
            };
            const userValues = {
                padding: {
                    left: 100,
                    right: 100
                }
            } as Partial<typeof defaults>;
            const merged = mergeFlatOptions(defaults, userValues);
            // Note: mergeFlatOptions does shallow merge, so nested objects are replaced
            assert.strictEqual(merged.padding.left, 100);
            assert.strictEqual(merged.padding.right, 100);
            assert.strictEqual(merged.theme, 'default');
            // Nested object is replaced, not merged
            assert.strictEqual(merged.padding.top, undefined);
        });

        it('should handle different types of values', () => {
            const defaults = {
                string: 'default',
                number: 42,
                boolean: true,
                array: [1, 2, 3]
            };
            const userValues = {
                string: 'custom',
                number: 100,
                boolean: false
            };
            const merged = mergeFlatOptions(defaults, userValues);
            assert.strictEqual(merged.string, 'custom');
            assert.strictEqual(merged.number, 100);
            assert.strictEqual(merged.boolean, false);
            assert.deepStrictEqual(merged.array, [1, 2, 3]);
        });
    });
});

