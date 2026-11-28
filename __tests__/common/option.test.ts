import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_METADATA, DEFAULT_OPTIONS, mergeJsMindOptions, type JsMindOptionsInput } from '../../src/common/option.ts';
import { mergeObjects } from '../../src/common/object.ts';

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
        // Explicit, and 'viewport': v2 takes the box over unless the caller
        // asks for native scrolling. The library does not wire gestures, so
        // `'native'` has to be asked for by a host that wants scrollbars.
        assert.strictEqual(DEFAULT_OPTIONS.view.viewportMode, 'viewport');
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

    it('mergeOptions should keep an explicitly requested viewport mode', () => {
        // Nested under `view`, so it goes through `mergeObjects` with the rest
        // of the group: a caller that asked for native must not be upgraded to
        // the default, and one that asked for the viewport must get it back
        // unchanged. The literals are the ones the API reference and the
        // refusal message print - a group whose other fields are omitted, not
        // spread in - so a host that copies them compiles.
        const native: JsMindOptionsInput = { view: { viewportMode: 'native' } };
        const merged = mergeJsMindOptions(native);
        assert.strictEqual(merged.view.viewportMode, 'native');
        assert.deepStrictEqual(merged.view.padding, DEFAULT_OPTIONS.view.padding,
            'omitting the rest of the group must keep the default padding');
        assert.deepStrictEqual(merged.view.expander, DEFAULT_OPTIONS.view.expander,
            'omitting the rest of the group must keep the default expander');
        const viewport = mergeJsMindOptions({ view: { viewportMode: 'viewport' } });
        assert.strictEqual(viewport.view.viewportMode, 'viewport');
        // No options at all is the viewport too: native is the exception now.
        assert.strictEqual(mergeJsMindOptions().view.viewportMode, 'viewport');
    });

    it('mergeOptions should merge nested options', () => {
        const partialOptions: JsMindOptionsInput = {
            layout: {
                parentChildSpace: 50
            }
        };
        const merged = mergeJsMindOptions(partialOptions);
        assert.strictEqual(merged.layout.parentChildSpace, 50);
        assert.strictEqual(merged.layout.siblingSpace, DEFAULT_OPTIONS.layout.siblingSpace);
    });

    describe('mergeObjects', () => {
        it('should return default values when userValues is undefined', () => {
            const defaults = { a: 1, b: 2, c: 3 };
            const merged = mergeObjects(defaults);
            assert.deepStrictEqual(merged, defaults);
            // Ensure it's a new object, not a reference
            assert.notStrictEqual(merged, defaults);
        });

        it('should merge user values with default values', () => {
            const defaults = { a: 1, b: 2, c: 3 };
            const userValues = { b: 20, c: 30 };
            const merged = mergeObjects(defaults, userValues);
            assert.strictEqual(merged.a, 1);
            assert.strictEqual(merged.b, 20);
            assert.strictEqual(merged.c, 30);
        });

        it('should preserve default values for properties not in userValues', () => {
            const defaults = { a: 1, b: 2, c: 3 };
            const userValues = { b: 20 };
            const merged = mergeObjects(defaults, userValues);
            assert.strictEqual(merged.a, 1);
            assert.strictEqual(merged.b, 20);
            assert.strictEqual(merged.c, 3);
        });

        it('should handle empty userValues object', () => {
            const defaults = { a: 1, b: 2 };
            const userValues = {};
            const merged = mergeObjects(defaults, userValues);
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
            const merged = mergeObjects(defaults, userValues);
            // Note: mergeObjects does shallow merge, so nested objects are replaced
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
            const merged = mergeObjects(defaults, userValues);
            assert.strictEqual(merged.string, 'custom');
            assert.strictEqual(merged.number, 100);
            assert.strictEqual(merged.boolean, false);
            assert.deepStrictEqual(merged.array, [1, 2, 3]);
        });
    });
});

