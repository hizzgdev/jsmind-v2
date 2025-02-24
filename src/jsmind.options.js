import { SimpleIdGenerator } from './impl/jsmind.impl.simple_id_generator';

export const options = {
    mind: {
        edgeIdGenerator: new SimpleIdGenerator('edge_'),
        nodeIdGenerator: new SimpleIdGenerator('node_'),
    }
};
