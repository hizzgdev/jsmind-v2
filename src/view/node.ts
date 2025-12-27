import { type JmNode } from '../model/jsmind.node.ts';
import { JmSize } from '../common/index.ts';
import { DomUtility, type JmElement } from '../common/dom.ts';

/**
 * View operator for nodes.
 * Handles rendering and manipulation of node elements in the view.
 *
 * @public
 */
export class JmNodeView {
    /** The container element for nodes. */
    private readonly container: JmElement;

    /** The map of node elements. */
    private readonly nodeElements: Map<string, JmElement> = new Map();

    /** The map of node sizes. */
    private readonly nodeSizes: Map<string, JmSize> = new Map();

    /**
     * Creates a new node view operator.
     *
     * @param innerContainer - The inner container element to append the nodes container to.
     */
    constructor(innerContainer: JmElement) {
        this.container = this._initNodesContainer(innerContainer);
    }

    /**
     * Initializes the nodes container element.
     *
     * @param innerContainer - The inner container element.
     * @returns The created nodes container element.
     */
    private _initNodesContainer(innerContainer: JmElement): JmElement {
        const element = DomUtility.createElement('div', 'jsmind-nodes');
        innerContainer.appendChild(element);
        return element;
    }

    async renderNode(node: JmNode): Promise<JmElement> {
        // Check if already rendered
        const existingElement = this.nodeElements.get(node.id);
        if (existingElement) {
            return existingElement;
        }
        const element = DomUtility.createElement('div', 'jsmind-node', { 'node-id': node.id });
        this.nodeElements.set(node.id, element);
        this.container.appendChild(element);
        return element;
    }
}

