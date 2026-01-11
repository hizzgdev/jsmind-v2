/**
 * Base interfaces for JsMind serialization.
 *
 * @packageDocumentation
 */

import type { JmMind } from '../model/mind.ts';

/**
 * Base interface for all mind map serializers.
 *
 * @public
 */
export interface JmMindSerializer {
    /**
     * Serializes a mind map to the specific format.
     *
     * @param mind - The mind map to serialize.
     * @returns The serialized data in the specific format.
     * @throws {@link JsMindError} If serialization fails.
     */
    serialize(mind: JmMind): unknown;

    /**
     * Deserializes data to a mind map.
     *
     * @param data - The data to deserialize.
     * @returns The deserialized mind map.
     * @throws {@link JsMindError} If deserialization fails.
     */
    deserialize(data: unknown): JmMind;

    /**
     * Gets the format name this serializer supports.
     *
     * @returns The format name.
     * @throws {@link JsMindError} If format name is not implemented.
     */
    getFormatName(): string;

    /**
     * Validates if the data can be deserialized by this serializer.
     *
     * @param data - The data to validate.
     * @returns True if the data is valid for this format.
     * @throws {@link JsMindError} If validation fails.
     */
    validate(data: unknown): boolean;

}
