/**
 * @fileoverview JSON serializer for JsMind mind maps
 * @package
 */

import { JmMindSerializer } from './jsmind.serializer.js';
import { JmMind } from '../jsmind.mind.js';
import { JmNode } from '../jsmind.node.js';
import { JmNodeContent } from '../jsmind.node.content.js';
import { JmEdge } from '../jsmind.edge.js';
import { JsMindError } from '../jsmind.error.js';

/**
 * JSON serializer for mind maps
 */
export class JmMindJsonSerializer extends JmMindSerializer {
    /**
     * Get the format name this serializer supports
     * @returns {string} The format name
     */
    getFormatName() {
        return 'json';
    }

    /**
     * Serialize a mind map to JSON format
     * @param {JmMind} mind - The mind map to serialize
     * @returns {Object} The serialized JSON data
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

        // Serialize all edges
        Object.values(mind._edges).forEach(edge => {
            serializedData.edges[edge.id] = this._serializeEdge(edge);
        });

        return serializedData;
    }

    /**
     * Deserialize JSON data to a mind map
     * @param {Object} data - The JSON data to deserialize
     * @returns {JmMind} The deserialized mind map
     */
    deserialize(data) {
        if (!this.validate(data)) {
            throw new JsMindError('Invalid JSON data format');
        }

        // Create mind map with basic options (we'll need to handle this properly)
        const mindOptions = {
            nodeIdGenerator: { newId: () => 'temp' }, // Placeholder
            edgeIdGenerator: { newId: () => 'temp' } // Placeholder
        };

        const mind = new JmMind(mindOptions);

        // Restore metadata
        mind.meta = { ...data.meta };

        // Restore nodes
        Object.values(data.nodes).forEach(nodeData => {
            const node = this._deserializeNode(nodeData);
            mind._nodes[node.id] = node;
        });

        // Restore edges
        Object.values(data.edges).forEach(edgeData => {
            const edge = this._deserializeEdge(edgeData);
            mind._edges[edge.id] = edge;
        });

        // Restore root
        mind._root = mind._nodes[data.root.id];

        // Restore parent-child relationships
        this._restoreNodeRelationships(mind);

        return mind;
    }

    /**
     * Validate if the data can be deserialized by this serializer
     * @param {any} data - The data to validate
     * @returns {boolean} True if the data is valid for this format
     */
    validate(data) {
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
     * Serialize a single node
     * @param {JmNode} node - The node to serialize
     * @returns {Object} The serialized node data
     * @private
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
     * Deserialize a single node
     * @param {Object} nodeData - The node data to deserialize
     * @returns {JmNode} The deserialized node
     * @private
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
     * Serialize a single edge
     * @param {JmEdge} edge - The edge to serialize
     * @returns {Object} The serialized edge data
     * @private
     */
    _serializeEdge(edge) {
        return {
            id: edge.id,
            sourceNodeId: edge.sourceNodeId,
            targetNodeId: edge.targetNodeId,
            type: edge.type
        };
    }

    /**
     * Deserialize a single edge
     * @param {Object} edgeData - The edge data to deserialize
     * @returns {JmEdge} The deserialized edge
     * @private
     */
    _deserializeEdge(edgeData) {
        return new JmEdge(
            edgeData.id,
            edgeData.sourceNodeId,
            edgeData.targetNodeId,
            edgeData.type
        );
    }

    /**
     * Restore parent-child relationships between nodes
     * @param {JmMind} mind - The mind map to restore relationships for
     * @private
     */
    _restoreNodeRelationships(mind) {
        Object.values(mind._nodes).forEach(node => {
            const nodeData = mind._nodes[node.id];

            // Restore parent relationship
            if (nodeData.parent) {
                const parentNode = mind._nodes[nodeData.parent];
                if (parentNode) {
                    node.parent = parentNode;
                }
            }

            // Restore children relationships
            if (nodeData.children && Array.isArray(nodeData.children)) {
                node.children = nodeData.children
                    .map(childId => mind._nodes[childId])
                    .filter(child => child !== undefined);
            }
        });
    }
}
