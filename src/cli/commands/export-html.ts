/**
 * `jsmind export html` — write one self-contained page that opens offline.
 *
 * The page is assembled at build time (`scripts/assemble-artifact.ts`) and
 * shipped as `dist/artifact.html`, beside this bundle. Exporting therefore
 * never bundles anything: this command reads that file, fills the two slots the
 * build left for it — `{{TITLE}}` and `{{DATA}}` — and writes the result.
 *
 * Nothing here launches a browser, and nothing here reaches the network. That
 * is the difference between this kind and `image`: an image is produced by a
 * rendering engine, while this page carries the engine with it and renders
 * where it is opened.
 *
 * @packageDocumentation
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

import { validateMindData } from '../../serialization/validation.ts';
import { readJsonFile } from '../io.ts';
import { CliExit, ioError } from '../exit.ts';
import { formatIssues } from '../format.ts';
import { MODULE_DIR } from '../version.ts';

/** The assembled page the build writes beside the CLI bundle. */
export const ARTIFACT_FILE = 'artifact.html';

/** Slot holding the page title. */
const TITLE_SLOT = '{{TITLE}}';

/** Slot holding the map document. */
const DATA_SLOT = '{{DATA}}';

/**
 * Escapes JSON text so it survives inside a `<script>` block.
 *
 * @param json - `JSON.stringify` output, about to be placed in the page.
 * @returns The same document, still parseable by `JSON.parse` as the original.
 * @remarks
 * Three sequences break the block rather than the JSON:
 *
 * - `</script`, in any casing, closes the element early — the HTML tokenizer
 *   does not know it is inside a string. `<!--` starts a comment for the same
 *   reason. Both begin with `<`, and JSON text has no `<` outside a string, so
 *   replacing every `<` with `\u003c` covers both without touching the data.
 * - U+2028 and U+2029 are line terminators to a JavaScript parser and ordinary
 *   characters to JSON. They are escaped so a reader that evaluates the block
 *   as code sees the same document.
 *
 * The result is checked by `JSON.parse` in the tests, not by eye: every one of
 * those sequences round-trips to the value it started as.
 */
