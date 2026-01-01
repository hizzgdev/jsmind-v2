/**
 * Base interfaces for JsMind serialization.
 *
 * @packageDocumentation
 */

import { type JmMind } from '../model/mind.ts';

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
     * @throws {@link Error} If not implemented.
     */
    serialize(mind: JmMind): unknown;

    /**
     * Deserializes data to a mind map.
     *
     * @param data - The data to deserialize.
     * @returns The deserialized mind map.
     * @throws {@link Error} If not implemented.
     */
    deserialize(data: unknown): JmMind;

    /**
     * Gets the format name this serializer supports.
     *
     * @returns The format name.
     * @throws {@link Error} If not implemented.
     */
    getFormatName(): string;

    /**
     * Validates if the data can be deserialized by this serializer.
     *
     * @param data - The data to validate.
     * @returns True if the data is valid for this format.
     * @throws {@link Error} If not implemented.
     */
    validate(data: unknown): boolean;
}

