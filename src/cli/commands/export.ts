/**
 * `jsmind export image` — render a mind map file to an image.
 *
 * The rendering itself happens in a browser, because the picture is produced by
 * handing the markup back to a rendering engine. This command only drives it:
 * load, open, ask the page for a blob, write the bytes.
 *
 * `export` is a group: its first positional word names what is produced, and
 * this module owns the only kind there is so far. {@link EXPORT_KINDS} is the
 * list a caller sees, and {@link EXPORT_KIND_OPTIONS} says what each kind takes
 * — so a second kind is a value in those two tables, not a command.
 *
 * @packageDocumentation
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, extname } from 'node:path';

import { validateMindData } from '../../serialization/validation.ts';
import { readJsonFile } from '../io.ts';
import { CliExit, CliError, usageError } from '../exit.ts';
import { openBrowser, isPageError } from '../browser.ts';
import { JmImageType, shouldExportTransparent } from '../../view/export.ts';

/** Viewport the map is laid out in when the caller does not say. */
export const DEFAULT_WIDTH = 1200;

/** Viewport height, same default reasoning. */
export const DEFAULT_HEIGHT = 800;

/** Rendered at 2x by default: crisp on a dense screen, still cheap. */
export const DEFAULT_SCALE = 2;

/**
 * What `export` can produce, in the order the group help lists it.
 *
 * @remarks
 * The first positional word after `export` selects one of these. `usage` and
 * `summary` are printed side by side on the group page, so a kind without a
 * line here would be a value a caller can type and not read about.
 */
export const EXPORT_KINDS = [
    {
        name: 'image',
        usage: '<file> <out.png>',
        summary: 'Render the map to an image  (PNG, JPEG or WebP)',
    },
] as const;

/** A word the `export` group accepts as its kind. */
export type ExportKind = (typeof EXPORT_KINDS)[number]['name'];

/**
 * Options each kind reads, beyond the global ones.
 *
 * @remarks
 * Keyed by kind rather than kept as one flat list: a flag belongs to the kind
 * that reads it, so `html` later brings its own set instead of a table that has
 * to annotate which of its entries do nothing there.
 *
 * Declared for the allow-list in `../options.ts`: a flag missing from its
 * kind's list is one that kind would silently drop.
 */
export const EXPORT_KIND_OPTIONS: Record<ExportKind, readonly string[]> = {
    image: ['width', 'height', 'scale', 'type', 'transparent'],
};

/** The encodings `--type` accepts, as the words this CLI uses. */
export const EXPORT_TYPES = ['png', 'jpeg', 'webp'] as const;

/** One value of {@link EXPORT_TYPES}. */
export type ExportType = (typeof EXPORT_TYPES)[number];

/**
 * Spellings accepted for a value of {@link EXPORT_TYPES}.
 *
 * @remarks
 * `jpg` is what a camera writes, so callers reach for it; `jpeg` is the one
 * spelling the help teaches, because a page that offers two for one format
 * makes the reader wonder which is right. Both mean JPEG here and nowhere else
 * in the program does the pair exist — {@link exportTypeOption} resolves it
 * before any other code sees the value.
 */
const EXPORT_TYPE_ALIASES: Record<string, ExportType> = {
    png: 'png',
    jpeg: 'jpeg',
    jpg: 'jpeg',
    webp: 'webp',
};

/** What each CLI word means to the renderer. */
const EXPORT_TYPE_MIME: Record<ExportType, JmImageType> = {
    png: JmImageType.Png,
    jpeg: JmImageType.Jpeg,
    webp: JmImageType.Webp,
};

/** The CLI word for a MIME type, for the messages this module writes. */
const EXPORT_TYPE_NAMES: Record<string, ExportType> = {
    [JmImageType.Png]: 'png',
    [JmImageType.Jpeg]: 'jpeg',
    [JmImageType.Webp]: 'webp',
};

/**
 * Reads `--type` in the CLI's own vocabulary and resolves it to a MIME type.
 *
 * @param raw - The parsed option, or `undefined` when it was not given.
 * @returns The type to encode with; PNG when the flag is absent.
 * @throws {@link CliError} With `Usage` when the value is not an accepted
 *         spelling.
 * @remarks
 * The short names are command-line words only. `JmImageType` and the renderer
 * behind it keep speaking MIME, so this is the single seam between the two and
 * `src/view/` never learns that `--type png` exists.
 */
