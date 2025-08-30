import { JmObserverManager } from './event/jsmind.observer.manager.js';
import { JmEdge, JmEdgeType } from './jsmind.edge.js';
import { DEFAULT_METADATA } from './jsmind.meta.js';
import { JmNode } from './jsmind.node.js';
import { JmNodeContent } from './jsmind.node.content.js';
import { DEFAULT_OPTIONS } from './jsmind.options.js';

import { JmMindEvent, JmMindEventType } from './event/jsmind.mind.event.js';
import { JsMindError } from './jsmind.error.js';
import { JmMindSerializationManager } from './serialization/jsmind.serialization.manager.js';

export class JmMind {
    /**
     * Create a new mind map
     * @param {import('./jsmind.options.js').MindOptions} [mindOptions] - Configuration options for the mind map
     */
    constructor(mindOptions) {
        /**
         * @type {import('./jsmind.options.js').MindOptions}
         */
        this.options = this._mergeOptions(mindOptions);
        this.observerManager = new JmObserverManager(this);
        this.nodeManager = new JmNodeManager(this);
        /**
         * @type {Object.<string, JmNode>}
         */
        this._nodes = {};
        /**
         * @type {Object.<string, JmEdge>}
         */
        this._edges = {};

        // Initialize serialization system
        this.serializationManager = JmMindSerializationManager.getInstance();

        this._initMindmap();
    }

    /**
     * Merge user options with default options
     * @param {import('./jsmind.options.js').MindOptions} [userOptions] - User-provided options
     * @returns {import('./jsmind.options.js').MindOptions} Merged options
     * @private
     */
    _mergeOptions(userOptions) {
        const defaultOptions = DEFAULT_OPTIONS.mind;

        if (!userOptions) {
            return { ...defaultOptions };
        }

        return {
            ...defaultOptions,
            ...userOptions
        };
    }

    _initMindmap() {
        this.meta = DEFAULT_METADATA;
        this._root = this._createRootNode();
        this._nodes[this._root.id] = this._root;
    }

    _createRootNode() {
        const node = this._newNode(this.options.rootNodeId, JmNodeContent.createText(this.meta.name));
        return node;
    }

    /**
     * create a new node, and add it to the mind
     * @param {string} nodeId - The ID for the new node
     * @param {JmNodeContent} content - Content for the node
     * @returns {JmNode} The created node
     */
    _newNode(nodeId, content) {
        const node = new JmNode(nodeId, content);
        this._nodes[nodeId] = node;
        return node;
    }

    /**
     * create a new edge, and add it to the mind
     * @param {string} edgeId - The ID for the new edge
     * @param {JmNode} source - The source node
     * @param {JmNode} target - The target node
     * @param {JmEdgeType} type - The type of edge
     * @returns {JmEdge} The created edge
     */
    _newEdge(edgeId, source, target, type) {
        const edge = new JmEdge(edgeId, source.id, target.id, type);
        this._edges[edgeId] = edge;
        return edge;
    }

    /**
     * retrieve node by node id
     * @param {string} nodeId
     * @returns {JmNode} the corresponding node
     * @throws throw an error if node doesn't exist
     */
    _getNodeById(nodeId) {
        const node = this._nodes[nodeId];
        if(!!node) {
            return node;
        }
        throw new JsMindError(`node[id=${nodeId}] does not exist`);
    }

    /**
     * find a node from the mindmap by the given id
     * @param {string} nodeId the given node id
     * @returns {JmNode|null} the corresponding node in this mindmap if exist, otherwise null
     */
    findNodeById(nodeId) {
        const node = this._nodes[nodeId];
        return !!node ? this.nodeManager.manage(node) : null;
    }

    /**
     * get the root node
     * @returns {JmNode} root node
     */
    get root() {
        return this.nodeManager.manage(this._root);
    }

