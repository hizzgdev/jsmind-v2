/**
 * Viewport arithmetic: where the map sits under the view's transform, and what
 * a gesture does to it.
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
 *   of the visible box, i.e. the same box scaled and translated.
 *
 * `x`/`y` name the map-space point shown at the viewport's top-left corner, so
 * they read like a scroll offset: panning the map to the right decreases `x`.
 *
 * @packageDocumentation
 */

import type { JmSize } from '../common/index.ts';
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
 * @param scale - Requested factor. Anything that is not a finite number
 * (a `NaN` from a division by an unmeasured size, an `Infinity` from a wheel
 * delta of 0) falls back to 1 rather than poisoning the transform.
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
 * The zoom factor at which the whole content fits inside the viewport.
 *
 * @remarks
 * Never magnifies: a map smaller than the box is shown at 1, because blowing it
 * up to fill the box would make the same document render at a different size
 * depending on the window. Shrinking is only ever done to make content that
 * would otherwise be cropped reachable.
 *
 * @param content - Size of the content to fit, including its padding, in map
 * pixels.
 * @param viewport - Size of the visible box in viewport pixels.
 * @returns A factor from {@link JmViewportScaleRange}, or 1 when either size is
 * not measurable yet.
 *
 * @private
 */
export function fitViewportScale(content: JmSize, viewport: JmSize): number {
    if (content.width <= 0 || content.height <= 0 || viewport.width <= 0 || viewport.height <= 0) {
        return 1;
    }
    return clampViewportScale(
        Math.min(1, viewport.width / content.width, viewport.height / content.height)
    );
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
 * The single piece of arithmetic behind both "centre this" and "keep the map
 * still under the cursor while it zooms": `centerOn`, `fitToView` and the wheel
 * handler differ only in which focus point and which anchor they pass.
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
 * Moves the viewport by a distance in viewport pixels.
 *
 * @param transform - Current viewport state.
 * @param deltaX - Pixels to move the map right. Negative moves it left.
 * @param deltaY - Pixels to move the map down.
 * @returns The new state; the zoom factor is untouched.
 *
 * @private
 */
export function panViewport(
    transform: JmViewportTransform,
    deltaX: number,
    deltaY: number
): JmViewportTransform {
    return {
        x: transform.x - deltaX / transform.scale,
        y: transform.y - deltaY / transform.scale,
        scale: transform.scale,
    };
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
 * fixed for the same reason (`transform-origin: 0 0` in the stylesheet caller).
 *
 * Identity comes back as `none` rather than as `translate(0px, 0px) scale(1)`:
 * every view that never asked for a viewport then carries no transform at all,
 * which is the layout it had before viewports existed.
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
