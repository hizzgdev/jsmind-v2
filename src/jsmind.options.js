import { SimpleIdGenerator } from './generation/jsmind.simple.id_generator.js';

export const options = {
    mind: {
        edgeIdGenerator: new SimpleIdGenerator('edge_'),
        nodeIdGenerator: new SimpleIdGenerator('node_'),
    }
};
