import type { JmMind } from '../model/mind.ts';
import { JsMindError } from '../common/error.ts';
import type { ViewOptions } from '../common/option.ts';
import { JmNodeView, resolveNodeTone } from './node.ts';
import { JmEdgeView } from './edge.ts';
import { attachViewShadowRoot, applyThemeToHost } from './shadow.ts';
import { resolveJmStyle, JmTone, JmLinePattern, JmLineCurve, JSMIND_THEME_DEFAULT } from '../model/data/style.ts';
import { captureShadowContent, type JmExportImageOptions, type JmExportImageResult } from './export.ts';
import type { JmViewHandle, JmViewport, JmViewportAnchor } from './handle.ts';
import { viewportCssTransform, zoomViewport, type JmViewportTransform } from './viewport.ts';
import type { JmTheme } from '../model/data/style.ts';
import type { JmResolvedLineStyle } from './edge.ts';
import { DomUtility, JmDomUtility, type JmElement } from '../common/dom.ts';
import type { JmNode } from '../model/data/node.ts';
import { JmPoint, JmSize } from '../common/index.ts';
import type { Arranger } from '../arranger/index.ts';

/**
 * View of mind map.
 * @public
 */
export class JmView implements JmViewHandle {
    private readonly container: HTMLElement;

    private readonly shadowRoot: ShadowRoot;

    private readonly innerContainer: JmElement;

    private readonly nodeView: JmNodeView;

    private readonly edgeView: JmEdgeView;

    private readonly arranger: Arranger;

    private readonly options: ViewOptions;

    /**
     * The theme resolved from the mind map's style, kept so that per-node
     * decisions at render time (tone lookup, line fallbacks) do not have to
     * re-resolve it for every node.
     *
     * Starts at the built-in default rather than null: a node can be rendered
     * before `applyTheme` runs, and a null theme would force every lookup to
     * carry an optional chain and a hardcoded colour of its own.
     */
    private theme: JmTheme = JSMIND_THEME_DEFAULT;

    private readonly viewSize: JmSize = new JmSize(1, 1);

    private readonly viewOffset: JmPoint = new JmPoint(0, 0);

    /** How the map sits in the viewport. Identity until a zoom asks for more. */
    private readonly viewport: JmViewportTransform = { x: 0, y: 0, scale: 1 };

    /**
     * Whether the viewport has taken the inner box over from native scrolling.
     *
     * @remarks
     * A view that is never asked to zoom keeps the old behaviour: the map
     * overflows the inner box and the browser's own scrollbars reach it. A
     * transform moves content without extending the scrollable area, so the two
     * cannot both be in charge - the first zoom replaces the scrollbars with the
     * transform, and this flag says which one owns the box.
     */
    private viewportActive = false;

    private constructor(container: HTMLElement, shadowRoot: ShadowRoot, innerContainer: JmElement, nodeView: JmNodeView, edgeView: JmEdgeView, arranger: Arranger, options: ViewOptions) {
        this.container = container;
        this.shadowRoot = shadowRoot;
        this.innerContainer = innerContainer;
        this.nodeView = nodeView;
        this.edgeView = edgeView;
        this.arranger = arranger;
        this.options = options;
    }

    static async create(container: string | HTMLElement, arranger: Arranger, options: ViewOptions): Promise<JmView> {
        const jmContainer = await this._initContainer(container);
        // Rendered content lives in a shadow root: the map's structural rules
        // are installed there, so the host page cannot reach them and they
        // cannot reach the host page.
        const shadowRoot = attachViewShadowRoot(jmContainer);
        const innerContainer = this._initInnerContainer(shadowRoot);
        const nodeView = new JmNodeView(innerContainer, options);
        const edgeView = new JmEdgeView(innerContainer);
        return new JmView(jmContainer, shadowRoot, innerContainer, nodeView, edgeView, arranger, options);
    }

    private static async _initContainer(container: string | HTMLElement): Promise<HTMLElement> {
        if (!container) {
            throw new JsMindError('Container is required');
        }
        if (typeof container === 'string') {
            const element = document.getElementById(container);
            if (!element) {
                throw new JsMindError(`Container element with ID '${container}' is not found`);
            }
            await DomUtility.ensureElementVisible(element);
            return element;
        }
        return container;
    }

