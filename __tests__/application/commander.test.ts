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
import type { JmViewHandle } from '../../src/view/handle.ts';
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
    };
    return { view, calls };
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
    };
    const commander = new JmCommander(view);

    // Swallowed errors here would turn "the export failed" into "the export
    // returned nothing", and only the caller knows which it can live with.
    await assert.rejects(
        () => commander.exportImage(),
        (error: Error) => error instanceof JsMindError && /encode/.test(error.message)
    );
});
