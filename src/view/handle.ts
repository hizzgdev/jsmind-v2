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
    /** Horizontal scroll offset. */
    x: number;
    /** Vertical scroll offset. */
    y: number;
    /** Current zoom factor, 1 being unscaled. */
    scale: number;
    /** Visible width in CSS pixels. */
    width: number;
    /** Visible height in CSS pixels. */
    height: number;
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

    // The rest of the viewport surface is not implemented yet. It is declared
    // here as one block rather than added one method at a time because the
    // shape is what matters: the application layer holds a handle whose surface
    // grows by adding methods, not by widening a constructor with another
    // callback per feature.
    //
    // panTo(x: number, y: number): void;
    // panBy(dx: number, dy: number): void;
    // centerOn(nodeId: string): void;
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
