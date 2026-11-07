# jsMind V2 Examples

Two pages and one data file.

## Pages

**`demo.html`** — the API in its simplest form: build a map, render it, change something.

**`playground.html`** — every option on one page, with a live code editor. Use this one when you want to see what a field actually does rather than read about it.

### How to run

1. Build the library:

   ```bash
   npm run build
   ```

2. Serve the repository root — the pages load `../dist/jsmind.js`, and `file://` will hit CORS:

   ```bash
   npm run server
   ```

3. Open `http://localhost:8080/example/demo.html` or `.../playground.html`.

## `v2-features.json`

A map that exercises the v2 feature set — tones, per-node styles, folded branches, attachments, every edge pattern. Its job is to have something in it that breaks if a feature regresses.

Two places use it:

- **CI** renders it to the preview image on every pull request, so a rendering regression shows up as a visibly wrong picture rather than a passing test.
- **`docs/features/image-export.md`** uses it in the CLI examples.

Neither page loads it — they build their maps inline so they stay readable as standalone documents. That makes this file a test fixture that happens to sit next to the examples rather than sample data for them. What the two have in common is only that both are things a reader wants to open, and one directory beats a second plural directory holding a single file.