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
