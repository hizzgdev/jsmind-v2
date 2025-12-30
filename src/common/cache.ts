/**
 * Generic cache for storing function results with any key and value types.
 * @public
 */
export class JmCache<K, V> {
    private readonly cache: Map<string, V>;

    private readonly keySelector: (key: K) => string;

    private hits: number = 0;

    private misses: number = 0;

    constructor(keySelector: (key: K) => string) {
        this.cache = new Map();
        this.keySelector = keySelector;
    }

    /**
     * Gets the cached value for the given key.
     *
     * @param key - The key to get the cached value for
     * @returns The cached value, or undefined if not found
     */
    get(key: K): V | undefined {
        const cacheKey = this.keySelector(key);
        const exists = this.cache.has(cacheKey);
        if (exists) {
            this.hits++;
        } else {
            this.misses++;
        }
        return this.cache.get(cacheKey);
    }

    /**
     * Stores a value in the cache for the given key.
     *
     * @param key - The key to cache the value for
     * @param value - The value to cache
     */
    put(key: K, value: V): void {
        this.cache.set(this.keySelector(key), value);
    }

    /**
     * Clears all cached values.
     */
    clear(): void {
        this.cache.clear();
        this.hits = 0;
        this.misses = 0;
    }

    /**
     * Gets cache statistics including hit rate.
     *
     * @returns An object containing hits, misses, total requests, and hit rate
     */
    stat(): {
        hits: number;
        misses: number;
        total: number;
        hitRate: number;
    } {
        const total = this.hits + this.misses;
        const hitRate = total > 0 ? this.hits / total : 0;
        return {
            hits: this.hits,
            misses: this.misses,
            total,
            hitRate,
        };
    }

    /**
     * Prints cache statistics to the console.
     */
    printStat(cacheName: string): void {
        const stats = this.stat();
        console.log(`${cacheName} Statistics:`);
        console.log(`  Hits: ${stats.hits}`);
        console.log(`  Misses: ${stats.misses}`);
        console.log(`  Total: ${stats.total} (${(stats.hitRate * 100).toFixed(2)}%)`);
    }
}
