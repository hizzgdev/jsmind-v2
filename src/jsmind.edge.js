import { JsMindError } from './jsmind.error.js';

/**
 * @typedef {Object} EdgeCreationOptions
 * @property {string} [edgeId] - Optional edge ID, will be generated if not provided
 * @property {string} [label] - Optional label for the edge
 */

/**
 * Edge of mind map
 */
export class JmEdge {
    /**
     * create an edge
     * @param {string} id
     * @param {string} sourceNodeId
     * @param {string} targetNodeId
     * @param {JmEdgeType} type
     * @param {string} [label] - Optional label for the edge
     */
    constructor(id, sourceNodeId, targetNodeId, type, label = null) {
        if (!id) {
            throw new JsMindError('invalid edge id');
        }
        if (!sourceNodeId) {
            throw new JsMindError('invalid source node id');
        }
        if (!targetNodeId) {
            throw new JsMindError('invalid target node');
        }
        if (!type) {
            throw new JsMindError('invalid edge type');
        }
        this.id = id;
        this.sourceNodeId = sourceNodeId;
        this.targetNodeId = targetNodeId;
        this.type = type;
        this.label = label;
    }
}

/**
 * Type of edge - only for additional relationships (not parent-child)
 */
export const JmEdgeType = {
    Link: 'link',
};
