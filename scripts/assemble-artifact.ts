/**
 * @fileoverview Assembles the self-contained page `jsmind export html` writes.
 *
 * The page is built once per release, not once per export. Three of its slots
 * come from the build and change only when the library does — the shell
 * stylesheet, the shell script and the UMD bundle. The other two are left
 * behind for the CLI, which fills them per export: the map document and the
 * page title. That split is why exporting an html file never bundles anything:
 * the CLI reads `dist/artifact.html` and does two string replacements.
 *
 * The template is a directory (`artifact/`) rather than a string in this
 * command, so the page can grow — more markup, more shell script, a second
 * stylesheet — without this file being rewritten. `site/` is the same shape for
 * the published site, and `renderSitePage` here is the same guard.
 *
 * A slot that cannot be filled fails the build instead of shipping a literal
 * `{{NAME}}` to a reader: an unknown slot, a build slot the template forgot, a
 * build slot written twice, or a runtime slot that is not left exactly once for
 * the CLI.
 *
 * @packageDocumentation
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Directory holding the page sources, beside `site/`. */
export const ARTIFACT_SRC_DIR = 'artifact';

/** The page template, with both kinds of slot. */
export const ARTIFACT_PAGE = 'page.html';

/** Shell stylesheet, inlined into the page. */
export const ARTIFACT_CSS = 'shell.css';

/** Shell behaviour, inlined into the page. */
export const ARTIFACT_SHELL = 'shell.js';

/** Build output: the assembled page, published beside `cli.js`. */
export const ARTIFACT_OUTPUT = join('dist', 'artifact.html');

/**
 * Slots filled here, once per build.
 *
 * @remarks
 * They carry things that change with the version of the library, not with an
 * individual export, so the CLI never has to rebuild the page.
 */
export const BUILD_SLOTS = ['SHELL_CSS', 'SHELL_JS', 'BUNDLE'] as const;

/** One name in {@link BUILD_SLOTS}. */
export type BuildSlot = (typeof BUILD_SLOTS)[number];

/**
 * Slots the CLI fills, once per export.
 *
 * @remarks
 * `{{DATA}}` is the map and `{{TITLE}}` the page title. The build leaves both
 * in place; `jsmind export html` is what replaces them.
 */
export const RUNTIME_SLOTS = ['DATA', 'TITLE'] as const;

/** One name in {@link RUNTIME_SLOTS}. */
export type RuntimeSlot = (typeof RUNTIME_SLOTS)[number];

/** Everything one assembly needs, already read from disk. */
export interface ArtifactSources {
    /** The template, slots untouched. */
    page: string;
    /** Shell stylesheet. */
    css: string;
    /** Shell script. */
    shellJs: string;
    /** UMD bundle, which assigns `window.jsMind`. */
    bundle: string;
}

/**
 * Reads one file from the artifact source directory.
 *
 * @param root - Repository root.
 * @param name - File name inside {@link ARTIFACT_SRC_DIR}.
 * @returns The file's text.
 * @throws {@link Error} When the file is missing, naming the path it looked at
 *         instead of failing later on an ENOENT with no context.
 */
export function readArtifactSource(root: string, name: string): string {
    const path = join(root, ARTIFACT_SRC_DIR, name);
    if (!existsSync(path)) {
        throw new Error(`missing artifact source: ${ARTIFACT_SRC_DIR}/${name}`);
    }
    return readFileSync(path, 'utf8');
}

/**
 * Reads every source one assembly needs.
 *
 * @param root - Repository root.
 * @returns The template and the three build-time values.
 * @throws {@link Error} When the bundle is missing, because that means the
 *         assembly ran before rollup did.
 */
export function loadArtifactSources(root: string): ArtifactSources {
    const bundlePath = join(root, 'dist', 'jsmind.umd.js');
    if (!existsSync(bundlePath)) {
        throw new Error('dist/jsmind.umd.js is missing — run rollup before assembling the artifact');
    }
    return {
        page: readArtifactSource(root, ARTIFACT_PAGE),
        css: readArtifactSource(root, ARTIFACT_CSS),
        shellJs: readArtifactSource(root, ARTIFACT_SHELL),
        bundle: readFileSync(bundlePath, 'utf8'),
    };
}

/**
 * Rejects a slot the template names but this script does not know.
 *
 * @param page - The template.
 * @throws {@link Error} For an unknown slot, or for a `{{` that never closes —
 *         both would survive the replacement pass and reach a reader as text.
 * @remarks
 * Checked against the template, before any value is inserted: a bundle or a
 * stylesheet may contain braces of its own, and scanning the filled page would
 * blame the template for them.
 */
