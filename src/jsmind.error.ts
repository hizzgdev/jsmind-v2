/**
 * Custom error class for jsMind operations.
 *
 * @public
 */
export class JsMindError extends Error {
    /**
     * Creates a new JsMindError instance.
     *
     * @param message - The error message.
     */
    constructor(message: string) {
        super(message);
    }
}

