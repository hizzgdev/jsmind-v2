import { SimpleIdGenerator } from './impl/jsmind.impl.simple_id_generator.js';

export const options = {
    mind: {
        edgeIdGenerator: new SimpleIdGenerator('edge_'),
        nodeIdGenerator: new SimpleIdGenerator('node_'),
    }
};
