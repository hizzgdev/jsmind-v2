import { JsMindError } from './jsmind.error.js';

/**
 * Edge of mind map
 */
export class JmEdge {
    /**
     * create an edge
     * @param {String} id
     * @param {String} sourceNodeId
     * @param {String} targetNodeId
     * @param {JmEdgeType} type
     */
    constructor(id, sourceNodeId, targetNodeId, type) {
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
    }
}

/**
 * Type of edge
 */
export const JmEdgeType = {
    CHILD: 1,
};
