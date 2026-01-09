import type { JmElement } from '../../common/dom.ts';
import { JsMindError } from '../../common/error.ts';
import { JmPoint, JmSize } from '../../common/index.ts';
import { type JmNodeContent } from './node-content.ts';

/**
 * Options for creating a new node.
 *
 * @public
 */
export interface NodeCreationOptions {
    /** Optional custom node ID. */
    nodeId?: string;
    /** Whether the node is folded (default: false). */
    folded?: boolean;
    /** Direction of the node (default: null). */
    side?: JmNodeSide;
    /** Additional data for the node (default: {}). */
    data?: Record<string, unknown>;
}

/**
 * Options for specifying node destination.
 *
 * @public
 */
export interface NodeDestinationOptions {
    /** The ID of the target parent node (required). */
    parentId: string;
    /** The position index among siblings (if not provided, adds to end). */
    position?: number
    /** The direction of the node (if not provided, keeps current direction). */
    side?: JmNodeSide;
}


export class JmNodeViewData {
    element: JmElement | null = null;

    expander: JmElement | null = null;

    leadingLine: SVGPathElement | null = null;
}

export class JmNodeLayoutData {
    side: JmNodeSide = JmNodeSide.Center;

    visible: boolean = true;

    size: JmSize = new JmSize(0, 0);

    withDescendantsSize: JmSize = new JmSize(0, 0);

    offsetToParent: JmPoint = new JmPoint(0, 0);
}

class NodeInternalData {
    view: JmNodeViewData = new JmNodeViewData();

    layout: JmNodeLayoutData = new JmNodeLayoutData();
}
/**
 * Node of mind map.
 *
 * @public
 */
export class JmNode {
    /** The unique identifier of the node. */
    id: string;

    /** The content of the node. */
    content: JmNodeContent;

    /** The parent node, or null if this is the root node. */
    parent: JmNode | null;

    /** Array of child nodes. */
    children: JmNode[];

    /** Whether the node is folded (collapsed). */
    folded: boolean;

    /** The direction of the node. */
    side: JmNodeSide;

    /** Additional data associated with the node. */
    data: Record<string, unknown>;

    /** View data associated with the node. */
    _data: NodeInternalData;

    /**
     * Creates a new node.
     *
     * @param id - The unique identifier of the node.
     * @param content - The content of the node.
     * @throws {@link JsMindError} If the node ID or content is invalid.
     */
    constructor(id: string, content: JmNodeContent) {
        if (!id) {
            throw new JsMindError('Invalid node id');
        }
        if (!content) {
            throw new JsMindError('Content is required');
        }

        this.id = id;
        this.content = content;
        this.parent = null;
        this.children = [];
        this.folded = false;
        this.side = JmNodeSide.SideA;
        this.data = {};
        this._data = new NodeInternalData();
    }

    /**
     * Lists all subnode IDs recursively.
     *
     * @returns Array of all subnode IDs including this node's children and their descendants.
     */
    getAllSubnodeIds(): string[] {
        const nodeIds: string[] = [];
        if(this.children.length > 0) {
            this.children.forEach((node)=>{
                nodeIds.push(node.id);
                nodeIds.push(...node.getAllSubnodeIds());
            });
        }
        return nodeIds;
    }

    /**
     * Compares this node with another node.
     *
     * @param other - The other node to compare with.
     * @returns True if they are equal, false otherwise.
     */
    equals(other: JmNode): boolean {
        return this.id === other.id
        && this.content.type === other.content.type
        && this.content.value === other.content.value
        && this.folded === other.folded
        && this.side === other.side
        && ((this.parent === null && other.parent === null) || (this.parent!.id === other.parent!.id))
        && this.children.length === other.children.length
        && this.children.every((child, idx, _)=>{ return child.id === other.children[idx].id; });
    }

    /**
     * Checks if this node is a descendant of another node.
     *
     * @param potentialAncestor - The potential ancestor node.
     * @returns True if this node is a descendant of potentialAncestor.
     */
    isDescendant(potentialAncestor: JmNode): boolean {
        if (!potentialAncestor || !potentialAncestor.children) {
            return false;
        }

        for (const child of potentialAncestor.children) {
            if (child.id === this.id) {
                return true;
            }
            if (this.isDescendant(child)) {
                return true;
            }
        }
        return false;
    }

    isRoot(): boolean {
        return this.parent === null;
    }
}

/**
 * Enumeration for directions of node.
 *
 * @public
 */
export const JmNodeSide = {
    /** Left direction. */
    SideB: -1,
    /** Center direction. */
    Center: 0,
    /** Right direction. */
    SideA: 1,
} as const;

export type JmNodeSide = typeof JmNodeSide[keyof typeof JmNodeSide];
