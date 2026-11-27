/**
 * @fileoverview The zoom arithmetic, without a browser.
 *
 * @remarks
 * `viewport.ts` is pure functions of a state object precisely so that the
 * geometry behind a zoom can be pinned here: which point the zoom holds still,
 * what the origin becomes, where the factor stops, and what "fit the whole map"
 * means. What a *browser* does with the resulting `transform` string is measured
 * in `__tests__/ui/viewport.test.ts` - the split is the point, not a shortcut.
 */

import { test } from 'node:test';
import assert from 'node:assert';

import { JmPoint, JmSize } from '../../src/common/index.ts';
import {
    JmViewportScaleRange,
    clampViewportScale,
    fitViewport,
    panViewport,
    panViewportTo,
    viewportCanPan,
    viewportCssTransform,
    viewportOriginFor,
    viewportPointAt,
    zoomViewport,
    type JmViewportBounds,
    type JmViewportTransform,
} from '../../src/view/viewport.ts';

/** A state with a non-zero origin, so a mistake cannot hide behind zeros. */
const STATE: JmViewportTransform = { x: 30, y: -20, scale: 1.5 };

/**
 * Content that is wider than the viewport on both axes at 1x, and off the
 * origin so a clamp to zero cannot pass for a clamp to the content.
 */
const CONTENT: JmViewportBounds = { left: 100, top: 50, width: 800, height: 600 };

/** The visible box the pan is clamped against. */
const WINDOW = new JmSize(400, 300);

/** A state inside {@link CONTENT}, at a zoom other than 1. */
const INSIDE: JmViewportTransform = { x: 300, y: 200, scale: 2 };

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

test('viewport - a drag moves the origin by the travel divided by the zoom', () => {
    // A pointer reports screen pixels. At 2x, 240px of travel uncovers 120 map
    // pixels, so the origin moves by half the travel - and in the opposite
    // direction, because moving the map right shows map points further left.
    const moved = panViewport(INSIDE, 240, 160, CONTENT, WINDOW);

    assert.deepStrictEqual(moved, { x: INSIDE.x - 120, y: INSIDE.y - 80, scale: 2 });
});

test('viewport - a drag stops at the content instead of leaving an empty viewport', () => {
    // Dragging the map to the right stops when the content's left edge reaches
    // the viewport's left edge; dragging it left stops when the content's right
    // edge does. Past either end the reader would be looking at blank canvas.
    const toNearEdge = panViewport(INSIDE, 5000, 5000, CONTENT, WINDOW);
    assert.deepStrictEqual(toNearEdge, { x: CONTENT.left, y: CONTENT.top, scale: 2 });

    const toFarEdge = panViewport(INSIDE, -5000, -5000, CONTENT, WINDOW);
    assert.deepStrictEqual(toFarEdge, {
        x: CONTENT.left + CONTENT.width - WINDOW.width / 2,
        y: CONTENT.top + CONTENT.height - WINDOW.height / 2,
        scale: 2,
    });

    // The far end is one viewport-width short of the content's width, not the
    // content's right edge: at 2x the visible box is half as wide in map pixels
    // as it is at 1x, so that is where the last screenful starts.
    assert.ok(toFarEdge.x < CONTENT.left + CONTENT.width, 'the origin stays inside the content');
});

test('viewport - a pan to a point outside the content is clamped to it', () => {
    // `panTo` is the same clamp as a drag, so a caller cannot reach a state a
    // gesture could not.
    assert.deepStrictEqual(panViewportTo(INSIDE, new JmPoint(-5000, 5000), CONTENT, WINDOW), {
        x: CONTENT.left,
        y: CONTENT.top + CONTENT.height - WINDOW.height / 2,
        scale: 2,
    });

    // And a target inside the content is taken as given, which is what makes
    // `getViewport()` read-back usable as a save point.
    const inside = new JmPoint(420, 260);
    assert.deepStrictEqual(panViewportTo(INSIDE, inside, CONTENT, WINDOW), {
        x: 420,
        y: 260,
        scale: 2,
    });
});

test('viewport - content smaller than the viewport cannot be panned at all', () => {
    // `span` is negative on both axes, so the band is empty. Clamping into it
    // would mean a reversed interval, and either end would put the map off the
    // screen; a map that already fits has nowhere to go.
    const small: JmViewportBounds = { left: 150, top: 100, width: 200, height: 100 };
    const state: JmViewportTransform = { x: 150, y: 100, scale: 1 };

    assert.deepStrictEqual(panViewport(state, 300, 200, small, WINDOW), state);
    assert.deepStrictEqual(panViewport(state, -300, -200, small, WINDOW), state);
});

