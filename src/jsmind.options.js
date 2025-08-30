import { SimpleIdGenerator } from './generation/jsmind.simple.id_generator.js';

/**
 * @typedef {Object} MindOptions
 * @property {import('./generation/jsmind.id_generator.js').IdGenerator} nodeIdGenerator - Generator for creating unique node IDs
 * @property {import('./generation/jsmind.id_generator.js').IdGenerator} edgeIdGenerator - Generator for creating unique edge IDs
 * @property {string} rootNodeId - The ID for the root node
 */

/**
 * @typedef {Object} JsMindOptions
 * @property {MindOptions} mind - Mind-specific options
 */

/**
 * @type {JsMindOptions}
 */
export const DEFAULT_OPTIONS = {
    mind: {
        edgeIdGenerator: new SimpleIdGenerator('edge_'),
        nodeIdGenerator: new SimpleIdGenerator('node_'),
        rootNodeId: 'root'
    }
};

