/**
 * @fileoverview Serialization manager for JsMind mind maps
 * @package
 */

import { JsMindError } from './jsmind.error.js';
import { JmMindSerializer } from './jsmind.serializer.js';
import { JmMindJsonSerializer } from './impl/jsmind.json.serializer.js';
import { JmMindFreeMindSerializer } from './impl/jsmind.freemind.serializer.js';

/**
 * Manager for mind map serialization operations
 */
export class JmMindSerializationManager {
    constructor() {
        /**
         * @type {Map<string, JmMindSerializer>}
         * @private
         */
        this._serializers = new Map();
    }

    /**
     * Get singleton instance
     * @returns {JmMindSerializationManager}
     */
    static getInstance() {
        if (!this._instance) {
            this._instance = new JmMindSerializationManager();

            // Register default serializers directly
            this._instance.registerSerializer(new JmMindJsonSerializer());
            this._instance.registerSerializer(new JmMindFreeMindSerializer());
        }

        return this._instance;
    }

    /**
     * Register a serializer for a specific format
     * @param {JmMindSerializer} serializer - The serializer to register
     */
    registerSerializer(serializer) {
        if (!serializer || typeof serializer.getFormatName !== 'function') {
            throw new JsMindError('Invalid serializer provided');
        }

        // Type check to ensure serializer implements the interface
        if (!(serializer instanceof JmMindSerializer)) {
            throw new JsMindError('Serializer must implement JmMindSerializer interface');
        }

        const formatName = serializer.getFormatName();
        if (!formatName) {
            throw new JsMindError('Serializer must provide a valid format name');
        }

        this._serializers.set(formatName, serializer);
    }

    /**
     * Get a serializer for a specific format
     * @param {string} format - The format name
     * @returns {JmMindSerializer} The serializer for the format
     * @throws {JsMindError} If format is not supported
     */
    getSerializer(format) {
        const serializer = this._serializers.get(format);
        if (!serializer) {
            throw new JsMindError(`Format '${format}' is not supported. Available formats: ${this.getSupportedFormats().join(', ')}`);
        }
        return serializer;
    }

    /**
     * Serialize a mind map to a specific format
     * @param {JmMind} mind - The mind map to serialize
     * @param {string} format - The target format
     * @returns {any} The serialized data
     */
    serialize(mind, format) {
        const serializer = this.getSerializer(format);
        return serializer.serialize(mind);
    }

    /**
     * Deserialize data to a mind map
     * @param {any} data - The data to deserialize
     * @param {string} format - The source format
     * @returns {JmMind} The deserialized mind map
     */
    deserialize(data, format) {
        const serializer = this.getSerializer(format);
        return serializer.deserialize(data);
    }

    /**
     * Get all supported format names
     * @returns {string[]} Array of supported format names
     */
    getSupportedFormats() {
        return Array.from(this._serializers.keys());
    }

    /**
     * Check if a format is supported
     * @param {string} format - The format to check
     * @returns {boolean} True if the format is supported
     */
    isFormatSupported(format) {
        return this._serializers.has(format);
    }
}

// Static property for singleton instance
JmMindSerializationManager._instance = null;
