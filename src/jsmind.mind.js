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
        this._edges = {};
        this._initMindmap();
    }

    _initMindmap() {
        this.meta = metadata();
        this.root = this._createRootNode();
        this._nodes[this.root.id] = this.root;
    }

    _createRootNode() {
        return this._newNode()
            .setTopic(this.meta.name);
    }

    /**
     * create a new node, and add it to the mind
     * @returns node
     */
    _newNode() {
        const id = this.options.nodeIdGenerator.newId();
        const node = new JmNode(id);
        this._nodes[id] = node;
        return node;
    }

    /**
     * create a new edge, add add it to the mind
     * @param {JmNode} source
     * @param {JmNode} target
     * @param {JmEdgeType} type
     */
    _newEdge(source, target, type) {
        const edgeId = this.options.edgeIdGenerator.newId();
        const edge = new JmEdge(edgeId, source.id, target.id, type);
        this._edges[edgeId] = edge;
        return edge;
    }

    /**
     * retrieve a node from the mindmap given a node id
     * @param {String} nodeId the given node id
     * @returns the corresponding node in this mindmap if exist, otherwise null
     */
    getNodeById(nodeId) {
        const node = this._nodes[nodeId];
        return !!node ? node : null;
    }

    /**
     * add a child node to the parent node
     * @param {JmNode} parent
     * @param {String} topic
     * @returns {JmNode} child node
     */
    addChildNode(parent, topic) {
        // create and init a node
        const node = this._newNode()
            .setTopic(topic)
            .setParent(parent);
        parent.addChildNode(node);
        // create a an edge
        const edge = this._newEdge(parent, node, JmEdgeType.Child);
        // emit event
        this.observerManager.notifyObservers(new JmMindEvent(JmMindEventType.NodeAdded, {'node': node, 'edge': edge}));
        return node;
    }

    /**
     * remove node
     * @param {JmNode} node
     */
    removeNode(node) {
        // remove node from parent's children
        node.parent.removeChildNode(node);

        // identify all nodes that need to be cleared
        const nodes = node.getAllSubnodes();
        const nodeIds = new Set(nodes.map((n)=>n.id));
        nodeIds.add(node.id);

        // remove those nodes
        nodeIds.forEach((id)=> delete this._nodes[id]);

        // remove all relevant edges
        const edgeIds = Object.values(this._edges)
            .filter((e)=>nodeIds.has(e.sourceNodeId) || nodeIds.has(e.targetNodeId))
            .map((e) => e.id);
        edgeIds.forEach((id) => delete this._edges[id]);

        // emit event
        this.observerManager.notifyObservers(new JmMindEvent(JmMindEventType.NodeRemoved, {'node': node, 'removedNodeIds': nodeIds, 'removedEdgeIds': new Set(edgeIds)}));
    }
}
