import type { JmMind } from '../model/mind.ts';
import { JsMindError } from '../common/error.ts';
import type { ViewOptions } from '../common/option.ts';
import { JmNodeView } from './node.ts';
import { JmEdgeView } from './edge.ts';
import { attachViewShadowRoot, applyThemeToHost } from './shadow.ts';
import { resolveJmStyle, JmTone, JmLinePattern, JmLineCurve, JSMIND_THEME_DEFAULT } from '../model/data/style.ts';
import { captureShadowContent, type JmExportImageOptions, type JmExportImageResult } from './export.ts';
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
export class JmView {
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
        const promises = Object.values(mind._nodes).map((node: JmNode)=>this.measureNodeSize(node));
        await Promise.all(promises);
    }

    async measureNodeSize(node: JmNode): Promise<JmSize> {
        return this.nodeView.createAndMeasure(node)
            .then((size: JmSize)=>{
                this.arranger.recordNodeSize(node, size);
                return size;
            });
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
        const tone = node.style?.tone ?? JmTone.Default;
        // The default palette is the last resort for an unknown or unstyled
        // tone, and it comes from the same constant the theme was built from, so
        // an untoned node never falls through to a colour of its own.
        const palette = theme.tones?.[tone] ?? JSMIND_THEME_DEFAULT.tones?.[JmTone.Default];

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
