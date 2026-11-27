import type { JmMind } from '../model/mind.ts';
import { JsMindError } from '../common/error.ts';
import type { ViewOptions } from '../common/option.ts';
import { JmNodeView, resolveNodeTone } from './node.ts';
import { JmEdgeView } from './edge.ts';
import { attachViewShadowRoot, applyThemeToHost } from './shadow.ts';
import { resolveJmStyle, JmTone, JmLinePattern, JmLineCurve, JSMIND_THEME_DEFAULT } from '../model/data/style.ts';
import { captureShadowContent, type JmExportImageOptions, type JmExportImageResult } from './export.ts';
import type { JmFitToViewMode, JmViewHandle, JmViewport, JmViewportAnchor } from './handle.ts';
import { viewportCssTransform, panViewport, panViewportTo, viewportOriginFor, zoomViewport, fitViewport, viewportCanPan, type JmViewportBounds, type JmViewportTransform } from './viewport.ts';
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

    /**
     * Where the rendered content sits in map space, for clamping a pan.
     *
     * @remarks
     * The renderer centres the map in the canvas, so these corners are not
     * `(0, 0)` to `viewSize` - they are the map's own bounding box translated by
     * the centring offset. They are kept rather than recomputed because a pan
     * has to clamp against the same rectangle the content was laid out in, and
     * `_updateViewSize` is the only place that knows it.
     */
    private readonly contentBounds: JmViewportBounds = { left: 0, top: 0, width: 0, height: 0 };

    /**
     * The map currently on screen.
     *
     * @remarks
     * Kept because {@link JmView.centerOn} is the one viewport command that
     * names something in the map rather than a place: it needs the node by id,
     * and node ids only exist in the model. Set on every settle, which is what
     * the coordinator runs on open and after a change, so what a command reads
     * here is the map and the layout the reader is looking at.
     */
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
     * Repaints the nodes whose style changed, in one pass, and records their
     * new sizes.
     *
     * @remarks
     * Batched rather than repainted one node at a time for the same reason
     * `measureNodeSizes` batches its measurements: a measurement resolves on the
     * next animation frame, so awaiting one node at a time paints a restyled map
     * one node per frame - visible as colours crawling across the map, and as a
     * map laid out to the old sizes until the last node lands.
     *
     * The whole batch sits inside a single {@link _whileUnscaled}. Each
     * `JmNodeView.refreshNodeStyle` has to measure unscaled, and letting every
     * node open its own unscaled window would restore the viewport transform as
     * soon as the first one finished, leaving the rest measuring at the zoomed
     * scale.
     *
     * The sizes are recorded because the layout is computed from them, and a
     * style is allowed to change the box.
     *
     * @param nodes - The nodes to repaint.
     */
    async refreshNodesStyle(nodes: JmNode[]): Promise<void> {
        if (nodes.length === 0) {
            return;
        }
        await this._whileUnscaled(async () => {
            const sizes = await Promise.all(nodes.map((node: JmNode)=>this.nodeView.refreshNodeStyle(node)));
            nodes.forEach((node: JmNode, index: number)=>this.arranger.recordNodeSize(node, sizes[index]));
        });
    }

    /**
     * Removes everything rendered for a mind map and forgets it.
     *
     * @remarks
     * Called when a map leaves this view - closed, or replaced by another one.
     * Both halves matter: the elements so nothing of the old map stays painted,
     * and the per-node cache so the map can be rendered here again. A node that
     * kept its cached element and size would be measured to its old dimensions
     * and never appended, which reads as a map that renders nothing.
     *
     * Walked over the model, so a node already removed from the map is not
     * reached: {@link releaseNode} is what takes those off the canvas, at the
     * moment the model reports them gone.
     *
     * @param mind - The map whose rendering should go.
     */
    clear(mind: JmMind): void {
        Object.values(mind._nodes).forEach((node: JmNode)=>this._releaseNode(node));
    }

    /**
     * Removes a node and its whole subtree from the rendered tree, and forgets
     * them.
     *
     * @remarks
     * For a node that left the model. `clear` cannot do this job: it walks the
     * model, and a removed node is no longer in it, so nothing would ever reach
     * the elements painted for it - a node deleted while the map is open would
     * stay on the canvas, and would still be there when another map is opened
     * over it.
     *
     * The subtree goes too because the model removes descendants with their
     * parent, and the parent link is what the event still carries.
     *
     * @param node - The removed node, root of the subtree to release.
     */
    releaseNode(node: JmNode): void {
        this._releaseNode(node);
        node.children.forEach((child: JmNode)=>this.releaseNode(child));
    }

    /**
     * Removes one node's element and line, and drops its cached element.
     *
     * @param node - Node whose rendering should go.
     *
     * @private
     */
    private _releaseNode(node: JmNode): void {
        this.nodeView.releaseNode(node);
        this.edgeView.releaseLine(node);
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
            canPan: viewportCanPan(this.contentBounds, size, this.viewport.scale),
        };
    }

    /**
     * Puts a map-space point at the viewport's top-left corner.
     *
     * @remarks
     * The box is taken over first, exactly as a zoom does: while native
     * scrolling is still in charge, a transform written here would move the map
     * on top of the scroll offset, and the handover would then fold that offset
     * into the origin again - two moves for one command.
     *
     * @param x - Map-space x to show at the left edge.
     * @param y - Map-space y to show at the top edge.
     */
    panTo(x: number, y: number): void {
        this._activateViewport();
        this._setViewport(panViewportTo(this.viewport, new JmPoint(x, y), this.contentBounds, this._viewportSize()));
    }

    /**
     * Moves the viewport by a drag, in viewport pixels.
     *
     * @param dx - Horizontal travel in viewport pixels.
     * @param dy - Vertical travel in viewport pixels.
     */
    panBy(dx: number, dy: number): void {
        this._activateViewport();
        this._setViewport(panViewport(this.viewport, dx, dy, this.contentBounds, this._viewportSize()));
    }

    /**
     * Moves the map so that one node's centre sits in the middle of the
     * viewport, leaving the zoom alone.
     *
     * @remarks
     * The node's box lives in two spaces that differ by `viewOffset`: the
     * arranger gives its corner in layout space, and what the viewport's
     * `x`/`y` are written against - the same space the renderer puts in
     * `style.left/top` - is that plus the centring offset. Without the offset
     * the map misses the middle by however far the content's own centre has
     * been shifted, which is hundreds of pixels on a wide map.
     *
     * The box is taken over before the middle is measured, not after: the
     * handover removes the scrollbars, they are part of the box's width, and a
     * centre read with them still there would come out half a scrollbar away
     * from the one the origin is measured against.
     *
     * The origin then goes through {@link JmView.panTo}, so it is clamped to the
     * content exactly as a pan is: an edge node stops short of the middle rather
     * than pulling empty canvas into view, and a map that fits its box does not
     * move at all.
     *
     * @param nodeId - Id of a node in the open mind map.
     */
    centerOn(nodeId: string): void {
        const mind = this.mind;
        if (!mind) {
            throw new JsMindError('No mind map is currently open');
        }
        // `_nodes` is a plain object, so `_nodes['constructor']` answers with
        // `Object.prototype.constructor` rather than `undefined`: the lookup
        // succeeds and the failure surfaces later as a `TypeError` from reading
        // `layout` off a function. Asking the object whether it owns the key is
        // what keeps an id that only exists on the prototype outside the map.
        const node = Object.prototype.hasOwnProperty.call(mind._nodes, nodeId) ? mind._nodes[nodeId] : undefined;
        if (!node) {
            throw new JsMindError(`Node '${nodeId}' is not in the open mind map`);
        }
        this._activateViewport();
        const corner = this.arranger.calculateNodePoint(node).offset(this.viewOffset);
        const size = node._data.layout.size;
        const focus = new JmPoint(corner.x + size.width / 2, corner.y + size.height / 2);
        const origin = viewportOriginFor(focus, this._viewportCentre(), this.viewport.scale);
        this.panTo(origin.x, origin.y);
    }

    /**
     * Fits the map to the viewport, shrinking, expanding, or both.
     *
     * @remarks
     * Two steps, both composed from the arithmetic beside them: the zoom the
     * mode allows, and the origin that puts the content's middle in the middle
     * of the box.
     *
     * The mode is optional and narrows the fit rather than defining it: with
     * none, a map too large for the box is scaled down and one too small is
     * scaled up, which is what a single "fit" button asks for. `'shrink'` and
     * `'expand'` each name one of those and leave the other state at its
     * natural size.
     *
     * The origin is written rather than handed to {@link JmView.panTo}, and
     * that is the answer the whole design turns on. At exactly-fitting zoom the
     * pan's band is empty - `span == 0` on the binding axis, `span < 0` on the
     * loose one - so `panTo` keeps the origin it had, and `centerOn` (which is
     * built on it) does not move either. A fit composed from `zoomTo` and
     * `centerOn` would therefore leave a map in whatever corner it was dragged
     * to, and no drag could bring it back, because the band stays empty. So
     * this composes the same arithmetic with the clamp left out: there is
     * nothing to clamp into, and the only origin that shows the content the way
     * the mode asks is the one that shows its middle.
     *
     * The box is taken over before anything is measured. On a page whose map
     * overflows, the inner box is showing a scrollbar at that moment and its
     * client size is that much narrower; reading it first would make the first
     * fit slightly smaller than the second fit of the same map - two answers to
     * one command, visible as a small jump the first time the reader fits it
     * again.
     *
     * @param mode - `'shrink'` for a map too large for the box, `'expand'` for
     * one too small. Omit it to correct both directions.
     * @throws {@link JsMindError} When `mode` is given as neither of those two,
     * before the box is touched, so a refused call leaves the view exactly as
     * it was.
     * @throws {@link JsMindError} When this view has not been given a map yet:
     * there is no content to fit, and the scale and origin a zero-sized box
     * produces would shift the first map that is opened afterwards. A closed
     * map is not the same thing - the view keeps the last map it was shown.
     */
    fitToView(mode?: JmFitToViewMode): void {
        if (mode !== undefined && mode !== 'shrink' && mode !== 'expand') {
            throw new JsMindError(`Unknown fit mode '${String(mode)}'; expected 'shrink', 'expand' or no mode`);
        }
        if (this.mind === null) {
            throw new JsMindError('No mind map is currently open');
        }
        this._activateViewport();
        this._setViewport(fitViewport(this.contentBounds, this._viewportSize(), mode));
    }

    /**
     * Stores a computed viewport state and paints it.
     *
     * @param state - State to adopt, already clamped by the arithmetic.
     */
    private _setViewport(state: JmViewportTransform): void {
        this.viewport.x = state.x;
        this.viewport.y = state.y;
        this.viewport.scale = state.scale;
        this._applyViewport();
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

        // The same centring `viewOffset` just applied, read back as a rectangle:
        // the content's middle lands on the canvas's middle, so its corners are
        // half of each size away from it. A pan clamps against this - after the
        // transform takes the inner box over, the box is only as big as the
        // view and nothing else stops the map from being dragged out of it.
        this.contentBounds.left = this.viewSize.width / 2 - mindViewSize.width / 2;
        this.contentBounds.top = this.viewSize.height / 2 - mindViewSize.height / 2;
        this.contentBounds.width = mindViewSize.width;
        this.contentBounds.height = mindViewSize.height;
    }
}