export function exportTypeOption(raw: unknown): JmImageType {
    if (raw === undefined) {
        return JmImageType.Png;
    }
    const value = String(raw);
    const name = EXPORT_TYPE_ALIASES[value];
    if (name === undefined) {
        throw usageError(`--type must be one of ${EXPORT_TYPES.join(', ')}, got "${value}"`);
    }
    return EXPORT_TYPE_MIME[name];
}

/** Arguments accepted by {@link runExport}. */
export interface ExportOptions {
    /** Path to the mind map JSON. */
    file: string;
    /** Where to write the image. */
    output: string;
    /** Viewport width the map is laid out in. */
    width: number;
    /** Viewport height the map is laid out in. */
    height: number;
    /** Output pixel ratio. */
    scale: number;
    /**
     * One of {@link JmImageType}. The CLI's own `--type` words (`png`, `jpeg`,
     * `webp`) are resolved to these by {@link exportTypeOption} before the
     * renderer sees them.
     */
    type: JmImageType;
    /** Emit machine-readable output. */
    asJson: boolean;
    /**
     * Leave the image background transparent. Opt-in; the default fills the
     * theme canvas color. Ignored with a warning when {@link type} is
     * `image/jpeg`.
     */
    transparent: boolean;
}

/** What the page reports back. */
interface PageResult {
    base64: string;
    width: number;
    height: number;
    cssWidth: number;
    cssHeight: number;
    bytes: number;
}

/**
 * The encoding each output extension promises.
 *
 * @remarks
 * Only extensions that name an image format appear here. Anything else —
 * `.txt`, `.bin`, no extension at all — makes no promise, so there is nothing
 * for `--type` to contradict and nothing to warn about.
 */
const EXTENSION_TYPES: Record<string, ExportType> = {
    '.png': 'png',
    '.jpg': 'jpeg',
    '.jpeg': 'jpeg',
    '.webp': 'webp',
};

/**
 * Reports a `--type` that disagrees with the output path's extension.
 *
 * @param type - Encoding the caller asked for, in the renderer's vocabulary.
 * @param output - Path the bytes are about to be written to.
 * @remarks
 * A warning, never a correction. `--type` decides the bytes and the path is
 * what the caller typed, so neither answer is second-guessed: renaming the
 * file would break a pipeline that expects the name it asked for, and obeying
 * the extension would silently override the flag. One line on stderr, exit code
 * untouched — the export is still what the caller asked for.
 */
function warnOnTypeMismatch(type: JmImageType, output: string): void {
    const extension = extname(output).toLowerCase();
    const promised = EXTENSION_TYPES[extension];
    if (promised === undefined) {
        return;
    }
    const name = EXPORT_TYPE_NAMES[type];
    if (promised === name) {
        return;
    }
    process.stderr.write(
        `jsmind: warning: --type ${name} but the output is ${extension}; ` +
            `writing ${name} bytes to ${output}\n`
    );
}

/**
 * Renders a mind map file to an image.
 *
 * @param options - Paths, viewport, scale and format.
 * @returns The exit code: 0 on success.
 * @throws {@link CliError} For usage, data, IO and browser failures.
 */
