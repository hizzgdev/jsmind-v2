import { JsMindError } from '../common/error.ts';
import { JmMindFreeMindSerializer } from './freemind.ts';
import type { JmMindSerializer } from './serializer.ts';
import { JmMindJsonSerializer } from './json.ts';

export class JmMindSerializerFactory {
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
