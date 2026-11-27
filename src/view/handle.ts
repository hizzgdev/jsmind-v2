/**
 * The view's capabilities, as the application layer sees them.
 *
 * `JsMind` needs to render the map to an image, and will later need to move the
 * viewport around. Those are things only the view can do, and things the mind
 * model knows nothing about. Rather than hold a `JmView` - which would make the
 * application layer depend on a concrete class, its lifecycle and its internals
 * - it holds this.
 *
 * What belongs here: operations that change **only how the map is displayed**.
 * Panning does not change the map. Zooming does not change the map. Exporting
 * does not change the map.
 *
 * What does not belong here: anything that changes the mind. Folding a node is a
 * change to `node.folded`; moving a node is a change to the tree. Both already
 * have a path - mutate the model, and the registered observer updates the view.
 * Routing them through here instead would give the same data two ways to reach
 * the renderer, and the interactive path would stop being the path an agent
 * takes when it edits the same file.
 *
 * Also not here: coordinate arithmetic. Mapping a pointer position to a node or
 * to a map position depends on the view's own offsets, and the view is what
 * handles pointers; exposing those helpers would expose the internals without
 * the callers needing them.
 *
 * @packageDocumentation
 */

import type { JmExportImageOptions, JmExportImageResult } from './export.ts';

/**
 * A rectangle in CSS pixels, relative to the container's top-left corner.
 *
 * @public
 */
export interface JmViewport {
    /**
     * Map-space x shown at the viewport's left edge.
     *
     * @remarks
     * A position in the map, not a scroll offset: it is the number
     * {@link JmViewHandle.panTo} writes, so what a caller reads here is what it
     * can put back there.
     */
    x: number;
    /** Map-space y shown at the viewport's top edge. See {@link JmViewport.x}. */
    y: number;
    /** Current zoom factor, 1 being unscaled. */
    scale: number;
    /** Visible width in CSS pixels. */
    width: number;
    /** Visible height in CSS pixels. */
    height: number;
    /**
     * Whether a pan would move the map at this zoom.
     *
     * @remarks
     * True while the content overflows the visible box on at least one axis -
     * exactly when {@link JmViewHandle.panTo} is allowed to change the origin.
     * A caller deciding *before* a gesture starts needs this, because the
     * browser settles `touch-action` before the first touchmove: a map that
     * fits should hand the gesture to the page rather than swallow a drag that
     * can only be a no-op. Asking here is also what keeps that caller from
     * measuring the content itself, which would fork the layout from the
     * view's own.
     */
    canPan: boolean;
}

/**
 * A point in the view's own box, measured from its top-left corner.
 *
 * @remarks
 * This is not a map coordinate and not a page coordinate: it is what a pointer
 * event carries once the box's own origin has been subtracted, which is the one
 * thing a caller holding a pointer has to work out. Turning it into a map
 * position is the view's job, and {@link JmViewHandle.zoomTo} is the only place
 * it crosses back in.
 *
 * @public
 */
export interface JmViewportAnchor {
    x: number;
    y: number;
}

/**
 * What the application layer is allowed to ask of the view.
 *
 * @public
 */
export interface JmViewHandle {
    /**
     * Renders the currently displayed map to an image.
     *
     * @param options - Scale, format and quality.
     * @returns The encoded image plus its dimensions.
     */
    capture(options?: JmExportImageOptions): Promise<JmExportImageResult>;

    /**
     * Changes the zoom factor, holding one point still.
     *
     * @remarks
     * The anchor is explicit because a zoom has to keep something fixed, and
     * which something decides how the gesture feels: a wheel zooms about the
     * pointer, a control without a pointer position zooms about the middle of
     * the box. Passing the anchor in keeps the two from being mixed by accident,
     * and keeps the mapping from a screen point to a map point inside the view.
     *
     * @param scale - Requested factor, clamped to the range the view accepts.
     * @param anchor - Point to hold still, in the view's own pixels. Defaults to
     * the middle of the viewport.
     */
    zoomTo(scale: number, anchor?: JmViewportAnchor): void;

    /**
     * Reads the current viewport.
     *
     * @returns The origin, the zoom factor and the visible size.
     */
    getViewport(): JmViewport;

