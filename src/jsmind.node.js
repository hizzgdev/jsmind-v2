import { config } from './jsmind.config';
import { JmEdge } from './jsmind.edge';
import { JsMindError } from './jsmind.error';

/**
 * Node of mind map
 */
export class JmNode {
    /**
     * create a node
     * @param {String} id
     * @param {JmNode} parent
     * @param {String} topic
     */
    constructor(id, parent, topic) {
        if (!id) {
            throw new JsMindError('invalid node id');
        }
        if (parent && !(parent instanceof JmNode)) {
            throw new JsMindError('invalid parent node');
        }
        this.id = id;
        this.topic = topic;
        this.parent = parent;
        this.edges = [];
        this.folded = false;
    }

    /**
     * create a root node
     * @param {String} topic
     * @returns A root node instance of JmNode
     */
    static createRootNode(topic) {
        const id = config.nodeIdGenerator.newId();
        const node = new JmNode(id, null, topic);
        return node;
    }

    /**
     * create a child node of this node
     * @param {String} topic
     * @returns A child node instance of this node
     */
    createSubNode(topic) {
        const id = config.nodeIdGenerator.newId();
        const node = new JmNode(id, this, topic);
        const edge = JmEdge.createChildEdge(node);
        this._addEdge(edge);
        return node;
    }

    /**
     * set topic of this node
     * @param {String} topic
     * @returns node's self
     */
    setTopic(topic) {
        this.topic = topic;
        return this;
    }

    /**
     * set folded state of this node
     * @param {boolean} folded
     * @returns node's self
     */
    setFolded(folded) {
        this.folded = !!folded;
        return this;
    }

    /**
     * add an edge to this node
     * @param {JmEdge} edge
     * @returns node's self
     */
    _addEdge(edge) {
        if (this.edges == null) {
            this.edges = [];
        }
        this.edges.push(edge);
        return this;
    }

    /**
     * indicates whether this node is root node
     * @returns true if this node is root node
     */
    isRootNode() {
        return this.parent === null;
    }
}
