import { type JmNode } from '../model/node.ts';
import { JmDomUtility, type JmElement } from '../common/dom.ts';

/**
 * View operator for nodes.
 * Handles rendering and manipulation of node elements in the view.
 *
 * @public
 */
export class JmNodeView {
    /** The container element for nodes. */
    private readonly container: JmElement;

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
        const element = JmDomUtility.createElement('div', 'jsmind-nodes');
        innerContainer.appendChild(element);
        return element;
    }

    async createNodeView(node: JmNode): Promise<JmElement> {
        // Check if already rendered
        const existingElement = node._data.viewData.element;
        if (existingElement) {
            return Promise.resolve(existingElement);
        }
        return this._createNodeElement(node)
            .then((element: JmElement) => {
                node._data.viewData.element = element;
                this.container.appendChild(element);
                return element;
            });
    }

    private async _createNodeElement(node: JmNode): Promise<JmElement> {
        const element = JmDomUtility.createElement('div', 'jsmind-node', { 'node-id': node.id });
        if(node.content.isText()) {
            element.innerHTML = node.content.getText();
        } else {
            element.innerHTML = 'unsupported content type';
        }
        const rect = await JmDomUtility.measureElement(element, this.container);
        element.cacheRect(rect);
        return element;
    }

    removeNodeView(node: JmNode): void {
        const element = node._data.viewData.element;
        if (element) {
            element.element.remove();
        }
    }
}

