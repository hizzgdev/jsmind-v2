/**
 * JSON serializer for JsMind mind maps.
 *
 * @packageDocumentation
 */
import type { JmMindSerializer } from './serializer.ts';
import { JmMind } from '../model/mind.ts';
import { JmNode } from '../model/data/node.ts';
import { JmNodeContent } from '../model/data/node-content.ts';
import { JmEdge, type JmEdgeType } from '../model/data/edge.ts';
import { JsMindError } from '../common/error.ts';
import type { MindMetadata } from '../common/option.ts';
import type { JmNodeSide } from '../model/data/node.ts';
import type { JmNodeContentType } from '../model/data/node-content.ts';

/**
 * Serialized node data structure.
 *
 * @public
 */
export interface SerializedNode {
    id: string;
    content: {
        type: JmNodeContentType;
        value: unknown;
    };
    parent: string | null;
    children: string[];
    folded: boolean;
    side: JmNodeSide;
    data: Record<string, unknown>;
}

/**
 * Serialized edge data structure.
 *
 * @public
 */
export interface SerializedEdge {
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
export interface SerializedMindMap {
    meta: MindMetadata;
    root: string;
    nodes: Record<string, SerializedNode>;
    edges: Record<string, SerializedEdge>;
}

/**
 * JSON serializer for mind maps.
 *
 * @public
 */
export class JmMindJsonSerializer implements JmMindSerializer {
    /**
     * Gets the format name this serializer supports.
     *
     * @returns The format name.
     */
    getFormatName(): string {
        return 'json';
    }

    /**
     * Serializes a mind map to JSON format.
     *
     * @param mind - The mind map to serialize.
     * @returns The serialized JSON data.
     * @throws {@link JsMindError} If the mind map is not provided.
     */
    serialize(mind: JmMind): SerializedMindMap {
        if (!mind) {
            throw new JsMindError('Mind map is required for serialization');
        }

        const serializedData: SerializedMindMap = {
            meta: mind.meta,
            root: mind._root.id,
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
    deserialize(data: SerializedMindMap): JmMind {
        if (!this.validate(data)) {
            throw new JsMindError('Invalid JSON data format');
        }

        // Create mind map with metadata and options
        const mind = new JmMind(data.meta, { rootNodeId: data.root });

        // Restore nodes
        Object.values(data.nodes).forEach((nodeData: SerializedNode) => {
            const node = this._deserializeNode(nodeData);
            mind._nodes[node.id] = node;
        });

        // Restore additional edges
        if (data.edges) {
            Object.values(data.edges).forEach((edgeData: SerializedEdge) => {
                const edge = this._deserializeEdge(edgeData);
                mind._edges[edge.id] = edge;
            });
        }

        // Restore root
        mind._root = mind._nodes[data.root];

        // Restore parent-child relationships
        this._restoreNodeRelationships(mind, data);

        return mind;
    }

    /**
     * Validates if the data can be deserialized by this serializer.
     *
     * @param data - The data to validate.
     * @returns True if the data is valid for this format.
     */
    validate(data: unknown): data is SerializedMindMap {
        if (!data || typeof data !== 'object') {
            return false;
        }

        const d = data as Record<string, unknown>;
        if (!d.meta || !d.root || !d.nodes || !d.edges) {
            return false;
        }

        const rootId = d.root;
        const nodes = d.nodes as Record<string, unknown>;
        if (!rootId || typeof rootId !== 'string' || !nodes[rootId]) {
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
    _serializeNode(node: JmNode): SerializedNode {
        return {
            id: node.id,
            content: {
                type: node.content.type,
                value: node.content.value
            },
            parent: node.parent ? node.parent.id : null,
            children: node.children.map(child => child.id),
            folded: node.folded,
            side: node.side,
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
    _deserializeNode(nodeData: SerializedNode): JmNode {
        const content = new JmNodeContent(nodeData.content.type, nodeData.content.value);
        const node = new JmNode(nodeData.id, content);

        node.folded = nodeData.folded;
        node.side = nodeData.side;
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
    _serializeEdge(edge: JmEdge): SerializedEdge {
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
    _deserializeEdge(edgeData: SerializedEdge): JmEdge {
        return new JmEdge(
            edgeData.id,
            edgeData.sourceNodeId,
            edgeData.targetNodeId,
            edgeData.type,
            edgeData.label
        );
    }

    /**
     * Restores parent-child relationships between nodes.
     *
     * @private
     * @param mind - The mind map to restore relationships for.
     * @param data - The serialized data containing parent and children information.
     */
    _restoreNodeRelationships(mind: JmMind, data: SerializedMindMap): void {
        // Restore parent relationships
        Object.values(data.nodes).forEach((nodeData: SerializedNode) => {
            const node = mind._nodes[nodeData.id];
            if (nodeData.parent !== null) {
                const parentNode = mind._nodes[nodeData.parent];
                if (parentNode) {
                    node.parent = parentNode;
                }
            } else {
                node.parent = null;
            }
        });

        // Restore children relationships
        Object.values(data.nodes).forEach((nodeData: SerializedNode) => {
            const node = mind._nodes[nodeData.id];
            node.children = nodeData.children
                .map((childId: string) => mind._nodes[childId])
                .filter((child: JmNode | undefined) => child !== undefined) as JmNode[];
        });
    }
}

