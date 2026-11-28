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

import { JmPoint, type JmSize } from '../common/index.ts';
import type { JmFitToViewMode, JmViewportAnchor } from './handle.ts';

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
 * The map-space rectangle a pan has to leave reachable.
 *
 * @remarks
 * In map pixels, so a limit and an origin can be compared without converting
 * either of them first. The map is drawn centred in the view's canvas, which is
 * why the caller has to work the corners out: the renderer knows where it put
 * the content, and nothing else does.
 *
 * @private
 */
export interface JmViewportBounds {
    /** Map-space x of the content's left edge. */
    left: number;
    /** Map-space y of the content's top edge. */
    top: number;
    /** Content width in map pixels. */
    width: number;
    /** Content height in map pixels. */
    height: number;
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
 * Changes the zoom factor while keeping one point still, where that is possible.
 *
 * @remarks
 * The anchor is what the gesture asked for. What a zoom may overwrite is the
 * state the pan machinery cannot correct, and that is one axis rule:
 *
 * - **The factor does not change** (`next === transform.scale`): every point is
 *   already still, so the state it found - origin included - is the state it
 *   writes. A host that asks for the factor in effect must not see the map
 *   move. Taking the box over is no longer one of those callers: the
 *   construction mode owns that now (`takeOverViewport()` on the view), so this
 *   branch is here for the caller, not for the takeover.
 * - **The content overflows the box** (`span > 0`): the anchored origin is
 *   stored as it is. That is what makes a wheel zoom grab the map under the
 *   pointer, and the band belongs to the pan: it says where a drag may stop,
 *   not where a zoom must land. An origin the anchor pushed out of
 *   `[contentStart, contentStart + span]` is one {@link panViewportTo} brings
 *   back, so it is recoverable and not this bug.
 * - **The content fits** (`span <= 0`): the band is empty, and a pan keeps
 *   whatever origin it finds because there is nowhere to clamp into. The
 *   anchored origin is dropped here: an anchor away from the content divides
 *   by the new zoom and pushes the origin far past the content, which is the
 *   state #274 reports - a map that fits, sits off its own screen, and no
 *   command can move. The middle is the one origin that is legal at this
 *   factor, so it is written instead.
 * - **The content has not been measured** (`contentSize <= 0`): there is no
 *   band and no middle, so the anchored origin stands. That is the state
 *   before the first render, and a zoom there must not displace the map opened
 *   afterwards.
 *
 * So the held point is a promise on an axis that still overflows, and the
 * fitting axis is answered with the middle instead: after a zoom that changes
 * the factor, `canPan === false` on an axis means that axis is centred, so
 * "the map fits" and "the map is off the screen" can no longer both be true of
 * a state a zoom wrote. A zoom that writes no new factor writes no new origin
 * either, which is the state the first rule leaves alone.
 *
 * @param transform - Current viewport state.
 * @param scale - Requested factor, clamped by {@link clampViewportScale}.
 * @param anchor - Viewport-space point to hold still, normally the pointer.
 * @param bounds - Content rectangle the origin has to stay reachable in.
 * @param viewport - Visible size, in viewport pixels.
 * @returns The new state, with each axis anchored or centred.
 *
 * @private
 */
export function zoomViewport(
    transform: JmViewportTransform,
    scale: number,
    anchor: JmViewportAnchor,
    bounds: JmViewportBounds,
    viewport: JmSize
): JmViewportTransform {
    const next = clampViewportScale(scale);
    // A zoom to the factor already in effect holds every point where it is, so
    // the origin it writes is the one it found. Nothing is settled here: there
    // is no new factor to settle against, and a caller that asks for the factor
    // in effect must not see the map move. Taking the box over no longer runs
    // through here - the construction mode does it - but a host's own
    // `zoomTo(getViewport().scale)` still has to be a no-op. The stranded state
    // this function closes cannot be built by this branch either: it takes a
    // change of factor to push an origin past the content, and every such
    // change is settled below.
    if (next === transform.scale) {
        return { x: transform.x, y: transform.y, scale: next };
    }
    const focus = viewportPointAt(transform, anchor);
    const origin = viewportOriginFor(focus, anchor, next);
    return {
        x: settleZoomAxis(origin.x, bounds.left, bounds.width, viewport.width, next),
        y: settleZoomAxis(origin.y, bounds.top, bounds.height, viewport.height, next),
        scale: next,
    };
}

/**
 * Where one axis of the origin goes after a zoom.
 *
 * @remarks
 * {@link clampViewportAxis} answers "where may a pan stop", and on an empty
 * band its answer is "nowhere": dropping the candidate is right for a gesture
 * into a band that is not there, and wrong right after a zoom, because the
 * zoom is what closed the band - the candidate is the origin the zoom has just
 * pushed out, and dropping it leaves the map there with nothing able to bring
 * it back. So the fitting case is answered here with the middle, the one
 * origin that is legal at every factor.
 *
 * While the content overflows the band exists, but it is not this function's
 * to enforce: clamping here would take the anchor away from a wheel gesture,
 * and an origin that was outside the band before the zoom - an exported page
 * opens at identity with its content inset from the box - would jump on the
 * first notch. A zoom that lands outside the band is still a state a drag can
 * leave, so the anchored origin stands. The one candidate not let through is a
 * non-finite one, since a single `NaN` leaves every node unpainted with no
 * error pointing at the cause; the middle stands in for it, the same fallback
 * {@link clampViewportScale} makes for the factor itself.
 *
 * A content rectangle that was never measured (`contentSize <= 0`, before the
 * first render) is answered with neither rule: it has no band and no middle
 * worth writing, so the anchored origin stands exactly as it did before this
 * rule existed. That matters because `zoomTo` has no "is a map open" guard -
 * the view is asked to zoom on an empty box, and an origin derived from a
 * zero-sized rectangle would then displace the first map opened afterwards.
 *
 * @param candidate - Origin the anchor asks for.
 * @param contentStart - Content's near edge, in map pixels.
 * @param contentSize - Content's extent on this axis, in map pixels.
 * @param viewportSize - Visible extent on this axis, in viewport pixels.
 * @param scale - Zoom factor, which turns viewport pixels into map pixels.
 * @returns The value to store: the anchored origin, or the middle where it
 * fits.
 *
 * @private
 */
function settleZoomAxis(
    candidate: number,
    contentStart: number,
    contentSize: number,
    viewportSize: number,
    scale: number
): number {
    if (!(contentSize > 0)) {
        return candidate;
    }
    const span = panSpan(contentSize, viewportSize, scale);
    const centre = contentStart + span / 2;
    if (span > 0) {
        return Number.isFinite(candidate) ? candidate : centre;
    }
    return Number.isFinite(centre) ? centre : candidate;
}

/**
 * How far the origin may travel on one axis, in map pixels.
 *
 * @remarks
 * The content's extent minus what the viewport covers at this zoom: positive
 * while the content overflows, zero when it exactly fills, negative when it
 * leaves empty canvas showing. It is one expression, shared by the clamp that
 * uses it and by {@link viewportCanPan} that reports it, so "the band is empty"
 * cannot come to mean two different things.
 *
 * @param contentSize - Content's extent on this axis, in map pixels.
 * @param viewportSize - Visible extent on this axis, in viewport pixels.
 * @param scale - Zoom factor, which turns viewport pixels into map pixels.
 * @returns The travel available, in map pixels.
 *
 * @private
 */
function panSpan(contentSize: number, viewportSize: number, scale: number): number {
    return contentSize - viewportSize / scale;
}

/**
 * Whether a pan would move the map at a given zoom.
 *
 * @remarks
 * True while the content overflows the viewport on at least one axis, which is
 * exactly when {@link panViewportTo} is allowed to write a new origin. The
 * caller that needs this is one deciding *before* a gesture begins: a browser
 * settles `touch-action` before the first touchmove, so a handler that claimed
 * or released the gesture after the fact would be too late. Asking here keeps
 * that decision on the same arithmetic the pan itself uses - measuring the
 * content outside the view would fork the layout from it.
 *
 * @param bounds - Content rectangle, in map pixels.
 * @param viewport - Visible size, in viewport pixels.
 * @param scale - Zoom factor.
 * @returns Whether the origin has anywhere to go.
 *
 * @private
 */
export function viewportCanPan(bounds: JmViewportBounds, viewport: JmSize, scale: number): boolean {
    return panSpan(bounds.width, viewport.width, scale) > 0 || panSpan(bounds.height, viewport.height, scale) > 0;
}

/**
 * The state that fits the content to the viewport, in the directions the caller
 * allows, centred.
 *
 * @remarks
 * The zoom is the largest factor at which both of the content's axes fit,
 * clamped to {@link JmViewportScaleRange}. With no mode the map's own size is
 * no bound at all: a map too large for the box is scaled down until it fits and
 * one too small is scaled up until it fills the box. `'shrink'` and `'expand'`
 * name one of those two courses and leave the other state at 1x - `'shrink'`
 * never goes above the natural size, `'expand'` never below it. The origin is
 * then the one {@link viewportOriginFor} gives for putting the content's middle
 * in the middle of the box, whichever mode was asked for. Every mode recentres,
 * so none of them keeps the part of the map the reader was looking at.
 *
 * Deliberately independent of the current state: two calls on the same content,
 * box and mode return the same numbers, which is what makes `fitToView`
 * idempotent. Nothing here clamps the origin to the pan band - at an exactly
 * fitting zoom that band is empty (`span == 0` on a binding axis, `span < 0` on
 * the other) and a clamp with nothing to clamp into keeps the origin it had,
 * i.e. leaves the map wherever it happened to be. So this writes the middle
 * instead of going through the pan's clamp.
 *
 * @param bounds - Content rectangle, in map pixels.
 * @param viewport - Visible size, in viewport pixels.
 * @param mode - Which side of the map's natural size the zoom may not cross, or
 * omitted to correct both directions.
 * @returns The state to adopt.
 *
 * @private
 */
export function fitViewport(bounds: JmViewportBounds, viewport: JmSize, mode?: JmFitToViewMode): JmViewportTransform {
    const fitting = Math.min(viewport.width / bounds.width, viewport.height / bounds.height);
    // The natural size is only a bound where the caller asked for one: without
    // a mode the fitting factor itself is the answer, whichever side of 1 it
    // lands on.
    const bounded = mode === 'expand' ? Math.max(1, fitting) : mode === 'shrink' ? Math.min(1, fitting) : fitting;
    const scale = clampViewportScale(bounded);
    const centre = new JmPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    const origin = viewportOriginFor(centre, { x: viewport.width / 2, y: viewport.height / 2 }, scale);
    return { x: origin.x, y: origin.y, scale };
}

/**
 * Clamps one axis of the origin into the band that keeps the content reachable.
 *
 * @remarks
 * The band's near end shows the content's near edge against the viewport's near
 * edge, and its far end shows the content's far edge against the far edge; in
 * between, the viewport is all content. Past either end the reader would be
 * looking at empty canvas, which is the state this exists to prevent.
 *
 * Two candidates are dropped rather than clamped, both for the same reason -
 * they have no sensible clamped value:
 *
 * - **`span <= 0`**: the content is smaller than the viewport at this zoom, so
 *   the band is empty. Clamping into an empty band would mean a reversed
 *   interval, and picking one end of it would throw the map off the screen; a
 *   map that already fits has nothing to pan to. A zoom does not leave the
 *   origin there, though - it writes the middle, because on a fitting axis
 *   that is the only legal origin (see {@link settleZoomAxis}).
 * - **A non-finite candidate**: a pointer delta can be `NaN` (a `0/0` from a
 *   box that was not measured), and one `NaN` in the origin leaves every node
 *   unpainted with no error pointing at the cause. Same fallback as
 *   {@link clampViewportScale}.
 *
 * @param origin - Current value on this axis, kept when the candidate is
 * dropped.
 * @param candidate - Proposed value.
 * @param contentStart - Content's near edge, in map pixels.
 * @param contentSize - Content's extent on this axis, in map pixels.
 * @param viewportSize - Visible extent on this axis, in viewport pixels.
 * @param scale - Zoom factor, which turns viewport pixels into map pixels.
 * @returns The value to store.
 *
 * @private
 */
function clampViewportAxis(
    origin: number,
    candidate: number,
    contentStart: number,
    contentSize: number,
    viewportSize: number,
    scale: number
): number {
    if (!Number.isFinite(candidate)) {
        return origin;
    }
    const span = panSpan(contentSize, viewportSize, scale);
    if (!(span > 0)) {
        return origin;
    }
    return Math.min(contentStart + span, Math.max(contentStart, candidate));
}

/**
 * Moves the origin to a requested map-space point, clamped.
 *
 * @param transform - Current viewport state.
 * @param target - Map-space point to show at the viewport's top-left corner.
 * @param bounds - Content rectangle the origin has to stay inside.
 * @param viewport - Visible size, in viewport pixels.
 * @returns The new state.
 *
 * @private
 */
export function panViewportTo(
    transform: JmViewportTransform,
    target: JmPoint,
    bounds: JmViewportBounds,
    viewport: JmSize
): JmViewportTransform {
    return {
        x: clampViewportAxis(transform.x, target.x, bounds.left, bounds.width, viewport.width, transform.scale),
        y: clampViewportAxis(transform.y, target.y, bounds.top, bounds.height, viewport.height, transform.scale),
        scale: transform.scale,
    };
}

/**
 * Moves the origin by a gesture, in viewport pixels.
 *
 * @remarks
 * A pointer reports how far it travelled on screen, not in the map, so the
 * division by the zoom happens here: dragging by 100px at 2x uncovers 50 map
 * pixels. Moving the map to the right means showing map points further left,
 * hence the subtraction - `x` reads like a scroll offset.
 *
 * Drags and absolute moves share {@link panViewportTo}'s clamp, so a gesture can
 * never take the map somewhere a command could not.
 *
 * @param transform - Current viewport state.
 * @param dx - Pointer travel on the x axis, in viewport pixels.
 * @param dy - Pointer travel on the y axis, in viewport pixels.
 * @param bounds - Content rectangle the origin has to stay inside.
 * @param viewport - Visible size, in viewport pixels.
 * @returns The new state.
 *
 * @private
 */
export function panViewport(
    transform: JmViewportTransform,
    dx: number,
    dy: number,
    bounds: JmViewportBounds,
    viewport: JmSize
): JmViewportTransform {
    const target = new JmPoint(transform.x - dx / transform.scale, transform.y - dy / transform.scale);
    return panViewportTo(transform, target, bounds, viewport);
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
