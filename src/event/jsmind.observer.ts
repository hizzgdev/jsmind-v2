import type { JmMindEvent } from './index.ts';

/**
 * Interface for observer pattern.
 *
 * @remarks
 * This is an interface and should not be used like a class.
 * It defines what an observer should look like.
 * You don't have to explicitly extend it in your observer, jsMind will only
 * check the observer's methods when adding observers to objects.
 *
 * @public
 */
export class JmObserver {
    /**
     * This method will be called when state changes in observed object.
     *
     * @param observedObject - The object being observed.
     * @param event - The event data.
     * @throws {@link Error} If not implemented.
     */
    update(observedObject: unknown, event: JmMindEvent): void {
        console.error('JmObserver.update not implemented', observedObject, event);
        throw new Error('JmObserver.update not implemented');
    }
}

