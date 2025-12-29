import { type JmMind } from '../model/jsmind.mind.ts';
import { type JmMindEvent } from '../event/index.ts';
import { JsMindError } from '../common/error.ts';
import { type ViewOptions } from '../common/option.ts';
import { JmNodeView } from './node.ts';
import { JmEdgeView } from './edge.ts';
import { JmDomUtility, JmElement } from '../common/dom.ts';
import type { JmNode } from '../model/node.ts';

/**
 * View of mind map.
 * @public
 */
export class JmView {
    private readonly container: JmElement;

    private readonly innerContainer: JmElement;

    readonly nodeView: JmNodeView;

    readonly edgeView: JmEdgeView;

    constructor(container: string | HTMLElement, _options: ViewOptions) {
        this.container = this._initContainer(container);
        this.innerContainer = this._initInnerContainer();
        this.nodeView = new JmNodeView(this.innerContainer);
        this.edgeView = new JmEdgeView(this.innerContainer);
    }

    private _initContainer(container: string | HTMLElement): JmElement {
        if (!container) {
            throw new JsMindError('Container is required');
        }
        if (typeof container === 'string') {
            const element = document.getElementById(container);
            if (!element) {
                throw new JsMindError(`Container element with ID '${container}' is not found`);
            }
            return new JmElement(element);
        }
        return new JmElement(container);
    }

    private _initInnerContainer(): JmElement {
        const element = JmDomUtility.createElement('div', 'jsmind-inner');
        element.classList.add('jsmind-inner');
        this.container.appendChild(element);
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

