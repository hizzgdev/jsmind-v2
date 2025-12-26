import { type JmNode } from '../model/jsmind.node.ts';
import { JmSize } from '../jsmind.data.ts';

/**
 * View operator for nodes.
 * Handles rendering and manipulation of node elements in the view.
 *
 * @public
 */
export class JmNodeView {
    /** The container element for nodes. */
    private readonly container: HTMLElement;

    /** The map of node elements. */
    private readonly nodeElements: Map<string, HTMLElement> = new Map();

    /** The map of node sizes. */
    private readonly nodeSizes: Map<string, JmSize> = new Map();

    /**
     * Creates a new node view operator.
     *
     * @param innerContainer - The inner container element to append the nodes container to.
     */
    constructor(innerContainer: HTMLElement) {
        this.container = this._initNodesContainer(innerContainer);
    }

    /**
     * Initializes the nodes container element.
     *
     * @param innerContainer - The inner container element.
     * @returns The created nodes container element.
     */
    private _initNodesContainer(innerContainer: HTMLElement): HTMLElement {
        const element = document.createElement('div');
        element.classList.add('jsmind-nodes');
        innerContainer.appendChild(element);
        return element;
    }

    async renderNode(node: JmNode): Promise<HTMLElement> {
        // Check if already rendered
        const existingElement = this.nodeElements.get(node.id);
        if (existingElement) {
            return existingElement;
        }
        console.log('JmView.render', node);
        const element = document.createElement('div');
        this.nodeElements.set(node.id, element);
        element.setAttribute('class', 'jsmind-node');
        element.setAttribute('data-node-id', node.id);
        this.container.appendChild(element);
        return element;
    }
}

