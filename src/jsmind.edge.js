import { JmNode } from './jsmind.node.js';
import { JsMindError } from './jsmind.error.js';

/**
 * Edge of mind map
 */
export class JmEdge {
    /**
     * create an edge
     * @param {String} id
     * @param {JmNode} target
     * @param {JmEdgeType} type
     */
    constructor(id, target, type) {
        if (!id) {
            throw new JsMindError('invalid edge id');
        }
        if (!target || !(target instanceof JmNode)) {
            throw new JsMindError('invalid target node');
        }
        if (!type) {
            throw new JsMindError('invalid edge type');
        }
        this.id = id;
        this.target = target;
        this.type = type;
    }

    /**
     * create a child edge
     * @param {String} id
     * @param {JmNode} target
     * @returns child edge instance of JmEdge
     */
    static createChildEdge(id, target) {
        return new JmEdge(id, target, JmEdgeType.CHILD);
    }
}

/**
 * Type of edge
 */
export const JmEdgeType = {
    CHILD: 1,
};