    private static _initInnerContainer(shadowRoot: ShadowRoot): JmElement {
        const jmElement = JmDomUtility.createElement('div', 'jsmind-inner');
        jmElement.classList.add('jsmind-inner');
        // Appended to the shadow root, not to its host: this is what puts the
        // rendered tree inside the style boundary.
        shadowRoot.appendChild(jmElement.element);
        return jmElement;
    }

    /**
     * Resolves the mind map's style and pushes it onto the rendered tree.
     *
     * @remarks
     * Must run before measuring: a node's measured size depends on its padding,
     * font size and line height, and those come from the theme. Applying it
     * afterwards would lay the map out to the previous theme's geometry and
     * leave the rendered nodes disagreeing with the coordinates beside them.
     *
     * @param mind - The mind map about to be rendered.
     */
    applyTheme(mind: JmMind): void {
        const theme = resolveJmStyle(mind.style);
        this.theme = theme;
        applyThemeToHost(this.shadowRoot, theme);
        this.nodeView.setTheme(theme);
    }

    async measureNodeSizes(mind: JmMind): Promise<void> {
        await this._whileUnscaled(() =>
            Promise.all(Object.values(mind._nodes).map((node: JmNode)=>this._measureNode(node)))
        );
    }

    async measureNodeSize(node: JmNode): Promise<JmSize> {
        return await this._whileUnscaled(() => this._measureNode(node));
    }

    /**
     * Measures one node and records its size for the layout.
     *
     * @param node - Node to measure.
     * @returns The measured size, in layout pixels.
     */
    private async _measureNode(node: JmNode): Promise<JmSize> {
        return this.nodeView.createAndMeasure(node)
            .then((size: JmSize)=>{
                this.arranger.recordNodeSize(node, size);
                return size;
            });
    }

    /**
     * Runs a measurement with the viewport transform out of the way.
     *
     * @remarks
     * Measurement reads `getBoundingClientRect()`, and a rect includes every
     * transform above the element: a node measured at 2x would be recorded as
     * twice its size, and the layout computed from that would be wrong. So the
     * transform is cleared for the measurement and put back afterwards.
     *
     * No flicker: the wait inside a measurement is a `requestAnimationFrame`
     * callback, and callbacks run before paint, so the transform is back in
     * place before the frame that would have shown the unscaled tree.
     *
     * Nothing to do for a view that was never zoomed, which is every caller that
     * does not touch the viewport API.
     *
     * @param work - Measurement to run.
     * @returns What the measurement returned.
     */
    private async _whileUnscaled<T>(work: () => Promise<T>): Promise<T> {
        if (!this.viewportActive) {
            return await work();
        }
        this.innerContainer.element.style.transform = 'none';
        try {
            return await work();
        } finally {
            this._applyViewport();
        }
    }

    async settle(mind: JmMind, _changedNodeIds: string[] = []): Promise<void> {
        this._updateViewSize(mind);
        this.nodeView.updateCanvasSize(this.viewSize);
        this.edgeView.updateEdgeViewsSize(this.viewSize);
        this._settleNode(mind, this.viewOffset);
        this._renderEdges(mind, this.viewOffset);
    }

    private _settleNode(mind: JmMind, viewOffset: JmPoint): void {
        Object.values(mind._nodes).forEach((node: JmNode)=>{
            if(this.arranger.isNodeVisible(node)) {
                // reset custom style
                const nodePoint = this.arranger.calculateNodePoint(node);
                const absolutePoint = nodePoint.offset(viewOffset);
                this.nodeView.placeNode(node, absolutePoint);

                const nodeExpanderPoint = this.arranger.calculateNodeExpanderPoint(node);
                const absoluteExpanderPoint = nodeExpanderPoint.offset(viewOffset);
                this.nodeView.placeNodeExpander(node, absoluteExpanderPoint);
            }else{
                this.nodeView.hideNode(node);
                this.nodeView.hideNodeExpander(node);
            }
        });
    }

