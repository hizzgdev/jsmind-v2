import { JsMindError } from './jsmind.error.js';

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
         * @member {JmNodePosition}
         */
        this.position = null;
        /**
         * @member {object}
         */
        this.data = {};
    }

    /**
     * Getter for topic (backward compatibility)
     * @returns {string|null}
     */
    get topic() {
        return this.content && this.content.type === 'text' ? this.content.value : null;
    }

    /**
     * Setter for topic (backward compatibility)
     * @param {string} value
     */
    set topic(value) {
        if (value !== null && value !== undefined) {
            this.content = { type: 'text', value: value };
        } else {
            this.content = null;
        }
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
        && this.position === other.position
        && ((this.parent === null && other.parent === null) || (this.parent.id === other.parent.id))
        && this.children.length === other.children.length
        && this.children.every((child, idx, _)=>{ return child.id === other.children[idx].id; });
    }
}

/**
 * Enum for positions of node
 * @readonly
 * @enum {number}
 */
export const JmNodePosition = {
    Left: -1,
    Center: 0,
    Right: 1,
};