function assertKnownSlots(page: string): void {
    const known = new Set<string>([...BUILD_SLOTS, ...RUNTIME_SLOTS]);
    for (const match of page.matchAll(/\{\{([^{}]*)\}\}/g)) {
        const name = match[1] as string;
        if (!known.has(name)) {
            throw new Error(`${ARTIFACT_SRC_DIR}/${ARTIFACT_PAGE} has an unknown slot: ${match[0]}`);
        }
    }
    // Everything the pattern above did not consume, with the matched slots
    // removed, must hold no brace pair at all: what is left is either an
    // unterminated `{{` or a stray `}}`.
    const rest = page.replace(/\{\{[^{}]*\}\}/g, '');
    if (rest.includes('{{') || rest.includes('}}')) {
        throw new Error(`${ARTIFACT_SRC_DIR}/${ARTIFACT_PAGE} has an unbalanced slot: {{ without a closing }}`);
    }
}

/**
 * Fills one slot, requiring exactly one occurrence.
 *
 * @param html - Text to fill.
 * @param slot - Slot name, without braces.
 * @param value - Replacement text.
 * @returns The text with the slot replaced.
 * @throws {@link Error} When the slot is absent or written more than once.
 * @remarks
 * The replacement is a function so a value containing `$&` or `$1` is inserted
 * literally: the bundle and the shell are code, and a `$` in either of them is
 * not a replacement pattern.
 */
function fillSlot(html: string, slot: string, value: string): string {
    const token = `{{${slot}}}`;
    const first = html.indexOf(token);
    if (first === -1) {
        throw new Error(`${ARTIFACT_SRC_DIR}/${ARTIFACT_PAGE} has no ${token} slot`);
    }
    if (html.indexOf(token, first + token.length) !== -1) {
        throw new Error(`${ARTIFACT_SRC_DIR}/${ARTIFACT_PAGE} has more than one ${token} slot`);
    }
    return html.replace(token, () => value);
}

/**
 * Escapes a `</script` sequence inside an inline script.
 *
 * @param code - JavaScript about to be placed in a `<script>` element.
 * @returns The same code with every `</script` spelled `<\/script`.
 * @remarks
 * `<\/script` means the same thing to a JavaScript parser — inside a string,
 * a regular expression or a comment — but the HTML tokenizer no longer sees a
 * closing tag. The current bundle does not contain the sequence; this keeps a
 * later minifier from being able to break the page silently.
 */
function escapeInlineScript(code: string): string {
    // `match.slice(2)` keeps the word's own casing: the escape only inserts a
    // backslash, it does not rewrite the code it escapes.
    return code.replace(/<\/script/gi, match => `<\\/${match.slice(2)}`);
}

/**
 * Assembles the page from its sources.
 *
 * @param sources - Template plus the three build-time values.
 * @returns The page, with `{{DATA}}` and `{{TITLE}}` left for the CLI.
 * @throws {@link Error} On an unknown, missing, duplicated or unbalanced slot,
 *         or on a shell that would close its own `<script>` / `<style>` early.
 */
export function assembleArtifactHtml(sources: ArtifactSources): string {
    assertKnownSlots(sources.page);

    // The shell is our own file, so a closer inside it is a mistake to fix
    // rather than a sequence to escape.
    if (/<\/script/i.test(sources.shellJs)) {
        throw new Error(`${ARTIFACT_SRC_DIR}/${ARTIFACT_SHELL} contains </script`);
    }
    if (/<\/style/i.test(sources.css)) {
        throw new Error(`${ARTIFACT_SRC_DIR}/${ARTIFACT_CSS} contains </style`);
    }

    let html = sources.page;
    html = fillSlot(html, 'SHELL_CSS', sources.css);
    html = fillSlot(html, 'SHELL_JS', sources.shellJs);
    html = fillSlot(html, 'BUNDLE', escapeInlineScript(sources.bundle));

    for (const slot of RUNTIME_SLOTS) {
        const token = `{{${slot}}}`;
        const count = html.split(token).length - 1;
        if (count !== 1) {
            throw new Error(
                `${ARTIFACT_SRC_DIR}/${ARTIFACT_PAGE} must keep exactly one ${token} slot for the CLI, found ${count}`
            );
        }
    }
    return html;
}

/**
 * Reads the sources, assembles the page and writes {@link ARTIFACT_OUTPUT}.
 *
 * @param root - Repository root.
 * @returns Path to the file written.
 */
export function assembleArtifact(root: string): string {
    const html = assembleArtifactHtml(loadArtifactSources(root));
    const output = join(root, ARTIFACT_OUTPUT);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, html, { flag: 'w' });
    return output;
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
    const output = assembleArtifact(ROOT);
    const size = statSync(output).size;
    process.stdout.write(`${relative(ROOT, output)}: ${(size / 1024).toFixed(1)} KB\n`);
}
