/**
 * @fileoverview The zoom arithmetic, without a browser.
 *
 * @remarks
 * `viewport.ts` is pure functions of a state object precisely so that the
 * geometry behind a zoom can be pinned here: which point the zoom holds still,
 * what the origin becomes, where the factor stops. What a *browser* does with
 * the resulting `transform` string is measured in `__tests__/ui/viewport.test.ts`
 * - the split is the point, not a shortcut.
 */

import { test } from 'node:test';
import assert from 'node:assert';

import { JmPoint } from '../../src/common/index.ts';
import {
    JmViewportScaleRange,
    clampViewportScale,
    viewportCssTransform,
    viewportOriginFor,
    viewportPointAt,
    zoomViewport,
    type JmViewportTransform,
} from '../../src/view/viewport.ts';

/** A state with a non-zero origin, so a mistake cannot hide behind zeros. */
const STATE: JmViewportTransform = { x: 30, y: -20, scale: 1.5 };

test('viewport - a requested factor is clamped into the range the view accepts', () => {
    assert.strictEqual(clampViewportScale(99), JmViewportScaleRange.max);
    assert.strictEqual(clampViewportScale(0.0001), JmViewportScaleRange.min);
    assert.strictEqual(clampViewportScale(2.5), 2.5);
    assert.strictEqual(clampViewportScale(JmViewportScaleRange.min), JmViewportScaleRange.min);
    assert.strictEqual(clampViewportScale(JmViewportScaleRange.max), JmViewportScaleRange.max);
});

test('viewport - a factor that is not a finite number falls back to 1', () => {
    // Reached by dividing by a size that was not measured yet. A NaN scale
    // would leave the map unpainted with no error pointing at the cause.
    assert.strictEqual(clampViewportScale(Number.NaN), 1);
    assert.strictEqual(clampViewportScale(Number.POSITIVE_INFINITY), 1);
    assert.strictEqual(clampViewportScale(Number.NEGATIVE_INFINITY), 1);
});

test('viewport - a viewport point reads back the map point under it', () => {
    const point = viewportPointAt(STATE, { x: 150, y: 90 });

    assert.strictEqual(point.x, STATE.x + 150 / STATE.scale);
    assert.strictEqual(point.y, STATE.y + 90 / STATE.scale);
});

test('viewport - the origin that puts a map point under an anchor reverses it', () => {
    const focus = new JmPoint(120, 60);
    const anchor = { x: 300, y: 200 };
    const origin = viewportOriginFor(focus, anchor, 2);

    // Put the computed origin back through the forward mapping: the same map
    // point has to land on the same anchor.
    const state: JmViewportTransform = { x: origin.x, y: origin.y, scale: 2 };
    const back = viewportPointAt(state, anchor);
    assert.ok(Math.abs(back.x - focus.x) < 1e-9, `x drifted to ${back.x}`);
    assert.ok(Math.abs(back.y - focus.y) < 1e-9, `y drifted to ${back.y}`);
});

test('viewport - a zoom holds the map point under its anchor still', () => {
    for (const anchor of [
        { x: 0, y: 0 },
        { x: 640, y: 480 },
        { x: 97, y: 313 },
    ]) {
        for (const scale of [0.5, 1, 2.2, 4]) {
            const before = viewportPointAt(STATE, anchor);
            const after = zoomViewport(STATE, scale, anchor);
            const focus = viewportPointAt(after, anchor);

            assert.strictEqual(after.scale, scale);
            assert.ok(
                Math.abs(focus.x - before.x) < 1e-9,
                `anchor ${anchor.x}/${anchor.y} at scale ${scale} drifted to ${focus.x}`
            );
            assert.ok(
                Math.abs(focus.y - before.y) < 1e-9,
                `anchor ${anchor.x}/${anchor.y} at scale ${scale} drifted to ${focus.y}`
            );
        }
    }
});

test('viewport - the anchor, not the middle of the box, is the point that stays still', () => {
    // A zoom about the centre is a different state from a zoom about a corner,
    // and only the anchor is promised to stay put. This is the assertion a
    // substitute anchor would break: the two ends of the box cannot both be
    // fixed by one zoom.
    const centre = { x: 320, y: 240 };
    const corner = { x: 10, y: 10 };

    const aboutCorner = zoomViewport(STATE, 2, corner);
    const pointAtCentre = viewportPointAt(aboutCorner, centre);
    const expectedAtCentre = viewportPointAt(STATE, centre);

    assert.ok(
        Math.abs(pointAtCentre.x - expectedAtCentre.x) > 1,
        'zooming about the corner should move the map point at the centre'
    );
    assert.ok(
        Math.abs(viewportPointAt(aboutCorner, corner).x - viewportPointAt(STATE, corner).x) < 1e-9,
        'the anchored point itself does not move'
    );
});

test('viewport - a zoom past the limit holds the anchor with the clamped factor', () => {
    const anchor = { x: 500, y: 100 };
    const before = viewportPointAt(STATE, anchor);
    const after = zoomViewport(STATE, 99, anchor);

    assert.strictEqual(after.scale, JmViewportScaleRange.max);
    const focus = viewportPointAt(after, anchor);
    assert.ok(Math.abs(focus.x - before.x) < 1e-9);
    assert.ok(Math.abs(focus.y - before.y) < 1e-9);
});

test('viewport - the identity state formats as no transform at all', () => {
    // A view nobody zoomed must keep the layout it had before viewports
    // existed, so the identity is `none` rather than a no-op transform.
    assert.strictEqual(viewportCssTransform({ x: 0, y: 0, scale: 1 }), 'none');
});

test('viewport - the transform maps map pixels to scaled viewport pixels', () => {
    // `translate` before `scale` is what makes `(p - x) * scale` the mapping:
    // the offset is multiplied by the zoom, not applied after it.
    assert.strictEqual(
        viewportCssTransform({ x: 30, y: -20, scale: 2 }),
        'translate(-60px, 40px) scale(2)'
    );
});
