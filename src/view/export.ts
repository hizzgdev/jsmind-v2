/**
 * @fileoverview Turns the rendered content of the view's shadow root into an image.
 *
 * The browser has no API that converts a DOM subtree into pixels. Element
 * Capture and Region Capture come closest, but both sit on top of the Screen
 * Capture API and need the user to grant a capture prompt, which rules them out
 * for an export a script can call.
 *
 * What every DOM-to-image library does instead, and what this does, is hand the
 * markup back to the browser as an SVG `<foreignObject>` and let the rendering
 * engine paint it. Canvas only appears at the very end, to turn those pixels
 * into a file: `drawImage` then `toBlob`. Nothing is redrawn by hand, so the
 * output matches the view exactly, including text wrapping, shadows and the
 * theme.
 *
 * Excluded from the unit coverage figure (see `test:coverage` in package.json).
 * Everything left here talks to the browser - cloneNode, Image, canvas - so the
 * unit suite cannot reach a line of it. The UI suite exercises it for real,
 * against the built bundle, but a bundle carries no source line numbers to
 * report coverage against. The parts worth asserting in isolation live in
 * `export-svg.ts`; what remains is calls into browser APIs with no logic to check.
 */

import { JsMindError } from '../common/error.ts';
import { collectHostVariables, escapeAttribute, escapeText } from './export-svg.ts';

/** Image formats a caller may ask for. */
export const JmImageType = {
    Png: 'image/png',
    Jpeg: 'image/jpeg',
    Webp: 'image/webp',
} as const;

export type JmImageType = typeof JmImageType[keyof typeof JmImageType];

/** Options for {@link captureShadowContent}. */
export interface JmExportImageOptions {
    /**
     * Device pixel ratio to render at. 2 gives a crisp result on high-density
     * screens and stays cheap; 1 mirrors what the user sees.
     */
    scale?: number;
    /** Output format. JPEG and WebP are lossy, PNG is not. */
    type?: JmImageType;
    /**
     * Quality for the lossy formats, 0 to 1. Ignored for PNG, where the browser
     * rejects a quality argument.
     */
    quality?: number;
}

/** What a capture produced. */
export interface JmExportImageResult {
    blob: Blob;
    /** Pixel width of the image, i.e. the content width times `scale`. */
    width: number;
    /** Pixel height of the image. */
    height: number;
    /** Content width in CSS pixels, before scaling. */
    cssWidth: number;
    /** Content height in CSS pixels, before scaling. */
    cssHeight: number;
}

const DEFAULT_SCALE = 2;

/**
 * Reads the shadow root's stylesheet back out.
 *
 * External stylesheets cannot reach into a shadow tree, which is why the view
 * carries its CSS as a string in the first place - that same string is what gets
 * inlined here.
 */
function collectStyles(root: ShadowRoot): string {
    const sheets = root.querySelectorAll('style');
    return Array.from(sheets)
        .map(sheet => sheet.textContent ?? '')
        .join('\n');
}

/**
 * Renders the shadow root's content to an image blob.
 *
 * The size is the content's own size, as laid out: the view sizes the map to
 * the larger of the container and the content, so whitespace the map does not
 * fill is kept and a map larger than its container is not cropped.
 *
 * @param host - The element the shadow root is attached to.
 * @param root - The view's shadow root.
 * @param size - The content size in CSS pixels, from the view.
 * @param options - Scale, format and quality.
 * @returns The encoded image plus its dimensions.
 * @throws {@link JsMindError} If there is nothing to capture, if the generated
 * SVG does not parse, or if the browser refuses to encode the canvas.
 */
