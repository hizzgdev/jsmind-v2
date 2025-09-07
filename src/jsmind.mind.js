import { JmObserverManager } from './event/jsmind.observer.manager.js';
import { JmEdge } from './jsmind.edge.js';
import { JmNode } from './jsmind.node.js';
import { JmNodeContent } from './jsmind.node.content.js';
import { DEFAULT_METADATA, DEFAULT_OPTIONS } from './jsmind.const.js';

import { JmMindEvent, JmMindEventType } from './event/jsmind.mind.event.js';
import { JsMindError } from './jsmind.error.js';

export class JmMind {
    /**
     * Create a new mind map
     * @param {import('./jsmind.const.js').MindMetadata} [metadata] - Metadata for the mind map
     * @param {import('./jsmind.const.js').MindOptions} [options] - Configuration options for the mind map
     */
    constructor(metadata = {}, options = {}) {

        /**
         * @type {import('./jsmind.const.js').MindMetadata}
         */
        this.meta = this._merge(DEFAULT_METADATA, metadata);

        /**
         * @type {import('./jsmind.const.js').MindOptions}
         */
        this.options = this._merge(DEFAULT_OPTIONS.mind, options);
        this.observerManager = new JmObserverManager(this);
        this.nodeManager = new JmNodeManager(this);

        /**
         * @type {Object.<string, JmNode>}
         */
        this._nodes = {};
        /**
         * @type {Object.<string, JmEdge>}
         * Global store for edges (links, references, etc.)
         */
        this._edges = {};

        this._root = this._createRootNode();
    }

    /**
     * get the root node
     * @returns {JmNode} root node
     */
    get root() {
        return this.nodeManager.manage(this._root);
    }

    /**
     * Add an edge between two nodes
     * @param {string} sourceNodeId - The source node ID
     * @param {string} targetNodeId - The target node ID
     * @param {JmEdgeType} type - The edge type
     * @param {string} [label] - Optional label for the edge
     * @returns {JmEdge} The created edge
     */
    addEdge(sourceNodeId, targetNodeId, type, label = null) {
        // Validate nodes exist
        this._getNodeById(sourceNodeId);
        this._getNodeById(targetNodeId);

        const edgeId = this.options.edgeIdGenerator.newId();
        const edge = new JmEdge(edgeId, sourceNodeId, targetNodeId, type, label);
        this._edges[edgeId] = edge;

        // Emit event
        this.observerManager.notifyObservers(new JmMindEvent(
            JmMindEventType.EdgeAdded,
            {
                'edge': edge
            })
        );

        return edge;
    }