export function escapeInlineJson(json: string): string {
    return json
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

/**
 * Escapes text that goes into an HTML element body, such as `<title>`.
 *
 * @param text - Raw text, from `--title` or from the document.
 * @returns The text with `&`, `<` and `>` replaced by their entities.
 * @remarks
 * `&` goes first: escaping it after the angle brackets would turn the `&` of
 * `&lt;` into `&amp;lt;` and print the entity instead of the character.
 */
export function escapeHtmlText(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Picks the page title for one export.
 *
 * @param data - The mind map document.
 * @param file - Path the document was read from.
 * @returns `meta.name` when the document states one, else the file name
 *          without its extension.
 * @remarks
 * The file name is the fallback because it is what the caller typed: a page
 * titled after a path is traceable back to the file it came from, and an empty
 * title is a browser tab with nothing in it.
 */
export function documentTitle(data: unknown, file: string): string {
    const meta = (data as { meta?: { name?: unknown } } | null | undefined)?.meta;
    const name = meta?.name;
    if (typeof name === 'string' && name.trim().length > 0) {
        return name;
    }
    return basename(file, extname(file));
}

/**
 * Derives the output path from the input when the caller omits it.
 *
 * @param file - Path to the mind map document.
 * @returns The same path with an `.html` extension.
 * @remarks
 * Only the last extension is replaced: `plan.2026.json` becomes
 * `plan.2026.html`, not `plan.html`, so a dated file keeps its date.
 */
export function defaultHtmlOutput(file: string): string {
    return join(dirname(file), `${basename(file, extname(file))}.html`);
}

/**
 * Path of the assembled page, beside the CLI bundle.
 *
 * @returns `<package>/dist/artifact.html` in an installed package, and the
 *          same relative location when the build output is used in place.
 * @remarks
 * The build writes the page next to `cli.js` for exactly this reason: the
 * lookup has to work from the published package, where nothing above `dist/`
 * is shipped.
 */
export function artifactTemplatePath(): string {
    return join(MODULE_DIR, ARTIFACT_FILE);
}

/**
 * Fills the two slots the build left for the CLI.
 *
 * @param template - `dist/artifact.html`, or a test's stand-in for it.
 * @param values - Title and document, already escaped by the caller.
 * @returns The page to write.
 * @throws {@link CliError} With `IoError` when a slot is not there exactly
 *         once, which means the packaged page is stale or was edited by hand.
 * @remarks
 * Each value is inserted with a replacement function so a `$&` or `$1` in the
 * map's text is written literally instead of being read as a replacement
 * pattern. The slots are counted on the template, before anything is inserted,
 * and replaced in a single pass: a document whose text happens to spell
 * `{{TITLE}}` is content and stays content.
 */
export function fillRuntimeSlots(template: string, values: { title: string; data: string }): string {
    for (const slot of [TITLE_SLOT, DATA_SLOT]) {
        const count = template.split(slot).length - 1;
        if (count !== 1) {
            throw ioError(
                `The export template has ${count} ${slot} slots, expected one — run \`npm run build\``
            );
        }
    }
    return template.replace(/\{\{(TITLE|DATA)\}\}/g, (_match: string, name: string) =>
        name === 'TITLE' ? values.title : values.data
    );
}

/** Arguments accepted by {@link runExportHtml}. */
export interface ExportHtmlOptions {
    /** Path to the mind map JSON. */
    file: string;
    /** Where to write the page. */
    output: string;
    /** `<title>` override; omitting it takes the map's name, then the file name. */
    title?: string;
    /** Emit machine-readable output. */
    asJson: boolean;
    /**
     * Page template to fill. The tests pass one; the command always uses
     * {@link artifactTemplatePath}.
     */
    template?: string;
}

/**
 * Writes a standalone page for one mind map file.
 *
 * @param options - Paths, title and output shape.
 * @returns The exit code: 0 on success.
 * @throws {@link CliError} For IO failures: the input, the template, or the
 *         output cannot be read or written.
 * @remarks
 * The data is validated first, exactly as `export image` does, so a bad file
 * fails in milliseconds with exit code 1 instead of producing a page that
 * renders an error message. The browser never enters the picture.
 */
export function runExportHtml(options: ExportHtmlOptions): number {
    const data = readJsonFile(options.file);

    const validation = validateMindData(data);
    if (!validation.valid) {
        process.stderr.write(
            `${options.file}: ${validation.errors.length} problem(s)\n` +
                `${formatIssues(validation.errors.slice(0, 10))}\n`
        );
        return CliExit.InvalidData;
    }

    const templatePath = options.template ?? artifactTemplatePath();
    let template: string;
    try {
        template = readFileSync(templatePath, 'utf8');
    } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === 'ENOENT') {
            throw ioError(
                `Cannot find ${templatePath} — the page is assembled by \`npm run build\``
            );
        }
        throw ioError(`Cannot read ${templatePath}: ${(err as Error).message}`);
    }

    const title = options.title ?? documentTitle(data, options.file);
    const html = fillRuntimeSlots(template, {
        title: escapeHtmlText(title),
        data: escapeInlineJson(JSON.stringify(data) ?? 'null'),
    });

    // Same reasoning as the image export: a caller may name a path under a
    // directory that does not exist yet, and creating it is cheaper than
    // making every caller write the mkdir.
    mkdirSync(dirname(options.output), { recursive: true });
    writeFileSync(options.output, html, { flag: 'w' });

    const bytes = Buffer.byteLength(html);
    if (options.asJson) {
        process.stdout.write(
            `${JSON.stringify({ file: options.file, output: options.output }, null, 2)}\n`
        );
    } else {
        process.stdout.write(`${options.output}: standalone page (${(bytes / 1024).toFixed(1)} KB)\n`);
    }

    return CliExit.Ok;
}
