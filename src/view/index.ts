import type { JmMind } from '../model/mind.ts';
import { JsMindError } from '../common/error.ts';
import type { ViewOptions } from '../common/option.ts';
import { JmNodeView, resolveNodeTone } from './node.ts';
import { JmEdgeView } from './edge.ts';
import { attachViewShadowRoot, applyThemeToHost } from './shadow.ts';
import { resolveJmStyle, JmTone, JmLinePattern, JmLineCurve, JSMIND_THEME_DEFAULT } from '../model/data/style.ts';
import { captureShadowContent, type JmExportImageOptions, type JmExportImageResult } from './export.ts';
import type { JmViewHandle, JmViewport, JmViewportAnchor } from './handle.ts';
import {
    fitViewportScale,
    panViewport,
    viewportCssTransform,
    viewportOriginFor,
    zoomViewport,
    type JmViewportTransform,
} from './viewport.ts';
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

    /**
     * Size of the content itself - the map plus its padding - kept separately
     * from {@link viewSize}, which grows to the container when the map is
     * smaller. Fitting and centring need the content's own size.
     */
    private readonly contentSize: JmSize = new JmSize(0, 0);

    private readonly viewOffset: JmPoint = new JmPoint(0, 0);

    /** How the map sits in the viewport. Identity until a command moves it. */
    private readonly viewport: JmViewportTransform = { x: 0, y: 0, scale: 1 };

    /**
     * Whether the viewport has taken the inner box over from native scrolling.
     *
     * @remarks
     * A view that is never asked to pan or zoom keeps the old behaviour: the map
     * overflows the inner box and the browser's own scrollbars reach it. The
     * first viewport command replaces that with a transform, and a transform
     * moves content without changing the scrollable area, so the two cannot both
     * be in charge. Tracked here rather than read back off the element so the
     * switch happens once, on the command, and not on every render.
     */
    private viewportActive = false;

    /** The map being displayed. Kept for {@link centerOn}, which needs a node. */
    private mind: JmMind | null = null;

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
     * callback, and callbacks run before paint, so the transform is back in place
     * before the frame that would have shown the unscaled tree.
     *
     * Nothing to do for a view that was never panned or zoomed, which is every
     * caller that does not use the viewport API.
     *
     * @param work - Measurement to run.
     * @returns What the measurement returned.
     */
    private async _whileUnscaled<T>(work: () => Promise<T>): Promise<T> {
        if (!this.viewportActive) {
            return await work();
        }
        const element = this.innerContainer.element;
        element.style.transform = 'none';
        try {
            return await work();
        } finally {
            this._applyViewport();
        }
    }

    async settle(mind: JmMind, _changedNodeIds: string[] = []): Promise<void> {
        this.mind = mind;
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
     * Moves the map so that the given map-space point sits at the viewport's
     * top-left corner.
     *
     * @param x - Map-space x, in CSS pixels.
     * @param y - Map-space y, in CSS pixels.
     */
    panTo(x: number, y: number): void {
        this._activateViewport();
        this._setViewport({ x, y, scale: this.viewport.scale });
    }

    /**
     * Moves the map by a distance in screen pixels.
     *
     * @param dx - Pixels to move the map right.
     * @param dy - Pixels to move the map down.
     */
    panBy(dx: number, dy: number): void {
        this._activateViewport();
        this._setViewport(panViewport(this.viewport, dx, dy));
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
        this._setViewport(zoomViewport(this.viewport, scale, anchor ?? this._viewportCentre()));
    }

    /**
     * Centres one node in the viewport at the current zoom level.
     *
     * @param nodeId - Id of a node in the open mind map.
     * @throws {@link JsMindError} When no map is open, or the id is not in it.
     */
    centerOn(nodeId: string): void {
        const mind = this.mind;
        if (!mind) {
            throw new JsMindError('No mind map is currently open');
        }
        // `_nodes` is a plain object, so `_nodes['constructor']` is the
        // `Object.prototype` member rather than a node: the lookup succeeds and
        // the failure then surfaces as a `TypeError` from reading `layout` off
        // a function. Asking the object whether it owns the key is what keeps
        // an id that only exists on the prototype outside the map.
        const node = Object.prototype.hasOwnProperty.call(mind._nodes, nodeId)
            ? mind._nodes[nodeId]
            : undefined;
        if (!node) {
            throw new JsMindError(`Node '${nodeId}' is not in the open mind map`);
        }
        this._activateViewport();
        // The node's own box, in map space: the layout point is its top-left
        // corner, and the recorded size is its extent from there.
        const layoutPoint = this.arranger.calculateNodePoint(node).offset(this.viewOffset);
        const size = node._data.layout.size;
        const focus = new JmPoint(layoutPoint.x + size.width / 2, layoutPoint.y + size.height / 2);
        const origin = viewportOriginFor(focus, this._viewportCentre(), this.viewport.scale);
        this._setViewport({ x: origin.x, y: origin.y, scale: this.viewport.scale });
    }

    /**
     * Reads the current viewport.
     *
     * @remarks
     * `x`/`y` name the map-space point at the viewport's top-left corner, and
     * that has to mean the same thing before and after the first command: while
     * native scrolling is in charge the displacement is the scroll offset, and
     * a reader who scrolled the map and then read the viewport would otherwise
     * be told the map is still at its origin.
     *
     * The scroll term is divided by the zoom for the same reason it is added at
     * activation: scrolling happens in the element's own untransformed space,
     * and the transform then scales it along with the content.
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
     * Zooms out until the whole map is visible and centres it.
     *
     * @remarks
     * The map is laid out centred in the content box (see `_updateViewSize`),
     * so the content box's middle is the map's middle: focusing on it centres
     * the map whether the map is larger than the viewport or smaller.
     *
     * The box is taken over *before* its size is read. While native scrolling is
     * in charge, classic scrollbars occupy part of the box, and the fit would
     * then be computed against a box that is narrower than the one the fit
     * itself creates - a slightly-too-small scale, and a different one from the
     * fit a reader gets on the next gesture. Same command, same answer.
     */
    fitToView(): void {
        this._activateViewport();
        const viewportSize = this._viewportSize();
        const scale = fitViewportScale(this.contentSize, viewportSize);
        const focus = new JmPoint(this.viewSize.width / 2, this.viewSize.height / 2);
        const anchor = { x: viewportSize.width / 2, y: viewportSize.height / 2 };
        const origin = viewportOriginFor(focus, anchor, scale);
        this._setViewport({ x: origin.x, y: origin.y, scale });
    }

    /**
     * Stores a viewport state and pushes it onto the rendered tree.
     *
     * @param transform - State to apply.
     */
    private _setViewport(transform: JmViewportTransform): void {
        this.viewport.x = transform.x;
        this.viewport.y = transform.y;
        this.viewport.scale = transform.scale;
        this._applyViewport();
    }

    /**
     * Takes the inner box over from native scrolling, once.
     *
     * @remarks
     * A transform moves content without extending the scrollable area, so with
     * both in charge a drag would move the map and a scrollbar would move it
     * again. Done before any size is read, because the scrollbars it removes
     * were occupying the box the size is read from.
     *
     * Whatever the reader had already scrolled to becomes part of the state
     * before the scrollbars go: a scroll offset and a viewport origin describe
     * the same displacement, so folding one into the other is what keeps the
     * picture from jumping at the moment the transform takes over. Scrolling
     * happens in the element's own space and the transform then scales that
     * space, which is why the offset is divided by the zoom.
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
        element.style.overflow = 'hidden';
    }

    /**
     * Writes the viewport state onto the inner box.
     *
     * @remarks
     * The transform lives on the inner box rather than on a wrapper of its own,
     * for two reasons. The boxes are already there - the content is positioned
     * inside it - and `export.ts` resets `transform` on the box it clones, which
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
        this.contentSize.width = minWidth;
        this.contentSize.height = minHeight;
        this.viewSize.width = Math.max(this.innerContainer.clientWidth, minWidth);
        this.viewSize.height = Math.max(this.innerContainer.clientHeight, minHeight);

        const centerOffset = mindBounds.center;
        this.viewOffset.x = this.viewSize.width / 2 - centerOffset.x;
        this.viewOffset.y = this.viewSize.height / 2 - centerOffset.y;
    }
}