    /**
     * Puts a map-space point at the viewport's top-left corner.
     *
     * @remarks
     * `x`/`y` are the same pair {@link JmViewHandle.getViewport} reports, so a
     * caller can read where the view is looking, keep it, and put it back. The
     * move is clamped to the content's bounds: the map cannot be sent into an
     * empty viewport it would then be unable to leave.
     *
     * A clamp needs a band to clamp into, and there is one only while the map is
     * larger than the viewport. When the whole map fits at the current zoom the
     * band is empty, and this call leaves the origin unchanged: no-op, not a
     * move to the nearest edge and not a centring. No pan writes an origin
     * outside that band, which is also the answer for a `centerOn` built on top
     * of this one: a node can only be brought to the middle while the map
     * overflows the view, and while the map fits there is nothing to bring into
     * view.
     *
     * @param x - Map-space x to show at the left edge.
     * @param y - Map-space y to show at the top edge.
     */
    panTo(x: number, y: number): void;

    /**
     * Moves the viewport by a distance on screen.
     *
     * @remarks
     * The delta is in viewport pixels, not map pixels: a drag reports how far
     * the pointer travelled, and dividing by the zoom is arithmetic the view
     * already owns. Positive `dx` moves the map right, which shows map points
     * further left. Clamped the same way as {@link JmViewHandle.panTo}, including
     * its no-op while the map fits the viewport.
     *
     * @param dx - Horizontal travel in viewport pixels.
     * @param dy - Vertical travel in viewport pixels.
     */
    panBy(dx: number, dy: number): void;

    /**
     * Moves the map so that one node's centre sits in the middle of the
     * viewport.
     *
     * @remarks
     * The zoom is left alone. This is a move, and a caller that centred a node
     * at the factor the reader had chosen should still be at that factor
     * afterwards - a command with "zoom to fit" in its name is a different one.
     *
     * The origin is the one {@link JmViewHandle.panTo} would write for that
     * position, so it is clamped the same way: a node near the content's edge
     * gets as close to the middle as the band allows, and while the whole map
     * fits the viewport the call is a no-op because there is nowhere to move to.
     *
     * A node whose ancestor is folded still has the layout position it is not
     * drawn at, and this centres that position. Expanding the ancestor would be
     * a change to the mind, which a display command does not make.
     *
     * @param nodeId - Id of a node in the open mind map.
     * @throws {@link JsMindError} When this view has not been given a map yet,
     * or when the id is not one of that map's nodes.
     *
     * A closed map is not the same as no map: nothing tells the view a map was
     * closed, it keeps the last one it was shown, and this centres a node of
     * that map instead of throwing.
     */
    centerOn(nodeId: string): void;

    /**
     * Scales the map so that all of it fits the viewport, and centres it.
     *
     * @remarks
     * The zoom is the largest factor at which the content fits, clamped to the
     * range the view accepts, so a map smaller than the box is enlarged as a
     * larger one is shrunk. The origin is then the one that puts the content's
     * middle in the middle of the box.
     *
     * Unlike {@link JmViewHandle.centerOn} this does move a map that fits: the
     * pan's band is empty at exactly-fitting zoom, and a fit that waited for a
     * clamp to move it would leave the map wherever the last gesture left it.
     *
     * Two calls on the same map and box give the same numbers, which is what a
     * double-click or a toolbar button pressing twice relies on.
     *
     * @throws {@link JsMindError} When this view has not been given a map yet -
     * there is no content to fit. A map that was closed counts as open here:
     * the view keeps the last one it was shown, as it does for
     * {@link JmViewHandle.centerOn}.
     */
    fitToView(): void;

    // The rest of the viewport surface is not implemented yet. It is declared
    // here as one block rather than added one method at a time because the
    // shape is what matters: the application layer holds a handle whose surface
    // grows by adding methods, not by widening a constructor with another
    // callback per feature.
    //
    // Interaction will arrive as semantic events, not as coordinate helpers.
    // Turning a pointer position into a node id, or into a map position, needs
    // the view's own offsets and scroll state - publishing that machinery would
    // publish the view's internals under a different name, and it is the view
    // that owns pointer handling anyway. What crosses the boundary is the
    // meaning of the gesture, not the arithmetic behind it:
    //
    // onNodeClick(handler: (nodeId: string) => void): () => void;
    // onNodeDragEnd(handler: (nodeId: string, destination: JmNodeDestination) => void): () => void;
    //
    // `onNodeDragEnd` deliberately hands back a destination rather than applying
    // it: the view reports what the user did, and the mutation still goes
    // through `mind.moveNode` like every other change. That is what keeps the
    // pointer path and the editing-a-file path the same path.
}
