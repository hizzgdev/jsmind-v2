/**
 * Custom error class for jsMind operations.
 *
 * @public
 */
export class JsMindError extends Error {
    /** The data associated with the error. */
    data: Record<string, unknown>;

    /**
     * Stable machine-readable code, when the failure has one.
     *
     * @remarks
     * Callers branch on this rather than on `message`, which is written for
     * humans and may be reworded at any time.
     */
    code?: string;

    /**
     * Creates a new JsMindError instance.
     *
     * @param message - The error message.
     * @param data - Extra data carried with the error.
     * @param code - Stable machine-readable code, if any.
     */
    constructor(message: string, data: Record<string, unknown> = {}, code?: string) {
        super(message);
        this.data = data;
        if (code !== undefined) {
            this.code = code;
        }
    }
}

