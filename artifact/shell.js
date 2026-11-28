/*
 * Shell behaviour for a standalone jsMind page.
 *
 * The page carries three things: the renderer (window.jsMind, from the inlined
 * UMD bundle), the map as JSON in an inline <script> block, and this file.
 * Nothing here reaches the network and nothing here knows where the map came
 * from, so the same shell serves a page that was exported to disk and one an
 * editor fills in memory — only the data source changes.
 *
 * Gestures are reported, not implemented: the shell says what the reader did
 * ("turned the wheel there") and the library decides what that means for the
 * map. Measuring the rendered tree here instead would fork the layout from the
 * library's, and the editor this shell is meant to serve later would inherit
 * the fork.
 */
/* global jsMind */
(function () {
    'use strict';

    /** Element the map is rendered into. */
    const CONTAINER_ID = 'jsmind';

    /** Block holding the map document. */
    const DATA_ID = 'jsmind-data';

    /** Element that carries a failure message. */
    const ERROR_ID = 'jsmind-error';

    /**
     * How hard the wheel zooms, per pixel of reported scroll.
     *
     * Exponential rather than additive so that scrolling up then down by the
     * same amount returns to the same zoom, whatever the current level. 0.0015
     * puts a 100-pixel mouse notch at about 1.16x.
     */
    const ZOOM_PER_WHEEL_PIXEL = 0.0015;

    /**
     * Pixels in one line of a line-mode wheel event.
     *
     * Firefox reports `deltaMode === 1` (lines) while Chrome and Safari report
     * pixels, and a bare line count fed to the ratio below would zoom by a
     * rounding error. 16 is the height browsers assume for a line in wheel
     * units.
     */
    const PIXELS_PER_WHEEL_LINE = 16;

    /**
     * Reads the mind map document embedded in this page.
     *
     * Kept on its own on purpose: this is the only function that knows the
     * document arrives as an inline script block. An online editor reusing this
     * shell replaces this function and leaves the rest alone.
     *
     * @returns {object} The parsed mind map document.
     */
    function readInlineData() {
        const element = document.getElementById(DATA_ID);
        if (element === null) {
            throw new Error('no #' + DATA_ID + ' block in the page');
        }
        return JSON.parse(element.textContent || '');
    }

    /**
     * Claims touch drags for the map while a pan has room, and gives them back
     * to the page otherwise.
     *
     * @remarks
     * On a touch screen this is the only lever there is: `preventDefault`
     * cannot cancel a pan the browser has already started, so `touch-action`
     * has to say what a finger on the map means *before* the gesture begins.
     * Which means it also has to be re-decided after everything that changes
     * the zoom - the wheel, the double-click that fits the map - because
     * whether a drag can move the map is a function of the zoom.
     *
     * The test is the library's own: `canPan` is the same "is there a band to
     * pan inside" that the pan itself checks. It used to be `scale > 1` here,
     * which was true only while this shell grew the host to the map's own size
     * - at that size a band opens as soon as the zoom passes 1. The host is now
     * the viewport, so the band is about the content and the box: a map a
     * little larger than the window fits at 0.9, and at 1.0 it is already
     * overflowing while the old test still said the drag belonged to the page.
     * Nothing scrolls the page any more, so that answer left a region no finger
     * could move.
     *
     * Asking rather than measuring: the content's size is the library's, and
     * measuring it here would fork the layout from the one being drawn.
     *
     * @param {HTMLElement} container - Element to listen on.
     * @param {object} commands - The library's command surface.
     */
    function syncPanTouchAction(container, commands) {
        container.style.touchAction = commands.getViewport().canPan ? 'none' : '';
    }

    /**
     * Zooms with the wheel, about the pointer.
     *
     * @remarks
     * Anchored on the pointer, so the map point under the cursor stays under
     * the cursor: the reader aims at a branch and the branch comes closer.
     * Zooming about the middle of the view instead would drift whatever was
     * being looked at out of the window. Which point stays still is passed in
     * rather than inferred, which is what keeps a trackpad pinch - it arrives
     * here as ctrl+wheel - on this same path instead of needing its own.
     *
     * @param {HTMLElement} container - Element to listen on.
     * @param {object} commands - The library's command surface.
     */
    function installWheel(container, commands) {
        container.addEventListener(
            'wheel',
            event => {
                if (event.deltaY === 0) {
                    return;
                }
                // Keeps the browser from scrolling the page or zooming the whole
                // page itself: the wheel over a map means "zoom the map".
                event.preventDefault();

                const delta = event.deltaMode === 1 ? event.deltaY * PIXELS_PER_WHEEL_LINE : event.deltaY;
                const current = commands.getViewport().scale;
                const box = container.getBoundingClientRect();
                commands.zoomTo(current * Math.exp(-delta * ZOOM_PER_WHEEL_PIXEL), {
                    x: event.clientX - box.left,
                    y: event.clientY - box.top,
                });
                // The zoom is what opens and closes the band a pan needs, so
                // what a finger on the map means is re-decided here.
                syncPanTouchAction(container, commands);
            },
            { passive: false }
        );
    }

    /**
     * Pans with a drag.
     *
     * @remarks
     * One handler for mouse, pen and touch: a pointer event carries all three,
     * and `setPointerCapture` keeps the moves arriving after the pointer leaves
     * the map - without it a fast drag stops at the element's edge and the map
     * lags behind the hand for the rest of the gesture.
     *
     * The shell reports travel and nothing else. How far the pointer moved is
     * all it knows; turning that into a map offset is the library's arithmetic,
     * because `panBy` divides by the zoom and clamps to the content. Measuring a
     * size here would fork the layout from the library's own.
     *
     * @param {HTMLElement} container - Element to listen on.
     * @param {object} commands - The library's command surface.
     */
    function installPan(container, commands) {
        /** Pointer the gesture belongs to, or null when nothing is being dragged. */
        let draggedPointer = null;
        /** Last pointer position, in viewport pixels. */
        let lastX = 0;
        let lastY = 0;

        container.addEventListener('pointerdown', event => {
            // Left button only, and one pointer at a time: a second finger on a
            // map that is already being dragged would fight the first.
            if (draggedPointer !== null || event.button !== 0) {
                return;
            }
            draggedPointer = event.pointerId;
            lastX = event.clientX;
            lastY = event.clientY;
            container.setPointerCapture(event.pointerId);
            // Suppresses the default the press would otherwise start: a text
            // selection, or a native drag of whatever is under the pointer.
            event.preventDefault();
        });

        container.addEventListener('pointermove', event => {
            if (event.pointerId !== draggedPointer) {
                return;
            }
            const dx = event.clientX - lastX;
            const dy = event.clientY - lastY;
            if (dx === 0 && dy === 0) {
                return;
            }
            lastX = event.clientX;
            lastY = event.clientY;
            commands.panBy(dx, dy);
        });

        const endDrag = event => {
            if (event.pointerId === draggedPointer) {
                draggedPointer = null;
            }
        };
        container.addEventListener('pointerup', endDrag);
        container.addEventListener('pointercancel', endDrag);
        // Capture can be lost without an up (the element was removed, the tab
        // lost focus); the next press has to start a new gesture regardless.
        container.addEventListener('lostpointercapture', endDrag);
    }

    /**
     * Double-click returns the map to the whole of itself.
     *
     * @remarks
     * The page opens on the map as it was laid out - not fitted, because which
     * view a reader should see first is the page's decision and, on a large
     * map, a fit is a wall of unreadable text. This gesture is the way to the
     * whole of it from there, and the way back from a zoom that went into a
     * corner; it is the only one a page without a toolbar can offer.
     *
     * `'shrink'` and not `'expand'`: the reader is asking to see everything,
     * so the fit may only scale down. Blowing a small map up to the size of the
     * window would answer a different question than the one the gesture asked,
     * and the page opens unfitted, so a reader who wanted that would not be
     * looking at a fitted map in the first place.
     *
     * The presses that make a double-click also reach `installPan`, so the
     * first two can move the map by a pixel or two before the click lands.
     * Nothing has to be done about that: this runs after the second press has
     * ended and writes the whole viewport, so whatever those drags did is
     * replaced by the fit. A movement threshold would only stop small drags
     * from working.
     *
     * @param {HTMLElement} container - Element to listen on.
     * @param {object} commands - The library's command surface.
     */
    function installDoubleClick(container, commands) {
        container.addEventListener('dblclick', () => {
            commands.fitToView('shrink');
            // A fit is a zoom change, so what a finger on the map means is
            // re-decided here exactly as it is after a wheel turn.
            syncPanTouchAction(container, commands);
        });
    }

    /**
     * Renders one document into one container.
     *
     * Independent of where the document came from: this is the entry an online
     * editor calls, with data it fetched itself.
     *
     * @param {HTMLElement} container - Element to render into.
     * @param {object} data - Mind map document, in the v2 JSON format.
     * @returns {Promise<object>} The jsMind instance showing the map.
     */
    async function render(container, data) {
        // The instance owns the box from its construction: taking it over is the
        // default mode, and the instance applies it when the map is opened. That
        // is what keeps a map larger than the window from opening with a
        // scrollbar on each axis that the first gesture would then remove, and
        // it is the only way the gestures below have a map to move.
        const jm = await jsMind.create(container);
        const mind = jsMind.Serializer.create('json').deserialize(data);
        await jm.open(mind);
        // Nothing is fitted here. A map opens at its natural size, which is the
        // size its text was written for: fitting a large map to the window
        // shrinks it until the labels are unreadable, and that is a decision for
        // whoever is showing the map, not for the page that renders one. The
        // double-click below is this page's answer to "show me all of it", and
        // it is only made when the reader asks.
        // The touch rule still has to be decided up front, from the state the
        // map opens in: the box does not scroll any more, so without it the
        // browser keeps a finger drag for itself and the map never sees it.
        syncPanTouchAction(container, jm.commands);
        installWheel(container, jm.commands);
        installPan(container, jm.commands);
        installDoubleClick(container, jm.commands);
        return jm;
    }

    /**
     * Reports a failed render in the page instead of leaving it blank.
     *
     * @param {unknown} error - What went wrong.
     */
    function showFailure(error) {
        const element = document.getElementById(ERROR_ID);
        if (element === null) {
            return;
        }
        const message = error && error.message ? error.message : String(error);
        element.textContent = 'This page could not render the mind map: ' + message;
        element.hidden = false;
    }

    /**
     * Reads this page's document and renders it.
     */
    async function main() {
        const container = document.getElementById(CONTAINER_ID);
        try {
            await render(container, readInlineData());
        } catch (error) {
            showFailure(error);
        }
    }

    main();
})();
