/**
 * Event data containing the state change in JmMind.
 *
 * @public
 */
export class JmMindEvent {
    /** The type of the event. */
    type: JmMindEventType;
    /** The event data. */
    data: any;

    /**
     * Creates a new JmMindEvent instance.
     *
     * @param type - The type of the event.
     * @param data - The event data.
     */
    constructor(type: JmMindEventType, data: any) {
        this.type = type;
        this.data = data;
    }
}

/**
 * Enumeration of mind map event types.
 *
 * @public
 */
export const JmMindEventType = {
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
} as const;

export type JmMindEventType = typeof JmMindEventType[keyof typeof JmMindEventType];

