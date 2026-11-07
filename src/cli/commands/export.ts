/**
 * `jsmind export` — render a mind map file to a PNG.
 *
 * The rendering itself happens in a browser, because the picture is produced by
 * handing the markup back to a rendering engine. This command only drives it:
 * load, open, ask the page for a blob, write the bytes.
 *
 * @packageDocumentation
 */

import { writeFileSync } from 'node:fs';

import { validateMindData } from '../../serialization/validation.ts';
import { readJsonFile } from '../io.ts';
import { CliExit, CliError } from '../exit.ts';
import { openBrowser, isPageError } from '../browser.ts';
import { JmImageType } from '../../view/export.ts';

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
    /** One of {@link JmImageType}. */
    type: string;
    /** Emit machine-readable output. */
    asJson: boolean;
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
 * Renders a mind map file to an image.
 *
 * @param options - Paths, viewport, scale and format.
 * @returns The exit code: 0 on success.
 * @throws {@link CliError} For usage, data, IO and browser failures.
 */
export async function runExport(options: ExportOptions): Promise<number> {
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
                // Two frames: one for the layout to settle, one for the paint.
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

                const result = await jm.exportImage({
                    scale: ${JSON.stringify(options.scale)},
                    type: ${JSON.stringify(options.type)},
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

/** The formats this command will accept on the command line. */
export const EXPORT_TYPES: readonly string[] = Object.values(JmImageType);

/**
 * Describes the export command for `--help`.
 */
export function describeExport(): string {
    return [
        'Usage: jsmind export <file> <out.png> [options]',
        '',
        'Renders a mind map to an image. The size is the map\'s own size:',
        'whitespace inside the viewport is kept, and a map larger than the',
        'viewport is not cropped.',
        '',
        'Options:',
        '  --width <px>      Viewport width to lay the map out in   (default 1200)',
        '  --height <px>     Viewport height                        (default 800)',
        '  --scale <n>       Output pixel ratio                     (default 2)',
        '  --type <format>   image/png, image/jpeg or image/webp    (default image/png)',
        '  --json            Machine-readable output',
        '',
        'Requires a Chromium binary. Set CHROME_PATH if it is not in a',
        'standard location.',
    ].join('\n');
}
