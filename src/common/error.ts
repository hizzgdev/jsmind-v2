/**
 * Custom error class for jsMind operations.
 *
 * @public
 */
export class JsMindError extends Error {
    /** The data associated with the error. */
    data: Record<string, unknown>;

    /**
     * Creates a new JsMindError instance.
     *
     * @param message - The error message.
     */
    constructor(message: string, data: Record<string, unknown> = {}) {
        super(message);
        this.data = data;
    }
}

