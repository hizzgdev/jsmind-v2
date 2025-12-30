import { type JmMind } from '../model/jsmind.mind.ts';
import { type JmMindEvent } from '../event/index.ts';
import { JsMindError } from '../common/error.ts';
import { type ViewOptions } from '../common/option.ts';
import { JmNodeView } from './node.ts';
import { JmEdgeView } from './edge.ts';
import { ensureElementVisible, JmDomUtility, JmElement } from '../common/dom.ts';
import type { JmNode } from '../model/node.ts';
import type { JmSize } from '../common/index.ts';

/**
 * View of mind map.
 * @public
 */
export class JmView {
    private readonly container: JmElement;

    private readonly innerContainer: JmElement;

    readonly nodeView: JmNodeView;

    readonly edgeView: JmEdgeView;

    private constructor(container: JmElement, innerContainer: JmElement, nodeView: JmNodeView, edgeView: JmEdgeView) {
        this.container = container;
        this.innerContainer = innerContainer;
        this.nodeView = nodeView;
        this.edgeView = edgeView;
    }

    static async create(container: string | HTMLElement, _options: ViewOptions): Promise<JmView> {
        const jmContainer = await this._initContainer(container);
        const innerContainer = this._initInnerContainer(jmContainer);
        const nodeView = new JmNodeView(innerContainer);
        const edgeView = new JmEdgeView(innerContainer);
        return new JmView(jmContainer, innerContainer, nodeView, edgeView);
    }

    private static async _initContainer(container: string | HTMLElement): Promise<JmElement> {
        if (!container) {
            throw new JsMindError('Container is required');
        }
        if (typeof container === 'string') {
            const element = document.getElementById(container);
            if (!element) {
                throw new JsMindError(`Container element with ID '${container}' is not found`);
            }
            await ensureElementVisible(element);
            return new JmElement(element);
        }
        return new JmElement(container);
    }

    private static _initInnerContainer(container: JmElement): JmElement {
        const element = JmDomUtility.createElement('div', 'jsmind-inner');
        element.classList.add('jsmind-inner');
        container.appendChild(element);
        return element;
    }

    async createMindNodes(mind: JmMind): Promise<void> {
        const promises = Object.values(mind._nodes)
            .map((node: JmNode)=>this.nodeView.createNodeView(node));
        await Promise.all(promises);
    }

    async render(mind: JmMind, _changedNodeIds: string[] = []): Promise<void> {
        for (const edgeId in mind._edges) {
            await this.edgeView.renderEdge(mind._edges[edgeId]);
        }
    }

    getSize(node: JmNode): JmSize {
        return this.nodeView.getViewData(node).size;
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

