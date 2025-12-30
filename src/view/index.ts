import { type JmMind } from '../model/jsmind.mind.ts';
import { type JmMindEvent } from '../event/index.ts';
import { JsMindError } from '../common/error.ts';
import { type ViewOptions } from '../common/option.ts';
import { JmNodeView } from './node.ts';
import { JmEdgeView } from './edge.ts';
import { DomUtility, ensureElementVisible } from '../common/dom.ts';
import type { JmNode } from '../model/node.ts';
import { JmPoint, JmSize } from '../common/index.ts';
import type { JmLayout } from '../layout.ts';

/**
 * View of mind map.
 * @public
 */
export class JmView {
    private readonly container: HTMLElement;

    private readonly innerContainer: HTMLElement;

    private readonly nodeView: JmNodeView;

    private readonly edgeView: JmEdgeView;

    private readonly layout: JmLayout;

    private readonly options: ViewOptions;

    private readonly viewSize: JmSize = new JmSize(1, 1);

    private constructor(container: HTMLElement, innerContainer: HTMLElement, nodeView: JmNodeView, edgeView: JmEdgeView, layout: JmLayout, options: ViewOptions) {
        this.container = container;
        this.innerContainer = innerContainer;
        this.nodeView = nodeView;
        this.edgeView = edgeView;
        this.layout = layout;
        this.options = options;
    }

    static async create(container: string | HTMLElement, layout: JmLayout, options: ViewOptions): Promise<JmView> {
        const jmContainer = await this._initContainer(container);
        const innerContainer = this._initInnerContainer(jmContainer);
        const nodeView = new JmNodeView(innerContainer);
        const edgeView = new JmEdgeView(innerContainer);
        return new JmView(jmContainer, innerContainer, nodeView, edgeView, layout, options);
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
            await ensureElementVisible(element);
            return element;
        }
        return container;
    }

    private static _initInnerContainer(container: HTMLElement): HTMLElement {
        const element = DomUtility.createElement('div', 'jsmind-inner');
        element.classList.add('jsmind-inner');
        container.appendChild(element);
        return element;
    }

    async createMindNodes(mind: JmMind): Promise<void> {
        const promises = Object.values(mind._nodes)
            .map((node: JmNode)=>this.nodeView.createNodeView(node));
        await Promise.all(promises);
    }

    async settle(mind: JmMind, _changedNodeIds: string[] = []): Promise<void> {
        this._updateViewSize(mind);
        this.nodeView.updateNodeViewsSize(this.viewSize);
        this._settleNode(mind);
        // this.nodeView.settleNode(mind._root);
        for (const edgeId in mind._edges) {
            await this.edgeView.renderEdge(mind._edges[edgeId]);
        }
    }

    private _settleNode(mind: JmMind): void {
        const viewOffset = this._getViewOffset();
        Object.values(mind._nodes).forEach((node: JmNode)=>{
            if(this.layout.isVisible(node)) {
                // reset custom style
                const nodePoint = this.layout.calculateNodePoint(node);
                const absolutePoint = new JmPoint(viewOffset.x + nodePoint.x, viewOffset.y + nodePoint.y);
                this.nodeView.placeNode(node, absolutePoint);
            }else{
                this.nodeView.hideNode(node);
            }
        });
    }

    private _getViewOffset(): JmPoint {
        return new JmPoint(this.viewSize.width / 2, this.viewSize.height / 2);
    }

    private _updateViewSize(mind: JmMind): void {
        const minViewSize = this.layout.calculateBoundingBoxSize(mind);
        const minWidth = minViewSize.width + this.options.padding.left + this.options.padding.right;
        const minHeight = minViewSize.height + this.options.padding.top + this.options.padding.bottom;
        this.viewSize.width = Math.max(this.innerContainer.clientWidth, minWidth);
        this.viewSize.height = Math.max(this.innerContainer.clientHeight, minHeight);
    }

    /**
     * Called when the mind map changes.
     *
     * @param sender - The object that triggered the change.
     * @param event - The event data.
     */
    onMindChanged(sender: JmMind, event: JmMindEvent): void {
        console.log('JmView.onMindChanged', sender, event);
    }
}

