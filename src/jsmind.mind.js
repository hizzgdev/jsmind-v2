import { JmObserverManager } from "./event/jsmind.observer.manager";
import { JmEdge } from "./jsmind.edge";
import { metadata } from "./jsmind.meta";
import { JmNode } from "./jsmind.node";

export class JmMind {
    constructor(mindOptions) {
        this.options = mindOptions;
        this.observerManager = new JmObserverManager();
        this._initMindmap();
    }

    _initMindmap() {
        this.meta = metadata();
        this.root = this._createRootNode();
    }

    _createRootNode() {
        const id = this.options.nodeIdGenerator.newId();
        return JmNode.create(id).setTopic(this.meta.name);
    }

    /**
     * add a child node to the parent node
     * @param {JmNode} parent
     * @param {String} topic
     * @returns {JmNode} child node
     */
    addSubNode(parent, topic) {
        const nodeId = this.options.nodeIdGenerator.newId();
        const node = JmNode.create(nodeId).setTopic(topic).setParent(parent);

        const edgeId = this.options.edgeIdGenerator.newId();
        const edge = JmEdge.createChildEdge(edgeId, node);

        parent.addEdge(edge);

        this.observerManager.notifyObservers(new JmMindEvent('add_node', node));
        return node;
    }
}


export class JmMindEvent {
    constructor(type, data) {
        this.type = type;
        this.data = data;
    }
}
