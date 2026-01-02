import type { JmElement } from '../common/dom.ts';
import type { JmPoint, JmSize } from '../common/index.ts';
import type { JmNode } from '../model/node.ts';

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
    constructor(innerContainer: JmElement) {
        this.container = this._initEdgesContainer(innerContainer);
    }

    updateEdgeViewsSize(viewSize: JmSize): void {
        this.container.style.width = `${viewSize.width}px`;
        this.container.style.height = `${viewSize.height}px`;
    }

    drawLine(node: JmNode, sourcePoint: JmPoint, targetPoint: JmPoint, color: string): void {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', '1');
        line.setAttribute('fill', 'transparent');
        this.container.appendChild(line);
        const x1 = sourcePoint.x;
        const y1 = sourcePoint.y;
        const x2 = targetPoint.x;
        const y2 = targetPoint.y;
        line.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2);
        node._data.view.leadingLine = line;
    }

    eraseLine(node: JmNode): void {
        console.log('eraseLine', node.id);
        const line = node._data.view.leadingLine;
        if(!!line) {
            this.container.removeChild(line);
        }
    }

    /**
     * Initializes the edges container element (SVG).
     *
     * @param innerContainer - The inner container element.
     * @returns The created edges container element.
     */
    private _initEdgesContainer(innerContainer: JmElement): SVGSVGElement {
        const element = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        element.classList.add('jsmind-edges');
        innerContainer.appendChild(element);
        element.style.width = `${innerContainer.clientWidth}px`;
        element.style.height = `${innerContainer.clientHeight}px`;
        return element;
    }

    private _clearEdges(): void {
    }
}

