import { JmNode } from './jsmind.node';
import { JsMindError } from './jsmind.error';
import { config } from './jsmind.config';

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
     * @param {JmNode} target
     * @returns child edge instance of JmEdge
     */
    static createChildEdge(target) {
        const id = config.edgeIdGenerator.newId();
        return new JmEdge(id, target, JmEdgeType.CHILD);
    }
}

/**
 * Type of edge
 */
export const JmEdgeType = {
    CHILD: 1,
};
