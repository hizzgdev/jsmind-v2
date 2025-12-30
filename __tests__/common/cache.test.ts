import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JmCache } from '../../src/common/cache.ts';

describe('JmCache', () => {
    it('should put and get values', () => {
        const cache = new JmCache<string, number>((key: string) => key);
        cache.put('key1', 100);
        assert.strictEqual(cache.get('key1'), 100);
        assert.strictEqual(cache.get('non-existent'), undefined);
    });

    it('should check if a key exists', () => {
        const cache = new JmCache<string, number>((key: string) => key);
        cache.put('key1', 100);
        assert.strictEqual(cache.contains('key1'), true);
        assert.strictEqual(cache.contains('key2'), false);
    });

    it('should overwrite existing values', () => {
        const cache = new JmCache<string, number>((key: string) => key);
        cache.put('key1', 100);
        cache.put('key1', 200);
        assert.strictEqual(cache.get('key1'), 200);
    });

    it('should clear all cached values', () => {
        const cache = new JmCache<string, number>((key: string) => key);
        cache.put('key1', 100);
        cache.put('key2', 200);
        cache.clear();
        assert.strictEqual(cache.get('key1'), undefined);
        assert.strictEqual(cache.contains('key2'), false);
    });

    it('should work with custom key selector function', () => {
        interface TestKey {
            id: string;
            name: string;
        }
        const cache = new JmCache<TestKey, number>((key: TestKey) => key.id);
        const key1: TestKey = { id: 'id1', name: 'name1' };
        const key2: TestKey = { id: 'id1', name: 'name2' };
        cache.put(key1, 100);
        assert.strictEqual(cache.get(key2), 100);
    });
});

