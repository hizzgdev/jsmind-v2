import { JsMindError } from './jsmind.error.js';

/**
 * Node of mind map
 */
export class JmNode {
    /**
     * create a node
     * @param {String} id
     */
    constructor(id) {
        if (!id) {
            throw new JsMindError('invalid node id');
        }
        this.id = id;
        this.topic = null;
        this.parent = null;
        this.children = [];
        this.folded = false;
        this.position = null;
        this._data = {};
    }

    /**
     * set topic of this node
     * @param {String} topic
     * @returns {JmNode} node's self
     */
    setTopic(topic) {
        this.topic = topic;
        return this;
    }

    /**
     * set parent of this node
     * @param {JmNode} node parent node
     * @returns {JmNode} node's self
     */
    setParent(node) {
        if (node && !(node instanceof JmNode)) {
            throw new JsMindError('invalid parent node');
        }
        this.parent = node;
        return this;
    }

    /**
     * set folded state of this node
     * @param {boolean} folded
     * @returns {JmNode} node's self
     */
    setFolded(folded) {
        this.folded = !!folded;
        return this;
    }

    /**
     * set position of this node
     * @param {JmNodePosition} position
     * @returns {JmNode} node's self
     */
    setPosition(position) {
        this.position = position;
        return this;
    }

    /**
     * add child node to this node
     * @param {JmNode} node child node
     * @returns {JmNode} node's self
     */
    addChildNode(node) {
        this.children.push(node);
        return this;
    }

    /**
     * remove a child node
     * @param {JmNode} node
     * @returns {JmNode} node's self
     */
    removeChildNode(node) {
        const idx = this.children.indexOf(node);
        if(idx>=0) {
            this.children.splice(idx, 1);
        }
        return this;
    }

    /**
     * indicates whether this node is root node
     * @returns true if this node is root node
     */
    isRootNode() {
        return this.parent === null;
    }

    /**
     * list all subnodes
     * @returns {Array<JmNode>}
     */
    getAllSubnodes() {
        const nodes = [];
        nodes.push(...this.children);
        this.children.forEach((node) => nodes.push(...node.getAllSubnodes()));
        return nodes;
    }
}

export const JmNodePosition = {
    Left: -1,
    Center: 0,
    Right: 1,
};
