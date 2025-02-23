import { SimpleIdGenerator } from './impl/jsmind.impl.simple_id_generator';

export const config = {
    nodeIdGenerator: new SimpleIdGenerator('node_'),
    edgeIdGenerator: new SimpleIdGenerator('edge_'),
};
