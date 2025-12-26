/**
 * Interface for generating unique IDs.
 *
 * @remarks
 * IdGenerator is an interface for generating unique IDs.
 *
 * @example
 * ```typescript
 * class MyIdGenerator extends IdGenerator {
 *    constructor() {
 *       super();
 *      this._seq = 0;
 *   }
 *   newId() {
 *      return 'my' + (this._seq++);
 *  }
 * }
 * ```
 *
 * @public
 */
export class IdGenerator {
    /**
     * Generates a new unique ID.
     *
     * @returns A new unique ID.
     * @throws {@link Error} If not implemented.
     */
    newId(): string {
        throw new Error('not implemented');
    }
}

/**
 * Simple implementation of IdGenerator.
 *
 * @public
 */
export class SimpleIdGenerator extends IdGenerator {
    /** The seed value for ID generation. */
    seed: number;
    /** The sequence counter. */
    seq: number;
    /** The prefix for generated IDs. */
    prefix: string;

    /**
     * Creates a new SimpleIdGenerator instance.
     *
     * @param prefix - Optional prefix for generated IDs. Defaults to empty string.
     */
    constructor(prefix?: string) {
        super();
        this.seed = new Date().getTime();
        this.seq = 0;
        this.prefix = prefix || '';
    }

    /**
     * Generates a new unique ID.
     *
     * @returns A new unique ID with the format: prefix + (seed + seq).toString(36)
     */
    newId(): string {
        this.seq++;
        return this.prefix + (this.seed + this.seq).toString(36);
    }
}

/**
 * Global ID generator instance.
 *
 * @public
 */
export const GLOBAL_ID_GENERATOR = new SimpleIdGenerator('jm-');

