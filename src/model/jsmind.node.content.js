/**
 * @fileoverview Content types and utilities for JsMind nodes
 * @package
 */

/**
 * Enum for content types of node
 * @readonly
 * @enum {string}
 */
export const JmNodeContentType = {
    Text: 'text',
};

/**
 * Content of mind map node
 */
export class JmNodeContent {
    /**
     * Create a content object
     * @param {JmNodeContentType} type - The type of content
     * @param {any} value - The actual content value
     */
    constructor(type, value) {
        if (!type || !Object.values(JmNodeContentType).includes(type)) {
            throw new Error(`Invalid content type: ${type}`);
        }
        this.type = type;
        this.value = value;
    }

    /**
     * Check if content is of specific type
     * @param {JmNodeContentType} type - The type to check
     * @returns {boolean} True if content is of the specified type
     */
    hasType(type) {
        return this.type === type;
    }

    /**
     * Check if content is text type
     * @returns {boolean} True if content is text type
     */
    isText() {
        return this.hasType(JmNodeContentType.Text);
    }

    /**
     * Create a text content object
     * @param {string} text - The text content
     * @returns {JmNodeContent} The content object
     */
    static createText(text) {
        return new JmNodeContent(JmNodeContentType.Text, text);
    }
}
