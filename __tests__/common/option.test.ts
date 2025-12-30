import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_METADATA, DEFAULT_OPTIONS, mergeOptions, type JsMindOptions } from '../../src/common/option.ts';

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
        const merged = mergeOptions();
        assert.deepStrictEqual(merged, DEFAULT_OPTIONS);
    });

    it('mergeOptions should merge partial options with defaults', () => {
        const merged = mergeOptions({
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
        const merged = mergeOptions(partialOptions);
        assert.strictEqual(merged.layout.parentChildSpace, 50);
        assert.strictEqual(merged.layout.siblingSpace, DEFAULT_OPTIONS.layout.siblingSpace);
    });
});

