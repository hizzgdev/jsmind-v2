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
     * Grows the host to the size the renderer gave the map.
     *
     * The renderer centers the map in a box of its own and clips what leaves
     * it, so a host left at the viewport size silently crops a map that is
     * larger than the window. The shadow root's scroll box reports the map's
     * real size through scrollWidth/scrollHeight; sizing the host to that turns
     * the inner box into a no-op and leaves the page with one native scrollbar.
     *
     * Item 3 of the export plan (pan, zoom and fit-to-screen) replaces this
     * hand-rolled fit. Until it lands this is what keeps a large map reachable.
     *
     * @param {HTMLElement} container - The element the map is rendered into.
     */
    function fitToContent(container) {
        const root = container.shadowRoot;
        if (!root) {
            return;
        }
        const inner = root.querySelector('.jsmind-inner');
        if (!inner) {
            return;
        }
        container.style.width = inner.scrollWidth + 'px';
        container.style.height = inner.scrollHeight + 'px';
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
            },
            { passive: false }
        );
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
        const jm = await jsMind.create(container);
        const mind = jsMind.Serializer.create('json').deserialize(data);
        await jm.open(mind);
        // Two frames: fonts and the shadow stylesheet settle in the first, and
        // the second measures the layout they produced.
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        fitToContent(container);
        installWheel(container, jm.commands);
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
