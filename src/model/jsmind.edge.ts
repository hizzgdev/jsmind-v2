import { JsMindError } from '../jsmind.error.ts';

/**
 * Options for creating a new edge.
 *
 * @public
 */
export interface EdgeCreationOptions {
    /** Optional edge ID, will be generated if not provided. */
    edgeId?: string;
    /** Optional label for the edge. */
    label?: string;
}

/**
 * Edge of mind map.
 *
 * @remarks
 * Edges represent additional relationships between nodes (not parent-child relationships).
 *
 * @public
 */
export class JmEdge {
    /** The unique identifier of the edge. */
    id: string;

    /** The ID of the source node. */
    sourceNodeId: string;

    /** The ID of the target node. */
    targetNodeId: string;

    /** The type of the edge. */
    type: JmEdgeType;

    /** The optional label of the edge. */
    label: string | null;

    /**
     * Creates a new edge.
     *
     * @param id - The unique identifier of the edge.
     * @param sourceNodeId - The ID of the source node.
     * @param targetNodeId - The ID of the target node.
     * @param type - The type of the edge.
     * @param label - Optional label for the edge.
     * @throws {@link JsMindError} If any of the required parameters are invalid.
     */
    constructor(id: string, sourceNodeId: string, targetNodeId: string, type: JmEdgeType, label: string | null = null) {
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
 * Type of edge - only for additional relationships (not parent-child).
 *
 * @public
 */
export const JmEdgeType = {
    /** Link edge type. */
    Link: 'link',
} as const;

export type JmEdgeType = typeof JmEdgeType[keyof typeof JmEdgeType];

