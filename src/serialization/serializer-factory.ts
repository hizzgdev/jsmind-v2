import { JsMindError } from '../common/error.ts';
import { JmMindFreeMindSerializer } from './freemind.ts';
import type { JmMindSerializer } from './serializer.ts';
import { JmMindJsonSerializer } from './json.ts';

/**
 * Creates serializers for the formats the library can read and write.
 *
 * @public
 */
export class JmMindSerializerFactory {
    /**
     * Creates a serializer for the given format.
     *
     * @param format - `'json'` or `'freemind'`.
     * @returns A serializer for that format.
     * @throws {@link JsMindError} If the format is not supported.
     */
    static create(format: string): JmMindSerializer {
        switch (format) {
            case 'json':
                return new JmMindJsonSerializer();
            case 'freemind':
                return new JmMindFreeMindSerializer();
            default:
                throw new JsMindError(`Invalid serializer format: ${format}`);
        }
    }
}
