/**
 * Content types and utilities for JsMind nodes.
 *
 * @packageDocumentation
 */

/**
 * Enumeration for content types of node.
 *
 * @public
 */
export const JmNodeContentType = {
    /** Text content type. */
    Text: 'text',
} as const;

export type JmNodeContentType = typeof JmNodeContentType[keyof typeof JmNodeContentType];

/**
 * Content of mind map node.
 *
 * @public
 */
export class JmNodeContent {
    /** The type of the content. */
    type: JmNodeContentType;

    /** The actual content value. */
    value: unknown;

    /**
     * Creates a content object.
     *
     * @param type - The type of content.
     * @param value - The actual content value.
     * @throws {@link Error} If the content type is invalid.
     */
    constructor(type: JmNodeContentType, value: unknown) {
        if (!type || !Object.values(JmNodeContentType).includes(type)) {
            throw new Error(`Invalid content type: ${type}`);
        }
        this.type = type;
        this.value = value;
    }

    /**
     * Checks if content is of specific type.
     *
     * @param type - The type to check.
     * @returns True if content is of the specified type.
     */
    hasType(type: JmNodeContentType): boolean {
        return this.type === type;
    }

    /**
     * Checks if content is text type.
     *
     * @returns True if content is text type.
     */
    isText(): boolean {
        return this.hasType(JmNodeContentType.Text);
    }

    getText(): string {
        if (!this.isText()) {
            throw new Error('Content is not text type');
        }
        return this.value as string;
    }

    /**
     * Creates a text content object.
     *
     * @param text - The text content.
     * @returns The content object.
     */
    static createText(text: string): JmNodeContent {
        return new JmNodeContent(JmNodeContentType.Text, text);
    }
}

