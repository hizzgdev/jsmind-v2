/**
 * Represents a size with width and height.
 *
 * @public
 */
export class JmSize {
    /** The width value. */
    width: number;

    /** The height value. */
    height: number;

    /**
     * Creates a new size instance.
     *
     * @param width - The width value.
     * @param height - The height value.
     */
    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
    }
}

