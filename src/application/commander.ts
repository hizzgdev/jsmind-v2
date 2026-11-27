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
 * `Since: 2.3.0`
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
     * `Since: 2.3.0`
     *
     * @param options - Scale, format and quality.
     * @returns The encoded image plus its dimensions.
     */
    async exportImage(options?: JmExportImageOptions): Promise<JmExportImageResult> {
        return await this.view.capture(options);
    }

    /**
     * Moves the map so that the given map-space point sits at the viewport's
     * top-left corner.
     *
     * `Since: 2.3.0`
     *
     * @param x - Map-space x, in CSS pixels.
     * @param y - Map-space y, in CSS pixels.
     */
    panTo(x: number, y: number): void {
        this.view.panTo(x, y);
    }

    /**
     * Moves the map by a distance in screen pixels.
     *
     * `Since: 2.3.0`
     *
     * @param dx - Pixels to move the map right.
     * @param dy - Pixels to move the map down.
     */
    panBy(dx: number, dy: number): void {
        this.view.panBy(dx, dy);
    }

    /**
     * Changes the zoom factor, holding one point still.
     *
     * `Since: 2.3.0`
     *
     * @param scale - Requested factor, clamped by the view.
     * @param anchor - Point to hold still, in the view's own pixels. Defaults to
     * the middle of the viewport.
     */
    zoomTo(scale: number, anchor?: JmViewportAnchor): void {
        this.view.zoomTo(scale, anchor);
    }

    /**
     * Centres one node in the viewport at the current zoom level.
     *
     * `Since: 2.3.0`
     *
     * @param nodeId - Id of a node in the open mind map.
     */
    centerOn(nodeId: string): void {
        this.view.centerOn(nodeId);
    }

    /**
     * Reads the current viewport.
     *
     * `Since: 2.3.0`
     *
     * @returns The origin, the zoom factor and the visible size.
     */
    getViewport(): JmViewport {
        return this.view.getViewport();
    }

    /**
     * Zooms out until the whole map is visible and centres it.
     *
     * `Since: 2.3.0`
     */
    fitToView(): void {
        this.view.fitToView();
    }

    // Folding and moving do not land here, for the reason given in the handle:
    // they change the mind, and the mind already notifies the view. A command
    // that reached past the model would be a second way to write the same data.
}
