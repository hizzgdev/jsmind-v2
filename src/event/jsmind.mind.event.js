/**
 * @class
 * Event data containing the state change in JmMind.
 */
export class JmMindEvent {
    /**
     * @param {JmMindEventType} type
     * @param {Object} data
     */
    constructor(type, data) {
        this.type = type;
        this.data = data;
    }
}

/**
 * @enum
 */
export const JmMindEventType = {
    NodeAdded: 1,
    NodeRemoved: 2,
    NodeUpdated: 3,
};
