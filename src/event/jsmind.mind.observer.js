import { JmObserver } from './jsmind.observer.js';

/**
 * @class JmObserverManager
 */
export class JmMindEventListener extends JmObserver {
    /**
     * @param {JmMindEvent} event
     */
    update(observedObject, event) {
        this.onMindChanged(observedObject, event);
    }

    /**
     * @param {JmMindEvent} event
     */
    onMindChanged(sender, event) {
        throw new Error('not implemented');
    }
}

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

export const JmMindEventType = {
    NodeAdded: 1,
};
