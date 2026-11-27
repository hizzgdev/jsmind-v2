/**
 * Viewport arithmetic: where the map sits inside the view's box, and what a
 * zoom does to that position.
 *
 * @remarks
 * The map is drawn in its own coordinate space and then moved and scaled as one
 * block, so the whole state is an origin plus a zoom factor. Keeping the
 * arithmetic here, as pure functions of that state, is what makes it testable
 * without a browser - and what keeps the DOM side in `JmView` down to reading a
 * size and writing a `transform`.
 *
 * Two coordinate spaces, named once so no function has to restate them:
 *
 * - **Map space** is the layout space of the rendered tree: CSS pixels with the
 *   origin at the top-left corner of the view's inner box. Node positions are
 *   written in it, and so is the map's own bounding box.
 * - **Viewport space** is screen pixels with the origin at the top-left corner
 *   of the visible box, i.e. those map pixels scaled and translated.
 *
 * `x`/`y` name the map-space point shown at the viewport's top-left corner, so
 * they read like a scroll offset: moving the map to the right decreases `x`.
 *
 * @packageDocumentation
 */

import { JmPoint } from '../common/index.ts';
import type { JmViewportAnchor } from './handle.ts';

/**
 * The zoom range the view accepts.
 *
 * @remarks
 * Bounded on both ends on purpose. Below the minimum a map is a few pixels of
 * noise nobody can find their way back from; above the maximum the node text is
 * a blurred mess and the transform gets big enough to lose precision.
 *
 * @private
 */
export const JmViewportScaleRange = { min: 0.1, max: 4 } as const;

/**
 * The viewport's whole state: the map-space origin and the zoom factor.
 *
 * @private
 */
export interface JmViewportTransform {
    /** Map-space x shown at the viewport's left edge. */
    x: number;
    /** Map-space y shown at the viewport's top edge. */
    y: number;
    /** Zoom factor, 1 being unscaled. */
    scale: number;
}

/**
 * Clamps a requested zoom factor into {@link JmViewportScaleRange}.
 *
 * @remarks
 * A factor that is not a finite number falls back to 1 rather than poisoning
 * the transform: the caller can arrive at one by dividing by a size that was
 * not measured yet, and a `NaN` scale would leave every node unpainted with no
 * error to point at.
 *
 * @param scale - Requested factor.
 * @returns A factor the view will accept.
 *
 * @private
 */
export function clampViewportScale(scale: number): number {
    if (!Number.isFinite(scale)) {
        return 1;
    }
    return Math.min(JmViewportScaleRange.max, Math.max(JmViewportScaleRange.min, scale));
}

/**
 * Reads the map-space point a viewport-space point is showing.
 *
 * @param transform - Current viewport state.
 * @param anchor - Point in viewport pixels, e.g. a pointer position.
 * @returns The map-space point under it.
 *
 * @private
 */
export function viewportPointAt(transform: JmViewportTransform, anchor: JmViewportAnchor): JmPoint {
    return new JmPoint(transform.x + anchor.x / transform.scale, transform.y + anchor.y / transform.scale);
}

/**
 * The origin that puts one map-space point under one viewport-space point.
 *
 * @remarks
 * This is the one piece of arithmetic behind "hold the point under the pointer
 * still while the zoom changes", with the anchor supplied by the caller: the
 * wheel passes the pointer, `zoomTo` without an anchor passes the middle of the
 * box. Which point stays fixed is the caller's decision; mapping a screen point
 * to a map point is the view's.
 *
 * @param focus - Map-space point that should be shown at `anchor`.
 * @param anchor - Where it should be shown, in viewport pixels.
 * @param scale - Zoom factor to apply at the same time.
 * @returns The origin, in map pixels.
 *
 * @private
 */
export function viewportOriginFor(focus: JmPoint, anchor: JmViewportAnchor, scale: number): JmPoint {
    return new JmPoint(focus.x - anchor.x / scale, focus.y - anchor.y / scale);
}

/**
 * Changes the zoom factor while keeping one point still.
 *
 * @param transform - Current viewport state.
 * @param scale - Requested factor, clamped by {@link clampViewportScale}.
 * @param anchor - Viewport-space point to hold still, normally the pointer.
 * @returns The new state.
 *
 * @private
 */
export function zoomViewport(
    transform: JmViewportTransform,
    scale: number,
    anchor: JmViewportAnchor
): JmViewportTransform {
    const next = clampViewportScale(scale);
    const focus = viewportPointAt(transform, anchor);
    const origin = viewportOriginFor(focus, anchor, next);
    return { x: origin.x, y: origin.y, scale: next };
}

/**
 * Formats a viewport state as a CSS `transform`.
 *
 * @remarks
 * `translate` comes first so the scale applies to the map, not to the offset:
 * `translate(-x * s) scale(s)` maps map-space `p` to `s * (p - x)` viewport
 * pixels, which is the definition of the state above. The origin corner is
 * fixed for the same reason (`transform-origin: 0 0` in the caller).
 *
 * Identity comes back as `none` rather than as `translate(0px, 0px) scale(1)`:
 * a view that never asked for a zoom then carries no transform at all, which is
 * the layout it had before the viewport existed.
 *
 * @param transform - State to format.
 * @returns A CSS value for the `transform` property.
 *
 * @private
 */
export function viewportCssTransform(transform: JmViewportTransform): string {
    if (transform.scale === 1 && transform.x === 0 && transform.y === 0) {
        return 'none';
    }
    return `translate(${-transform.x * transform.scale}px, ${-transform.y * transform.scale}px) scale(${transform.scale})`;
}
