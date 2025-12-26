import { type JmNode } from '../model/jsmind.node.ts';
import { type JmMind } from '../model/jsmind.mind.ts';
import { type JmMindEvent } from '../event/jsmind.mind.event.ts';
import { JmSize } from '../jsmind.data.ts';
import { JsMindError } from '../jsmind.error.ts';
import { ViewOptions } from '../jsmind.const.ts';
import { JmNodeView } from './node.ts';
import { JmEdgeView } from './edge.ts';
import { JmEdge } from '../model/jsmind.edge.ts';

/**
 * View of mind map.
 * @public
 */
export class JmView {
    private readonly container: HTMLElement;
    private readonly innerContainer: HTMLElement;
    readonly nodeView: JmNodeView;
    readonly edgeView: JmEdgeView;
    
    constructor(container: string | HTMLElement, options: ViewOptions) {
        this.container = this._initContainer(container);
        this.innerContainer = this._initInnerContainer();
        this.nodeView = new JmNodeView(this.innerContainer);
        this.edgeView = new JmEdgeView(this.innerContainer);
    }

    private _initContainer(container: string | HTMLElement): HTMLElement {
        if (!container) {
            throw new JsMindError('Container is required');
        }
        if (typeof container === 'string') {
            const element = document.getElementById(container);
            if (!element) {
                throw new JsMindError(`Container element with ID '${container}' is not found`);
            }
            return element;
        }
        return container;
    }

    private _initInnerContainer(): HTMLElement {
        const element = document.createElement('div');
        element.classList.add('jsmind-inner');
        this.container.appendChild(element);
        return element;
    }

    async render(mind: JmMind): Promise<void> {
        console.log('JmView.render', mind);
        for (const nodeId in mind._nodes) {
            await this.nodeView.renderNode(mind._nodes[nodeId]);
        }
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

