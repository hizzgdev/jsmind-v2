/*
 * Shell behaviour for a standalone jsMind page.
 *
 * The page carries three things: the renderer (window.jsMind, from the inlined
 * UMD bundle), the map as JSON in an inline <script> block, and this file.
 * Nothing here reaches the network and nothing here knows where the map came
 * from, so the same shell serves a page that was exported to disk and one an
 * editor fills in memory — only the data source changes.
 *
 * This file draws nothing. Panning, zooming and fitting are the library's job
 * (`jm.commands`), and the shell only says what the reader did: dragged this
 * far, turned the wheel there, double-clicked. Anything that measured the
 * rendered tree here instead would fork the layout from the library's, and the
 * editor this shell is meant to serve later would inherit the fork.
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

    /** Class that switches the host's cursor to "holding the map". */
    const DRAGGING_CLASS = 'jsmind-dragging';

    /**
     * How hard the wheel zooms, per pixel of reported scroll.
     *
     * Exponential rather than additive so that scrolling up then down by the
     * same amount returns to the same zoom, whatever the current level. 0.0015
     * puts a 100-pixel mouse notch at about 1.16x.
     */
    const ZOOM_PER_WHEEL_PIXEL = 0.0015;

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
     * Drags the map with the pointer.
     *
     * @remarks
     * Pointer events rather than mouse events, so a touch or a pen drags the
     * same way without a second code path. The capture is what keeps the drag
     * alive when the pointer leaves the host — without it, dragging past the
     * window edge would drop the map mid-gesture.
     *
     * @param {HTMLElement} container - Element to listen on.
     * @param {object} commands - The library's command surface.
     */
    function installDrag(container, commands) {
        let pointerId = null;
        let lastX = 0;
        let lastY = 0;

        container.addEventListener('pointerdown', event => {
            if (pointerId !== null || event.button !== 0) {
                return;
            }
            pointerId = event.pointerId;
            lastX = event.clientX;
            lastY = event.clientY;
            container.setPointerCapture(pointerId);
            container.classList.add(DRAGGING_CLASS);
        });

        container.addEventListener('pointermove', event => {
            if (event.pointerId !== pointerId) {
                return;
            }
            // The delta is in screen pixels, which is exactly what `panBy`
            // takes: the library turns it into map pixels for the current zoom.
            commands.panBy(event.clientX - lastX, event.clientY - lastY);
            lastX = event.clientX;
            lastY = event.clientY;
        });

        const release = event => {
            if (event.pointerId !== pointerId) {
                return;
            }
            pointerId = null;
            container.classList.remove(DRAGGING_CLASS);
            if (container.hasPointerCapture(event.pointerId)) {
                container.releasePointerCapture(event.pointerId);
            }
        };
        container.addEventListener('pointerup', release);
        container.addEventListener('pointercancel', release);
    }

    /**
     * Zooms with the wheel, about the pointer.
     *
     * @remarks
     * Anchored on the pointer, so the map point under the cursor stays under the
     * cursor: the reader aims at a branch and the branch comes closer. Zooming
     * about the middle instead would drift whatever was being looked at out of
     * view. A trackpad pinch arrives here as ctrl+wheel and takes the same path,
     * which is why no separate pinch handler exists for it.
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
                // Keeps the browser from scrolling the page or zooming itself.
                event.preventDefault();

                // Some mice report lines rather than pixels; 16 is the height
                // browsers use for a line in wheel units.
                const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
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
     * Returns to the whole map with a double-click.
     *
     * @remarks
     * A gesture rather than a button because the toolbar is the next item of
     * this plan, and a keyboard shortcut is out of scope for M2. When the
     * toolbar lands, its fit button calls the same command and this can go.
     *
     * @param {HTMLElement} container - Element to listen on.
     * @param {object} commands - The library's command surface.
     */
    function installReset(container, commands) {
        container.addEventListener('dblclick', () => {
            commands.fitToView();
        });
    }

    /**
     * Wires the map's gestures to the library's commands.
     *
     * @param {HTMLElement} container - Element the map is rendered into.
     * @param {object} commands - The library's command surface.
     */
    function installViewport(container, commands) {
        installDrag(container, commands);
        installWheel(container, commands);
        installReset(container, commands);
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
        // Fit only now: the scale is the ratio between the rendered map and the
        // box it has to fit into, and before the frames above there is no
        // rendered map to measure.
        jm.commands.fitToView();
        installViewport(container, jm.commands);
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
