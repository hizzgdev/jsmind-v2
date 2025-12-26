/**
 * @license BSD-3-Clause
 * @copyright 2014-2025 hizzgdev@163.com
 *
 * Project Home:
 *   https://github.com/hizzgdev/jsmind/
 */
/**
 * Interface for objects that can be observed.
 *
 * @public
 */
interface Observable {
    update(observedObject: unknown, event: unknown): void;
}
/**
 * Manager for observers of an observed object.
 *
 * @public
 */
declare class JmObserverManager {
    /** The object being observed. */
    observedObject: unknown;
    /** @internal */
    _observers: Observable[];
    /**
     * Creates an observer manager for an observed object.
     *
     * @param observedObject - The object to observe.
     */
    constructor(observedObject: unknown);
    /**
     * Adds an observer to the observed object.
     *
     * @param observer - An object that contains an `update(observedObject, event)` method.
     * @throws {@link JsMindError} If the observer is not a valid object.
     */
    addObserver(observer: Observable): void;
    /**
     * Removes an observer that was previously added by the `addObserver` method.
     *
     * @param observer - The observer to remove.
     */
    removeObserver(observer: Observable): void;
    /**
     * Removes all observers from the object.
     */
    clearObservers(): void;
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
    notifyObservers(event: unknown): Promise<void>;
}

/**
 * Options for creating a new edge.
 *
 * @public
 */
interface EdgeCreationOptions {
    /** Optional edge ID, will be generated if not provided. */
    edgeId?: string;
    /** Optional label for the edge. */
    label?: string;
}
/**
 * Edge of mind map.
 *
 * @remarks
 * Edges represent additional relationships between nodes (not parent-child relationships).
 *
 * @public
 */
declare class JmEdge {
    /** The unique identifier of the edge. */
    id: string;
    /** The ID of the source node. */
    sourceNodeId: string;
    /** The ID of the target node. */
    targetNodeId: string;
    /** The type of the edge. */
    type: JmEdgeType;
    /** The optional label of the edge. */
    label: string | null;
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
    constructor(id: string, sourceNodeId: string, targetNodeId: string, type: JmEdgeType, label?: string | null);
}
/**
 * Type of edge - only for additional relationships (not parent-child).
 *
 * @public
 */
declare const JmEdgeType: {
    /** Link edge type. */
    readonly Link: "link";
};
type JmEdgeType = typeof JmEdgeType[keyof typeof JmEdgeType];

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
declare const JmNodeContentType: {
    /** Text content type. */
    readonly Text: "text";
};
type JmNodeContentType = typeof JmNodeContentType[keyof typeof JmNodeContentType];
/**
 * Content of mind map node.
 *
 * @public
 */
declare class JmNodeContent {
    /** The type of the content. */
    type: JmNodeContentType;
    /** The actual content value. */
    value: any;
    /**
     * Creates a content object.
     *
     * @param type - The type of content.
     * @param value - The actual content value.
     * @throws {@link Error} If the content type is invalid.
     */
    constructor(type: JmNodeContentType, value: any);
    /**
     * Checks if content is of specific type.
     *
     * @param type - The type to check.
     * @returns True if content is of the specified type.
     */
    hasType(type: JmNodeContentType): boolean;
    /**
     * Checks if content is text type.
     *
     * @returns True if content is text type.
     */
    isText(): boolean;
    /**
     * Creates a text content object.
     *
     * @param text - The text content.
     * @returns The content object.
     */
    static createText(text: string): JmNodeContent;
}

/**
 * Options for creating a new node.
 *
 * @public
 */
interface NodeCreationOptions {
    /** Optional custom node ID. */
    nodeId?: string;
    /** Whether the node is folded (default: false). */
    folded?: boolean;
    /** Direction of the node (default: null). */
    direction?: JmNodeDirection | null;
    /** Additional data for the node (default: {}). */
    data?: any;
}
/**
 * Options for specifying node destination.
 *
 * @public
 */
interface NodeDestinationOptions {
    /** The ID of the target parent node (required). */
    parentId: string;
    /** The position index among siblings (if not provided, adds to end). */
    position?: number;
    /** The direction of the node (if not provided, keeps current direction). */
    direction?: JmNodeDirection | null;
}
/**
 * Node of mind map.
 *
 * @public
 */