test('viewport - one axis can have room while the other has none', () => {
    // Wide but short content: the horizontal drag lands on the clamp, and the
    // vertical one is dropped rather than clamped into an empty band.
    const wide: JmViewportBounds = { left: 0, top: 0, width: 800, height: 100 };
    const state: JmViewportTransform = { x: 0, y: 0, scale: 1 };

    const moved = panViewport(state, -500, -500, wide, WINDOW);
    assert.strictEqual(moved.x, wide.width - WINDOW.width, 'the horizontal axis has room and stops at its end');
    assert.strictEqual(moved.y, 0, 'the vertical axis has none, so its origin is untouched');
});

test('viewport - a pan that is not a finite number leaves the origin alone', () => {
    // A `0/0` from a box that was not measured yet. One NaN in the origin
    // leaves every node unpainted with no error pointing at the cause.
    assert.deepStrictEqual(panViewport(INSIDE, Number.NaN, 40, CONTENT, WINDOW), {
        x: INSIDE.x,
        y: INSIDE.y - 20,
        scale: 2,
    });
    assert.deepStrictEqual(panViewportTo(INSIDE, new JmPoint(Number.NaN, Number.NaN), CONTENT, WINDOW), INSIDE);
});

test('viewport - centring a map point puts it under the middle of the box at any zoom', () => {
    // `centerOn` composes exactly these two functions: `viewportOriginFor` for
    // the arithmetic and the pan's clamp for the bounds. The composition is
    // pinned here, without a browser, because "which point ends up where" is
    // the whole claim.
    const middle = { x: WINDOW.width / 2, y: WINDOW.height / 2 };

    // 0.5x is left out on purpose: at that factor the box sees the whole 800px
    // content, the pan band is empty, and a pan - and so a centring built on it -
    // is a no-op rather than a move.
    for (const scale of [1, 2, 4]) {
        const focus = new JmPoint(500, 350);
        const origin = viewportOriginFor(focus, middle, scale);
        const centred = panViewportTo({ x: INSIDE.x, y: INSIDE.y, scale }, origin, CONTENT, WINDOW);

        assert.strictEqual(centred.scale, scale, 'centring does not change the zoom');

        // Read back through the forward mapping: the point the caller asked to
        // centre has to be the one under the box's middle.
        const back = viewportPointAt(centred, middle);
        assert.ok(Math.abs(back.x - focus.x) < 1e-9, `at ${scale}x the centre drifted to ${back.x}`);
        assert.ok(Math.abs(back.y - focus.y) < 1e-9, `at ${scale}x the centre drifted to ${back.y}`);
    }
});

test('viewport - centring a point at the content edge is clamped, not pulled past it', () => {
    // A node near the left edge of the map: centring it would need an origin
    // left of the content, and the box would show empty canvas beside the map.
    // The clamp wins, so the point lands short of the middle - which is what a
    // pan contract that never reveals blank canvas has to mean for `centerOn`.
    const middle = { x: WINDOW.width / 2, y: WINDOW.height / 2 };
    const nearEdge = new JmPoint(CONTENT.left + 20, CONTENT.top + CONTENT.height / 2);

    const origin = viewportOriginFor(nearEdge, middle, 2);
    assert.ok(origin.x < CONTENT.left, 'the unclamped origin would sit outside the content');

    const clamped = panViewportTo(INSIDE, origin, CONTENT, WINDOW);
    assert.strictEqual(clamped.x, CONTENT.left, 'the origin stops at the content edge');
    assert.strictEqual(clamped.y, origin.y, 'the axis with room is untouched');

    // Where the point actually appears: against the view's left edge rather
    // than in the middle of a 400px box.
    const painted = (nearEdge.x - clamped.x) * clamped.scale;
    assert.ok(painted < middle.x - 100, `the point sits at ${painted}px from the left edge, not at ${middle.x}`);
});

test('viewport - fitting the map picks the factor at which it just fits, and centres it', () => {
    // 800x600 content in a 400x300 box: both axes bind at 0.5, so the content
    // exactly fills the box and the origin is its own top-left corner. A map
    // this size is too large for the box, which is the state `'shrink'` is for;
    // `'expand'` has nothing to expand here and answers the natural size, so the
    // two modes do different things to the same map.
    const fitted = fitViewport(CONTENT, WINDOW, 'shrink');

    assert.strictEqual(fitted.scale, 0.5);
    assert.deepStrictEqual(fitted, { x: CONTENT.left, y: CONTENT.top, scale: 0.5 });
    assert.strictEqual(fitViewport(CONTENT, WINDOW, 'expand').scale, 1, 'expanding must not shrink a map that is too large');

    // Read back through the forward mapping: the content's middle has to be the
    // box's middle, and its painted extent has to be the box, not a corner of it.
    const middle = { x: WINDOW.width / 2, y: WINDOW.height / 2 };
    const back = viewportPointAt(fitted, middle);
    assert.ok(Math.abs(back.x - (CONTENT.left + CONTENT.width / 2)) < 1e-9, `the horizontal centre drifted to ${back.x}`);
    assert.ok(Math.abs(back.y - (CONTENT.top + CONTENT.height / 2)) < 1e-9, `the vertical centre drifted to ${back.y}`);
});

