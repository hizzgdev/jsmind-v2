import { type JmNode } from './model/jsmind.node.ts';
import { type JmMind } from './model/jsmind.mind.ts';
import { type JmMindEvent } from './event/jsmind.mind.event.ts';
import { JmSize } from './jsmind.data.ts';

/**
 * View of mind map.
 * @public
 */
export class JmView {
    /**
     * Measures the size of the node in the view.
     *
     * @param node - The node to measure.
     * @returns The size of the node.
     * @throws {@link Error} If not implemented.
     */
    measure(node: JmNode): JmSize {
        console.log('JmView.measure', node);
        throw new Error('not implemented');
    }

    /**
     * Called when the mind map changes.
     *
     * @param sender - The object that triggered the change.
     * @param event - The event data.
     */
    onMindChanged(sender: JmMind, event: JmMindEvent): void {
        console.log('JmView.onMindChanged', sender, event);
    }
}