export async function captureShadowContent(
    host: HTMLElement,
    root: ShadowRoot,
    size: { width: number; height: number },
    options: JmExportImageOptions = {}
): Promise<JmExportImageResult> {
    const scale = options.scale ?? DEFAULT_SCALE;
    const type = options.type ?? JmImageType.Png;

    const inner = root.querySelector<HTMLElement>('.jsmind-inner');
    if (!inner) {
        throw new JsMindError('Nothing to capture: the view has no rendered content.');
    }

    // The size comes from the caller, not from the element. The inner container
    // is sized by its own container through CSS, so `clientWidth` reports the
    // viewport, not the map: a map larger than the box would be captured
    // cropped to the box. The view keeps the real size separately and hands it
    // over here.
    const cssWidth = size.width;
    const cssHeight = size.height;
    if (cssWidth === 0 || cssHeight === 0) {
        throw new JsMindError(
            `Nothing to capture: the rendered content has no size (${cssWidth}x${cssHeight}).`
        );
    }

    const clone = inner.cloneNode(true) as HTMLElement;
    clone.style.position = 'absolute';
    clone.style.left = '0';
    clone.style.top = '0';
    clone.style.margin = '0';
    // The container scrolls; inside a picture that would paint scrollbars.
    clone.style.overflow = 'visible';
    // It is already positioned in the export, not offset by a view pan.
    clone.style.transform = 'none';

    // `outerHTML` of a live <svg> carries no xmlns: the element is in the SVG
    // namespace already, so the serializer omits it. Reparsed as XHTML it is an
    // unknown element and paints nothing at all - which is how the edge layer
    // silently disappears from the export.
    for (const svg of Array.from(clone.querySelectorAll('svg'))) {
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }

    const hostStyle = getComputedStyle(host);
    const wrapperStyle = escapeAttribute(
        [
            `width:${cssWidth}px`,
            `height:${cssHeight}px`,
            'position:relative',
            'overflow:hidden',
            `background:${hostStyle.backgroundColor}`,
            `font-family:${hostStyle.fontFamily}`,
            collectHostVariables(host.getAttribute('style')),
        ]
            .filter(Boolean)
            .join(';')
    );

    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${cssWidth}" height="${cssHeight}">` +
        '<foreignObject x="0" y="0" width="100%" height="100%">' +
        `<div xmlns="http://www.w3.org/1999/xhtml" style="${wrapperStyle}">` +
        `<style>${escapeText(collectStyles(root))}</style>` +
        clone.outerHTML +
        '</div></foreignObject></svg>';

    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
    if (parsed.querySelector('parsererror')) {
        throw new JsMindError('Failed to render the view to an image: the generated SVG is malformed.');
    }

    // A blob: URL taints the canvas once the SVG carries a foreignObject, so
    // toBlob throws SecurityError. A data: URL keeps the document same-origin.
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const image = await loadImage(dataUrl);

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(cssWidth * scale);
    canvas.height = Math.round(cssHeight * scale);

    const context = canvas.getContext('2d');
    if (!context) {
        throw new JsMindError('Failed to render the view to an image: 2D canvas is unavailable.');
    }
    context.scale(scale, scale);
    context.drawImage(image, 0, 0);

    const blob = await encodeCanvas(canvas, type, options.quality);

    return {
        blob,
        width: canvas.width,
        height: canvas.height,
        cssWidth,
        cssHeight,
    };
}

/** Loads a data URL into a decoded image. */
function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        // The error event carries no detail beyond "failed to load", so the
        // message has to say where to look.
        image.onerror = () =>
            reject(new JsMindError('Failed to render the view to an image: the SVG did not load.'));
        image.src = src;
    });
}

/** Encodes a canvas, passing a quality only for the lossy formats. */
function encodeCanvas(
    canvas: HTMLCanvasElement,
    type: JmImageType,
    quality: number | undefined
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const done = (blob: Blob | null): void => {
            if (blob === null) {
                reject(new JsMindError(`Failed to encode the image as ${type}.`));
            } else {
                resolve(blob);
            }
        };
        // PNG has no quality knob; passing one makes some browsers treat the
        // argument as a format hint and fall back to a different encoder.
        if (type === JmImageType.Png || quality === undefined) {
            canvas.toBlob(done, type);
        } else {
            canvas.toBlob(done, type, quality);
        }
    });
}
