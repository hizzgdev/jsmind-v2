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
            return Promise.resolve(existingElement);
        }
        return this.createNodeElement(node)
            .then((element: JmElement) => {
                this.nodeElements.set(node.id, element);
                this.container.appendChild(element);
                // append to container first and then measure size
                this.nodeSizes.set(node.id, element.getSize());
                return element;
            });
    }

    private async createNodeElement(node: JmNode): Promise<JmElement> {
        const element = DomUtility.createElement('div', 'jsmind-node', { 'node-id': node.id });
        if(node.content.isText()) {
            element.innerHTML = node.content.getText();
        } else {
            element.innerHTML = 'unsupported content type';
        }
        return Promise.resolve(element);
    }

    getNodeSize(nodeId: string): JmSize {
        return this.nodeSizes.get(nodeId) || { width: 0, height: 0 };
    }

    removeNode(nodeId: string): void {
        const element = this.nodeElements.get(nodeId);
        if (element) {
            element.element.remove();
            this.nodeElements.delete(nodeId);
            this.nodeSizes.delete(nodeId);
        }
    }
}