export async function runExport(options: ExportOptions): Promise<number> {
    // Judged from the command line, before anything is read or launched: the
    // warning describes what was asked for, not what the run managed to do.
    warnOnTypeMismatch(options.type, options.output);

    const transparent = shouldExportTransparent(options.type, options.transparent, message => {
        process.stderr.write(`${message}\n`);
    });

    const data = readJsonFile(options.file);

    // Validate before starting a browser: a bad file should fail in
    // milliseconds, not after a Chrome launch.
    const validation = validateMindData(data);
    if (!validation.valid) {
        process.stderr.write(`${options.file}: ${validation.errors.length} problem(s)\n`);
        for (const issue of validation.errors.slice(0, 10)) {
            process.stderr.write(`  ${issue.code}  ${issue.path || '<root>'}\n    ${issue.message}\n`);
        }
        return CliExit.InvalidData;
    }

    const session = await openBrowser(options.width, options.height);

    try {
        const script = `
            (async () => {
                const stage = document.getElementById('stage');
                const jm = await jsMind.create(stage);
                const mind = jsMind.Serializer.create('json')
                    .deserialize(JSON.parse(${JSON.stringify(JSON.stringify(data))}));
                await jm.open(mind);

                // Fonts before frames: layout measured against a fallback face
                // stays measured against it, so a map that ends up in a web font
                // would be exported with the wrong metrics - and the picture
                // would look plausible, just not like the screen. document.fonts.ready
                // resolves once they are loaded and applied; the two frames
                // after it let the relayout that the swap triggered finish.
                if (document.fonts) {
                    await document.fonts.ready;
                }
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

                const result = await jm.exportImage({
                    scale: ${JSON.stringify(options.scale)},
                    type: ${JSON.stringify(options.type)},
                    transparent: ${JSON.stringify(transparent)},
                });

                const base64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        const text = String(reader.result);
                        resolve(text.slice(text.indexOf(',') + 1));
                    };
                    reader.onerror = () => reject(new Error('could not read the blob'));
                    reader.readAsDataURL(result.blob);
                });

                return {
                    base64,
                    width: result.width,
                    height: result.height,
                    cssWidth: result.cssWidth,
                    cssHeight: result.cssHeight,
                    bytes: result.blob.size,
                };
            })()
        `;

        const result = (await session.evaluate(script)) as PageResult;
        const bytes = Buffer.from(result.base64, 'base64');
        // The caller may well name a path under a directory that does not exist
        // yet (`tmp/preview.png` in CI is exactly that); creating it is cheaper
        // than making every caller write the mkdir themselves.
        mkdirSync(dirname(options.output), { recursive: true });
        writeFileSync(options.output, bytes, { flag: 'w' });

        if (options.asJson) {
            process.stdout.write(
                `${JSON.stringify(
                    {
                        output: options.output,
                        width: result.width,
                        height: result.height,
                        cssWidth: Math.round(result.cssWidth),
                        cssHeight: Math.round(result.cssHeight),
                        bytes: bytes.length,
                        type: options.type,
                    },
                    null,
                    2
                )}\n`
            );
        } else {
            process.stdout.write(
                `${options.output}: ${result.width}x${result.height} ` +
                    `(${(bytes.length / 1024).toFixed(1)} KB)\n`
            );
        }

        return CliExit.Ok;
    } catch (error) {
        if (isPageError(error)) {
            // The page could not render: bad data for the renderer, or a browser
            // that cannot encode the canvas. Neither is a crash of this tool.
            throw new CliError(`Rendering failed: ${error.message}`, CliExit.IoError);
        }
        throw error;
    } finally {
        await session.close();
    }
}

/**
 * Describes the `export` group for `--help`.
 *
 * @remarks
 * One page for the group, not a page per kind: with a single kind there is
 * nothing a second level could say, so `jsmind export image --help` answers
 * with this block too. A kind is listed with the words it takes and one line
 * about what it produces, then the option table of the kind that has one —
 * a reader asking what `export` can do gets both answers at once.
 *
 * Defaults, the format list and the kind list are interpolated rather than
 * typed out, so the help cannot quote a value the command no longer uses.
 */
export const exportHelp = `jsmind export <kind> <file> [out] [options]

Writes a mind map out as a shareable file. The word after \`export\` is the kind —
what the file is:

${EXPORT_KINDS.map(kind => `  ${kind.name.padEnd(8)}${kind.usage.padEnd(21)}${kind.summary}`).join('\n')}

image options

  --width <px>      Viewport width to lay the map out in   (default ${DEFAULT_WIDTH})
  --height <px>     Viewport height                        (default ${DEFAULT_HEIGHT})
  --scale <n>       Output pixel ratio                     (default ${DEFAULT_SCALE})
  --type <format>   ${EXPORT_TYPES.join(', ')}                        (default png)
  --transparent     Transparent background (PNG and WebP; opt-in; ignored for JPEG)
  --json            Machine-readable output

The image is the map's own size: whitespace inside the viewport is kept, and a
map larger than the viewport is not cropped.

--type is the encoding, not the file name. The bytes are the format it names and
the output path is written exactly as given, so \`out.png --type jpeg\` writes a
JPEG to a file called out.png — with one warning on stderr, because the
extension says otherwise.

Requires a Chromium binary. Set CHROME_PATH if it is not in a
standard location. Rendering starts a browser process, so a sandboxed
environment may ask for permission the first time; that is the browser
starting, not a failure. An existing output file is overwritten in place —
give a different output path to keep the old image.`;
