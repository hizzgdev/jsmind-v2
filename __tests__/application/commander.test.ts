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
import type { JmViewHandle, JmViewport, JmViewportAnchor } from '../../src/view/handle.ts';
import type { JmExportImageOptions, JmExportImageResult } from '../../src/view/export.ts';

/**
 * A view that records what it was asked and returns a fixed result.
 *
 * @param result - What `capture` should return.
 * @returns The fake, plus the list of options it received.
 */
function fakeView(result: Partial<JmExportImageResult> = {}): {
    view: JmViewHandle;
    calls: (JmExportImageOptions | undefined)[];
} {
    const calls: (JmExportImageOptions | undefined)[] = [];
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
        panTo: () => undefined,
        panBy: () => undefined,
        zoomTo: () => undefined,
        centerOn: () => undefined,
        getViewport: () => ({ x: 0, y: 0, scale: 1, width: 0, height: 0 }),
        fitToView: () => undefined,
    };
    return { view, calls };
}

/**
 * A view that records every viewport command it is given.
 *
 * @param viewport - What `getViewport` should answer.
 * @returns The fake, plus the call log.
 */
function recordingView(viewport: JmViewport = { x: 10, y: 20, scale: 2, width: 800, height: 600 }): {
    view: JmViewHandle;
    log: [string, ...unknown[]][];
} {
    const log: [string, ...unknown[]][] = [];
    const view: JmViewHandle = {
        async capture(): Promise<JmExportImageResult> {
            log.push(['capture']);
            return { blob: new Blob([], { type: 'image/png' }), width: 1, height: 1, cssWidth: 1, cssHeight: 1 };
        },
        panTo(x: number, y: number): void {
            log.push(['panTo', x, y]);
        },
        panBy(dx: number, dy: number): void {
            log.push(['panBy', dx, dy]);
        },
        zoomTo(scale: number, anchor?: JmViewportAnchor): void {
            log.push(['zoomTo', scale, anchor]);
        },
        centerOn(nodeId: string): void {
            log.push(['centerOn', nodeId]);
        },
        getViewport(): JmViewport {
            log.push(['getViewport']);
            return viewport;
        },
        fitToView(): void {
            log.push(['fitToView']);
        },
    };
    return { view, log };
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
        ...recordingView().view,
        async capture(): Promise<JmExportImageResult> {
            throw new JsMindError('the browser could not encode the canvas');
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

test('commander - every viewport command reaches the view with its arguments intact', () => {
    const { view, log } = recordingView();
    const commander = new JmCommander(view);

    commander.panTo(120, -40);
    commander.panBy(-15, 25);
    commander.zoomTo(2.5);
    commander.zoomTo(1.5, { x: 30, y: 40 });
    commander.centerOn('jm-3');
    commander.fitToView();

    assert.deepStrictEqual(log, [
        ['panTo', 120, -40],
        ['panBy', -15, 25],
        // No anchor invented for the caller: the view's own default (the middle
        // of the viewport) applies, and an explicit anchor passes through.
        ['zoomTo', 2.5, undefined],
        ['zoomTo', 1.5, { x: 30, y: 40 }],
        ['centerOn', 'jm-3'],
        ['fitToView'],
    ]);
});

test('commander - getViewport answers exactly what the view reports', () => {
    const viewport: JmViewport = { x: -320.5, y: 88, scale: 0.75, width: 1024, height: 768 };
    const { view } = recordingView(viewport);
    const commander = new JmCommander(view);

    // Forwarded as-is: the view builds the object, so the commander cannot
    // disagree with it about what is on screen.
    assert.deepStrictEqual(commander.getViewport(), viewport);
});