test('viewport - the two modes disagree on a map smaller than the box, and only there', () => {
    // The two disagreements the API exists for, in one place. A 200x100 map in a
    // 400x300 box fits at 2x: `'shrink'` has nothing to shrink and keeps the map
    // at the size its text was written for, `'expand'` fills the box with it.
    // The same map at 1000x500 - too large - gets 0.4 from `'shrink'` and 1x
    // from `'expand'`, so neither mode does the other's job.
    const small: JmViewportBounds = { left: 30, top: 20, width: 200, height: 100 };
    const large: JmViewportBounds = { left: 0, top: 0, width: 1000, height: 500 };

    assert.strictEqual(fitViewport(small, WINDOW, 'shrink').scale, 1, 'shrinking must not blow a small map up');
    assert.strictEqual(fitViewport(small, WINDOW, 'expand').scale, 2, 'expanding fills the box exactly');
    assert.strictEqual(fitViewport(large, WINDOW, 'shrink').scale, 0.4, 'a large map is scaled down to fit');
    assert.strictEqual(fitViewport(large, WINDOW, 'expand').scale, 1, 'expanding must not shrink a large map');

    // Both modes centre, so neither leaves the map where the last gesture left
    // it - which is the whole reason the origin is written rather than panned
    // to. Only the factor differs between them and the state they are in.
    const middle = { x: WINDOW.width / 2, y: WINDOW.height / 2 };
    for (const mode of ['shrink', 'expand'] as const) {
        for (const bounds of [small, large]) {
            const fitted = fitViewport(bounds, WINDOW, mode);
            const back = viewportPointAt(fitted, middle);
            const label = `${mode} at ${bounds.width}x${bounds.height} (${fitted.scale}x)`;
            assert.ok(
                Math.abs(back.x - (bounds.left + bounds.width / 2)) < 1e-9 &&
                    Math.abs(back.y - (bounds.top + bounds.height / 2)) < 1e-9,
                `the content should be centred: ${label} put ${back.x}/${back.y} in the middle`
            );
            assert.deepStrictEqual(fitViewport(bounds, WINDOW, mode), fitted, `a second identical fit differs: ${label}`);
        }
    }
});

test('viewport - a fit with no mode corrects both directions, and leaves the range as the only bound', () => {
    // What a viewer with one "fit" button asks for. It is not a third behaviour
    // to keep in step with the other two: it is the same fitting factor with
    // neither bound on the natural size, so on a map that needs one direction
    // it has to be exactly that direction's answer - which the deep comparisons
    // pin, rather than a scale that merely looks plausible.
    const small: JmViewportBounds = { left: 30, top: 20, width: 200, height: 100 };
    const large: JmViewportBounds = { left: 0, top: 0, width: 1000, height: 500 };

    assert.deepStrictEqual(fitViewport(large, WINDOW), fitViewport(large, WINDOW, 'shrink'), 'a large map is shrunk to fit');
    assert.deepStrictEqual(fitViewport(small, WINDOW), fitViewport(small, WINDOW, 'expand'), 'a small map is blown up to fill the box');
    assert.strictEqual(fitViewport(large, WINDOW).scale, 0.4);
    assert.strictEqual(fitViewport(small, WINDOW).scale, 2);

    // Both ends of the range still bind, and what is left is still centred and
    // still idempotent: the natural size was the only bound dropped.
    const tiny: JmViewportBounds = { left: 10, top: 10, width: 10, height: 10 };
    const huge: JmViewportBounds = { left: 0, top: 0, width: 8000, height: 6000 };
    assert.strictEqual(fitViewport(tiny, WINDOW).scale, JmViewportScaleRange.max);
    assert.strictEqual(fitViewport(huge, WINDOW).scale, JmViewportScaleRange.min);

    const middle = { x: WINDOW.width / 2, y: WINDOW.height / 2 };
    for (const bounds of [small, large]) {
        const fitted = fitViewport(bounds, WINDOW);
        const back = viewportPointAt(fitted, middle);
        assert.ok(
            Math.abs(back.x - (bounds.left + bounds.width / 2)) < 1e-9 &&
                Math.abs(back.y - (bounds.top + bounds.height / 2)) < 1e-9,
            `the content should be centred: it put ${back.x}/${back.y} in the middle`
        );
        assert.deepStrictEqual(fitViewport(bounds, WINDOW), fitted, 'a second identical fit differs');
    }
});

