import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JmCache } from '../../src/common/cache.ts';

describe('JmCache', () => {
    it('should put and get values', () => {
        const cache = new JmCache<string, number>('test', (key: string) => key);
        cache.put('key1', 100);
        assert.strictEqual(cache.get('key1'), 100);
        assert.strictEqual(cache.get('non-existent'), undefined);
    });

    it('should check if a key exists', () => {
        const cache = new JmCache<string, number>('test', (key: string) => key);
        cache.put('key1', 100);
        assert.strictEqual(cache.get('key1') !== undefined, true);
        assert.strictEqual(cache.get('key2') !== undefined, false);
    });

    it('should overwrite existing values', () => {
        const cache = new JmCache<string, number>('test', (key: string) => key);
        cache.put('key1', 100);
        cache.put('key1', 200);
        assert.strictEqual(cache.get('key1'), 200);
    });

    it('should clear all cached values', () => {
        const cache = new JmCache<string, number>('test', (key: string) => key);
        cache.put('key1', 100);
        cache.put('key2', 200);
        cache.clear();
        assert.strictEqual(cache.get('key1'), undefined);
        assert.strictEqual(cache.get('key2'), undefined);
    });

    it('should work with custom key selector function', () => {
        interface TestKey {
            id: string;
            name: string;
        }
        const cache = new JmCache<TestKey, number>('test', (key: TestKey) => key.id);
        const key1: TestKey = { id: 'id1', name: 'name1' };
        const key2: TestKey = { id: 'id1', name: 'name2' };
        cache.put(key1, 100);
        assert.strictEqual(cache.get(key2), 100);
    });

    describe('stat', () => {
        it('should return zero statistics for empty cache', () => {
            const cache = new JmCache<string, number>('test', (key: string) => key);
            const stats = cache.stat();
            assert.strictEqual(stats.hits, 0);
            assert.strictEqual(stats.misses, 0);
            assert.strictEqual(stats.total, 0);
            assert.strictEqual(stats.hitRate, 0);
        });

        it('should track hits correctly', () => {
            const cache = new JmCache<string, number>('test', (key: string) => key);
            cache.put('key1', 100);
            cache.put('key2', 200);
            cache.get('key1');
            cache.get('key2');
            const stats = cache.stat();
            assert.strictEqual(stats.hits, 2);
            assert.strictEqual(stats.misses, 0);
            assert.strictEqual(stats.total, 2);
            assert.strictEqual(stats.hitRate, 1);
        });

        it('should track misses correctly', () => {
            const cache = new JmCache<string, number>('test', (key: string) => key);
            cache.get('key1');
            cache.get('key2');
            const stats = cache.stat();
            assert.strictEqual(stats.hits, 0);
            assert.strictEqual(stats.misses, 2);
            assert.strictEqual(stats.total, 2);
            assert.strictEqual(stats.hitRate, 0);
        });

        it('should calculate hit rate correctly for mixed hits and misses', () => {
            const cache = new JmCache<string, number>('test', (key: string) => key);
            cache.put('key1', 100);
            cache.put('key2', 200);
            cache.get('key1'); // hit
            cache.get('key2'); // hit
            cache.get('key3'); // miss
            cache.get('key4'); // miss
            cache.get('key1'); // hit
            const stats = cache.stat();
            assert.strictEqual(stats.hits, 3);
            assert.strictEqual(stats.misses, 2);
            assert.strictEqual(stats.total, 5);
            assert.strictEqual(stats.hitRate, 0.6);
        });

        it('should reset statistics when clear is called', () => {
            const cache = new JmCache<string, number>('test', (key: string) => key);
            cache.put('key1', 100);
            cache.get('key1');
            cache.get('key2');
            cache.clear();
            const stats = cache.stat();
            assert.strictEqual(stats.hits, 0);
            assert.strictEqual(stats.misses, 0);
            assert.strictEqual(stats.total, 0);
            assert.strictEqual(stats.hitRate, 0);
        });

        it('should handle undefined cached values correctly', () => {
            const cache = new JmCache<string, number | undefined>('test', (key: string) => key);
            cache.put('key1', undefined);
            cache.get('key1'); // should be a hit, not a miss
            cache.get('key2'); // should be a miss
            const stats = cache.stat();
            assert.strictEqual(stats.hits, 1);
            assert.strictEqual(stats.misses, 1);
            assert.strictEqual(stats.total, 2);
            assert.strictEqual(stats.hitRate, 0.5);
        });
    });
});

