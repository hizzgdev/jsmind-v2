import { JmObserver } from './jsmind.observer.ts';
import { type JmMind } from '../model/jsmind.mind.ts';
import { type JmMindEvent } from './jsmind.mind.event.ts';
import { type JmView } from '../view/index.ts';

/**
 * Observer of JmMind.
 *
 * @public
 */
export class JmMindObserver extends JmObserver {
    /** The view instance associated with this observer. */
    view: JmView;

    /**
     * Creates an observer on JmMind with a JmView instance.
     *
     * @param jmView - The view instance.
     */
    constructor(jmView: JmView) {
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
    update(observedObject: JmMind, event: JmMindEvent): void {
        throw new Error('not implemented', observedObject, event);
    }
}

