import { JmObserverManager } from './event/jsmind.observer.manager.js';
import { JmEdge, JmEdgeType } from './jsmind.edge.js';
import { metadata } from './jsmind.meta.js';
import { JmNode } from './jsmind.node.js';
import { JmMindEvent, JmMindEventType } from './event/jsmind.mind.observer.js';

export class JmMind {
    constructor(mindOptions) {
        this.options = mindOptions;
        this.observerManager = new JmObserverManager();
        this._nodes = {};
        this._edges = [];
        this._initMindmap();
    }

    _initMindmap() {
        this.meta = metadata();
        this.root = this._createRootNode();
        this._nodes[this.root.id] = this.root;
    }

    _createRootNode() {
        return this._newNode().setTopic(this.meta.name);
    }

    _newNode() {
        const id = this.options.nodeIdGenerator.newId();
        const node = new JmNode(id);
        this._nodes[id] = node;
        return node;
    }

    /**
     * add a child node to the parent node
     * @param {JmNode} parent
     * @param {String} topic
     * @returns {JmNode} child node
     */
    addChildNode(parent, topic) {
        const node = this._newNode().setTopic(topic).setParent(parent);
        parent.addChildNode(node);

        const edgeId = this.options.edgeIdGenerator.newId();
        const edge = new JmEdge(edgeId, parent, node, JmEdgeType.CHILD);
        this._edges.push(edge);

        this.observerManager.notifyObservers(new JmMindEvent(JmMindEventType.NodeAdded, node));
        return node;
    }

    /**
     * remove node
     * @param {JmNode} node
     */
    removeNode(node) {
        this._removeChildNodes(node);
        this._removeReversedEdges(node);
        this._removeEdgeByTarget(node);
        delete this._nodes[node.id];
    }

    /**
     * remove child nodes
     * @param {JmNode} node
     */
    _removeChildNodes(node) {
        node.getChildNodes().forEach(n=>this.removeNode(n));
    }

    _removeReversedEdges(node) {
        node.getSourceNodes();
    }

    _removeEdgeByTarget(node) {
        node.getChildNodes();
    }
}
