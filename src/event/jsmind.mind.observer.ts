import { JmObserver } from './jsmind.observer.ts';

/**
 * Observer of JmMind.
 *
 * @public
 */
export class JmMindObserver extends JmObserver {
    /** The view instance associated with this observer. */
    view: any;

    /**
     * Creates an observer on JmMind with a JmView instance.
     *
     * @param jmView - The view instance.
     */
    constructor(jmView: any) {
        super();
        this.view = jmView;
    }

    /**
     * Updates the observer when the mind map changes.
     *
     * @param observedObject - The JmMind instance being observed.
     * @param event - The JmMindEvent containing change information.
     * @throws {@link Error} If not implemented.
     */
    update(observedObject: any, event: any): void {
        throw new Error('not implemented', observedObject, event);
    }
}

