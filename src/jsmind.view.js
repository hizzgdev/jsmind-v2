import { JmSize } from "./jsmind.data.js";
import { JmNode } from "./jsmind.node.js";

/**
 * @interface JmView
 * View of mind map
 */
export class JmView extends JmMindEventListener {
    /**
     * measure the size of the node in the view
     * @param {JmNode} node
     * @returns {JmSize} size of the node
     */
    measure(node) {
        throw new Error('not implemented');
    }

    onMindChanged(sender, event) {
        console.log('JmView.onMindChanged', sender, event);
    }
}
