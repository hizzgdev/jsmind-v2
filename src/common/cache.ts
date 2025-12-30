/**
 * Generic cache for storing function results with any key and value types.
 * @public
 */
export class JmCache<K, V> {
    private readonly cache: Map<string, V>;

    private readonly keySelector: (key: K) => string;

    constructor(keySelector: (key: K) => string) {
        this.cache = new Map();
        this.keySelector = keySelector;
    }

    /**
     * Checks if the cache contains a value for the given key.
     *
     * @param key - The key to check
     * @returns True if the cache contains a value for this key
     */
    contains(key: K): boolean {
        return this.cache.has(this.keySelector(key));
    }

    /**
     * Gets the cached value for the given key.
     *
     * @param key - The key to get the cached value for
     * @returns The cached value, or undefined if not found
     */
    get(key: K): V | undefined {
        return this.cache.get(this.keySelector(key));
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
    }
}
