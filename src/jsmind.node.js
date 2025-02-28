import { JmEdge } from './jsmind.edge.js';
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
        this.edges = [];
        this.folded = false;
        this._data = {};
    }

    /**
     * create a node
     * @param {String} nodeId
     * @returns {JmNode} node instance
     */
    static create(nodeId) {
        return new JmNode(nodeId);
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
     * @param {JmNode} parent
     * @returns {JmNode} node's self
     */
    setParent(parent) {
        if (parent && !(parent instanceof JmNode)) {
            throw new JsMindError('invalid parent node');
        }
        this.parent = parent;
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
     * add a sub node
     * @param {JmEdge} edge
     * @returns {JmNode} node's self
     */
    addEdge(edge) {
        if(!this.edges) {
            this.edges = [];
        }
        if (!edge || !(edge instanceof JmEdge)) {
            throw new JsMindError('invalid edge');
        }
        this.edges.push(edge);
    }

    /**
     * indicates whether this node is root node
     * @returns true if this node is root node
     */
    isRootNode() {
        return this.parent === null;
    }
}

export class JmNodeEventListener {
    /**
     * @param {JmNode} node
     */
    onNodeCreated(node) {
        throw new Error('not implemented');
    }

    /**
     * @param {JmNode} node
     */
    onNodeRemoved(node) {
        throw new Error('not implemented');
    }

    /**
     * @param {JmNode} node
     */
    onNodeUpdated(node) {
        throw new Error('not implemented');
    }
}
