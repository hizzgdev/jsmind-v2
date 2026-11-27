import type { JmNode } from '../model/data/node.ts';
import { JmDomUtility, type JmElement } from '../common/dom.ts';
import { JmSize, type JmPoint } from '../common/index.ts';
import { ViewExpanderStyle, type ViewOptions } from '../common/option.ts';
import { JmTone, type JmNodeStyle, type JmTheme } from '../model/data/style.ts';
import { applyTonePalette } from './shadow.ts';

/**
 * Picks the tone a node is painted with.
 *
 * @remarks
 * The precedence chain, most specific first:
 *
 * 1. `node.style.tone` — this node states its own tone.
 * 2. `theme.defaultTone` — the document's `style.defaultTone`, already resolved
 *    by `resolveJmStyle`, so a file that declares none arrives as `"default"`.
 * 3. `"default"` — reachable only before a theme has been applied, when there
 *    is nothing to read the fallback from.
 *
 * One function for both painters on purpose: the node's fill and the line that
 * leads to it have to agree. Two copies of this chain is how a map ends up with
 * recoloured nodes and unchanged lines.
 *
 * @param style - The node's own overrides, if it has any.
 * @param theme - The resolved theme, or null before one is applied.
 * @returns A tone name.
 */
export function resolveNodeTone(
    style: JmNodeStyle | undefined,
    theme: JmTheme | null | undefined
): string {
    return style?.tone ?? theme?.defaultTone ?? JmTone.Default;
}

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

    /**
     * Repaints an already rendered node with the style it carries now, and
     * re-measures it.
     *
     * @remarks
     * The element is reused rather than rebuilt. It already holds the node's
     * content, its position and anything a caller attached to it, and a style
     * change touches none of those.
     *
     * Measuring is not optional: a style can change the box (font size, border
     * width), and the layout is computed from the measured size - keeping the
     * cached one would paint a wider node at the old width, overlapping its
     * neighbours.
     *
     * A node that has no element yet is created and measured like any new node,
     * so a caller that changes the style of a node the map is not painting does
     * not have to know the difference.
     *
     * The measurement waits a frame, and that frame is long enough for the map
     * to be closed or replaced underneath it. When that happens this node's
     * cached element is no longer the one on screen - `releaseNode` forgot it,
     * or a new open painted another one - so the measured element is dropped
     * rather than put back, and `null` says nothing was painted.
     *
     * @param node - Node to repaint.
     * @returns The size the node occupies after the repaint, or `null` if the
     *          node stopped being rendered before the measurement landed.
     */
    async refreshNodeStyle(node: JmNode): Promise<JmSize | null> {
        const element = node._data.view.element;
        if (!element) {
            return await this.createAndMeasure(node);
        }
        this._applyTone(element, node);
        const rect = await JmDomUtility.measureElement(element, this.container);
        if (node._data.view.element !== element) {
            // The map left this element behind while we waited for the frame.
            // Putting it back would draw a node of a map that is no longer on
            // screen next to - or over - the one that is.
            return null;
        }
        element.cachedRect = rect;
        // Measurement takes the element out of the document to read its box and
        // leaves it out - `createAndMeasure` puts it back for the same reason.
        // Skipping this measures the node and then paints nothing: the element
        // is left detached and no later pass re-attaches it.
        this.container.appendChild(element.element);
        return new JmSize(rect.width, rect.height);
    }

    removeNode(node: JmNode): void {
        const element = node._data.view.element;
        if (element) {
            element.element.remove();
        }
    }

    /**
     * Removes a node's rendered elements and forgets them.
     *
     * @remarks
     * Differing from {@link removeNode} on the part that matters for a rebuild:
     * the cache is dropped as well. `createAndMeasure` trusts an element it
     * finds, so a node whose element was removed but whose cache was kept would
     * never be painted again - the next open would measure it to its old size
     * and place an element that is no longer in the document.
     *
     * @param node - Node whose rendering should go.
     */
    releaseNode(node: JmNode): void {
        node._data.view.element?.element.remove();
        node._data.view.expander?.element.remove();
        node._data.view.element = null;
        node._data.view.expander = null;
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
        // No tone here on purpose. The expander sits outside the node's box and
        // its stylesheet draws a neutral outline; feeding it the node's palette
        // would put a white circle beside every untoned node.
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
        const tone = resolveNodeTone(style, this.theme);

        // This runs against an element that may already be on screen, so every
        // field it can write is cleared first. Without that, a node whose style
        // dropped a field would keep wearing the value it had: going back from
        // an explicit `background` to the tone's fill left the old colour in
        // place, because applying a tone only overwrites what it sets.
        this._clearStyleOverrides(element);

        // The field is a string on disk, so the tone that lands here is typed
        // `string`; validation restricts it to a known name, which is what the
        // narrower index type wants.
        applyTonePalette(element, this.theme?.tones?.[tone as JmTone]);

        if (!style) {
            return;
        }

        /** Sets a custom property only when the node actually states it. */
        const set = (name: string, value: string | undefined): void => {
            if (value !== undefined) {
                element.style.setProperty(name, value);
            }
        };

        // Explicit fields win over the tone they sat alongside.
        set('--jm-node-fill', style.background);
        set('--jm-node-text', style.color);
        set('--jm-node-border-color', style.borderColor);
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

    /**
     * Removes every style override this view can write onto a node element.
     *
     * @remarks
     * Two mechanisms, so two removals. The colours are custom properties and go
     * back to inheriting the tone the host carries; the rest are ordinary inline
     * declarations that go back to the stylesheet's rules. Both have to happen
     * before the new style is applied, never after.
     *
     * @param element - The element to strip.
     *
     * @private
     */
    private _clearStyleOverrides(element: JmElement): void {
        element.style.removeProperty('--jm-node-fill');
        element.style.removeProperty('--jm-node-text');
        element.style.removeProperty('--jm-node-border-color');
        element.style.borderWidth = '';
        element.style.borderStyle = '';
        element.style.fontSize = '';
        element.style.fontWeight = '';
    }
}

