/**
 * @fileoverview Builds the GitHub Pages directory.
 *
 * The workflow only publishes `_site`. This command copies the landing page,
 * the playground, and the bundle, and points the playground at the bundle
 * that sits beside it.
 *
 * `example/playground.html` keeps `../dist/jsmind.js`. That path is what
 * `npm run server` needs, because the page lives in `example/`. On the site
 * both files are at the root, so the src becomes `jsmind.js`.
 *
 * Attribute order is not part of the contract. `type="module"` may come
 * before or after `src`.
 */

import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Script src while the page still lives under `example/`. */
export const LOCAL_BUNDLE_SRC = '../dist/jsmind.js';

/** Script src once the page and the bundle share the site root. */
export const SITE_BUNDLE_SRC = 'jsmind.js';

const SITE_FILES = ['index.html', 'playground.html', 'jsmind.js'] as const;

/** Src of every `<script type="module" src="...">`, whatever the attribute order. */
export function moduleScriptSrcs(html: string): string[] {
    const tags = html.match(/<script\b[^>]*>/gi) ?? [];
    const srcs: string[] = [];
    for (const tag of tags) {
        const attrs = new Map<string, string>();
        for (const match of tag.matchAll(/\b([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g)) {
            attrs.set(match[1].toLowerCase(), match[2]);
        }
        const src = attrs.get('src');
        if (attrs.get('type') === 'module' && src !== undefined) {
            srcs.push(src);
        }
    }
    return srcs;
}

/**
 * Rewrites the playground for the site root and rejects a page that would
 * render nothing: a missed path, or a bundle loaded as a classic script.
 *
 * @param html - The source page.
 * @returns The page to publish.
 */
export function rewritePlayground(html: string): string {
    const localSrc = `src="${LOCAL_BUNDLE_SRC}"`;
    if (!html.includes(localSrc)) {
        throw new Error(`playground.html has no script ${localSrc}`);
    }
    const rewritten = html.replaceAll(localSrc, `src="${SITE_BUNDLE_SRC}"`);
    if (rewritten.includes(LOCAL_BUNDLE_SRC)) {
        throw new Error('playground.html still points at ../dist/jsmind.js');
    }
    if (!moduleScriptSrcs(rewritten).includes(SITE_BUNDLE_SRC)) {
        throw new Error('playground.html does not load jsmind.js as a module');
    }
    return rewritten;
}

/**
 * Writes `_site` (or `siteDir`) from a repository checkout.
 *
 * @param root - Repository root. Defaults to this repo.
 * @param siteDir - Output directory. Defaults to `<root>/_site`.
 */
export function assembleSite(root: string = ROOT, siteDir: string = join(root, '_site')): void {
    rmSync(siteDir, { recursive: true, force: true });
    mkdirSync(siteDir, { recursive: true });

    copyFileSync(join(root, 'index.html'), join(siteDir, 'index.html'));
    copyFileSync(join(root, 'dist', 'jsmind.js'), join(siteDir, 'jsmind.js'));

    const playground = readFileSync(join(root, 'example', 'playground.html'), 'utf8');
    writeFileSync(join(siteDir, 'playground.html'), rewritePlayground(playground));

    for (const name of SITE_FILES) {
        const path = join(siteDir, name);
        const stat = statSync(path, { throwIfNoEntry: false });
        if (!stat?.isFile() || stat.size === 0) {
            throw new Error(`missing or empty site file: ${name}`);
        }
    }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
    assembleSite();
}
