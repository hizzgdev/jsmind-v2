import { JmMindEventType } from './index.ts';
import { JmNode } from '../data/node.ts';
import { JmEdge } from '../data/edge.ts';
import { JmNodeSide } from '../data/node.ts';

/**
 * Event data containing the state change in JmMind.
 *
 * @public
 */
export class JmMindEvent {
    /** The type of the event. */
    readonly type: JmMindEventType;

    /** The event data. */
    readonly data: JmMindEventData;

    /**
     * Creates a new JmMindEvent instance.
     *
     * @param type - The type of the event.
     * @param data - The event data.
     */
    constructor(type: JmMindEventType, data: JmMindEventData) {
        this.type = type;
        this.data = data;
    }

    static onNodeAdded(node: JmNode) {
        return new JmMindEvent(JmMindEventType.NodeAdded, new JmMindEventDataOnNodeAdded(node));
    }

    static onNodeRemoved(node: JmNode, removedNodeIds: string[], removedEdgeIds: string[]) {
        return new JmMindEvent(JmMindEventType.NodeRemoved, new JmMindEventDataOnNodeRemoved(node, removedNodeIds, removedEdgeIds));
    }

    static onNodeUpdated(node: JmNode, property: string, originValue: unknown, newValue: unknown) {
        return new JmMindEvent(JmMindEventType.NodeUpdated, new JmMindEventDataOnNodeUpdated(node, property, originValue, newValue));
    }

    static onNodeMoved(node: JmNode, oldParentId: string | null, oldPosition: number | null, oldSide: JmNodeSide | null) {
        return new JmMindEvent(JmMindEventType.NodeMoved, new JmMindEventDataOnNodeMoved(node, oldParentId, oldPosition, oldSide));
    }

    static onEdgeAdded(edge: JmEdge) {
        return new JmMindEvent(JmMindEventType.EdgeAdded, new JmMindEventDataOnEdgeAdded(edge));
    }

    static onEdgeRemoved(edge: JmEdge) {
        return new JmMindEvent(JmMindEventType.EdgeRemoved, new JmMindEventDataOnEdgeRemoved(edge));
    }

}


export class JmMindEventDataOnNodeAdded {
    readonly node: JmNode;

    constructor(node: JmNode) {
        this.node = node;
    }
}

export class JmMindEventDataOnNodeRemoved {
    readonly node: JmNode;

    readonly removedNodeIds: string[];

    readonly removedEdgeIds: string[];

    constructor(node: JmNode, removedNodeIds: string[], removedEdgeIds: string[]) {
        this.node = node;
        this.removedNodeIds = removedNodeIds.slice();
        this.removedEdgeIds = removedEdgeIds.slice();
    }
}

export class JmMindEventDataOnNodeUpdated {
    readonly node: JmNode;

    readonly property: string;

    readonly originValue: unknown;

    readonly newValue: unknown;

    constructor(node: JmNode, property: string, originValue: unknown, newValue: unknown) {
        this.node = node;
        this.property = property;
        this.originValue = originValue;
        this.newValue = newValue;
    }
}

export class JmMindEventDataOnNodeMoved {
    readonly node: JmNode;

    readonly oldParentId: string | null;

    readonly oldPosition: number | null;

    readonly oldSide: JmNodeSide | null;

    constructor(node: JmNode, oldParentId: string | null, oldPosition: number | null, oldSide: JmNodeSide | null) {
        this.node = node;
        this.oldParentId = oldParentId;
        this.oldPosition = oldPosition;
        this.oldSide = oldSide;
    }
}

export class JmMindEventDataOnEdgeAdded {
    readonly edge: JmEdge;

    constructor(edge: JmEdge) {
        this.edge = edge;
    }
}

export class JmMindEventDataOnEdgeRemoved {
    readonly edge: JmEdge;

    constructor(edge: JmEdge) {
        this.edge = edge;
    }
}

export type JmMindEventData = JmMindEventDataOnNodeRemoved | JmMindEventDataOnNodeAdded | JmMindEventDataOnNodeUpdated | JmMindEventDataOnNodeMoved | JmMindEventDataOnEdgeAdded | JmMindEventDataOnEdgeRemoved;
