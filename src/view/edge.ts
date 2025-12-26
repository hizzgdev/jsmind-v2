import { type JmEdge } from '../model/jsmind.edge.ts';

/**
 * View operator for edges.
 * Handles rendering and manipulation of edge elements in the view.
 *
 * @public
 */
export class JmEdgeView {
    /** The container element for edges (SVG). */
    readonly container: SVGSVGElement;

    /**
     * Creates a new edge view operator.
     *
     * @param innerContainer - The inner container element to append the edges container to.
     */
    constructor(innerContainer: HTMLElement) {
        this.container = this._initEdgesContainer(innerContainer);
    }

    /**
     * Initializes the edges container element (SVG).
     *
     * @param innerContainer - The inner container element.
     * @returns The created edges container element.
     */
    private _initEdgesContainer(innerContainer: HTMLElement): SVGSVGElement {
        const element = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        element.classList.add('jsmind-edges');
        innerContainer.appendChild(element);
        return element;
    }

    async renderEdge(edge: JmEdge): Promise<void> {
        const element = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        element.classList.add('jsmind-edge');
        element.setAttribute('d', `M ${edge.sourceNodeId} ${edge.targetNodeId}`);
        this.container.appendChild(element);
    }
}