    private _renderEdges(mind: JmMind, viewOffset: JmPoint): void {
        Object.values(mind._nodes)
            .filter((node: JmNode)=>!node.isRoot())
            .forEach((node: JmNode)=>{
                if(this.arranger.isNodeVisible(node)) {
                    const sourcePoint = this.arranger.calculateNodeOutgoingPoint(node.parent!);
                    const targetPoint = this.arranger.calculateNodeIncomingPoint(node);
                    const absoluteSourcePoint = sourcePoint.offset(viewOffset);
                    const absoluteTargetPoint = targetPoint.offset(viewOffset);
                    this.edgeView.drawLine(node, absoluteSourcePoint, absoluteTargetPoint, this._resolveLineStyle(node));
                }else{
                    this.edgeView.eraseLine(node);
                }
            });
    }

    /**
     * Resolves the style of the line that connects a node to its parent.
     *
     * @remarks
     * Three layers, most specific first:
     *
     * 1. `node.style.incoming` — this one line.
     * 2. The node's tone — a subtree reads as one visual grouping, because the
     *    tone's `lineColor` differs from the fill rather than repeating it.
     * 3. The theme's `line` block — width, pattern and curve for the map.
     *
     * The line belongs to the child, not the parent: a line connects exactly one
     * child, so the child is the natural owner and can restyle its own
     * connection without touching its siblings. v1 did the same, reading
     * `leading-line-color` off the child's `data`.
     *
     * `curve` deliberately does not fall back to the tone. A tone is a colour,
     * and letting it carry geometry would make two nodes of the same tone but
     * different shapes impossible to express.
     */
    private _resolveLineStyle(node: JmNode): JmResolvedLineStyle {
        const theme = this.theme;
        const incoming = node.style?.incoming;
        // Same fallback the node's own fill uses - a node without a tone wears
        // the document's defaultTone, and the line leading to it follows.
        const tone = resolveNodeTone(node.style, theme);
        // The default palette is the last resort for an unknown or unstyled
        // tone, and it comes from the same constant the theme was built from, so
        // an untoned node never falls through to a colour of its own.
        const palette = theme.tones?.[tone as JmTone] ?? JSMIND_THEME_DEFAULT.tones?.[JmTone.Default];

        // Every fallback reads the theme. The final literal is unreachable while
        // JSMIND_THEME_DEFAULT defines a default tone - it exists so the type is
        // `string`, not as a second source of truth that could drift.
        return {
            color: incoming?.color ?? palette?.lineColor ?? '#b0b0b0',
            width: incoming?.width ?? theme.line?.width ?? 2,
            pattern: incoming?.pattern ?? theme.line?.pattern ?? JmLinePattern.Solid,
            curve: incoming?.curve ?? theme.line?.curve ?? JmLineCurve.Bezier,
        };
    }

    /**
     * Renders the current content to an image.
     *
     * Kept on the view rather than reached into from outside: the host element
     * and the shadow root are both private, and they are exactly what the
     * capture needs.
     *
     * @param options - Scale, format and quality.
     * @returns The encoded image plus its dimensions.
     */
    async capture(options?: JmExportImageOptions): Promise<JmExportImageResult> {
        return await captureShadowContent(this.container, this.shadowRoot, this.viewSize, options);
    }

    /**
     * Changes the zoom factor, holding one point still.
     *
     * @param scale - Requested factor, clamped to the range the view accepts.
     * @param anchor - Point to hold still, in the view's own pixels. Defaults to
     * the middle of the viewport, which is what a control without a pointer
     * position wants.
     */
    zoomTo(scale: number, anchor?: JmViewportAnchor): void {
        this._activateViewport();
        const state = zoomViewport(this.viewport, scale, anchor ?? this._viewportCentre());
        this.viewport.x = state.x;
        this.viewport.y = state.y;
        this.viewport.scale = state.scale;
        this._applyViewport();
    }

