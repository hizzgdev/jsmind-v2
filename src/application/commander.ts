/**
 * Application-level commands.
 *
 * The counterpart to the change coordinator. The coordinator answers "the mind
 * changed, update the view"; the commander answers "the caller asked for
 * something, do it". Between them they cover both directions of traffic, and
 * both hold the view the same way - as a narrow handle, not as the class.
 *
 * Existing as its own object rather than as methods on `JsMind` is what makes
 * these commands addressable: a menu item, a keyboard shortcut or a future
 * toolbar can hold a reference to one and call it without knowing where the
 * view lives or how it works. Methods buried in the facade are reachable only
 * by whoever holds the facade.
 *
 * @packageDocumentation
 */

import type { JmExportImageOptions, JmExportImageResult } from '../view/export.ts';
import type { JmViewHandle, JmViewport, JmViewportAnchor } from '../view/handle.ts';

/**
 * Issues commands that change what is displayed, never what is stored.
 *
 * @public
 */
export class JmCommander {
    /** What commands may ask of the view. */
    private readonly view: JmViewHandle;

    /**
     * Creates a commander.
     *
     * @param view - The view's capabilities.
     */
    constructor(view: JmViewHandle) {
        this.view = view;
    }

    /**
     * Renders the displayed map to an image.
     *
     * @param options - Scale, format and quality.
     * @returns The encoded image plus its dimensions.
     */
    async exportImage(options?: JmExportImageOptions): Promise<JmExportImageResult> {
        return await this.view.capture(options);
    }

    /**
     * Changes the zoom factor, holding one point still.
     *
     * @param scale - Requested factor, clamped by the view.
     * @param anchor - Point to hold still, in the view's own pixels. Defaults to
     * the middle of the viewport.
     */
    zoomTo(scale: number, anchor?: JmViewportAnchor): void {
        this.view.zoomTo(scale, anchor);
    }

    /**
     * Reads the current viewport.
     *
     * @returns The origin, the zoom factor and the visible size.
     */
    getViewport(): JmViewport {
        return this.view.getViewport();
    }

    /**
     * Puts a map-space point at the viewport's top-left corner.
     *
     * @param x - Map-space x to show at the left edge.
     * @param y - Map-space y to show at the top edge.
     */
    panTo(x: number, y: number): void {
        this.view.panTo(x, y);
    }

    /**
     * Moves the viewport by a distance on screen.
     *
     * @param dx - Horizontal travel in viewport pixels.
     * @param dy - Vertical travel in viewport pixels.
     */
    panBy(dx: number, dy: number): void {
        this.view.panBy(dx, dy);
    }

    /**
     * Moves the map so that one node's centre sits in the middle of the
     * viewport, leaving the zoom alone.
     *
     * @param nodeId - Id of a node in the open mind map.
     * @throws {@link JsMindError} When this view has not been given a map yet,
     * or the id is not one of that map's nodes. Closing the map does not empty
     * the view: centring afterwards still acts on the last map shown, instead
     * of throwing.
     */
    centerOn(nodeId: string): void {
        this.view.centerOn(nodeId);
    }

    /**
     * Scales the map so that all of it fits the viewport, and centres it.
     *
     * @remarks
     * The one command that moves a map that already fits, and the reason a
     * double-click can be the way back from a zoom that left the content in a
     * corner.
     *
     * @throws {@link JsMindError} When this view has not been given a map yet.
     */
    fitToView(): void {
        this.view.fitToView();
    }

    // The rest of the viewport commands land here, next to these.
    //
    // Folding and moving do not, for the reason given in the handle: they change
    // the mind, and the mind already notifies the view. A command that reached
    // past the model would be a second way to write the same data.
}
