import { JsMindError } from '../jsmind.error.js';

/**
 * @class
 */
export class JmObserverManager {

    /**
     * create a observer manger for an observed object
     * @param {Object} observedObject observed object
     */
    constructor(observedObject) {
        this.observedObject = observedObject;
        this._observers = [];
    }

    /**
     * add an observer to the observed object
     * @param {JmObserver} observer An object that contains a `onStateChanged(observedObject, event)` method
     */
    addObserver(observer) {
        if(!observer || !observer.onStateChanged || typeof observer.onStateChanged !== 'function') {
            throw new JsMindError('observer is not an valid Object');
        }
        this._observers.push(observer);
    }

    /**
     * delete an observer that was previously added by the `addObserver` method
     * @param {JmObserver} observer
     */
    removeObserver(observer) {
        this._observers = this._observers.filter(o => o !== observer);
    }

    /**
     * remove all observers from the object
     */
    clearObservers() {
        this._observers = [];
    }

    /**
     * notify the event to all observers. this is an asynchronous method.
     * @param {Object} event events are defined by different observed object, which represent specific information about the changes.
     */
    async notifyObservers(event) {
        this._observers.forEach(async (observer) => {
            await new Promise((resolve) => {
                setTimeout(() => {
                    observer.onStateChanged(this.observedObject, event);
                    resolve();
                });
            });
        }
        );
    }
}