    /**
     * Reads the current viewport.
     *
     * @remarks
     * `x`/`y` name the map-space point at the viewport's top-left corner, and
     * that has to mean the same thing before and after the first zoom: while
     * native scrolling is in charge the displacement is the scroll offset, and a
     * reader who scrolled the map and then read the viewport would otherwise be
     * told the map is still at its origin.
     *
     * The scroll term is divided by the zoom for the same reason it is added
     * when the box is taken over: scrolling happens in the element's own
     * untransformed space, and the transform then scales it along with the
     * content.
     *
     * @returns The origin, the zoom factor and the visible size.
     */
    getViewport(): JmViewport {
        const size = this._viewportSize();
        const element = this.innerContainer.element;
        return {
            x: this.viewport.x + element.scrollLeft / this.viewport.scale,
            y: this.viewport.y + element.scrollTop / this.viewport.scale,
            scale: this.viewport.scale,
            width: size.width,
            height: size.height,
        };
    }

    /**
     * Takes the inner box over from native scrolling, once.
     *
     * @remarks
     * `transform` moves content without extending the scrollable area, so with
     * both in charge a zoom would move the map and a scrollbar would move it
     * again. Done before any size is read, because the scrollbars it removes
     * were occupying the box the size is read from.
     *
     * Whatever the reader had already scrolled to becomes part of the state
     * before the scrollbars go: a scroll offset and a viewport origin describe
     * the same displacement, so folding one into the other is what keeps the
     * picture from jumping at the moment the transform takes over.
     */
    private _activateViewport(): void {
        if (this.viewportActive) {
            return;
        }
        const element = this.innerContainer.element;
        this.viewport.x += element.scrollLeft / this.viewport.scale;
        this.viewport.y += element.scrollTop / this.viewport.scale;
        element.scrollLeft = 0;
        element.scrollTop = 0;
        this.viewportActive = true;
        // `visible`, not `hidden`: native scrolling has to go, but clipping must
        // not move to this box. An `overflow` that clips does so in the element's
        // own coordinate space, and this box is only as big as the view - so
        // below 1x it would keep showing the same slice of the map, merely
        // smaller, and the rest of the map would be neither painted nor, before
        // pan exists, reachable. `visible` produces no scrollbars either, so it
        // ends native scrolling just as `hidden` does. Clipping stays on `:host`,
        // which is the same size as the view and already has it.
        element.style.overflow = 'visible';
    }

    /**
     * Writes the viewport state onto the inner box.
     *
     * @remarks
     * The transform lives on the inner box rather than on a wrapper of its own
     * for two reasons: the box is already there and the content is positioned
     * inside it, and `export.ts` resets `transform` on the box it clones, which
     * is what keeps a capture independent of where the view happens to be
     * looking.
     */
    private _applyViewport(): void {
        const element = this.innerContainer.element;
        element.style.transformOrigin = '0 0';
        element.style.transform = viewportCssTransform(this.viewport);
    }

    /**
     * The visible box's size, in CSS pixels.
     *
     * @returns Width and height of the inner box, read from layout so the
     * viewport transform cannot change what it reports.
     */
    private _viewportSize(): JmSize {
        return new JmSize(this.innerContainer.element.clientWidth, this.innerContainer.element.clientHeight);
    }

    /**
     * The middle of the visible box, in the view's own pixels.
     *
     * @returns The default zoom anchor.
     */
    private _viewportCentre(): JmViewportAnchor {
        const size = this._viewportSize();
        return { x: size.width / 2, y: size.height / 2 };
    }

    private _updateViewSize(mind: JmMind): void {
        const mindBounds = this.arranger.calculateMindBounds(mind);
        const mindViewSize = mindBounds.size;
        const minWidth = mindViewSize.width + this.options.padding.left + this.options.padding.right;
        const minHeight = mindViewSize.height + this.options.padding.top + this.options.padding.bottom;
        this.viewSize.width = Math.max(this.innerContainer.clientWidth, minWidth);
        this.viewSize.height = Math.max(this.innerContainer.clientHeight, minHeight);

        const centerOffset = mindBounds.center;
        this.viewOffset.x = this.viewSize.width / 2 - centerOffset.x;
        this.viewOffset.y = this.viewSize.height / 2 - centerOffset.y;
    }
}