declare class JmNode {
    /** The unique identifier of the node. */
    id: string;
    /** The content of the node. */
    content: JmNodeContent;
    /** The parent node, or null if this is the root node. */
    parent: JmNode | null;
    /** Array of child nodes. */
    children: JmNode[];
    /** Whether the node is folded (collapsed). */
    folded: boolean;
    /** The direction of the node. */
    direction: JmNodeDirection | null;
    /** Additional data associated with the node. */
    data: any;
    /**
     * Creates a new node.
     *
     * @param id - The unique identifier of the node.
     * @param content - The content of the node.
     * @throws {@link JsMindError} If the node ID or content is invalid.
     */
    constructor(id: string, content: JmNodeContent);
    /**
     * Lists all subnode IDs recursively.
     *
     * @returns Array of all subnode IDs including this node's children and their descendants.
     */
    getAllSubnodeIds(): string[];
    /**
     * Compares this node with another node.
     *
     * @param other - The other node to compare with.
     * @returns True if they are equal, false otherwise.
     */
    equals(other: JmNode): boolean;
    /**
     * Checks if this node is a descendant of another node.
     *
     * @param potentialAncestor - The potential ancestor node.
     * @returns True if this node is a descendant of potentialAncestor.
     */
    isDescendant(potentialAncestor: JmNode): boolean;
}
/**
 * Enumeration for directions of node.
 *
 * @public
 */
declare const JmNodeDirection: {
    /** Left direction. */
    readonly Left: -1;
    /** Center direction. */
    readonly Center: 0;
    /** Right direction. */
    readonly Right: 1;
};
type JmNodeDirection = typeof JmNodeDirection[keyof typeof JmNodeDirection];

/**
 * Metadata for the mind map.
 *
 * @public
 */
interface MindMetadata {
    /** The author of the mind map. */
    author: string;
    /** The name of the mind map. */
    name: string;
    /** The version of the mind map. */
    version: string;
}
/**
 * Configuration options for the mind map.
 *
 * @public
 */
interface MindOptions {
    /** The ID for the root node. */
    rootNodeId: string;
}

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
declare class IdGenerator {
    /**
     * Generates a new unique ID.
     *
     * @returns A new unique ID.
     * @throws {@link Error} If not implemented.
     */
    newId(): string;
}
/**
 * Simple implementation of IdGenerator.
 *
 * @public
 */
declare class SimpleIdGenerator extends IdGenerator {
    /** The seed value for ID generation. */
    seed: number;
    /** The sequence counter. */
    seq: number;
    /** The prefix for generated IDs. */
    prefix: string;
    /**
     * Creates a new SimpleIdGenerator instance.
     *
     * @param prefix - Optional prefix for generated IDs. Defaults to empty string.
     */
    constructor(prefix?: string);
    /**
     * Generates a new unique ID.
     *
     * @returns A new unique ID with the format: prefix + (seed + seq).toString(36)
     */
    newId(): string;
}

/**
 * Represents a mind map with nodes and edges.
 *
 * @public
 */
