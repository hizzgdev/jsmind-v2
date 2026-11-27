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

test('viewport - a zoom holds the map point under its anchor still where the content overflows', () => {
    // While there is a band, the anchored origin is taken as given: that is
    // what makes a wheel zoom feel like it grabs the map under the pointer.
    // The band is where a drag may go, not where a zoom must land, so the
    // anchor wins even where it points outside it. The case below is the axis
    // where there is no band at all.
    const state: JmViewportTransform = { x: 300, y: 200, scale: 1.5 };
    for (const anchor of [
        { x: 0, y: 0 },
        { x: 400, y: 300 },
        { x: 97, y: 313 },
        { x: 200, y: 150 },
    ]) {
        for (const scale of [1, 1.5, 2, 2.2, 4]) {
            const before = viewportPointAt(state, anchor);
            const after = zoomViewport(state, scale, anchor, CONTENT, WINDOW);
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

test('viewport - a zoom writes the middle on an axis whose content fits', () => {
    // The state this closes: the anchored origin at a factor that fits divides
    // by the new zoom and lands far outside the content, and the pan clamp
    // drops every candidate on an empty band - so the map used to end up off a
    // box it would have fitted, with no command that could bring it back.
    // 800x600 in a 400x300 box at 0.4 is smaller than the box on both axes, so
    // both are answered with the middle, whatever the anchor asks for.
    const state: JmViewportTransform = { x: 300, y: 200, scale: 1.5 };
    const centred = {
        x: CONTENT.left + (CONTENT.width - WINDOW.width / 0.4) / 2,
        y: CONTENT.top + (CONTENT.height - WINDOW.height / 0.4) / 2,
    };

    for (const anchor of [
        { x: 0, y: 0 },
        { x: 400, y: 300 },
        { x: 1000, y: 1000 },
    ]) {
        const zoomed = zoomViewport(state, 0.4, anchor, CONTENT, WINDOW);
        assert.deepStrictEqual(
            zoomed,
            { x: centred.x, y: centred.y, scale: 0.4 },
            `anchor ${anchor.x}/${anchor.y} should not move a map that fits`
        );
    }
});

test('viewport - one axis can fit while the other still holds its anchor', () => {
    // The two rules have to apply per axis, not per zoom: 800x100 in a 400x300
    // box at 2x overflows horizontally and fits vertically, so the same call
    // holds the anchor on one axis and centres the other. An implementation
    // that picked one rule for the whole zoom gets one of these numbers wrong.
    const wide: JmViewportBounds = { left: 100, top: 50, width: 800, height: 100 };
    const state: JmViewportTransform = { x: 650, y: 50, scale: 1 };
    const anchor = { x: 300, y: 300 };
    const zoomed = zoomViewport(state, 2, anchor, wide, WINDOW);

    assert.strictEqual(zoomed.scale, 2);

    // The overflowing axis keeps the point under the anchor, which here asks
    // for an origin past the band's far end (100 + 800 - 200 = 700): the band
    // is not a limit a zoom enforces, and a drag can still leave it.
    const held = state.x + anchor.x / state.scale;
    assert.strictEqual(zoomed.x, held - anchor.x / zoomed.scale, 'the overflowing axis keeps its anchor');
    assert.ok(zoomed.x > wide.left + wide.width - WINDOW.width / zoomed.scale, 'even past the band, where a pan can bring it back');

    // While the axis that fits is centred, so nothing is left off screen.
    assert.strictEqual(zoomed.y, wide.top + (wide.height - WINDOW.height / 2) / 2, 'the axis that fits is centred');

    // And the map is on screen: that is the claim the numbers above stand for.
    const painted = {
        left: (wide.left - zoomed.x) * zoomed.scale,
        right: (wide.left + wide.width - zoomed.x) * zoomed.scale,
        top: (wide.top - zoomed.y) * zoomed.scale,
        bottom: (wide.top + wide.height - zoomed.y) * zoomed.scale,
    };
    assert.ok(painted.right > 0 && painted.left < WINDOW.width, `horizontally on screen: ${painted.left}..${painted.right}`);
    assert.ok(painted.bottom > 0 && painted.top < WINDOW.height, `vertically on screen: ${painted.top}..${painted.bottom}`);
});

test('viewport - the anchor, not the middle of the box, is the point that stays still', () => {
    // A zoom about the centre is a different state from a zoom about a corner,
    // and only the anchor is promised to stay put. This is the assertion a
    // substitute anchor would break: the two ends of the box cannot both be
    // fixed by one zoom.
    const centre = { x: 200, y: 150 };
    const corner = { x: 10, y: 10 };

    const aboutCorner = zoomViewport(INSIDE, 3, corner, CONTENT, WINDOW);
    const pointAtCentre = viewportPointAt(aboutCorner, centre);
    const expectedAtCentre = viewportPointAt(INSIDE, centre);

    assert.ok(
        Math.abs(pointAtCentre.x - expectedAtCentre.x) > 1,
        'zooming about the corner should move the map point at the centre'
    );
    assert.ok(
        Math.abs(viewportPointAt(aboutCorner, corner).x - viewportPointAt(INSIDE, corner).x) < 1e-9,
        'the anchored point itself does not move'
    );
});

test('viewport - a zoom past the limit holds the anchor with the clamped factor', () => {
    const anchor = { x: 500, y: 100 };
    const before = viewportPointAt(INSIDE, anchor);
    const after = zoomViewport(INSIDE, 99, anchor, CONTENT, WINDOW);

    assert.strictEqual(after.scale, JmViewportScaleRange.max);
    const focus = viewportPointAt(after, anchor);
    assert.ok(Math.abs(focus.x - before.x) < 1e-9);
    assert.ok(Math.abs(focus.y - before.y) < 1e-9);
});

test('viewport - a zoom with an anchor that is not a number keeps a legal origin', () => {
    // A `0/0` from a box that was not measured yet. One NaN in the origin
    // leaves every node unpainted with no error pointing at the cause, so the
    // middle stands in - the same fallback `clampViewportScale` makes for the
    // factor itself.
    const zoomed = zoomViewport(INSIDE, 2, { x: Number.NaN, y: Number.NaN }, CONTENT, WINDOW);

    assert.strictEqual(zoomed.scale, 2);
    assert.ok(
        Number.isFinite(zoomed.x) && Number.isFinite(zoomed.y),
        `the origin should stay finite, got ${zoomed.x}/${zoomed.y}`
    );
    assert.ok(
        zoomed.x >= CONTENT.left && zoomed.x <= CONTENT.left + CONTENT.width - WINDOW.width / 2,
        `and inside the band on x: ${zoomed.x}`
    );
    assert.ok(
        zoomed.y >= CONTENT.top && zoomed.y <= CONTENT.top + CONTENT.height - WINDOW.height / 2,
        `and inside the band on y: ${zoomed.y}`
    );
});

test('viewport - a zoom before the content is measured leaves the anchored origin alone', () => {
    // `zoomTo` has no "is a map open" guard, so it can be called on a view whose
    // content rectangle is still the zero-sized one it started with. There is no
    // band and no middle to write there; the anchored origin is the answer, so
    // the first map opened afterwards is not displaced by the earlier call.
    const unmeasured: JmViewportBounds = { left: 0, top: 0, width: 0, height: 0 };
    const state: JmViewportTransform = { x: 12, y: 34, scale: 1 };
    const anchor = { x: 100, y: 60 };

    const zoomed = zoomViewport(state, 2, anchor, unmeasured, WINDOW);

    // The plain anchor arithmetic, unclamped: focus (112, 94) put at (100, 60)
    // at 2x is an origin of (62, 64).
    assert.deepStrictEqual(zoomed, { x: 62, y: 64, scale: 2 });
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

test('viewport - no zoom can leave a fitting map off its own screen', () => {
    // The invariant A buys, over every combination that matters: whatever the
    // content, the box, the pointer and the sequence of factors, an axis whose
    // content fits ends exactly in the middle. So `canPan === false` on an axis
    // means that axis is centred, and "the map fits" and "the map is off the
    // screen" cannot be true at once - the state #274 reports is unbuildable,
    // not merely escapable.
    //
    // The axis that still overflows keeps its anchored origin, as a wheel zoom
    // always has; nothing here requires it to land inside the band. What is
    // required of it is that a pan can still bring the map back inside the box.
    // Asserting that keeps the two cases apart: a rule that recentred every
    // axis would satisfy the first claim and give up the pointer anchor the UI
    // suite measures.
    const contents: JmViewportBounds[] = [
        { left: 0, top: 0, width: 1000, height: 500 },
        { left: -100, top: 20, width: 300, height: 900 },
        { left: 50, top: 40, width: 640, height: 480 },
        { left: 300, top: 500, width: 40, height: 30 },
    ];
    const boxes = [new JmSize(800, 600), new JmSize(320, 240), new JmSize(150, 120), new JmSize(2000, 1200)];
    const scales = [0.1, 0.4, 0.7, 1, 1.6, 2.4, 4];
    const pointers: [number, number][] = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
        [0.5, 0.5],
        [0.37, 0.81],
    ];

    const painted = (bounds: JmViewportBounds, state: JmViewportTransform) => ({
        left: (bounds.left - state.x) * state.scale,
        right: (bounds.left + bounds.width - state.x) * state.scale,
        top: (bounds.top - state.y) * state.scale,
        bottom: (bounds.top + bounds.height - state.y) * state.scale,
    });

    for (const bounds of contents) {
        for (const box of boxes) {
            for (const [fx, fy] of pointers) {
                const anchor = { x: fx * box.width, y: fy * box.height };
                // A sequence, not one call: the reported bug needed two zooms -
                // the first closed the band, the second then pushed the origin
                // out of a band that was already gone.
                let state: JmViewportTransform = { x: 0, y: 0, scale: 1 };
                for (const scale of scales) {
                    state = zoomViewport(state, scale, anchor, bounds, box);
                    const label =
                        `${bounds.width}x${bounds.height} in ${box.width}x${box.height}, ` +
                        `anchor ${anchor.x}/${anchor.y}, ${scale}x`;

                    for (const axis of ['x', 'y'] as const) {
                        const start = axis === 'x' ? bounds.left : bounds.top;
                        const size = axis === 'x' ? bounds.width : bounds.height;
                        const visible = axis === 'x' ? box.width : box.height;
                        const span = size - visible / state.scale;
                        if (!(span > 0)) {
                            assert.ok(
                                Math.abs(state[axis] - (start + span / 2)) < 1e-9,
                                `${label}: ${axis} fits, so it should be centred at ${start + span / 2}, it is ${state[axis]}`
                            );
                        }
                    }

                    // The whole map fits: it has to be on screen right away, not
                    // after a drag - that is the state no command could leave.
                    const direct = painted(bounds, state);
                    if (!viewportCanPan(bounds, box, state.scale)) {
                        assert.ok(
                            direct.left >= -1e-9 && direct.right <= box.width + 1e-9,
                            `${label}: the map fits but is off screen horizontally, ${direct.left}..${direct.right}`
                        );
                        assert.ok(
                            direct.top >= -1e-9 && direct.bottom <= box.height + 1e-9,
                            `${label}: the map fits but is off screen vertically, ${direct.top}..${direct.bottom}`
                        );
                    }

                    // One drag towards the middle always brings an overflowing
                    // map back inside the box, and leaves a fitting one centred.
                    const recovered = painted(
                        bounds,
                        panViewportTo(
                            state,
                            new JmPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2),
                            bounds,
                            box
                        )
                    );
                    assert.ok(
                        recovered.right > 0 && recovered.left < box.width,
                        `${label}: off screen horizontally even after a pan, ${recovered.left}..${recovered.right}`
                    );
                    assert.ok(
                        recovered.bottom > 0 && recovered.top < box.height,
                        `${label}: off screen vertically even after a pan, ${recovered.top}..${recovered.bottom}`
                    );
                }
            }
        }
    }
});

test('viewport - the two zooms that stranded the map now keep it on screen', () => {
    // The reported sequence, in the numbers the report gives: 1000x500 of
    // content in an 800x600 box, a zoom out at the top-left corner and then a
    // zoom in at the bottom-right one. That used to end at
    // {x: 857.14, y: 642.86, scale: 0.7}, which paints the content at
    // -600..100 x -450..-100 - entirely outside the box, with `canPan` false
    // and every pan a no-op. Both zooms leave the map fitting, so both write
    // the middle, and the state cannot be built at all.
    const content: JmViewportBounds = { left: 0, top: 0, width: 1000, height: 500 };
    const box = new JmSize(800, 600);

    const out = zoomViewport({ x: 0, y: 0, scale: 1 }, 0.4, { x: 0, y: 0 }, content, box);
    assert.deepStrictEqual(out, { x: -500, y: -500, scale: 0.4 }, 'the map now fits, so it is centred');
    assert.strictEqual(viewportCanPan(content, box, out.scale), false, 'and nothing can be panned');

    const back = zoomViewport(out, 0.7, { x: 800, y: 600 }, content, box);
    assert.strictEqual(back.scale, 0.7);
    assert.strictEqual(viewportCanPan(content, box, back.scale), false, 'it still fits at 0.7x');

    // The claim that matters: the painted content and the box still overlap.
    const painted = {
        left: (content.left - back.x) * back.scale,
        right: (content.left + content.width - back.x) * back.scale,
        top: (content.top - back.y) * back.scale,
        bottom: (content.top + content.height - back.y) * back.scale,
    };
    assert.ok(painted.right > 0, `the content's right edge is on screen: ${painted.right}`);
    assert.ok(painted.bottom > 0, `the content's bottom edge is on screen: ${painted.bottom}`);
    assert.ok(painted.left < box.width && painted.top < box.height, `and its left and top edges: ${painted.left}/${painted.top}`);
    assert.ok(Math.abs(painted.left + painted.right - box.width) < 1e-9, `centred horizontally: ${painted.left}..${painted.right}`);
    assert.ok(Math.abs(painted.top + painted.bottom - box.height) < 1e-9, `centred vertically: ${painted.top}..${painted.bottom}`);

    // A pan is still a no-op on a fitting map (#245), which is what makes this
    // a fix rather than a new escape hatch: the map is visible without one.
    assert.deepStrictEqual(panViewportTo(back, new JmPoint(0, 0), content, box), back);
});
