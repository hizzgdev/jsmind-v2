/**
 * JSON serializer for JsMind mind maps.
 *
 * @packageDocumentation
 */

import { JmMindSerializer } from './jsmind.serializer.ts';
import { JmMind } from '../model/jsmind.mind.ts';
import { JmNode } from '../model/jsmind.node.ts';
import { JmNodeContent } from '../model/jsmind.node.content.ts';
import { JmEdge } from '../model/jsmind.edge.ts';
import { JsMindError } from '../jsmind.error.ts';

/**
 * JSON serializer for mind maps.
 *
 * @public
 */
export class JmMindJsonSerializer extends JmMindSerializer {
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
    serialize(mind: JmMind): any {
        if (!mind) {
            throw new JsMindError('Mind map is required for serialization');
        }

        const serializedData: any = {
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
    deserialize(data: any): JmMind {
        if (!this.validate(data)) {
            throw new JsMindError('Invalid JSON data format');
        }

        // Create mind map with basic options
        const mindOptions = {
            nodeIdGenerator: { newId: () => 'temp' }, // Placeholder
            edgeIdGenerator: { newId: () => 'temp' } // Placeholder
        };

        const mind = new JmMind(mindOptions);

        // Restore metadata
        mind.meta = { ...data.meta };

        // Restore nodes
        Object.values(data.nodes).forEach((nodeData: any) => {
            const node = this._deserializeNode(nodeData);
            mind._nodes[node.id] = node;
        });

        // Restore additional edges
        if (data.edges) {
            Object.values(data.edges).forEach((edgeData: any) => {
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
    validate(data: any): boolean {
        if (!data || typeof data !== 'object') {
            return false;
        }

        if (!data.meta || !data.root || !data.nodes || !data.edges) {
            return false;
        }

        if (!data.root.id || !data.nodes[data.root.id]) {
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
    _serializeNode(node: JmNode): any {
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
    _deserializeNode(nodeData: any): JmNode {
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
    _serializeEdge(edge: JmEdge): any {
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
    _deserializeEdge(edgeData: any): JmEdge {
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
     * @remarks
     * This method is no longer needed since parent-child relationships
     * are now stored directly in the nodes and serialized/deserialized
     * as part of the node data itself.
     *
     * @private
     * @param _mind - The mind map to restore relationships for.
     */
    _restoreNodeRelationships(_mind: JmMind): void {
        // This method is no longer needed since parent-child relationships
        // are now stored directly in the nodes and serialized/deserialized
        // as part of the node data itself
    }
}

