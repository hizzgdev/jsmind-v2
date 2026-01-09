/**
 * Interface for observer pattern.
 *
 * @public
 */
export interface JmObserver<T> {
    /**
     * This method will be called when state changes in observed object.
     *
     * @param observedObject - The object being observed.
     * @param event - The event data.
     */
    update(observedObject: T, event: unknown): void;
}

