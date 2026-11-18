/**
 * @fileoverview Builds the GitHub Pages directory.
 *
 * The workflow only publishes `_site`. This command writes the root index as
 * a redirect to the docs site, copies the playground and the bundle, points
 * the playground at the bundle that sits beside it, and builds the VitePress
 * documentation site into `_site/docs`.
 *
 * The site root is a redirect, not a page: `/docs/` is the project front
 * page, so a second copy of the project description at the root would only
 * drift from it. The index is generated, not checked in.
 *
 * `example/playground.html` keeps `../dist/jsmind.js`. That path is what
 * `npm run server` needs, because the page lives in `example/`. On the site
 * both files are at the root, so the src becomes `jsmind.js`.
 *
 * Attribute order is not part of the contract. `type="module"` may come
 * before or after `src`.
 *
 * The docs site is bilingual (`/docs/en/`, `/docs/zh/`). `/docs/` is a
 * language redirect that reads `jsmind-docs-lang` from localStorage.
 * Existing markdown under `docs/requirements/` stays in the repository
 * but is not published here. Architecture and feature articles now live
 * under the bilingual `docs/en/` and `docs/zh/` trees.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Site root index: a redirect to the documentation, which is the project
 * front page. Nothing else lives here - no title, no styles, no feature list.
 *
 * `location.replace` keeps the redirect out of history so the back button
 * does not land on it again. The search and hash are carried over, so old
 * links that arrived with a query or an anchor keep their information, and
 * the `<noscript>` link is the way in without JavaScript.
 */
export const LANDING_REDIRECT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<script>
location.replace('docs/' + location.search + location.hash);
</script>
</head>
<body>
<noscript>
    <p><a href="docs/">jsMind V2 documentation</a></p>
</noscript>
</body>
</html>
`;

/** Script src while the page still lives under `example/`. */
export const LOCAL_BUNDLE_SRC = '../dist/jsmind.js';

/** Script src once the page and the bundle share the site root. */
export const SITE_BUNDLE_SRC = 'jsmind.js';

/** localStorage key used by `/docs/` and the docs language switcher. */
export const DOCS_LANG_STORAGE_KEY = 'jsmind-docs-lang';

const SITE_FILES = ['index.html', 'playground.html', 'jsmind.js'] as const;

/**
 * Language redirect written to `_site/docs/index.html` after the VitePress
 * build, replacing any root index the generator may have emitted.
 */
export const DOCS_LANGUAGE_REDIRECT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>jsMind V2 Documentation</title>
<script>
(function () {
    var lang = localStorage.getItem('${DOCS_LANG_STORAGE_KEY}');
    if (lang !== 'en' && lang !== 'zh') {
        lang = 'en';
    }
    location.replace(lang + '/' + location.search + location.hash);
})();
</script>
</head>
<body>
<noscript>
    <p><a href="en/">English</a> · <a href="zh/">中文</a></p>
</noscript>
</body>
</html>
`;

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
 * Writes the site root index, the playground and the bundle into an
 * already-created site directory. Does not wipe the directory or build the
 * docs site.
 *
 * @param root - Repository root.
 * @param siteDir - Output directory.
 */
export function assembleRootSite(root: string, siteDir: string): void {
    mkdirSync(siteDir, { recursive: true });

    writeFileSync(join(siteDir, 'index.html'), LANDING_REDIRECT_HTML);
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

/**
 * Writes the `/docs/` language redirect index.
 *
 * @param docsDir - Docs output directory (`_site/docs`).
 */
export function writeDocsLanguageRedirect(docsDir: string): void {
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, 'index.html'), DOCS_LANGUAGE_REDIRECT_HTML);
}

/**
 * Retired doc paths and their in-tree relative destinations.
 * Written after the VitePress build so old bookmarks keep working on
 * GitHub Pages for both `/docs/en/...` and `/docs/zh/...`.
 */
export const DOCS_PAGE_REDIRECTS = [
    { from: 'guide/node-content.html', to: '../reference/node-content' },
    { from: 'guide/node-move.html', to: '../reference/node-move' },
    { from: 'guide/image-export.html', to: '../reference/image-export' },
    { from: 'guide/serialization.html', to: '../reference/serialization' },
    { from: 'reference/cli.html', to: '../guide/cli' },
] as const;

/**
 * A static redirect page. GitHub Pages serves `name.html` for `/name`,
 * so these cover both the extensionless bookmark and the `.html` URL.
 *
 * @param to - Relative destination, without a query or hash.
 */
export function docsPageRedirectHtml(to: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page moved</title>
<meta http-equiv="refresh" content="0; url=${to}">
<script>
(function () {
    location.replace('${to}' + location.search + location.hash);
})();
</script>
</head>
<body>
<noscript>
    <p><a href="${to}">This page has moved</a></p>
</noscript>
</body>
</html>
`;
}

/**
 * Writes retired-path redirects under `en/` and `zh/`.
 *
 * @param docsDir - Docs output directory (`_site/docs`).
 */
export function writeDocsPageRedirects(docsDir: string): void {
    for (const locale of ['en', 'zh'] as const) {
        for (const { from, to } of DOCS_PAGE_REDIRECTS) {
            const path = join(docsDir, locale, from);
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, docsPageRedirectHtml(to));
        }
    }
}

/**
 * Builds the VitePress documentation site into `docsDir`, then writes the
 * language redirect at the docs root so `/docs/` is not left as a VitePress
 * index, and writes retired-path redirects under `en/` and `zh/`.
 *
 * @param root - Repository root.
 * @param docsDir - Docs output directory (`_site/docs`).
 */
export function assembleDocsSite(root: string, docsDir: string): void {
    const vitepressBin = join(root, 'node_modules', 'vitepress', 'bin', 'vitepress.js');
    if (!existsSync(vitepressBin)) {
        throw new Error(`vitepress is not installed at ${vitepressBin}`);
    }

    const result = spawnSync(
        process.execPath,
        [vitepressBin, 'build', join(root, 'docs'), '--outDir', docsDir],
        { cwd: root, stdio: 'inherit' }
    );
    if (result.status !== 0) {
        throw new Error(`VitePress docs build failed with exit code ${result.status ?? 'null'}`);
    }

    writeDocsLanguageRedirect(docsDir);
    writeDocsPageRedirects(docsDir);
}

/**
 * Writes `_site` (or `siteDir`) from a repository checkout.
 *
 * Wipes the output directory first, then writes the root site files, then
 * builds the docs site into `<siteDir>/docs` so the VitePress output is not
 * deleted after it is written.
 *
 * @param root - Repository root. Defaults to this repo.
 * @param siteDir - Output directory. Defaults to `<root>/_site`.
 */
export function assembleSite(root: string = ROOT, siteDir: string = join(root, '_site')): void {
    rmSync(siteDir, { recursive: true, force: true });
    mkdirSync(siteDir, { recursive: true });
    assembleRootSite(root, siteDir);
    assembleDocsSite(root, join(siteDir, 'docs'));
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
    assembleSite();
}
