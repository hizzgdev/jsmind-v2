import { type JmNode } from '../model/node.ts';
import { DomUtility, JmDomUtility, type JmElement } from '../common/dom.ts';
import { JmPoint, JmSize } from '../common/index.ts';

/**
 * View operator for nodes.
 * Handles rendering and manipulation of node elements in the view.
 *
 * @public
 */
export class JmNodeView {
    /** The container element for nodes. */
    private readonly container: HTMLElement;

    /**
     * Creates a new node view operator.
     *
     * @param innerContainer - The inner container element to append the nodes container to.
     */
    constructor(innerContainer: HTMLElement) {
        this.container = this._initNodesContainer(innerContainer);
    }

    async createAndMeasure(node: JmNode): Promise<JmSize> {
        const existingElement = node._data.view.element;
        if (existingElement) {
            return new JmSize(existingElement.cachedRect.width, existingElement.cachedRect.height);
        }
        return this._createNodeElement(node)
            .then((element: JmElement) => {
                node._data.view.element = element;
                this.container.appendChild(element.element);
                return new JmSize(element.cachedRect.width, element.cachedRect.height);
            });
    }

    removeNode(node: JmNode): void {
        const element = node._data.view.element;
        if (element) {
            element.element.remove();
        }
    }

    updateCanvasSize(viewSize: JmSize) {
        this.container.style.width = `${viewSize.width}px`;
        this.container.style.height = `${viewSize.height}px`;
    }

    placeNode(node: JmNode, absolutePoint: JmPoint) {
        const element = node._data.view.element!;
        element.style.left = `${absolutePoint.x}px`;
        element.style.top = `${absolutePoint.y}px`;
        element.innerHTML = node.content.getText();
        element.style.display = 'unset';
        element.style.visibility = 'visible';
    }

    hideNode(node: JmNode) {
        const element = node._data.view.element!;
        element.style.display = 'none';
    }

    /**
     * Initializes the nodes container element.
     *
     * @param innerContainer - The inner container element.
     * @returns The created nodes container element.
     */
    private _initNodesContainer(innerContainer: HTMLElement): HTMLElement {
        const element = DomUtility.createElement('div', 'jsmind-nodes');
        innerContainer.appendChild(element);
        element.style.width = `${innerContainer.clientWidth}px`;
        element.style.height = `${innerContainer.clientHeight}px`;
        return element;
    }

    private async _createNodeElement(node: JmNode): Promise<JmElement> {
        const element = JmDomUtility.createElement('div', 'jsmind-node', { 'node-id': node.id });
        element.style.visibility = 'hidden';
        if(node.content.isText()) {
            element.innerHTML = node.content.getText();
        } else {
            element.innerHTML = 'unsupported content type';
        }
        const rect = await DomUtility.measureElement(element.element, this.container);
        element.cachedRect = rect;
        return element;
    }
}

