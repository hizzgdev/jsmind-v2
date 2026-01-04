import { type JmMind } from '../model/mind.ts';
import { JsMindError } from '../common/error.ts';
import { type ViewOptions } from '../common/option.ts';
import { JmNodeView } from './node.ts';
import { JmEdgeView } from './edge.ts';
import { DomUtility, JmDomUtility, JmElement } from '../common/dom.ts';
import type { JmNode } from '../model/node.ts';
import { JmPoint, JmSize } from '../common/index.ts';
import type { Arranger } from '../arranger/index.ts';

/**
 * View of mind map.
 * @public
 */
export class JmView {
    private readonly container: HTMLElement;

    private readonly innerContainer: JmElement;

    private readonly nodeView: JmNodeView;

    private readonly edgeView: JmEdgeView;

    private readonly arranger: Arranger;

    private readonly options: ViewOptions;

    private readonly viewSize: JmSize = new JmSize(1, 1);

    private readonly viewOffset: JmPoint = new JmPoint(0, 0);

    private constructor(container: HTMLElement, innerContainer: JmElement, nodeView: JmNodeView, edgeView: JmEdgeView, arranger: Arranger, options: ViewOptions) {
        this.container = container;
        this.innerContainer = innerContainer;
        this.nodeView = nodeView;
        this.edgeView = edgeView;
        this.arranger = arranger;
        this.options = options;
    }

    static async create(container: string | HTMLElement, arranger: Arranger, options: ViewOptions): Promise<JmView> {
        const jmContainer = await this._initContainer(container);
        const innerContainer = this._initInnerContainer(jmContainer);
        const nodeView = new JmNodeView(innerContainer, options);
        const edgeView = new JmEdgeView(innerContainer);
        return new JmView(jmContainer, innerContainer, nodeView, edgeView, arranger, options);
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

    private static _initInnerContainer(container: HTMLElement): JmElement {
        const jmElement = JmDomUtility.createElement('div', 'jsmind-inner');
        jmElement.classList.add('jsmind-inner');
        container.appendChild(jmElement.element);
        return jmElement;
    }

    async measureNodeSizes(mind: JmMind): Promise<void> {
        const promises = Object.values(mind._nodes)
            .map((node: JmNode)=>this.nodeView.createAndMeasure(node)
                .then((size: JmSize)=>this.arranger.recordNodeSize(node, size)));
        await Promise.all(promises);
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
                    this.edgeView.drawLine(node, absoluteSourcePoint, absoluteTargetPoint, 'black');
                }else{
                    this.edgeView.eraseLine(node);
                }
            });
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