    /**
     * add a child node to the parent node
     * @param {string} parentId parent node Id
     * @param {JmNodeContent} content
     * @returns {JmNode} the added child node
     */
    addChildNode(parentId, content) {
        const existedParent = this._getNodeById(parentId);
        // create and init a node
        const nodeId = this.options.nodeIdGenerator.newId();
        const node = this._newNode(nodeId, content);
        node.parent = existedParent;
        // add to parent's children
        existedParent.children.push(node);
        // create an edge
        const edgeId = this.options.edgeIdGenerator.newId();
        const edge = this._newEdge(edgeId, existedParent, node, JmEdgeType.Child);
        // emit event
        this.observerManager.notifyObservers(new JmMindEvent(
            JmMindEventType.NodeAdded,
            {
                'node': node,
                'edge': edge
            })
        );
        return this.nodeManager.manage(node);
    }

    /**
     * remove node
     * @param {string} nodeId
     */
    removeNode(nodeId) {
        const node = this._getNodeById(nodeId);
        if(nodeId == this._root.id) {
            throw new JsMindError('root node can not be removed');
        }

        // remove node from parent's children
        const nodeIndex = node.parent.children.indexOf(node);
        node.parent.children.splice(nodeIndex, 1);

        // identify all nodes that need to be cleared
        const nodeIds = node.getAllSubnodeIds();
        nodeIds.push(node.id);

        // remove those nodes
        nodeIds.forEach((id)=> delete this._nodes[id]);

        // remove all relevant edges
        const edgeIds = Object.values(this._edges)
            .filter((e)=>nodeIds.includes(e.sourceNodeId) || nodeIds.includes(e.targetNodeId))
            .map((e) => e.id);
        edgeIds.forEach((id) => delete this._edges[id]);

        // emit event
        this.observerManager.notifyObservers(new JmMindEvent(
            JmMindEventType.NodeRemoved,
            {
                'node': node,
                'removedNodeIds': nodeIds,
                'removedEdgeIds': edgeIds
            })
        );
    }

    _onNodeUpdated(node, prop, originValue, newValue) {
        this.observerManager.notifyObservers(new JmMindEvent(
            JmMindEventType.NodeUpdated,
            {
                'node': node,
                'property': prop,
                'originValue': originValue,
                'newValue': newValue
            })
        );
    }

    /**
     * Serialize the mind map to a specific format
     * @param {string} format - The target format (default: 'json')
     * @returns {any} The serialized data
     *
     * @example
     * // Serialize to JSON format
     * const mind = new JmMind(options);
     * const jsonData = mind.serialize('json');
     * console.log(jsonData.meta.name); // "untitled jsmind mindmap"
     *
     * // Serialize to FreeMind format (when implemented)
     * const freemindData = mind.serialize('freemind');
     */
    serialize(format = 'json') {
        return this.serializationManager.serialize(this, format);
    }
}

class JmNodeManager {
    constructor(mind) {
        this.mind = mind;
        this.readonlyFields = new Set(['id', 'parent', 'children', 'data']);
        this.unsafeArrayMethods = new Set(['fill', 'pop', 'push', 'shift', 'unshift', 'reverse', 'sort', 'splice']);
    }

    manage(node) {
        return new Proxy(node, {
            get: this.getterTrap.bind(this),
            set: this.setterTrap.bind(this)
        });
    }

    getterTrap(node, prop) {
        const ori = node[prop];
        if(prop === 'children') {
            const itemManagedArray = ori.map((n)=>this.manage(n));
            return new Proxy(itemManagedArray, {
                get: function (arr, prop) {
                    if(this.unsafeArrayMethods.has(prop)) {
                        return function() {
                            throw new JsMindError(`unsupported method ${prop} on node.children, please follow the document to operate the mindmap.`);
                        };
                    }
                    return arr[prop];
                }.bind(this)
            });
        }
        if(prop === 'parent') {
            return !!ori ? this.manage(ori) : null;
        }
        return ori;
    }

    setterTrap(node, prop, value) {
        if(this.readonlyFields.has(prop)) {
            throw new JsMindError(`the property[${prop}] is readonly`);
        }
        const ori = node[prop];
        if(ori !== value) {
            node[prop] = value;
            this.mind._onNodeUpdated(node, prop, ori, value);
        }
        return true;
    }

    arrayApplyTrap(arr, thisArg, argumentsList) {
        console.log(arr, thisArg, argumentsList);
    }
}
