import { type JmNode } from '../model/node.ts';
import { JmDomUtility, type JmElement } from '../common/dom.ts';
import { JmPoint, JmSize } from '../common/index.ts';
import { ViewExpanderStyle, type ViewOptions } from '../common/option.ts';

/**
 * View operator for nodes.
 * Handles rendering and manipulation of node elements in the view.
 *
 * @public
 */
export class JmNodeView {
    /** The container element for nodes. */
    private readonly container: JmElement;

    /** The view options. */
    private readonly options: ViewOptions;

    /**
     * Creates a new node view operator.
     *
     * @param innerContainer - The inner container element to append the nodes container to.
     */
    constructor(innerContainer: JmElement, viewOptions: ViewOptions) {
        this.container = this._initNodesContainer(innerContainer);
        this.options = viewOptions;
    }

    async createAndMeasure(node: JmNode): Promise<JmSize> {
        const existingElement = node._data.view.element;
        if (existingElement) {
            return new JmSize(existingElement.cachedRect.width, existingElement.cachedRect.height);
        }
        const sizePromise = this._createNodeElement(node)
            .then((element: JmElement) => {
                node._data.view.element = element;
                this.container.appendChild(element.element);
                return new JmSize(element.cachedRect.width, element.cachedRect.height);
            });

        if(!node.isRoot()) {
            const expanderElement = this._createNodeExpander(node);
            node._data.view.expander = expanderElement;
            this.container.appendChild(expanderElement.element);
        }
        return sizePromise;
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

    placeNodeExpander(node: JmNode, absolutePoint: JmPoint) {
        if(node.isRoot()) {
            return;
        }
        const expanderElement = node._data.view.expander!;
        expanderElement.style.left = `${absolutePoint.x}px`;
        expanderElement.style.top = `${absolutePoint.y}px`;
        expanderElement.style.display = 'unset';
        expanderElement.style.visibility = 'visible';
    }

    hideNode(node: JmNode) {
        const element = node._data.view.element!;
        element.style.display = 'none';
        element.style.visibility = 'hidden';
    }

    hideNodeExpander(node: JmNode) {
        const expanderElement = node._data.view.expander!;
        expanderElement.style.display = 'none';
        expanderElement.style.visibility = 'hidden';
    }

    /**
     * Initializes the nodes container element.
     *
     * @param innerContainer - The inner container element.
     * @returns The created nodes container element.
     */
    private _initNodesContainer(innerContainer: JmElement): JmElement {
        const jmElement = JmDomUtility.createElement('div', 'jsmind-nodes');
        innerContainer.appendChild(jmElement.element);
        jmElement.style.width = `${innerContainer.clientWidth}px`;
        jmElement.style.height = `${innerContainer.clientHeight}px`;
        return jmElement;
    }

    private async _createNodeElement(node: JmNode): Promise<JmElement> {
        const element = JmDomUtility.createElement('div', 'jsmind-node', { 'node-id': node.id });
        element.style.visibility = 'hidden';
        if(node.content.isText()) {
            element.innerHTML = node.content.getText();
        } else {
            element.innerHTML = 'unsupported content type';
        }
        const rect = await JmDomUtility.measureElement(element, this.container);
        element.cachedRect = rect;
        return element;
    }

    private _createNodeExpander(node: JmNode): JmElement {
        const element = JmDomUtility.createElement('div', 'jsmind-node-expander', {'node-id': node.id});
        if(this.options.expander.style === ViewExpanderStyle.Char) {
            element.classList.add('jsmind-node-expander-expanded');
        } else if(this.options.expander.style === ViewExpanderStyle.Number) {
            element.classList.add('jsmind-node-expander-number');
            element.innerHTML = `${node.children.length}`;
        }
        element.style.visibility = 'hidden';
        return element;
    }
}

