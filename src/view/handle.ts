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

    // The viewport methods below are not implemented yet. They are declared
    // here rather than added one at a time because the shape is what matters:
    // the application layer holds a handle whose surface grows by adding
    // methods, not by widening a constructor with another callback per feature.
    //
    // panTo(x: number, y: number): void;
    // panBy(dx: number, dy: number): void;
    // zoomTo(scale: number): void;
    // centerOn(nodeId: string): void;
    // getViewport(): JmViewport;
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
