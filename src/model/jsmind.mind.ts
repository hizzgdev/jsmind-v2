import { JmObserverManager } from '../event/jsmind.observer.manager.ts';
import { JmEdge } from './jsmind.edge.ts';
import { JmNode, type NodeCreationOptions, type NodeDestinationOptions } from './jsmind.node.ts';
import { JmNodeContent } from './jsmind.node.content.ts';
import { type MindMetadata, type MindOptions, DEFAULT_METADATA, DEFAULT_OPTIONS } from '../jsmind.const.ts';
import { SimpleIdGenerator } from '../generation/jsmind.id_generator.ts';

import { JmMindEvent, JmMindEventType } from '../event/jsmind.mind.event.ts';
import { JsMindError } from '../jsmind.error.ts';

/**
 * Represents a mind map with nodes and edges.
 *
 * @public
 */
export class JmMind {
    /** Metadata for the mind map. */
    meta: MindMetadata;
    /** Configuration options for the mind map. */
    options: MindOptions;
    /** Manager for observers of this mind map. */
    observerManager: JmObserverManager;
    /** Manager for node operations. */
    nodeManager: JmNodeManager;
    /** @internal Internal ID generator for nodes and edges. */
    _idGenerator: SimpleIdGenerator;
    /** @internal Dictionary of all nodes by ID. */
    _nodes: { [key: string]: JmNode };
    /** @internal Dictionary of all edges by ID. */
    _edges: { [key: string]: JmEdge };
    /** @internal The root node of the mind map. */
    _root: JmNode;

    /**
     * Creates a new mind map.
     *
     * @param metadata - Metadata for the mind map.
     * @param options - Configuration options for the mind map.
     */
    constructor(metadata: any = {}, options: any = {}) {
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
    get root(): JmNode {
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
    addEdge(sourceNodeId: string, targetNodeId: string, type: any, options?: any): JmEdge {
        // Validate nodes exist
        this._getNodeById(sourceNodeId);
        this._getNodeById(targetNodeId);

        const edgeId = (options && options.edgeId) || this._idGenerator.newId();
        const label = (options && options.label) || null;
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
     * Adds a new node to the mind map at a specific destination.
     *
     * @param content - Content for the new node.
     * @param destOptions - Destination options (required).
     * @param nodeOptions - Optional node creation options.
     * @returns The created node.
     * @throws {@link JsMindError} If destOptions.parentId is missing.
     */
    addNode(content: JmNodeContent, destOptions: NodeDestinationOptions, nodeOptions?: NodeCreationOptions): JmNode {
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
        this.observerManager.notifyObservers(new JmMindEvent(
            JmMindEventType.NodeAdded,
            {
                'node': node
            })
        );

        return this.nodeManager.manage(node);
    }

    /**
     * Finds a node from the mind map by the given ID.
     *
     * @param nodeId - The given node ID.
     * @returns The corresponding node in this mind map if it exists, otherwise null.
     */
    findNodeById(nodeId: string): JmNode | null {
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
    getEdges(nodeId: string, type: any = null): JmEdge[] {
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
    moveNode(nodeId: string, destOptions: NodeDestinationOptions): JmNode {
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
    removeEdge(edgeId: string): boolean {
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
     * Removes a node and all its descendants.
     *
     * @param nodeId - The ID of the node to remove.
     * @throws {@link JsMindError} If trying to remove the root node.
     */
    removeNode(nodeId: string): void {
        const node = this._getNodeById(nodeId);
        if(nodeId == this._root.id) {
            throw new JsMindError('root node can not be removed');
        }

        // remove node from parent's children
        const nodeIndex = node.parent!.children.indexOf(node);
        node.parent!.children.splice(nodeIndex, 1);

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
     * Adds a node to a new parent at a specific position.
     *
     * @private
     * @param node - The node to add.
     * @param targetParent - The new parent node.
     * @param targetPosition - The position index among siblings.
     */
    _addNodeToParent(node: JmNode, targetParent: JmNode, targetPosition?: number | null): void {
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
     * Creates the root node.
     *
     * @private
     * @returns The created root node.
     */
    _createRootNode(): JmNode {
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
    _emitNodeMovedEventIfChanged(node: JmNode, oldParent: JmNode | null, oldPosition: number, oldDirection: any): void {
        // Compare actual updated node properties with old values
        const parentChanged = oldParent!.id !== node.parent!.id;
        const positionChanged = oldPosition !== node.parent!.children.indexOf(node);
        const directionChanged = oldDirection !== node.direction;

        if (parentChanged || positionChanged || directionChanged) {
            const eventData: any = {
                'node': node
            };

            // Only include changed properties in event data
            if (parentChanged) {
                eventData.oldParentId = oldParent!.id;
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
     * Merges user values with default values.
     *
     * @private
     * @param defaultValues - Default values.
     * @param userValues - User-provided values.
     * @returns Merged values.
     */
    _merge(defaultValues: any, userValues?: any): any {
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
    _newNode(content: JmNodeContent, nodeOptions?: NodeCreationOptions): JmNode {
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
    _onNodeUpdated(node: JmNode, prop: string, originValue: any, newValue: any): void {
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
     * Removes a node from its current parent.
     *
     * @private
     * @param node - The node to remove from parent.
     */
    _removeNodeFromParent(node: JmNode): void {
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
    _repositionNode(node: JmNode, targetPosition: number): void {
        if (targetPosition === undefined || targetPosition === null) {
            return;
        }

        const parent = node.parent!;
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
    _getNodeById(nodeId: string): JmNode {
        const node = this._nodes[nodeId];
        if(!!node) {
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
    /** The mind map instance. */
    mind: JmMind;
    /** Set of readonly field names. */
    readonlyFields: Set<string>;
    /** Set of unsafe array method names. */
    unsafeArrayMethods: Set<string>;

    /**
     * Creates a new JmNodeManager instance.
     *
     * @param mind - The mind map instance.
     */
    constructor(mind: JmMind) {
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
    manage(node: JmNode): JmNode {
        return new Proxy(node, {
            get: this.getterTrap.bind(this),
            set: this.setterTrap.bind(this)
        }) as JmNode;
    }

    /**
     * Getter trap for the proxy.
     *
     * @param node - The node.
     * @param prop - The property name.
     * @returns The property value.
     */
    getterTrap(node: JmNode, prop: string | symbol): any {
        const ori = (node as any)[prop];
        if(prop === 'children') {
            const itemManagedArray = ori.map((n: JmNode)=>this.manage(n));
            return new Proxy(itemManagedArray, {
                get: function (arr: any, prop: string | symbol) {
                    if(this.unsafeArrayMethods.has(prop as string)) {
                        return function() {
                            throw new JsMindError(`unsupported method ${String(prop)} on node.children, please follow the document to operate the mindmap.`);
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

    /**
     * Setter trap for the proxy.
     *
     * @param node - The node.
     * @param prop - The property name.
     * @param value - The new value.
     * @returns True if the operation succeeded.
     * @throws {@link JsMindError} If trying to set a readonly property.
     */
    setterTrap(node: JmNode, prop: string | symbol, value: any): boolean {
        if(this.readonlyFields.has(prop as string)) {
            throw new JsMindError(`the property[${String(prop)}] is readonly`);
        }
        const ori = (node as any)[prop];
        if(ori !== value) {
            (node as any)[prop] = value;
            this.mind._onNodeUpdated(node, prop as string, ori, value);
        }
        return true;
    }

}

