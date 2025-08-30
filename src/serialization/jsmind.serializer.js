/**
 * @fileoverview Base interfaces for JsMind serialization
 * @package
 */

/**
 * Base interface for all mind map serializers
 * @interface
 */
export class JmMindSerializer {
    /**
     * Serialize a mind map to the specific format
     * @param {JmMind} mind - The mind map to serialize
     * @returns {any} The serialized data in the specific format
     */
    serialize(mind) {
        throw new Error('serialize method must be implemented', { cause: mind });
    }

    /**
     * Deserialize data to a mind map
     * @param {any} data - The data to deserialize
     * @returns {JmMind} The deserialized mind map
     */
    deserialize(data) {
        throw new Error('deserialize method must be implemented', { cause: data });
    }

    /**
     * Get the format name this serializer supports
     * @returns {string} The format name
     */
    getFormatName() {
        throw new Error('getFormatName method must be implemented');
    }

    /**
     * Validate if the data can be deserialized by this serializer
     * @param {any} data - The data to validate
     * @returns {boolean} True if the data is valid for this format
     */
    validate(data) {
        throw new Error('validate method must be implemented', { cause: data });
    }
}
