/**
 * @fileoverview Tests for the command layer.
 *
 * The commander exists so the application layer can issue commands without
 * holding the view. These tests are what that buys: a fake view is enough to
 * exercise the whole path, no browser, no container, no rendering.
 */

import { test } from 'node:test';
import assert from 'node:assert';

import { JmCommander } from '../../src/application/commander.ts';
import { JsMindError } from '../../src/common/error.ts';
import type { JmFitToViewMode, JmViewHandle, JmViewport, JmViewportAnchor } from '../../src/view/handle.ts';
import type { JmExportImageOptions, JmExportImageResult } from '../../src/view/export.ts';

/** A zoom request the fake view received. */
interface ZoomCall {
    scale: number;
    anchor?: JmViewportAnchor;
}

/**
 * A view that records what it was asked and returns a fixed result.
 *
 * @param result - What `capture` should return.
 * @returns The fake, plus the list of options it received.
 */
function fakeView(result: Partial<JmExportImageResult> = {}): {
    view: JmViewHandle;
    calls: (JmExportImageOptions | undefined)[];
    zooms: ZoomCall[];
    centres: string[];
    fits: (JmFitToViewMode | undefined)[];
} {
    const calls: (JmExportImageOptions | undefined)[] = [];
    const zooms: ZoomCall[] = [];
    const centres: string[] = [];
    const fits: (JmFitToViewMode | undefined)[] = [];
    const viewport: JmViewport = { x: 4, y: 5, scale: 2, width: 640, height: 480, canPan: true, mode: 'viewport' };
    const view: JmViewHandle = {
        async capture(options?: JmExportImageOptions): Promise<JmExportImageResult> {
            calls.push(options);
            return {
                blob: new Blob([], { type: 'image/png' }),
                width: 100,
                height: 50,
                cssWidth: 50,
                cssHeight: 25,
                ...result,
            };
        },
        zoomTo(scale: number, anchor?: JmViewportAnchor): void {
            zooms.push({ scale, anchor });
        },
        panTo(): void {
            // Not exercised here.
        },
        panBy(): void {
            // Not exercised here.
        },
        centerOn(nodeId: string): void {
            centres.push(nodeId);
        },
        fitToView(mode?: JmFitToViewMode): void {
            // Recorded, not interpreted: the mode is the caller's decision.
            fits.push(mode);
        },
        getViewport(): JmViewport {
            return viewport;
        },
    };
    return { view, calls, zooms, centres, fits };
}

test('commander - exportImage passes the options through to the view', async () => {
    const { view, calls } = fakeView();
    const commander = new JmCommander(view);

    await commander.exportImage({ scale: 3, type: 'image/jpeg', quality: 0.5 });

    assert.deepStrictEqual(calls, [{ scale: 3, type: 'image/jpeg', quality: 0.5 }]);
});

test('commander - exportImage forwards an absent options object as undefined', async () => {
    const { view, calls } = fakeView();
    const commander = new JmCommander(view);

    await commander.exportImage();

    // Not `{}`: the view decides the defaults, and inventing an empty object
    // here would make "caller said nothing" indistinguishable from "caller
    // explicitly passed defaults" if the two ever diverge.
    assert.deepStrictEqual(calls, [undefined]);
});

test('commander - exportImage returns the view result unchanged', async () => {
    const { view } = fakeView({ width: 1500, height: 900, cssWidth: 750, cssHeight: 450 });
    const commander = new JmCommander(view);

    const result = await commander.exportImage();

    assert.strictEqual(result.width, 1500);
    assert.strictEqual(result.height, 900);
    assert.strictEqual(result.cssWidth, 750);
    assert.strictEqual(result.cssHeight, 450);
});

test('commander - exportImage surfaces a view failure to the caller', async () => {
    const view: JmViewHandle = {
        async capture(): Promise<JmExportImageResult> {
            throw new JsMindError('the browser could not encode the canvas');
        },
        zoomTo(): void {
            // Not exercised here.
        },
        fitToView(): void {
            // Not exercised here, and the mode does not change that.
        },
        getViewport(): JmViewport {
            return { x: 0, y: 0, scale: 1, width: 0, height: 0, canPan: false, mode: 'native' };
        },
    };
    const commander = new JmCommander(view);

    // Swallowed errors here would turn "the export failed" into "the export
    // returned nothing", and only the caller knows which it can live with.
    await assert.rejects(
        () => commander.exportImage(),
        (error: Error) => error instanceof JsMindError && /encode/.test(error.message)
    );
});

test('commander - zoomTo passes the requested anchor through to the view', () => {
    const { view, zooms } = fakeView();
    const commander = new JmCommander(view);

    commander.zoomTo(1.75, { x: 120, y: 80 });

    assert.deepStrictEqual(zooms, [{ scale: 1.75, anchor: { x: 120, y: 80 } }]);
});

test('commander - zoomTo without an anchor leaves the choice of anchor to the view', () => {
    const { view, zooms } = fakeView();
    const commander = new JmCommander(view);

    commander.zoomTo(0.5);

    // Not the middle of the viewport: the view owns that default, and inventing
    // one here would make "caller said nothing" indistinguishable from "caller
    // asked for the centre", which are separate rules once a keyboard shortcut
    // zooms about something else.
    assert.deepStrictEqual(zooms, [{ scale: 0.5, anchor: undefined }]);
});

test('commander - getViewport returns what the view reports', () => {
    const { view } = fakeView();
    const commander = new JmCommander(view);

    // `canPan` and `mode` are part of the report: a caller deciding
    // `touch-action` before a gesture starts reads them here instead of
    // measuring the content, or reading `overflow`, itself.
    assert.deepStrictEqual(
        commander.getViewport(),
        { x: 4, y: 5, scale: 2, width: 640, height: 480, canPan: true, mode: 'viewport' }
    );
});

test('commander - centerOn forwards the node id to the view', () => {
    const { view, centres } = fakeView();
    const commander = new JmCommander(view);

    commander.centerOn('jm-7');

    // The id is the whole request. Where that node is and what origin puts it
    // in the middle are the view's, and a commander that resolved either would
    // need the model and the layout as well.
    assert.deepStrictEqual(centres, ['jm-7']);
});

test('commander - fitToView is forwarded to the view, mode and all', () => {
    const { view, fits } = fakeView();
    const commander = new JmCommander(view);

    commander.fitToView('shrink');
    commander.fitToView('expand');
    commander.fitToView();

    // The zoom and the origin are the view's, and so is the box whose size
    // decides both: a commander that computed a fit would need the layout too.
    // The mode is the one thing it must not invent - and "no mode" is a request
    // of its own, not a gap for this layer to fill with one direction.
    assert.deepStrictEqual(fits, ['shrink', 'expand', undefined]);
});
