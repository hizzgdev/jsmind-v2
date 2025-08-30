/**
 * @fileoverview FreeMind serializer for JsMind mind maps (placeholder)
 * @package
 */

import { JmMindSerializer } from '../jsmind.serializer.js';
import { JsMindError } from '../jsmind.error.js';

/**
 * FreeMind serializer for mind maps (not yet implemented)
 */
export class JmMindFreeMindSerializer extends JmMindSerializer {
    /**
     * Get the format name this serializer supports
     * @returns {string} The format name
     */
    getFormatName() {
        return 'freemind';
    }

    /**
     * Serialize a mind map to FreeMind format
     * @param {JmMind} mind - The mind map to serialize
     * @returns {any} The serialized data
     */
    serialize(mind) {
        throw new JsMindError('FreeMind serialization is not yet implemented');
    }

    /**
     * Deserialize FreeMind data to a mind map
     * @param {any} data - The data to deserialize
     * @returns {JmMind} The deserialized mind map
     */
    deserialize(data) {
        throw new JsMindError('FreeMind deserialization is not yet implemented');
    }

    /**
     * Validate if the data can be deserialized by this serializer
     * @param {any} data - The data to validate
     * @returns {boolean} True if the data is valid for this format
     */
    validate(data) {
        // Basic validation - will be implemented later
        return false;
    }
}
