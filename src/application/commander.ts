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
import type { JmViewHandle } from '../view/handle.ts';

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

    // Future viewport commands land here, next to this one:
    //
    // panTo(x: number, y: number): void;
    // zoomTo(scale: number): void;
    // centerOn(nodeId: string): void;
    //
    // Folding and moving do not, for the reason given in the handle: they change
    // the mind, and the mind already notifies the view. A command that reached
    // past the model would be a second way to write the same data.
}
