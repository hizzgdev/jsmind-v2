
/**
 * @typedef {Object} MindMetadata
 * @property {string} author - The author of the mind map
 * @property {string} name - The name of the mind map
 * @property {string} version - The version of the mind map
 */

/**
 * @typedef {Object} MindOptions
 * @property {string} rootNodeId - The ID for the root node
 */

/**
 * @typedef {Object} JsMindOptions
 * @property {MindOptions} mind - Mind-specific options
 */

/**
 * @type {MindMetadata}
 */
export const DEFAULT_METADATA = {
    author: 'hizzgdev@163.com',
    name: 'jsMind Mindmap',
    version: '1.0'
};

/**
 * @type {JsMindOptions}
 */
export const DEFAULT_OPTIONS = {
    mind: {
        rootNodeId: 'root'
    }
};