declare class JmMind {
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
    _nodes: {
        [key: string]: JmNode;
    };
    /** @internal Dictionary of all edges by ID. */
    _edges: {
        [key: string]: JmEdge;
    };
    /** @internal The root node of the mind map. */
    _root: JmNode;
    /**
     * Creates a new mind map.
     *
     * @param metadata - Metadata for the mind map.
     * @param options - Configuration options for the mind map.
     */
    constructor(metadata?: Partial<MindMetadata>, options?: Partial<MindOptions>);
    /**
     * Gets the root node.
     *
     * @returns The root node.
     */
    get root(): JmNode;
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
    addEdge(sourceNodeId: string, targetNodeId: string, type: JmEdgeType, options?: EdgeCreationOptions): JmEdge;
    /**
     * Adds a new node to the mind map at a specific destination.
     *
     * @param content - Content for the new node.
     * @param destOptions - Destination options (required).
     * @param nodeOptions - Optional node creation options.
     * @returns The created node.
     * @throws {@link JsMindError} If destOptions.parentId is missing.
     */
    addNode(content: JmNodeContent, destOptions: NodeDestinationOptions, nodeOptions?: NodeCreationOptions): JmNode;
    /**
     * Finds a node from the mind map by the given ID.
     *
     * @param nodeId - The given node ID.
     * @returns The corresponding node in this mind map if it exists, otherwise null.
     */
    findNodeById(nodeId: string): JmNode | null;
    /**
     * Gets all edges for a specific node.
     *
     * @param nodeId - The node ID.
     * @param type - Optional edge type filter.
     * @returns Array of edges involving the node.
     */
    getEdges(nodeId: string, type?: JmEdgeType | null): JmEdge[];
    /**
     * Moves a node to a new parent and position.
     *
     * @param nodeId - The ID of the node to move.
     * @param destOptions - Destination options.
     * @returns The moved node.
     * @throws {@link JsMindError} If destOptions are missing, node not found, or invalid move operation.
     */
    moveNode(nodeId: string, destOptions: NodeDestinationOptions): JmNode;
    /**
     * Removes an edge by ID.
     *
     * @param edgeId - The edge ID to remove.
     * @returns True if the edge was removed, false if not found.
     */
    removeEdge(edgeId: string): boolean;
    /**
     * Removes a node and all its descendants.
     *
     * @param nodeId - The ID of the node to remove.
     * @throws {@link JsMindError} If trying to remove the root node.
     */
    removeNode(nodeId: string): void;
    /**
     * Adds a node to a new parent at a specific position.
     *
     * @private
     * @param node - The node to add.
     * @param targetParent - The new parent node.
     * @param targetPosition - The position index among siblings.
     */
    _addNodeToParent(node: JmNode, targetParent: JmNode, targetPosition?: number | null): void;
    /**
     * Creates the root node.
     *
     * @private
     * @returns The created root node.
     */
    _createRootNode(): JmNode;
    /**
     * Emits NodeMoved event only if something actually changed.
     *
     * @private
     * @param node - The node that was moved.
     * @param oldParent - The old parent node.
     * @param oldPosition - The old position index.
     * @param oldDirection - The old direction.
     */
    _emitNodeMovedEventIfChanged(node: JmNode, oldParent: JmNode | null, oldPosition: number, oldDirection: JmNodeDirection | null): void;
    /**
     * Merges user values with default values.
     *
     * @private
     * @param defaultValues - Default values.
     * @param userValues - User-provided values.
     * @returns Merged values.
     */
    _merge<T>(defaultValues: T, userValues?: Partial<T>): T;
    /**
     * Creates a new node and adds it to the mind map.
     *
     * @private
     * @param content - Content for the node.
     * @param nodeOptions - Optional node creation options.
     * @returns The created node.
     */
    _newNode(content: JmNodeContent, nodeOptions?: NodeCreationOptions): JmNode;
    /**
     * Handles node update events.
     *
     * @private
     * @param node - The node that was updated.
     * @param prop - The property that was updated.
     * @param originValue - The original value.
     * @param newValue - The new value.
     */
    _onNodeUpdated(node: JmNode, prop: string, originValue: any, newValue: any): void;
    /**
     * Removes a node from its current parent.
     *
     * @private
     * @param node - The node to remove from parent.
     */
    _removeNodeFromParent(node: JmNode): void;
    /**
     * Repositions a node within the same parent (optimized operation).
     *
     * @private
     * @param node - The node to reposition.
     * @param targetPosition - The new position index among siblings.
     */
    _repositionNode(node: JmNode, targetPosition: number): void;
    /**
     * Retrieves a node by node ID.
     *
     * @private
     * @param nodeId - The node ID.
     * @returns The corresponding node.
     * @throws {@link JsMindError} If the node doesn't exist.
     */
    _getNodeById(nodeId: string): JmNode;
}
/**
 * Manager for node operations with proxy-based access control.
 *
 * @internal
 */
