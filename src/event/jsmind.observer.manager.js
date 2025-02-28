import { JsMindError } from '../jsmind.error.js';

export class JmObserverManager {
    constructor(observedObject) {
        this.observedObject = observedObject;
        this._observers = [];
    }

    addObserver(observer) {
        if(!observer || !observer.update || typeof observer.update !== 'function') {
            throw new JsMindError('observer is not an valid Object');
        }
        this._observers.push(observer);
    }

    removeObserver(observer) {
        this._observers = this._observers.filter(o => o !== observer);
    }

    clearObservers() {
        this._observers = [];
    }

    async notifyObservers(event) {
        this._observers.forEach(async (observer) => {
            await new Promise((resolve) => {
                setTimeout(() => {
                    observer.update(this.observedObject, event);
                    resolve();
                });
            });
        }
        );
    }
}
