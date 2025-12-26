import { JsMindError } from '../jsmind.error.ts';

/**
 * Manager for observers of an observed object.
 *
 * @public
 */
export class JmObserverManager {
    /** The object being observed. */
    observedObject: any;
    /** @internal */
    _observers: any[];

    /**
     * Creates an observer manager for an observed object.
     *
     * @param observedObject - The object to observe.
     */
    constructor(observedObject: any) {
        this.observedObject = observedObject;
        this._observers = [];
    }

    /**
     * Adds an observer to the observed object.
     *
     * @param observer - An object that contains an `update(observedObject, event)` method.
     * @throws {@link JsMindError} If the observer is not a valid object.
     */
    addObserver(observer: any): void {
        if(!observer || !observer.update || typeof observer.update !== 'function') {
            throw new JsMindError('observer is not an valid Object');
        }
        this._observers.push(observer);
    }

    /**
     * Removes an observer that was previously added by the `addObserver` method.
     *
     * @param observer - The observer to remove.
     */
    removeObserver(observer: any): void {
        this._observers = this._observers.filter(o => o !== observer);
    }

    /**
     * Removes all observers from the object.
     */
    clearObservers(): void {
        this._observers = [];
    }

    /**
     * Notifies the event to all observers.
     *
     * @remarks
     * This is an asynchronous method. Each observer is notified in a separate
     * asynchronous operation.
     *
     * @param event - Events are defined by different observed objects, which
     * represent specific information about the changes.
     */
    async notifyObservers(event: any): Promise<void> {
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

