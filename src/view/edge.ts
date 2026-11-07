import type { JmElement } from '../common/dom.ts';
import type { JmPoint, JmSize } from '../common/index.ts';
import type { JmNode } from '../model/data/node.ts';
import { JmLineCurve, JmLinePattern } from '../model/data/style.ts';

/**
 * A line style with every field resolved.
 *
 * @remarks
 * `drawLine` takes a fully determined style rather than a partial one, so the
 * question of where each value comes from — node override, tone, theme — is
 * answered once, by the caller, and not re-derived per line.
 *
 * @public
 */
export interface JmResolvedLineStyle {
    /** Stroke color. */
    color: string;
    /** Stroke width in pixels. */
    width: number;
    /** Dash pattern. */
    pattern: JmLinePattern;
    /** Path shape. */
    curve: JmLineCurve;
}

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

    drawLine(node: JmNode, sourcePoint: JmPoint, targetPoint: JmPoint, style: JmResolvedLineStyle): void {
        let line = node._data.view.leadingLine;
        if(!line) {
            line = this._createLine();
            node._data.view.leadingLine = line;
        }
        line.setAttribute('d', this._buildPath(sourcePoint, targetPoint, style.curve));
        // Written on every draw, not just at creation: the element outlives
        // redraws, and a node can change tone while its line stays the same
        // element.
        line.setAttribute('stroke', style.color);
        line.setAttribute('stroke-width', String(style.width));
        const dash = this._dashPattern(style);
        if(dash) {
            line.setAttribute('stroke-dasharray', dash);
        }else{
            // Removing the attribute is what makes a line solid. Leaving it set
            // would keep an element dashed after its style went back to solid.
            line.removeAttribute('stroke-dasharray');
        }
        line.style.visibility = 'visible';
    }

    eraseLine(node: JmNode): void {
        const line = node._data.view.leadingLine;
        if(!!line) {
            line.style.visibility = 'hidden';
            line.setAttribute('d', 'M 0 0 L 0 0');
        }
    }

    /**
     * Builds the path data for one line.
     *
     * @remarks
     * The bezier puts both control points on the horizontal midpoint, so the
     * line leaves the source and enters the target along the horizontal axis and
     * the bend stays symmetric. v1 used `x1 + 2*(x2-x1)/3` for the first control
     * point and the untouched `x1` for the second, which drags the bulge towards
     * the source and reads as lopsided once the vertical span is large.
     */
    private _buildPath(source: JmPoint, target: JmPoint, curve: JmLineCurve): string {
        if(curve === JmLineCurve.Straight) {
            return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
        }
        const midX = (source.x + target.x) / 2;
        return `M ${source.x} ${source.y} C ${midX} ${source.y}, ${midX} ${target.y}, ${target.x} ${target.y}`;
    }

    /**
     * Turns a dash pattern into an SVG `stroke-dasharray` value.
     *
     * @returns The dash array, or `null` for a solid line.
     *
     * @remarks
     * Dash lengths scale with the stroke width so a thicker line keeps the same
     * rhythm instead of collapsing into near-solid strokes.
     */
    private _dashPattern(style: JmResolvedLineStyle): string | null {
        switch(style.pattern) {
            case JmLinePattern.Dashed:
                return `${style.width * 4} ${style.width * 3}`;
            case JmLinePattern.Dotted:
                return `${style.width} ${style.width * 2}`;
            case JmLinePattern.Solid:
            default:
                return null;
        }
    }

    private _createLine(): SVGPathElement {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        line.setAttribute('fill', 'transparent');
        line.setAttribute('d', 'M 0 0 L 0 0');
        line.style.visibility = 'hidden';
        this.container.appendChild(line);
        return line;
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
