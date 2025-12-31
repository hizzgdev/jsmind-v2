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

export class JmPoint {
    x: number;

    y: number;

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    offset(offset: JmPoint): JmPoint {
        return new JmPoint(this.x + offset.x, this.y + offset.y);
    }
}
