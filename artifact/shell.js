/*
 * Shell behaviour for a standalone jsMind page.
 *
 * The page carries three things: the renderer (window.jsMind, from the inlined
 * UMD bundle), the map as JSON in an inline <script> block, and this file.
 * Nothing here reaches the network and nothing here knows where the map came
 * from, so the same shell serves a page that was exported to disk and one an
 * editor fills in memory — only the data source changes.
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
