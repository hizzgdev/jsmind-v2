/**
 * @interface IdGenerator
 * @description
 * IdGenerator is an interface for generating unique id.
 *
 * @example
 * ```js
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
 */
export class IdGenerator {

    /**
     * @method newId
     * @description
     * Generate a new unique id.
     *
     * @returns {string} A new unique id.
     */
    newId() {
        throw new Error('not implemented');
    }
}

/**
 * Simple implementation of IdGenerator
 */
export class SimpleIdGenerator extends IdGenerator {
    constructor(prefix) {
        super();
        this.seed = new Date().getTime();
        this.seq = 0;
        this.prefix = prefix || '';
    }

    newId() {
        this.seq++;
        return this.prefix + (this.seed + this.seq).toString(36);
    }
}

/**
 * Global ID generator instance
 */
export const GLOBAL_ID_GENERATOR = new SimpleIdGenerator('jm-');
