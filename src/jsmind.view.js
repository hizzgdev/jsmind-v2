import { JmSize } from "./jsmind.data";
import { JmNode } from "./jsmind.node";

/**
 * @interface JmView
 * View of mind map
 */
export class JmView {
    /**
     * measure the size of the node in the view
     * @param {JmNode} node
     * @returns {JmSize} size of the node
     */
    measure(node) {
        throw new Error('not implemented');
    }
}
