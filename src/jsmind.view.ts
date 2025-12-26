/**
 * JmMindEventListener is referenced but not defined in the original code.
 *
 * @internal
 */
declare class JmMindEventListener {
}

/**
 * View of mind map.
 *
 * @remarks
 * This is an interface/abstract class that should be extended to implement
 * a concrete view for rendering mind maps.
 *
 * @public
 */
export class JmView extends JmMindEventListener {
    /**
     * Measures the size of the node in the view.
     *
     * @param node - The node to measure.
     * @returns The size of the node.
     * @throws {@link Error} If not implemented.
     */
    measure(node: any): any {
        throw new Error('not implemented', node);
    }

    /**
     * Called when the mind map changes.
     *
     * @param sender - The object that triggered the change.
     * @param event - The event data.
     */
    onMindChanged(sender: any, event: any): void {
        console.log('JmView.onMindChanged', sender, event);
    }
}