test('viewport - a fit stops at the range ends, and at the natural size', () => {
    // Each mode has two ceilings and the tighter one wins. A map far smaller
    // than the box would want 30x in `'expand'`; the view accepts 4, so the
    // floor of the range wins - and in `'shrink'` the natural size wins first,
    // at 1x.
    const tiny: JmViewportBounds = { left: 10, top: 10, width: 10, height: 10 };
    const enlarged = fitViewport(tiny, WINDOW, 'expand');
    assert.strictEqual(enlarged.scale, JmViewportScaleRange.max);
    assert.strictEqual((tiny.left - enlarged.x) * enlarged.scale + (tiny.width * enlarged.scale) / 2, WINDOW.width / 2);
    assert.strictEqual(fitViewport(tiny, WINDOW, 'shrink').scale, 1, 'shrinking a tiny map leaves it at 1x');

    // And one 100 times the box would want 0.05 in `'shrink'`; the floor wins,
    // so it is shown as much as the range allows and no further. `'expand'`
    // never goes below the natural size, so it answers 1x here.
    const huge: JmViewportBounds = { left: 0, top: 0, width: 8000, height: 6000 };
    assert.strictEqual(fitViewport(huge, WINDOW, 'shrink').scale, JmViewportScaleRange.min);
    assert.strictEqual(fitViewport(huge, WINDOW, 'expand').scale, 1);
});

test('viewport - fitting a map that binds on one axis leaves the other centred', () => {
    // 800x200 in a 400x300 box: the width binds at 0.5, so the content is
    // 400x100 on screen and the leftover 100px is split evenly at top and bottom.
    const wide: JmViewportBounds = { left: 100, top: 50, width: 800, height: 200 };
    const fitted = fitViewport(wide, WINDOW, 'shrink');

    assert.strictEqual(fitted.scale, 0.5);
    const paintedTop = (wide.top - fitted.y) * fitted.scale;
    const paintedBottom = paintedTop + wide.height * fitted.scale;
    assert.ok(Math.abs(paintedTop) > 0.5, 'the loose axis should not be flush with the box');
    assert.ok(Math.abs(paintedTop - (WINDOW.height - paintedBottom)) < 1e-9, `the gap should be symmetric: ${paintedTop} vs ${paintedBottom}`);
    assert.ok(Math.abs(paintedTop + (paintedBottom - paintedTop) / 2 - WINDOW.height / 2) < 1e-9, 'the content should be centred vertically');
});

test('viewport - the fit ignores where the view is looking', () => {
    // No state goes in, so a map left in a corner by a zoom fits back to the
    // same numbers as one that was never moved. That is what makes `fitToView`
    // idempotent - and what a `zoomTo` + `centerOn` composition cannot do,
    // because the pan band is empty at exactly-fitting zoom.
    const first = fitViewport(CONTENT, WINDOW, 'shrink');
    const second = fitViewport(CONTENT, WINDOW, 'shrink');

    assert.deepStrictEqual(second, first);
    // At the fitted factor the pan band really is empty, which is why the
    // origin had to be written rather than panned to.
    assert.strictEqual(viewportCanPan(CONTENT, WINDOW, first.scale), false);
    assert.deepStrictEqual(
        panViewportTo({ x: INSIDE.x, y: INSIDE.y, scale: first.scale }, new JmPoint(1e9, 1e9), CONTENT, WINDOW),
        { x: INSIDE.x, y: INSIDE.y, scale: first.scale },
        'a pan at the fitted factor must not move the map'
    );
});

test('viewport - a pan has room whenever the content overflows, at any factor', () => {
    // A 1000x500 map in a 900x600 box: the fit is 0.9, and at 0.9 the bands are
    // empty (0 horizontally, negative vertically). At 1.0 the map overflows
    // horizontally - so a finger drag must pan - even though the factor is not
    // above 1. That case is why `scale > 1` was the wrong test for the shell.
    const bounds: JmViewportBounds = { left: 0, top: 0, width: 1000, height: 500 };
    const box = new JmSize(900, 600);

    assert.strictEqual(fitViewport(bounds, box, 'shrink').scale, 0.9);
    assert.strictEqual(viewportCanPan(bounds, box, 0.9), false, 'exactly fitting leaves no band');
    assert.strictEqual(viewportCanPan(bounds, box, 1), true, '1x overflows here, so a drag must pan');
    assert.strictEqual(viewportCanPan(bounds, box, 0.5), false, 'zoomed out, the whole map is inside');

    // The report has to agree with the clamp it stands for, at every factor:
    // a pan moves the origin exactly when `canPan` says it can.
    for (const scale of [0.5, 0.9, 1, 2]) {
        const moved = panViewportTo({ x: 0, y: 0, scale }, new JmPoint(1e9, 1e9), bounds, box);
        const panned = moved.x !== 0 || moved.y !== 0;
        assert.strictEqual(panned, viewportCanPan(bounds, box, scale), `at ${scale}x the report and the clamp disagree`);
    }
});
