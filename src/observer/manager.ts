import { JsMindError } from '../common/error.ts';
import type { JmObserver } from './index.ts';

/**
 * Manager for observers of an observed object.
 *
 * @public
 */
export class JmObserverManager<T> {
    /** The object being observed. */
    observedObject: T;

    /** @internal */
    _observers: JmObserver<T>[];

    /**
     * Creates an observer manager for an observed object.
     *
     * @param observedObject - The object to observe.
     */
    constructor(observedObject: T) {
        this.observedObject = observedObject;
        this._observers = [];
    }

    /**
     * Adds an observer to the observed object.
     *
     * @param observer - An object that contains an `update(observedObject, event)` method.
     * @throws {@link JsMindError} If the observer is not a valid JmObserver instance.
     */
    addObserver(observer: JmObserver<T>): void {
        if(!observer || !('update' in observer) || typeof observer.update !== 'function') {
            throw new JsMindError('observer is not a valid JmObserver instance');
        }
        this._observers.push(observer);
    }

    /**
     * Removes an observer that was previously added by the `addObserver` method.
     *
     * @param observer - The observer to remove.
     */
    removeObserver(observer: JmObserver<T>): void {
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
    async notifyObservers(event: unknown): Promise<void> {
        this._observers.forEach(async (observer: JmObserver<T>) => {
            await new Promise<void>((resolve) => {
                setTimeout(() => {
                    observer.update(this.observedObject, event);
                    resolve();
                });
            });
        }
        );
    }
}