declare class JmNodeManager {
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
    constructor(mind: JmMind);
    /**
     * Manages a node with proxy-based access control.
     *
     * @param node - The node to manage.
     * @returns The managed node with proxy.
     */
    manage(node: JmNode): JmNode;
    /**
     * Getter trap for the proxy.
     *
     * @param node - The node.
     * @param prop - The property name.
     * @returns The property value.
     */
    getterTrap(node: JmNode, prop: string | symbol): any;
    /**
     * Setter trap for the proxy.
     *
     * @param node - The node.
     * @param prop - The property name.
     * @param value - The new value.
     * @returns True if the operation succeeded.
     * @throws {@link JsMindError} If trying to set a readonly property.
     */
    setterTrap(node: JmNode, prop: string | symbol, value: any): boolean;
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
declare class JmMindSerializer {
    /**
     * Serializes a mind map to the specific format.
     *
     * @param mind - The mind map to serialize.
     * @returns The serialized data in the specific format.
     * @throws {@link Error} If not implemented.
     */
    serialize(mind: JmMind): unknown;
    /**
     * Deserializes data to a mind map.
     *
     * @param data - The data to deserialize.
     * @returns The deserialized mind map.
     * @throws {@link Error} If not implemented.
     */
    deserialize(data: unknown): JmMind;
    /**
     * Gets the format name this serializer supports.
     *
     * @returns The format name.
     * @throws {@link Error} If not implemented.
     */
    getFormatName(): string;
    /**
     * Validates if the data can be deserialized by this serializer.
     *
     * @param data - The data to validate.
     * @returns True if the data is valid for this format.
     * @throws {@link Error} If not implemented.
     */
    validate(data: unknown): boolean;
}

/**
 * JSON serializer for JsMind mind maps.
 *
 * @packageDocumentation
 */

/**
 * Serialized node data structure.
 *
 * @public
 */
interface SerializedNode {
    id: string;
    content: {
        type: JmNodeContentType;
        value: unknown;
    };
    parent: string | null;
    children: string[];
    folded: boolean;
    direction: JmNodeDirection | null;
    data: Record<string, unknown>;
}
/**
 * Serialized edge data structure.
 *
 * @public
 */
interface SerializedEdge {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    type: JmEdgeType;
    label: string | null;
}
/**
 * Serialized mind map data structure.
 *
 * @public
 */
interface SerializedMindMap {
    meta: MindMetadata;
    root: SerializedNode;
    nodes: Record<string, SerializedNode>;
    edges: Record<string, SerializedEdge>;
}
/**
 * JSON serializer for mind maps.
 *
 * @public
 */
declare class JmMindJsonSerializer extends JmMindSerializer {
    /**
     * Gets the format name this serializer supports.
     *
     * @returns The format name.
     */
    getFormatName(): string;
    /**
     * Serializes a mind map to JSON format.
     *
     * @param mind - The mind map to serialize.
     * @returns The serialized JSON data.
     * @throws {@link JsMindError} If the mind map is not provided.
     */
    serialize(mind: JmMind): SerializedMindMap;
    /**
     * Deserializes JSON data to a mind map.
     *
     * @param data - The JSON data to deserialize.
     * @returns The deserialized mind map.
     * @throws {@link JsMindError} If the JSON data format is invalid.
     */
    deserialize(data: SerializedMindMap): JmMind;
    /**
     * Validates if the data can be deserialized by this serializer.
     *
     * @param data - The data to validate.
     * @returns True if the data is valid for this format.
     */
    validate(data: unknown): data is SerializedMindMap;
    /**
     * Serializes a single node.
     *
     * @private
     * @param node - The node to serialize.
     * @returns The serialized node data.
     */
    _serializeNode(node: JmNode): SerializedNode;
    /**
     * Deserializes a single node.
     *
     * @private
     * @param nodeData - The node data to deserialize.
     * @returns The deserialized node.
     */
    _deserializeNode(nodeData: SerializedNode): JmNode;
    /**
     * Serializes a single edge.
     *
     * @private
     * @param edge - The edge to serialize.
     * @returns The serialized edge data.
     */
    _serializeEdge(edge: JmEdge): SerializedEdge;
    /**
     * Deserializes a single edge.
     *
     * @private
     * @param edgeData - The edge data to deserialize.
     * @returns The deserialized edge.
     */
    _deserializeEdge(edgeData: SerializedEdge): JmEdge;
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
    _restoreNodeRelationships(_mind: JmMind): void;
}

/**
 * Main class for jsMind mind map operations.
 *
 * @public
 */
declare class JsMind {
    /**
     * Gets the version of jsMind.
     *
     * @returns The version string.
     */
    static get Version(): string;
    /**
     * Gets the author of jsMind.
     *
     * @returns The author string.
     */
    static get Author(): string;
    /**
     * Exported classes for browser use.
     */
    static Mind: typeof JmMind;
    static NodeContent: typeof JmNodeContent;
    /** The options for this jsMind instance. */
    options: any;
    /** The currently opened mind map, or null if none is open. */
    mind: JmMind | null;
    /** The serializer used for serialization operations. */
    serializer: JmMindJsonSerializer;
    /**
     * Creates a new jsMind instance.
     *
     * @param options - Configuration options for the jsMind instance.
     */
    constructor(options: any);
    /**
     * Opens a mind map.
     *
     * @param mind - The mind map instance to open.
     * @returns The opened mind map instance.
     */
    open(mind: JmMind): JmMind;
    /**
     * Closes the current mind map (cleanup method).
     *
     * @remarks
     * This method can be extended in the future for cleanup operations
     * like removing observers, clearing caches, etc.
     */
    close(): void;
    /**
     * Serializes the current mind map to JSON.
     *
     * @returns JSON string representation of the mind map.
     * @throws {@link Error} If no mind map is open or serialization fails.
     */
    serialize(): string;
}

export { JsMind as default };