    /**
     * add a child node to the parent node
     * @param {string} parentId parent node Id
     * @param {JmNodeContent} content
     * @param {import('./jsmind.node.js').NodeCreationOptions} [options] optional node creation options
     * @returns {JmNode} the added child node
     */
    addChildNode(parentId, content, options) {
        const existedParent = this._getNodeById(parentId);

        // Extract options with defaults
        const nodeId = (options && options.nodeId) || this.options.nodeIdGenerator.newId();

        // create and init a node
        const node = this._newNode(nodeId, content);

        // Set additional properties only if provided in options
        if (options) {
            if (options.folded !== undefined) {
                node.folded = options.folded;
            }
            if (options.direction !== undefined) {
                node.direction = options.direction;
            }
            if (options.data !== undefined) {
                node.data = options.data;
            }
        }

        node.parent = existedParent;
        // add to parent's children
        existedParent.children.push(node);
        // emit event
        this.observerManager.notifyObservers(new JmMindEvent(
            JmMindEventType.NodeAdded,
            {
                'node': node
            })
        );
        return this.nodeManager.manage(node);
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
     * Get all edges for a specific node
     * @param {string} nodeId - The node ID
     * @param {string} [type] - Optional edge type filter
     * @returns {JmEdge[]} Array of edges involving the node
     */
    getEdges(nodeId, type = null) {
        return Object.values(this._edges).filter(edge => {
            return (edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId) &&
                   (!type || edge.type === type);
        });
    }

    /**
     * Move a node to a new parent and position
     * @param {string} nodeId - The ID of the node to move
     * @param {import('./jsmind.node.js').NodeMoveOptions} options - Move options
     * @returns {JmNode} The moved node
     */
    moveNode(nodeId, options) {
        if (!options || Object.keys(options).length === 0) {
            throw new JsMindError('Options are required for moveNode operation');
        }

        const node = this._getNodeById(nodeId);
        if (!node) {
            throw new JsMindError(`Node with ID '${nodeId}' not found`);
        }

        // Skip all logic for root node - it cannot be moved
        if (node === this.root) {
            return this.nodeManager.manage(node);
        }

        // Extract options
        const targetParentId = options.parentId;
        const targetPosition = options.position;
        const targetDirection = options.direction;

        // Capture original values before any changes
        const oldParent = node.parent;
        const oldPosition = node.parent ? node.parent.children.indexOf(node) : -1;
        const oldDirection = node.direction;

        // 1. Update parent and position if the node parent is provided and changed
        if (targetParentId && (!node.parent || node.parent.id !== targetParentId)) {
            const targetParent = this._getNodeById(targetParentId);
            if (!targetParent) {
                throw new JsMindError(`Target parent with ID '${targetParentId}' not found`);
            }

            // Validate that we're not moving a node to be its own descendant
            if (targetParent.isDescendant(node)) {
                throw new JsMindError('Cannot move a node to be its own descendant');
            }

            // Remove from current parent
            this._removeNodeFromParent(node);

            // Add to new parent at specified position and create edge
            this._addNodeToParent(node, targetParent, targetPosition);
        }

        // 2. Reposition if the node parent is not provided or is not changed, and the targetPosition is provided and changed
        if ((!targetParentId || (node.parent && node.parent.id === targetParentId)) &&
            targetPosition !== undefined && targetPosition !== null) {
            this._repositionNode(node, targetPosition);
        }

        // 3. Update direction if the target direction is provided and changed
        if (targetDirection !== undefined && targetDirection !== null) {
            node.direction = targetDirection;
        }

        // 4. Emit event only if something actually changed
        this._emitNodeMovedEventIfChanged(node, oldParent, oldPosition, oldDirection);

        return this.nodeManager.manage(node);
    }

    /**
     * Remove an edge by ID
     * @param {string} edgeId - The edge ID to remove
     * @returns {boolean} True if the edge was removed, false if not found
     */
    removeEdge(edgeId) {
        const edge = this._edges[edgeId];
        if (edge) {
            delete this._edges[edgeId];

            // Emit event
            this.observerManager.notifyObservers(new JmMindEvent(
                JmMindEventType.EdgeRemoved,
                {
                    'edge': edge
                })
            );

            return true;
        }
        return false;
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

    /**
     * Add a node to a new parent at a specific position
     * @private
     * @param {JmNode} node - The node to add
     * @param {JmNode} targetParent - The new parent node
     * @param {number} targetPosition - The position index among siblings
     */
    _addNodeToParent(node, targetParent, targetPosition) {
        node.parent = targetParent;

        if (targetPosition === undefined || targetPosition === null) {
            // Add to the end if no position specified
            targetParent.children.push(node);
        } else {
            // Insert at specific position
            const position = Math.max(0, Math.min(targetPosition, targetParent.children.length));
            targetParent.children.splice(position, 0, node);
        }
    }

    /**
     * create a new node, and add it to the mind
     * @param {string} nodeId - The ID for the new node
     * @param {JmNodeContent} content - Content for the node
     * @returns {JmNode} The created node
     */
    _createRootNode() {
        // Check if rootNodeId is empty and generate a new one if needed
        const rootNodeId = this.options.rootNodeId || this.options.nodeIdGenerator.newId();
        return this._newNode(rootNodeId, JmNodeContent.createText(this.meta.name));
    }

    /**
     * Emit NodeMoved event only if something actually changed
     * @private
     * @param {JmNode} node - The node that was moved
     * @param {JmNode} oldParent - The old parent node
     * @param {number} oldPosition - The old position index
     * @param {JmNodeDirection} oldDirection - The old direction
     */
    _emitNodeMovedEventIfChanged(node, oldParent, oldPosition, oldDirection) {
        // Compare actual updated node properties with old values
        const parentChanged = oldParent.id !== node.parent.id;
        const positionChanged = oldPosition !== node.parent.children.indexOf(node);
        const directionChanged = oldDirection !== node.direction;

        if (parentChanged || positionChanged || directionChanged) {
            const eventData = {
                'node': node
            };

            // Only include changed properties in event data
            if (parentChanged) {
                eventData.oldParentId = oldParent.id;
            }
            if (positionChanged) {
                eventData.oldPosition = oldPosition;
            }
            if (directionChanged) {
                eventData.oldDirection = oldDirection;
            }

            this.observerManager.notifyObservers(new JmMindEvent(
                JmMindEventType.NodeMoved,
                eventData
            ));
        }
    }

    /**
     * Merge user values with default values
     * @param {Object} [defaultValues] - default values
     * @param {Object} [userValues] - User-provided values
     * @returns {Object} Merged values
     * @private
     */
    _merge(defaultValues, userValues) {
        if (!userValues) {
            return { ...defaultValues };
        }

        return {
            ...defaultValues,
            ...userValues
        };
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
     * Remove a node from its current parent
     * @private
     * @param {JmNode} node - The node to remove from parent
     */
    _removeNodeFromParent(node) {
        if (!node.parent) {
            return;
        }

        const parent = node.parent;
        const index = parent.children.indexOf(node);
        if (index > -1) {
            parent.children.splice(index, 1);
        }
        node.parent = null;
    }

    /**
     * Reposition a node within the same parent (optimized operation)
     * @private
     * @param {JmNode} node - The node to reposition
     * @param {number} targetPosition - The new position index among siblings
     */
    _repositionNode(node, targetPosition) {
        if (targetPosition === undefined || targetPosition === null) {
            return;
        }

        const parent = node.parent;
        const currentIndex = parent.children.indexOf(node);
        const newPosition = Math.max(0, Math.min(targetPosition, parent.children.length));

        if (currentIndex !== newPosition) {
            parent.children.splice(currentIndex, 1);
            parent.children.splice(newPosition, 0, node);
        }
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
