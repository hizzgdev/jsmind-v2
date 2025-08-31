import { JsMindError } from './jsmind.error.js';

/**
 * @typedef {Object} NodeCreationOptions
 * @property {string} [nodeId] - Optional custom node ID
 * @property {boolean} [folded] - Whether the node is folded (default: false)
 * @property {JmNodeDirection} [direction] - Direction of the node (default: null)
 * @property {Object} [data] - Additional data for the node (default: {})
 */

/**
 * @typedef {Object} NodeMoveOptions
 * @property {string} [parentId] - The ID of the target parent node (if not provided, keeps current parent)
 * @property {number} [position] - The position index among siblings (if not provided, keeps current position)
 * @property {JmNodeDirection} [direction] - The direction of the node (if not provided, keeps current direction)
 */

/**
 * Node of mind map
 */
export class JmNode {
    /**
     * create a node
     * @param {string} id
     * @param {JmNodeContent} content
     */
    constructor(id, content) {
        if (!id) {
            throw new JsMindError('Invalid node id');
        }
        if (!content) {
            throw new JsMindError('Content is required');
        }

        /**
         * @member {string} id
         */
        this.id = id;
        /**
         * @member {JmNodeContent}
         */
        this.content = content;
        /**
         * @member {JmNode|null}
         */
        this.parent = null;
        /**
         * @member {JmNode[]}
         */
        this.children = [];
        /**
         * @member {boolean}
         */
        this.folded = false;
        /**
         * @member {JmNodeDirection}
         */
        this.direction = null;
        /**
         * @member {object}
         */
        this.data = {};
    }

    /**
     * List all subnode IDs
     * @returns {string[]}
     */
    getAllSubnodeIds() {
        const nodeIds = [];
        if(this.children.length>0) {
            this.children.forEach((node)=>{
                nodeIds.push(node.id);
                nodeIds.push(...node.getAllSubnodeIds());
            });
        }
        return nodeIds;
    }

    /**
     * Compare with other node
     * @param {JmNode} other
     * @returns {boolean} return true if they are equal, return false if not.
     */
    equals(other) {
        return this.id === other.id
        && this.content.type === other.content.type
        && this.content.value === other.content.value
        && this.folded === other.folded
        && this.direction === other.direction
        && ((this.parent === null && other.parent === null) || (this.parent.id === other.parent.id))
        && this.children.length === other.children.length
        && this.children.every((child, idx, _)=>{ return child.id === other.children[idx].id; });
    }

    /**
     * Check if this node is a descendant of another node
     * @param {JmNode} potentialAncestor - The potential ancestor node
     * @returns {boolean} True if this node is a descendant of potentialAncestor
     */
    isDescendant(potentialAncestor) {
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
}

/**
 * Enum for directions of node
 * @readonly
 * @enum {number}
 */
export const JmNodeDirection = {
    Left: -1,
    Center: 0,
    Right: 1,
};
