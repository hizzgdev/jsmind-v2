/**
 * @license BSD-3-Clause
 * @copyright 2014-2025 hizzgdev@163.com
 *
 * Project Home:
 *   https://github.com/hizzgdev/jsmind/
 */
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.jsMind = factory());
})(this, (function () { 'use strict';

    /**
     * Custom error class for jsMind operations.
     *
     * @public
     */
    class JsMindError extends Error {
        /**
         * Creates a new JsMindError instance.
         *
         * @param message - The error message.
         */
        constructor(message) {
            super(message);
        }
    }

    /**
     * Manager for observers of an observed object.
     *
     * @public
     */
    class JmObserverManager {
        /**
         * Creates an observer manager for an observed object.
         *
         * @param observedObject - The object to observe.
         */
        constructor(observedObject) {
            this.observedObject = observedObject;
            this._observers = [];
        }
        /**
         * Adds an observer to the observed object.
         *
         * @param observer - An object that contains an `update(observedObject, event)` method.
         * @throws {@link JsMindError} If the observer is not a valid object.
         */
        addObserver(observer) {
            if (!observer || !observer.update || typeof observer.update !== 'function') {
                throw new JsMindError('observer is not an valid Object');
            }
            this._observers.push(observer);
        }
        /**
         * Removes an observer that was previously added by the `addObserver` method.
         *
         * @param observer - The observer to remove.
         */
        removeObserver(observer) {
            this._observers = this._observers.filter(o => o !== observer);
        }
        /**
         * Removes all observers from the object.
         */
        clearObservers() {
            this._observers = [];
        }
        /**
         * Notifies the event to all observers.
         *
         * @remarks
         * This is an asynchronous method. Each observer is notified in a separate
         * asynchronous operation.
         *
         * @param event - Events are defined by different observed objects, which
         * represent specific information about the changes.
         */
        async notifyObservers(event) {
            this._observers.forEach(async (observer) => {
                await new Promise((resolve) => {
                    setTimeout(() => {
                        observer.update(this.observedObject, event);
                        resolve();
                    });
                });
            });
        }
    }

    /**
     * Edge of mind map.
     *
     * @remarks
     * Edges represent additional relationships between nodes (not parent-child relationships).
     *
     * @public
     */
    class JmEdge {
        /**
         * Creates a new edge.
         *
         * @param id - The unique identifier of the edge.
         * @param sourceNodeId - The ID of the source node.
         * @param targetNodeId - The ID of the target node.
         * @param type - The type of the edge.
         * @param label - Optional label for the edge.
         * @throws {@link JsMindError} If any of the required parameters are invalid.
         */
        constructor(id, sourceNodeId, targetNodeId, type, label = null) {
            if (!id) {
                throw new JsMindError('invalid edge id');
            }
            if (!sourceNodeId) {
                throw new JsMindError('invalid source node id');
            }
            if (!targetNodeId) {
                throw new JsMindError('invalid target node');
            }
            if (!type) {
                throw new JsMindError('invalid edge type');
            }
            this.id = id;
            this.sourceNodeId = sourceNodeId;
            this.targetNodeId = targetNodeId;
            this.type = type;
            this.label = label;
        }
    }

    /**
     * Node of mind map.
     *
     * @public
     */
    class JmNode {
        /**
         * Creates a new node.
         *
         * @param id - The unique identifier of the node.
         * @param content - The content of the node.
         * @throws {@link JsMindError} If the node ID or content is invalid.
         */
        constructor(id, content) {
            if (!id) {
                throw new JsMindError('Invalid node id');
            }
            if (!content) {
                throw new JsMindError('Content is required');
            }
            this.id = id;
            this.content = content;
            this.parent = null;
            this.children = [];
            this.folded = false;
            this.direction = null;
            this.data = {};
        }
        /**
         * Lists all subnode IDs recursively.
         *
         * @returns Array of all subnode IDs including this node's children and their descendants.
         */
        getAllSubnodeIds() {
            const nodeIds = [];
            if (this.children.length > 0) {
                this.children.forEach((node) => {
                    nodeIds.push(node.id);
                    nodeIds.push(...node.getAllSubnodeIds());
                });
            }
            return nodeIds;
        }
        /**
         * Compares this node with another node.
         *
         * @param other - The other node to compare with.
         * @returns True if they are equal, false otherwise.
         */
        equals(other) {
            return this.id === other.id
                && this.content.type === other.content.type
                && this.content.value === other.content.value
                && this.folded === other.folded
                && this.direction === other.direction
                && ((this.parent === null && other.parent === null) || (this.parent.id === other.parent.id))
                && this.children.length === other.children.length
                && this.children.every((child, idx, _) => { return child.id === other.children[idx].id; });
        }
        /**
         * Checks if this node is a descendant of another node.
         *
         * @param potentialAncestor - The potential ancestor node.
         * @returns True if this node is a descendant of potentialAncestor.
         */
        isDescendant(potentialAncestor) {
            if (!potentialAncestor || !potentialAncestor.children) {
                return false;
            }
            for (const child of potentialAncestor.children) {
                if (child.id === this.id) {
                    return true;
                }
                if (this.isDescendant(child)) {
                    return true;
                }
            }
            return false;
        }
    }

    /**
     * Content types and utilities for JsMind nodes.
     *
     * @packageDocumentation
     */
    /**
     * Enumeration for content types of node.
     *
     * @public
     */
    const JmNodeContentType = {
        /** Text content type. */
        Text: 'text',
    };
    /**
     * Content of mind map node.
     *
     * @public
     */
    class JmNodeContent {
        /**
         * Creates a content object.
         *
         * @param type - The type of content.
         * @param value - The actual content value.
         * @throws {@link Error} If the content type is invalid.
         */
        constructor(type, value) {
            if (!type || !Object.values(JmNodeContentType).includes(type)) {
                throw new Error(`Invalid content type: ${type}`);
            }
            this.type = type;
            this.value = value;
        }
        /**
         * Checks if content is of specific type.
         *
         * @param type - The type to check.
         * @returns True if content is of the specified type.
         */
        hasType(type) {
            return this.type === type;
        }
        /**
         * Checks if content is text type.
         *
         * @returns True if content is text type.
         */
        isText() {
            return this.hasType(JmNodeContentType.Text);
        }
        /**
         * Creates a text content object.
         *
         * @param text - The text content.
         * @returns The content object.
         */
        static createText(text) {
            return new JmNodeContent(JmNodeContentType.Text, text);
        }
    }

    const DEFAULT_METADATA = {
        author: 'hizzgdev@163.com',
        name: 'jsMind Mindmap',
        version: '1.0'
    };
    const DEFAULT_OPTIONS = {
        mind: {
            rootNodeId: 'root'
        }
    };

    /**
     * Interface for generating unique IDs.
     *
     * @remarks
     * IdGenerator is an interface for generating unique IDs.
     *
     * @example
     * ```typescript
     * class MyIdGenerator extends IdGenerator {
     *    constructor() {
     *       super();
     *      this._seq = 0;
     *   }
     *   newId() {
     *      return 'my' + (this._seq++);
     *  }
     * }
     * ```
     *
     * @public
     */
    class IdGenerator {
        /**
         * Generates a new unique ID.
         *
         * @returns A new unique ID.
         * @throws {@link Error} If not implemented.
         */
        newId() {
            throw new Error('not implemented');
        }
    }
    /**
     * Simple implementation of IdGenerator.
     *
     * @public
     */
    class SimpleIdGenerator extends IdGenerator {
        /**
         * Creates a new SimpleIdGenerator instance.
         *
         * @param prefix - Optional prefix for generated IDs. Defaults to empty string.
         */
        constructor(prefix) {
            super();
            this.seed = new Date().getTime();
            this.seq = 0;
            this.prefix = prefix || '';
        }
        /**
         * Generates a new unique ID.
         *
         * @returns A new unique ID with the format: prefix + (seed + seq).toString(36)
         */
        newId() {
            this.seq++;
            return this.prefix + (this.seed + this.seq).toString(36);
        }
    }
    /**
     * Global ID generator instance.
     *
     * @public
     */
    new SimpleIdGenerator('jm-');

    /**
     * Event data containing the state change in JmMind.
     *
     * @public
     */
    class JmMindEvent {
        /**
         * Creates a new JmMindEvent instance.
         *
         * @param type - The type of the event.
         * @param data - The event data.
         */
        constructor(type, data) {
            this.type = type;
            this.data = data;
        }
    }
    /**
     * Enumeration of mind map event types.
     *
     * @public
     */
    const JmMindEventType = {
        /** Event fired when a node is added. */
        NodeAdded: 1,
        /** Event fired when a node is removed. */
        NodeRemoved: 2,
        /** Event fired when a node is updated. */
        NodeUpdated: 3,
        /** Event fired when a node is moved. */
        NodeMoved: 4,
        /** Event fired when an edge is added. */
        EdgeAdded: 5,
        /** Event fired when an edge is removed. */
        EdgeRemoved: 6,
    };

    /**
     * Represents a mind map with nodes and edges.
     *
     * @public
     */
    class JmMind {
        /**
         * Creates a new mind map.
         *
         * @param metadata - Metadata for the mind map.
         * @param options - Configuration options for the mind map.
         */
        constructor(metadata = {}, options = {}) {
            this.meta = this._merge(DEFAULT_METADATA, metadata);
            this.options = this._merge(DEFAULT_OPTIONS.mind, options);
            this.observerManager = new JmObserverManager(this);
            this.nodeManager = new JmNodeManager(this);
            this._idGenerator = new SimpleIdGenerator('jm-');
            this._nodes = {};
            this._edges = {};
            this._root = this._createRootNode();
        }
        /**
         * Gets the root node.
         *
         * @returns The root node.
         */
        get root() {
            return this.nodeManager.manage(this._root);
        }
        /**
         * Adds an edge between two nodes.
         *
         * @param sourceNodeId - The source node ID.
         * @param targetNodeId - The target node ID.
         * @param type - The edge type.
         * @param options - Optional edge creation options.
         * @returns The created edge.
         * @throws {@link JsMindError} If the source or target node does not exist.
         */
        addEdge(sourceNodeId, targetNodeId, type, options) {
            // Validate nodes exist
            this._getNodeById(sourceNodeId);
            this._getNodeById(targetNodeId);
            const edgeId = (options && options.edgeId) || this._idGenerator.newId();
            const label = (options && options.label) || null;
            const edge = new JmEdge(edgeId, sourceNodeId, targetNodeId, type, label);
            this._edges[edgeId] = edge;
            // Emit event
            this.observerManager.notifyObservers(new JmMindEvent(JmMindEventType.EdgeAdded, {
                'edge': edge
            }));
            return edge;
        }
        /**
         * Adds a new node to the mind map at a specific destination.
         *
         * @param content - Content for the new node.
         * @param destOptions - Destination options (required).
         * @param nodeOptions - Optional node creation options.
         * @returns The created node.
         * @throws {@link JsMindError} If destOptions.parentId is missing.
         */
        addNode(content, destOptions, nodeOptions) {
            // Validate destination options
            if (!destOptions || !destOptions.parentId) {
                throw new JsMindError('destOptions.parentId is required for addNode');
            }
            // Get target parent
            const targetParent = this._getNodeById(destOptions.parentId);
            // Create and initialize the node
            const node = this._newNode(content, nodeOptions);
            // Use existing helper method for placement
            this._addNodeToParent(node, targetParent, destOptions.position);
            // Apply destination direction if specified
            if (destOptions.direction !== undefined && destOptions.direction !== null) {
                node.direction = destOptions.direction;
            }
            // Emit event
            this.observerManager.notifyObservers(new JmMindEvent(JmMindEventType.NodeAdded, {
                'node': node
            }));
            return this.nodeManager.manage(node);
        }
        /**
         * Finds a node from the mind map by the given ID.
         *
         * @param nodeId - The given node ID.
         * @returns The corresponding node in this mind map if it exists, otherwise null.
         */
        findNodeById(nodeId) {
            const node = this._nodes[nodeId];
            return !!node ? this.nodeManager.manage(node) : null;
        }
        /**
         * Gets all edges for a specific node.
         *
         * @param nodeId - The node ID.
         * @param type - Optional edge type filter.
         * @returns Array of edges involving the node.
         */
        getEdges(nodeId, type = null) {
            return Object.values(this._edges).filter(edge => {
                return (edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId) &&
                    (!type || edge.type === type);
            });
        }
        /**
         * Moves a node to a new parent and position.
         *
         * @param nodeId - The ID of the node to move.
         * @param destOptions - Destination options.
         * @returns The moved node.
         * @throws {@link JsMindError} If destOptions are missing, node not found, or invalid move operation.
         */
        moveNode(nodeId, destOptions) {
            if (!destOptions || Object.keys(destOptions).length === 0) {
                throw new JsMindError('destOptions are required for moveNode operation');
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
            const targetParentId = destOptions.parentId;
            const targetPosition = destOptions.position;
            const targetDirection = destOptions.direction;
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
         * Removes an edge by ID.
         *
         * @param edgeId - The edge ID to remove.
         * @returns True if the edge was removed, false if not found.
         */
        removeEdge(edgeId) {
            const edge = this._edges[edgeId];
            if (edge) {
                delete this._edges[edgeId];
                // Emit event
                this.observerManager.notifyObservers(new JmMindEvent(JmMindEventType.EdgeRemoved, {
                    'edge': edge
                }));
                return true;
            }
            return false;
        }
        /**
         * Removes a node and all its descendants.
         *
         * @param nodeId - The ID of the node to remove.
         * @throws {@link JsMindError} If trying to remove the root node.
         */
        removeNode(nodeId) {
            const node = this._getNodeById(nodeId);
            if (nodeId == this._root.id) {
                throw new JsMindError('root node can not be removed');
            }
            // remove node from parent's children
            const nodeIndex = node.parent.children.indexOf(node);
            node.parent.children.splice(nodeIndex, 1);
            // identify all nodes that need to be cleared
            const nodeIds = node.getAllSubnodeIds();
            nodeIds.push(node.id);
            // remove those nodes
            nodeIds.forEach((id) => delete this._nodes[id]);
            // remove all relevant edges
            const edgeIds = Object.values(this._edges)
                .filter((e) => nodeIds.includes(e.sourceNodeId) || nodeIds.includes(e.targetNodeId))
                .map((e) => e.id);
            edgeIds.forEach((id) => delete this._edges[id]);
            // emit event
            this.observerManager.notifyObservers(new JmMindEvent(JmMindEventType.NodeRemoved, {
                'node': node,
                'removedNodeIds': nodeIds,
                'removedEdgeIds': edgeIds
            }));
        }
        /**
         * Adds a node to a new parent at a specific position.
         *
         * @private
         * @param node - The node to add.
         * @param targetParent - The new parent node.
         * @param targetPosition - The position index among siblings.
         */
        _addNodeToParent(node, targetParent, targetPosition) {
            node.parent = targetParent;
            if (targetPosition === undefined || targetPosition === null) {
                // Add to the end if no position specified
                targetParent.children.push(node);
            }
            else {
                // Insert at specific position
                const position = Math.max(0, Math.min(targetPosition, targetParent.children.length));
                targetParent.children.splice(position, 0, node);
            }
        }
        /**
         * Creates the root node.
         *
         * @private
         * @returns The created root node.
         */
        _createRootNode() {
            const nodeOptions = {
                nodeId: this.options.rootNodeId
            };
            return this._newNode(JmNodeContent.createText(this.meta.name), nodeOptions);
        }
        /**
         * Emits NodeMoved event only if something actually changed.
         *
         * @private
         * @param node - The node that was moved.
         * @param oldParent - The old parent node.
         * @param oldPosition - The old position index.
         * @param oldDirection - The old direction.
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
                this.observerManager.notifyObservers(new JmMindEvent(JmMindEventType.NodeMoved, eventData));
            }
        }
        /**
         * Merges user values with default values.
         *
         * @private
         * @param defaultValues - Default values.
         * @param userValues - User-provided values.
         * @returns Merged values.
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
         * Creates a new node and adds it to the mind map.
         *
         * @private
         * @param content - Content for the node.
         * @param nodeOptions - Optional node creation options.
         * @returns The created node.
         */
        _newNode(content, nodeOptions) {
            const nodeId = (nodeOptions && nodeOptions.nodeId) || this._idGenerator.newId();
            const node = new JmNode(nodeId, content);
            if (nodeOptions) {
                if (nodeOptions.folded !== undefined) {
                    node.folded = nodeOptions.folded;
                }
                if (nodeOptions.direction !== undefined) {
                    node.direction = nodeOptions.direction;
                }
                if (nodeOptions.data !== undefined) {
                    node.data = nodeOptions.data;
                }
            }
            this._nodes[nodeId] = node;
            return node;
        }
        /**
         * Handles node update events.
         *
         * @private
         * @param node - The node that was updated.
         * @param prop - The property that was updated.
         * @param originValue - The original value.
         * @param newValue - The new value.
         */
        _onNodeUpdated(node, prop, originValue, newValue) {
            this.observerManager.notifyObservers(new JmMindEvent(JmMindEventType.NodeUpdated, {
                'node': node,
                'property': prop,
                'originValue': originValue,
                'newValue': newValue
            }));
        }
        /**
         * Removes a node from its current parent.
         *
         * @private
         * @param node - The node to remove from parent.
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
         * Repositions a node within the same parent (optimized operation).
         *
         * @private
         * @param node - The node to reposition.
         * @param targetPosition - The new position index among siblings.
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
         * Retrieves a node by node ID.
         *
         * @private
         * @param nodeId - The node ID.
         * @returns The corresponding node.
         * @throws {@link JsMindError} If the node doesn't exist.
         */
        _getNodeById(nodeId) {
            const node = this._nodes[nodeId];
            if (!!node) {
                return node;
            }
            throw new JsMindError(`node[id=${nodeId}] does not exist`);
        }
    }
    /**
     * Manager for node operations with proxy-based access control.
     *
     * @internal
     */
    class JmNodeManager {
        /**
         * Creates a new JmNodeManager instance.
         *
         * @param mind - The mind map instance.
         */
        constructor(mind) {
            this.mind = mind;
            this.readonlyFields = new Set(['id', 'parent', 'children', 'data']);
            this.unsafeArrayMethods = new Set(['fill', 'pop', 'push', 'shift', 'unshift', 'reverse', 'sort', 'splice']);
        }
        /**
         * Manages a node with proxy-based access control.
         *
         * @param node - The node to manage.
         * @returns The managed node with proxy.
         */
        manage(node) {
            return new Proxy(node, {
                get: this.getterTrap.bind(this),
                set: this.setterTrap.bind(this)
            });
        }
        /**
         * Getter trap for the proxy.
         *
         * @param node - The node.
         * @param prop - The property name.
         * @returns The property value.
         */
        getterTrap(node, prop) {
            const ori = node[prop];
            if (prop === 'children') {
                const itemManagedArray = ori.map((n) => this.manage(n));
                const manager = this;
                return new Proxy(itemManagedArray, {
                    get: function (arr, prop) {
                        if (manager.unsafeArrayMethods.has(prop)) {
                            return function () {
                                throw new JsMindError(`unsupported method ${String(prop)} on node.children, please follow the document to operate the mindmap.`);
                            };
                        }
                        return arr[prop];
                    }
                });
            }
            if (prop === 'parent') {
                return !!ori ? this.manage(ori) : null;
            }
            return ori;
        }
        /**
         * Setter trap for the proxy.
         *
         * @param node - The node.
         * @param prop - The property name.
         * @param value - The new value.
         * @returns True if the operation succeeded.
         * @throws {@link JsMindError} If trying to set a readonly property.
         */
        setterTrap(node, prop, value) {
            if (this.readonlyFields.has(prop)) {
                throw new JsMindError(`the property[${String(prop)}] is readonly`);
            }
            const ori = node[prop];
            if (ori !== value) {
                node[prop] = value;
                this.mind._onNodeUpdated(node, prop, ori, value);
            }
            return true;
        }
    }

    /**
     * Base interfaces for JsMind serialization.
     *
     * @packageDocumentation
     */
    /**
     * Base interface for all mind map serializers.
     *
     * @public
     */
    class JmMindSerializer {
        /**
         * Serializes a mind map to the specific format.
         *
         * @param mind - The mind map to serialize.
         * @returns The serialized data in the specific format.
         * @throws {@link Error} If not implemented.
         */
        serialize(mind) {
            throw new Error('serialize method must be implemented', { cause: mind });
        }
        /**
         * Deserializes data to a mind map.
         *
         * @param data - The data to deserialize.
         * @returns The deserialized mind map.
         * @throws {@link Error} If not implemented.
         */
        deserialize(data) {
            throw new Error('deserialize method must be implemented', { cause: data });
        }
        /**
         * Gets the format name this serializer supports.
         *
         * @returns The format name.
         * @throws {@link Error} If not implemented.
         */
        getFormatName() {
            throw new Error('getFormatName method must be implemented');
        }
        /**
         * Validates if the data can be deserialized by this serializer.
         *
         * @param data - The data to validate.
         * @returns True if the data is valid for this format.
         * @throws {@link Error} If not implemented.
         */
        validate(data) {
            throw new Error('validate method must be implemented', { cause: data });
        }
    }

    /**
     * JSON serializer for JsMind mind maps.
     *
     * @packageDocumentation
     */
    /**
     * JSON serializer for mind maps.
     *
     * @public
     */
    class JmMindJsonSerializer extends JmMindSerializer {
        /**
         * Gets the format name this serializer supports.
         *
         * @returns The format name.
         */
        getFormatName() {
            return 'json';
        }
        /**
         * Serializes a mind map to JSON format.
         *
         * @param mind - The mind map to serialize.
         * @returns The serialized JSON data.
         * @throws {@link JsMindError} If the mind map is not provided.
         */
        serialize(mind) {
            if (!mind) {
                throw new JsMindError('Mind map is required for serialization');
            }
            const serializedData = {
                meta: mind.meta,
                root: this._serializeNode(mind._root),
                nodes: {},
                edges: {}
            };
            // Serialize all nodes
            Object.values(mind._nodes).forEach(node => {
                serializedData.nodes[node.id] = this._serializeNode(node);
            });
            // Serialize all additional edges
            Object.values(mind._edges).forEach(edge => {
                serializedData.edges[edge.id] = this._serializeEdge(edge);
            });
            return serializedData;
        }
        /**
         * Deserializes JSON data to a mind map.
         *
         * @param data - The JSON data to deserialize.
         * @returns The deserialized mind map.
         * @throws {@link JsMindError} If the JSON data format is invalid.
         */
        deserialize(data) {
            if (!this.validate(data)) {
                throw new JsMindError('Invalid JSON data format');
            }
            // Create mind map with metadata and options
            const mind = new JmMind(data.meta, { rootNodeId: data.root.id });
            // Restore nodes
            Object.values(data.nodes).forEach((nodeData) => {
                const node = this._deserializeNode(nodeData);
                mind._nodes[node.id] = node;
            });
            // Restore additional edges
            if (data.edges) {
                Object.values(data.edges).forEach((edgeData) => {
                    const edge = this._deserializeEdge(edgeData);
                    mind._edges[edge.id] = edge;
                });
            }
            // Restore root
            mind._root = mind._nodes[data.root.id];
            // Restore parent-child relationships
            this._restoreNodeRelationships(mind);
            return mind;
        }
        /**
         * Validates if the data can be deserialized by this serializer.
         *
         * @param data - The data to validate.
         * @returns True if the data is valid for this format.
         */
        validate(data) {
            if (!data || typeof data !== 'object') {
                return false;
            }
            const d = data;
            if (!d.meta || !d.root || !d.nodes || !d.edges) {
                return false;
            }
            const root = d.root;
            const nodes = d.nodes;
            if (!root.id || typeof root.id !== 'string' || !nodes[root.id]) {
                return false;
            }
            return true;
        }
        /**
         * Serializes a single node.
         *
         * @private
         * @param node - The node to serialize.
         * @returns The serialized node data.
         */
        _serializeNode(node) {
            return {
                id: node.id,
                content: {
                    type: node.content.type,
                    value: node.content.value
                },
                parent: node.parent ? node.parent.id : null,
                children: node.children.map(child => child.id),
                folded: node.folded,
                direction: node.direction,
                data: { ...node.data }
            };
        }
        /**
         * Deserializes a single node.
         *
         * @private
         * @param nodeData - The node data to deserialize.
         * @returns The deserialized node.
         */
        _deserializeNode(nodeData) {
            const content = new JmNodeContent(nodeData.content.type, nodeData.content.value);
            const node = new JmNode(nodeData.id, content);
            node.folded = nodeData.folded;
            node.direction = nodeData.direction;
            node.data = { ...nodeData.data };
            return node;
        }
        /**
         * Serializes a single edge.
         *
         * @private
         * @param edge - The edge to serialize.
         * @returns The serialized edge data.
         */
        _serializeEdge(edge) {
            return {
                id: edge.id,
                sourceNodeId: edge.sourceNodeId,
                targetNodeId: edge.targetNodeId,
                type: edge.type,
                label: edge.label
            };
        }
        /**
         * Deserializes a single edge.
         *
         * @private
         * @param edgeData - The edge data to deserialize.
         * @returns The deserialized edge.
         */
        _deserializeEdge(edgeData) {
            return new JmEdge(edgeData.id, edgeData.sourceNodeId, edgeData.targetNodeId, edgeData.type, edgeData.label);
        }
        /**
         * Restores parent-child relationships between nodes.
         *
         * @remarks
         * This method is no longer needed since parent-child relationships
         * are now stored directly in the nodes and serialized/deserialized
         * as part of the node data itself.
         *
         * @private
         * @param _mind - The mind map to restore relationships for.
         */
        _restoreNodeRelationships(_mind) {
            // This method is no longer needed since parent-child relationships
            // are now stored directly in the nodes and serialized/deserialized
            // as part of the node data itself
        }
    }

    /**
     * Main class for jsMind mind map operations.
     *
     * @public
     */
    class JsMind {
        /**
         * Gets the version of jsMind.
         *
         * @returns The version string.
         */
        static get Version() { return '2.0'; }
        /**
         * Gets the author of jsMind.
         *
         * @returns The author string.
         */
        static get Author() { return 'hizzgdev@163.com'; }
        /**
         * Creates a new jsMind instance.
         *
         * @param options - Configuration options for the jsMind instance.
         */
        constructor(options) {
            this.options = options;
            this.mind = null;
            this.serializer = new JmMindJsonSerializer();
        }
        /**
         * Opens a mind map.
         *
         * @param mind - The mind map instance to open.
         * @returns The opened mind map instance.
         */
        open(mind) {
            this.mind = mind;
            return mind;
        }
        /**
         * Closes the current mind map (cleanup method).
         *
         * @remarks
         * This method can be extended in the future for cleanup operations
         * like removing observers, clearing caches, etc.
         */
        close() {
            // Empty for now - can be extended in the future
            // for cleanup operations like removing observers, clearing caches, etc.
            this.mind = null;
        }
        /**
         * Serializes the current mind map to JSON.
         *
         * @returns JSON string representation of the mind map.
         * @throws {@link Error} If no mind map is open or serialization fails.
         */
        serialize() {
            if (!this.mind) {
                throw new Error('No mind map is currently open');
            }
            const data = this.serializer.serialize(this.mind);
            return JSON.stringify(data);
        }
    }
    /**
     * Exported classes for browser use.
     */
    JsMind.Mind = JmMind;
    JsMind.NodeContent = JmNodeContent;

    return JsMind;

}));
//# sourceMappingURL=jsmind.js.map
