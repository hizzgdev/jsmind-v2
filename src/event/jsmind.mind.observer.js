import { JmObserver } from './jsmind.observer.js';

/**
 * @interface
 * It's an interface inherited from JmObserver
 */
export class JmMindEventListener extends JmObserver {
    /**
     * @param {JmMind} observedObject
     * @param {JmMindEvent} event
     */
    onStateChanged(observedObject, event) {
        this.onMindChanged(observedObject, event);
    }

    /**
     * @param {JmMind} sender
     * @param {JmMindEvent} event
     */
    onMindChanged(sender, event) {
        throw new Error('not implemented', sender, event);
    }
}

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
};
