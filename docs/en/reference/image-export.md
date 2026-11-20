# Image export

Save a rendered mind map as a PNG (JPEG and WebP are also supported).

There are two entry points, and they share one implementation:

| Entry | Form |
|---|---|
| Browser | `await jm.exportImage(options)` → `Blob` |
| Command line | `jsmind export <file> <out.png>` |

See also the [image export](/en/reference/api/export) API reference and the [CLI](/en/guide/cli) page.

## 1. Size semantics

**The image size is the size of the content. There is no cropping and no added margin.**

The size maintained inside the view is the larger of the following two:

```
max(container size, mind-map content size + view padding)
```

So two cases appear, and both are the intended result:

- **Content smaller than the container** → the image is emitted at the container size, and the surrounding empty space is **kept**. That is an honest representation of “there was nothing here”.
- **Content larger than the container** → the view expands itself, the image expands with it, and **nothing is cropped at the container boundary**.

The “do not crop when it overflows the container” rule is easy to get wrong. The size of `.jsmind-inner` is determined by CSS, and `clientWidth` reads the **viewport**, not the mind map: if you use that as the export size, a large map is cropped to the window with no error. So the size is maintained by the view separately and passed explicitly to the export logic; it is not read off the element.

## 2. Browser API

```ts
const jm = await jsMind.create(container);
await jm.open(mind);

const { blob, width, height, cssWidth, cssHeight } = await jm.exportImage({
    scale: 2,             // output scale, default 2
    type: 'image/png',    // image/png | image/jpeg | image/webp
    quality: 0.9,         // only applies to jpeg / webp; ignored for png
    transparent: true,    // opt-in; default keeps the theme background
});

// The blob can be passed to createObjectURL, written into FormData, or given to the clipboard
const url = URL.createObjectURL(blob);
```

The four size fields in the return value:

| Field | Meaning |
|---|---|
| `width` / `height` | Pixel size of the output image |
| `cssWidth` / `cssHeight` | Layout size, i.e. `width / scale` |

Calling this when no mind map is open throws `JsMindError`.

## 3. Command line

```bash
jsmind export <file> <out.png> [options]
```

| Option | Default | Description |
|---|---|---|
| `--width <px>` | 1200 | Viewport width used for layout |
| `--height <px>` | 800 | Viewport height used for layout |
| `--scale <n>` | 2 | Output scale |
| `--type <format>` | image/png | Output format |
| `--transparent` | — | Transparent background (PNG and WebP; opt-in) |
| `--json` | — | Machine-readable output |

```bash
$ jsmind export example/v2-features.json preview.png
preview.png: 2400x1600 (174.9 KB)

$ jsmind export example/v2-features.json small.png --width 400 --height 300
small.png: 2095x1032 (145.0 KB)      # the viewport cannot hold it, so the image is larger, not cropped
```

**Chromium is required.** If it cannot be found, the command errors immediately and tells you to set `CHROME_PATH`; it will not degrade into “a blank image was exported”. CI runs a separate `google-chrome --version` step before exporting, so a missing browser looks like a missing browser, not like a rendering bug.

Exit codes follow the CLI contract: `0` success, `1` illegal data (validate first, do not start the browser), `2` argument error, `3` I/O or runtime failure.

## 4. How it is implemented

### Why foreignObject

Browsers have **no** API that turns a DOM subtree into pixels. The closest options, Element Capture / Region Capture, are part of the Screen Capture API and require a user-permission prompt; a script cannot call them on its own.

The common approach in the industry (libraries such as snapDOM) is to hand the markup back to the browser's rendering engine:

```
Clone the rendered result → wrap it in an SVG <foreignObject> → decode with Image → drawImage → toBlob
```

**canvas is used here only for encoding, not for redrawing.** That is the key difference from “drawing every node and connection again with the canvas API” — the latter would mean writing a second renderer, in which wrapping, shadows, and Bézier curves would all have to be reimplemented, and the result would inevitably differ from the DOM.

Because the markup reuses the result the browser has already computed, the exported image matches what is on screen, including where text wraps.

### Five silent failure pits

These were all hit in practice, and **none of them throws**; they only show up as a wrong image:

1. **A `blob:` URL taints the canvas.** Once the SVG contains a `foreignObject`, Chrome treats it as cross-origin, and `toBlob` throws `SecurityError`. A `data:` URL must be used.

2. **The `outerHTML` of an `<svg>` element has no `xmlns`.** The element is already in the SVG namespace, so the serializer omits it. But this markup has to be re-parsed as XHTML; without the namespace it is just an unknown element, and **the entire connection layer is not drawn**.

3. **Theme CSS variables are set on the host and are not taken along by a clone.** Inline variables on nodes are cloned; those on the host are not. If they are missed, every node loses its fill, border, radius, and shadow, and the export is left with bare text.

4. **Iterating a `CSSStyleDeclaration` with `for...of` yields indexes.** You get `"0"`, `"1"` instead of property names, so filtering on the `--jm-` prefix yields nothing, silently. Read the element's inline `style` attribute.

5. **A computed `font-family` may include quotes.** The quotes in `"Times New Roman"` end the XML attribute early, SVG parsing fails, and `Image.onerror` only says "failed to load".

Two more things are not pits, but are worth knowing: the container's own `overflow: auto` would draw scrollbars into the image (export sets it to `visible`); hidden children of a folded branch still occupy a box at (0,0), and anything that computes a range from the union of nodes will be pulled off by them.

## 5. Related files

| File | Responsibility |
|---|---|
| `src/view/export.ts` | Clone, assemble the SVG, decode, encode |
| `src/application/jsmind.ts` | Public `exportImage()` entry |
| `src/cli/browser.ts` | Headless browser + DevTools protocol |
| `src/cli/commands/export.ts` | `jsmind export` |

The preview image on a CI pull request is produced by `jsmind export`. There is no longer a separate screenshot script — the preview image and the image a user gets must come from the same path.
