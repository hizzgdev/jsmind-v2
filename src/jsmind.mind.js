import { JmObserverManager } from './event/jsmind.observer.manager.js';
import { JmEdge } from './jsmind.edge.js';
import { metadata } from './jsmind.meta.js';
import { JmNode } from './jsmind.node.js';
import { JmMindEvent, JmMindEventType } from './event/jsmind.mind.observer.js';

export class JmMind {
    constructor(mindOptions) {
        this.options = mindOptions;
        this.observerManager = new JmObserverManager();
        this._nodes = {};
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
        const node = JmNode.create(id);
        this._nodes[id] = node;
        return node;
    }

    /**
     * add a child node to the parent node
     * @param {JmNode} parent
     * @param {String} topic
     * @returns {JmNode} child node
     */
    addSubNode(parent, topic) {
        const node = this._newNode().setTopic(topic).setParent(parent);

        const edgeId = this.options.edgeIdGenerator.newId();
        const edge = JmEdge.createChildEdge(edgeId, parent, node);

        parent.addEdge(edge);

        this.observerManager.notifyObservers(new JmMindEvent(JmMindEventType.NodeAdded, node));
        return node;
    }

    /**
     * remove node by nodeId
     * @param {String} nodeId
     */
    removeNodeById(nodeId) {
        console.log(nodeId);
    }
}
