import type { JmNode } from '../model/data/node.ts';
import { JmDomUtility, type JmElement } from '../common/dom.ts';
import { JmSize, type JmPoint } from '../common/index.ts';
import { ViewExpanderStyle, type ViewOptions } from '../common/option.ts';
import { JmTone, type JmTheme } from '../model/data/style.ts';

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

    /** The resolved theme, or null until one is applied. */
    private theme: JmTheme | null = null;

    /**
     * Creates a new node view operator.
     *
     * @param innerContainer - The inner container element to append the nodes container to.
     */
    constructor(innerContainer: JmElement, viewOptions: ViewOptions) {
        this.container = this._initNodesContainer(innerContainer);
        this.options = viewOptions;
    }

    /**
     * Sets the theme whose tone palettes node elements resolve against.
     *
     * @remarks
     * Only the palettes are needed here. Geometry is written onto the host as
     * custom properties once per map, and every node inherits it — repeating a
     * padding value on every element would multiply work by node count for no
     * benefit.
     *
     * @param theme - The resolved theme.
     */
    setTheme(theme: JmTheme): void {
        this.theme = theme;
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
        element.innerHTML = node.content.getText();
        element.show(absolutePoint);
    }

    placeNodeExpander(node: JmNode, absolutePoint: JmPoint) {
        if(node.isRoot()) {
            return;
        }
        if(node.children.length === 0) {
            return;
        }

        const element = node._data.view.expander!;
        if(this.options.expander.style === ViewExpanderStyle.Char) {
            if(node.folded) {
                element.classList.add('jsmind-node-expander-collapsed');
            } else {
                element.classList.add('jsmind-node-expander-expanded');
            }
        } else if(this.options.expander.style === ViewExpanderStyle.Number) {
            element.classList.add('jsmind-node-expander-number');
            element.innerHTML = `${node.children.length}`;
        }
        element.show(absolutePoint);
    }

    hideNode(node: JmNode) {
        const element = node._data.view.element!;
        element.hide();
    }

    hideNodeExpander(node: JmNode) {
        const expanderElement = node._data.view.expander!;
        expanderElement.hide();
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
        element.hide();
        if(node.content.isText()) {
            element.innerHTML = node.content.getText();
        } else {
            element.innerHTML = 'unsupported content type';
        }
        if(node.isRoot()) {
            element.classList.add('jsmind-node-root');
        }
        this._applyTone(element, node);
        const rect = await JmDomUtility.measureElement(element, this.container);
        element.cachedRect = rect;
        return element;
    }

    private _createNodeExpander(node: JmNode): JmElement {
        const element = JmDomUtility.createElement('div', 'jsmind-node-expander', {'node-id': node.id});
        element.hide();
        // The expander sits next to the node and should read as part of it, so
        // it takes the same tone rather than inheriting whatever the host chose.
        this._applyTone(element, node);
        return element;
    }

    /**
     * Resolves a node's tone and its own style overrides into custom properties.
     *
     * @remarks
     * Written on the element, not on the host, because that is the whole point
     * of the tone concept: one node differs while its siblings do not. Custom
     * properties inherit downward, so a value set here wins for this subtree and
     * nothing else.
     *
     * Precedence follows `JmNodeStyle`'s contract — a field the node states
     * beats the tone beats the theme.
     *
     * @param element - The element to paint.
     * @param node - The node it represents.
     *
     * @private
     */
    private _applyTone(element: JmElement, node: JmNode): void {
        const style = node.style;
        const tone = style?.tone ?? JmTone.Default;
        const palette = this.theme?.tones?.[tone];

        /** Sets a custom property only when the palette actually carries it. */
        const set = (name: string, value: string | undefined): void => {
            if (value !== undefined) {
                element.style.setProperty(name, value);
            }
        };

        if (palette) {
            set('--jm-node-fill', palette.fillColor);
            set('--jm-node-text', palette.textColor);
            set('--jm-node-border-color', palette.borderColor);
            set('--jm-expander-border-color', palette.borderColor);
        }

        if (!style) {
            return;
        }

        // Explicit fields win over the tone they sat alongside.
        set('--jm-node-fill', style.background);
        set('--jm-node-text', style.color);
        set('--jm-node-border-color', style.borderColor);
        set('--jm-expander-border-color', style.borderColor);
        if (style.borderWidth !== undefined) {
            element.style.borderWidth = `${style.borderWidth}px`;
        }
        if (style.borderStyle !== undefined) {
            element.style.borderStyle = style.borderStyle;
        }
        // Font size and weight are set inline rather than through a custom
        // property: only the root adjusts size through the stylesheet, so a
        // per-node value has to override a rule rather than a default.
        if (style.fontSize !== undefined) {
            element.style.fontSize = `${style.fontSize}px`;
        }
        if (style.fontWeight !== undefined) {
            element.style.fontWeight = style.fontWeight;
        }
    }
}

