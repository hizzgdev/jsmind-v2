import { JmObserver } from './jsmind.observer.js';

/**
 * @class Observer of JmMind
 */
export class JmMindObserver extends JmObserver {

    /**
     * create an observer on JmMind with a JmView instance
     * @param {JmView} jmView
     */
    constructor(jmView) {
        super();
        this.view = jmView;
    }

    /**
     * @param {JmMind} observedObject
     * @param {JmMindEvent} event
     */
    update(observedObject, event) {
        throw new Error('not implemented', observedObject, event);
    }
}
