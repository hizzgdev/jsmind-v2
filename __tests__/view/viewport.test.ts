/**
 * @fileoverview The viewport arithmetic, without a browser.
 *
 * @remarks
 * These are the functions that decide where the map ends up after a command, so
 * they are pure and tested here: no DOM, no layout, no guessed pixel sizes. What
 * the browser does with the resulting `transform` is a different question, and
 * `__tests__/ui/viewport.test.ts` answers that one against real rendered boxes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { JmPoint, JmSize } from '../../src/common/index.ts';
import {
    clampViewportScale,
    fitViewportScale,
    JmViewportScaleRange,
    panViewport,
    viewportCssTransform,
    viewportOriginFor,
    viewportPointAt,
    zoomViewport,
} from '../../src/view/viewport.ts';

/** A 800x600 map seen through a 400x300 window: the interesting case, 2x too big. */
const bigContent = new JmSize(800, 600);
const smallViewport = new JmSize(400, 300);

describe('clampViewportScale', () => {
    it('passes a usable factor through unchanged', () => {
        assert.equal(clampViewportScale(1), 1);
        assert.equal(clampViewportScale(2.5), 2.5);
    });

    it('holds the ends of the range', () => {
        assert.equal(clampViewportScale(99), JmViewportScaleRange.max);
        assert.equal(clampViewportScale(0.000001), JmViewportScaleRange.min);
    });

    it('refuses to store a factor that is not a number', () => {
        // A wheel event with a zero delta, or a ratio against a box that has not
        // been laid out yet, produces these. Storing one would poison every
        // later transform with NaN and lose the map for good.
        assert.equal(clampViewportScale(Number.NaN), 1);
        assert.equal(clampViewportScale(Number.POSITIVE_INFINITY), 1);
    });
});

describe('fitViewportScale', () => {
    it('shrinks content that is too big for the window', () => {
        assert.equal(fitViewportScale(bigContent, smallViewport), 0.5);
    });

    it('takes the tighter of the two axes', () => {
        // 400/800 is 0.5 and 300/100 is 3, so the width decides.
        assert.equal(fitViewportScale(new JmSize(800, 100), smallViewport), 0.5);
        assert.equal(fitViewportScale(new JmSize(100, 600), smallViewport), 0.5);
    });

    it('never magnifies content that already fits', () => {
        // A small map shown at 1x is the same document rendered at the same
        // size whatever the window; blowing it up would make the page's zoom
        // depend on the monitor.
        assert.equal(fitViewportScale(new JmSize(100, 100), smallViewport), 1);
    });

    it('answers 1 when nothing has been measured yet', () => {
        assert.equal(fitViewportScale(new JmSize(0, 0), smallViewport), 1);
        assert.equal(fitViewportScale(bigContent, new JmSize(0, 0)), 1);
    });
});

describe('viewportPointAt', () => {
    it('reads the map point under a viewport point', () => {
        const point = viewportPointAt({ x: 100, y: 50, scale: 2 }, { x: 40, y: 20 });
        assert.equal(point.x, 120);
        assert.equal(point.y, 60);
    });
});

describe('viewportOriginFor', () => {
    it('puts the focus point at the anchor', () => {
        const focus = new JmPoint(500, 400);
        const anchor = { x: 100, y: 75 };
        const origin = viewportOriginFor(focus, anchor, 2);

        // Round trip: reading the anchor point back has to return the focus.
        const back = viewportPointAt({ x: origin.x, y: origin.y, scale: 2 }, anchor);
        assert.equal(back.x, focus.x);
        assert.equal(back.y, focus.y);
    });
});

describe('panViewport', () => {
    it('moves the map by the distance in screen pixels', () => {
        const next = panViewport({ x: 100, y: 100, scale: 1 }, -30, 20);
        assert.deepEqual(next, { x: 130, y: 80, scale: 1 });
    });

    it('converts the distance into map pixels at the current zoom', () => {
        // Dragging 100 screen pixels at 2x moves the map 50 map pixels: the map
        // has to follow the pointer, not a fixed step in its own units.
        const next = panViewport({ x: 0, y: 0, scale: 2 }, 100, -100);
        assert.deepEqual(next, { x: -50, y: 50, scale: 2 });
    });

    it('leaves the zoom factor alone', () => {
        assert.equal(panViewport({ x: 5, y: 5, scale: 1.75 }, 10, 10).scale, 1.75);
    });
});

describe('zoomViewport', () => {
    it('keeps the map point under the anchor where it was', () => {
        const before = { x: 120, y: 80, scale: 1 };
        const anchor = { x: 200, y: 150 };
        const focus = viewportPointAt(before, anchor);

        const after = zoomViewport(before, 3, anchor);

        assert.equal(after.scale, 3);
        const stillThere = viewportPointAt(after, anchor);
        assert.ok(Math.abs(stillThere.x - focus.x) < 1e-9, `x drifted to ${stillThere.x}`);
        assert.ok(Math.abs(stillThere.y - focus.y) < 1e-9, `y drifted to ${stillThere.y}`);
    });

    it('clamps the factor it is given', () => {
        const anchor = { x: 0, y: 0 };
        assert.equal(zoomViewport({ x: 0, y: 0, scale: 1 }, 50, anchor).scale, JmViewportScaleRange.max);
        assert.equal(zoomViewport({ x: 0, y: 0, scale: 1 }, 0.0001, anchor).scale, JmViewportScaleRange.min);
    });
});

describe('viewportCssTransform', () => {
    it('is none at the identity', () => {
        // A view nobody asked to pan or zoom must carry no transform at all, so
        // that it lays out exactly as it did before viewports existed.
        assert.equal(viewportCssTransform({ x: 0, y: 0, scale: 1 }), 'none');
    });

    it('scales the origin offset together with the map', () => {
        // translate comes first so the scale applies to the map and to the
        // offset: map point p lands at scale * (p - x) viewport pixels.
        assert.equal(
            viewportCssTransform({ x: 100, y: 50, scale: 2 }),
            'translate(-200px, -100px) scale(2)'
        );
    });
});
