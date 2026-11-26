/**
 * @fileoverview Builds the GitHub Pages directory.
 *
 * The workflow only publishes `_site`. This command writes the root product
 * page, copies the playground, the bundle, the browser icon and the `skills/`
 * directory, points the playground at the bundle and the icon that sit beside
 * it, builds the VitePress documentation site into `_site/docs`, and builds
 * the tutorials site into `_site/tutorials`.
 *
 * `docs/public/` is the repository's one copy of the browser icon. VitePress
 * copies that directory into the docs output by itself, and the root site
 * takes the same file, so the two published locations have a single source and
 * an edit cannot reach one and miss the other.
 *
 * The skill directory is published whole, at the site root, so an agent can
 * fetch `skills/jsmind/SKILL.md` over HTTPS without cloning the repository.
 * It is not part of the npm package: the directory may later carry scripts
 * and fixtures that npm has no business shipping.
 *
 * The site root is a product page, not a redirect: the documentation, the
 * tutorials and the playground each get an entry there. The page itself is
 * `site/index.html`, a source file that reads like a page; this command renders
 * it into `_site/index.html`, so the markup is edited in one place and the
 * published root is never a second, hand-kept copy.
 *
 * `example/playground.html` keeps `../dist/jsmind.js`. That path is what
 * `npm run server` needs, because the page lives in `example/`. On the site
 * both files are at the root, so the src becomes `jsmind.js`.
 *
 * Attribute order is not part of the contract. `type="module"` may come
 * before or after `src`.
 *
 * The docs site is bilingual (`/docs/en/`, `/docs/zh/`). `/docs/` is a
 * language redirect that reads `jsmind-docs-lang` from localStorage, and it
 * lands directly on that locale's guide: the guide is the documentation's
 * entry, so the locale home is a one-hop redirect to it rather than a landing
 * page that repeats the product page.
 *
 * The tutorials are a second VitePress site, published at `/tutorials/` with
 * its own base: the documentation URLs are already published under
 * `/jsmind-v2/docs/` and must not move, so the two sites cannot share one
 * `base`. `/tutorials/` is the same language redirect as `/docs/`, reading
 * the same key.
 * Existing markdown under `docs/requirements/` stays in the repository
 * but is not published here. Architecture and feature articles now live
 * under the bilingual `docs/en/` and `docs/zh/` trees.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
    listTutorialPosts,
    recentTutorialPosts,
    renderRecentTutorialItems,
    RECENT_TUTORIALS_EMPTY_HTML,
} from './tutorial-posts.ts';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * localStorage key shared by `/docs/`, `/tutorials/`, the root page and every
 * language switcher: a reader picks a language once, and each entry restores
 * it. Declared before the templates that interpolate it.
 */
export const DOCS_LANG_STORAGE_KEY = 'jsmind-docs-lang';

/**
 * Source directory of the published site's own pages.
 *
 * It is `site/`, not `_site/`: `_site` is the build output, wiped and rewritten
 * on every `npm run assemble-site` and ignored by git. `site/` is the source
 * that is checked in, so editing the front page means editing a file here and
 * not a string inside this command.
 *
 * Only the pages the command writes from scratch live here. Anything with a
 * source tree of its own keeps it: `docs/` and `tutorials/` are VitePress
 * sources, `example/playground.html` is the playground `npm run server` serves,
 * `docs/public/` holds the icons and `dist/` the bundle.
 */
export const SITE_SRC_DIR = 'site';

/** The product front page, published as the site root `index.html`. */
export const SITE_INDEX_PAGE = 'index.html';

/** Template of the `/docs/` and `/tutorials/` language redirects. */
export const LANGUAGE_REDIRECT_PAGE = 'language-redirect.html';

/** Template of the retired-doc-path redirects. */
export const PAGE_REDIRECT_PAGE = 'page-redirect.html';

/**
 * Renders a page from {@link SITE_SRC_DIR}.
 *
 * A page source is plain HTML with `{{NAME}}` slots for the few values that
 * come from the build rather than from the page: the language key, the
 * redirect title, the redirect destination. Plain HTML is the point — a page
 * opens, reads and diffs like a page, and this function only fills the slots.
 *
 * A slot left unfilled fails the build instead of shipping a literal `{{...}}`
 * to readers, and a missing source names the file it looked for instead of
 * failing somewhere deeper on ENOENT.
 *
 * @param root - Repository root.
 * @param name - File name inside {@link SITE_SRC_DIR}.
 * @param values - Slot name to value.
 * @returns The page to publish.
 */
export function renderSitePage(root: string, name: string, values: Record<string, string>): string {
    const path = join(root, SITE_SRC_DIR, name);
    if (!existsSync(path)) {
        throw new Error(`missing site page source: ${SITE_SRC_DIR}/${name}`);
    }

    let html = readFileSync(path, 'utf8');
    for (const [slot, value] of Object.entries(values)) {
        // A function replacement, so a value containing `$&` or `$1` is
        // inserted literally instead of being read as a replacement pattern.
        html = html.replaceAll(`{{${slot}}}`, () => value);
    }

    const open = html.indexOf('{{');
    if (open !== -1) {
        const close = html.indexOf('}}', open);
        throw new Error(
            `${SITE_SRC_DIR}/${name} has an unfilled slot: ${html.slice(open, close === -1 ? undefined : close + 2)}`
        );
    }
    return html;
}

/**
 * The product front page, rendered from {@link SITE_INDEX_PAGE}.
 *
 * Three entries — documentation, tutorials, playground — plus the install
 * line, the GitHub link and the 2.x preview notice. The "recent tutorials"
 * list is filled from the markdown files in tutorials/en/posts and tutorials/zh/posts at render time, newest first, and
 * stays empty (with the reserved empty-state sentence) until a post ships.
 *
 * The page lives in `site/index.html`. That is a source file, not the
 * published page: nothing sits at the repository root, and the assembly writes
 * `_site/index.html` from this page, so the checkout holds one copy of the
 * markup and the published site holds one copy of the same markup.
 *
 * Language comes from `jsmind-docs-lang`, the key `/docs/`, `/tutorials/` and
 * both switchers already share, defaulting to English when nothing is stored.
 * Both languages sit in the markup as `data-en` / `data-zh`, so the page is
 * still readable with JavaScript disabled (English, the default), and the
 * switcher only rewrites text, the one language-dependent href and the
 * document language.
 *
 * The icons are relative names because the page and the copied icons share
 * the site root; the paths to `docs/`, `tutorials/` and `playground.html` are
 * relative for the same reason, and so the page works from the site root
 * wherever that root is mounted.
 *
 * @param root - Repository root.
 * @returns The page to publish.
 */
export function landingPageHtml(root: string = ROOT): string {
    const recent = recentTutorialPosts(listTutorialPosts(root));
    return renderSitePage(root, SITE_INDEX_PAGE, {
        DOCS_LANG_STORAGE_KEY,
        RECENT_TUTORIALS: recent.length === 0 ? '' : `\n${renderRecentTutorialItems(recent)}\n        `,
        RECENT_EMPTY: recent.length === 0 ? RECENT_TUTORIALS_EMPTY_HTML : '',
    });
}

/** Script src while the page still lives under `example/`. */
export const LOCAL_BUNDLE_SRC = '../dist/jsmind.js';

/** Script src once the page and the bundle share the site root. */
export const SITE_BUNDLE_SRC = 'jsmind.js';

/**
 * `docs/public/`: VitePress's static directory, and the repository's only copy
 * of the site's static assets.
 *
 * VitePress copies it into the docs output root (`_site/docs/`), which is where
 * the docs pages fetch the icon from; the root site takes the same files from
 * here instead of keeping a second copy in the tree.
 */
export const PUBLIC_DIR = 'docs/public';

/** Static files published at the site root, next to the playground. */
export const SITE_ICON_FILES = ['favicon.svg', 'favicon.png'] as const;

/** Icon href prefix while the page still lives under `example/`. */
export const LOCAL_ICON_HREF_PREFIX = `../${PUBLIC_DIR}/`;

/**
 * Source directory of the agent skill, copied whole to the site root.
 *
 * The site keeps the repository's own layout, so the published path can be
 * derived from the repository path instead of being a second place to edit:
 * `skills/jsmind/SKILL.md` in the checkout is `skills/jsmind/SKILL.md` on the
 * site.
 */
export const SKILL_DIR = 'skills';

/** The one file inside {@link SKILL_DIR} that proves the copy happened. */
export const SKILL_SITE_FILE = `${SKILL_DIR}/jsmind/SKILL.md`;

/**
 * Source directory of the tutorials, a second VitePress site published at
 * `/tutorials/`.
 *
 * It sits beside `docs/`, not inside it: the docs sidebars are product
 * documentation, and the tutorials are a separate column that must not appear
 * in them. The two sites also cannot share one VitePress `base` — the docs
 * URLs under `/jsmind-v2/docs/` are already published.
 */
export const TUTORIALS_DIR = 'tutorials';

const SITE_FILES = [
    'index.html',
    'playground.html',
    'jsmind.js',
    ...SITE_ICON_FILES,
    SKILL_SITE_FILE,
] as const;

/**
 * Where the docs entry lands, relative to a locale root.
 *
 * The guide is the documentation's real entry: `/docs/` and `/docs/en/` both
 * finish on the guide in one hop, so a reader who types the site address sees
 * the guide rather than a landing page that repeats the product page.
 */
export const DOCS_ENTRY_PATH = 'guide/';

/**
 * A language redirect for a bilingual site root, rendered from
 * {@link LANGUAGE_REDIRECT_PAGE}.
 *
 * `/docs/` and `/tutorials/` share one rule: read `jsmind-docs-lang`, default
 * to English, and forward into the stored language with the query and hash
 * intact. The entry path says where inside that language the reader lands —
 * the docs site's guide, or the tutorials column's own index — so the entry
 * costs one hop and never two. It is written after the VitePress build,
 * replacing any root index the generator may have emitted. A page that already
 * names its language (`/docs/zh/`, `/tutorials/en/`) is a real page and is
 * never rewritten.
 *
 * @param title - Page title, so a reader who lands here knows which site it is.
 * @param entry - Locale-relative entry path, with a trailing slash, or `''`.
 * @param root - Repository root.
 */
export function languageRedirectHtml(title: string, entry: string, root: string = ROOT): string {
    return renderSitePage(root, LANGUAGE_REDIRECT_PAGE, { TITLE: title, DOCS_LANG_STORAGE_KEY, ENTRY: entry });
}

/**
 * Language redirect written to `_site/docs/index.html`.
 *
 * @param root - Repository root.
 */
export function docsLanguageRedirectHtml(root: string = ROOT): string {
    return languageRedirectHtml('jsMind V2 Documentation', DOCS_ENTRY_PATH, root);
}

/**
 * Language redirect written to `_site/tutorials/index.html`.
 *
 * @param root - Repository root.
 */
export function tutorialsLanguageRedirectHtml(root: string = ROOT): string {
    return languageRedirectHtml('jsMind V2 Tutorials', '', root);
}

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
 * The bundle and the icons move from repository-relative paths to the site
 * root, where the page sits beside them. Both rewritten things are checked
 * after the fact, so a renamed file or a page that lost its icon stops the
 * build instead of publishing a request that 404s.
 *
 * @param html - The source page.
 * @returns The page to publish.
 */
export function rewritePlayground(html: string): string {
    const localSrc = `src="${LOCAL_BUNDLE_SRC}"`;
    if (!html.includes(localSrc)) {
        throw new Error(`playground.html has no script ${localSrc}`);
    }
    let rewritten = html.replaceAll(localSrc, `src="${SITE_BUNDLE_SRC}"`);
    for (const name of SITE_ICON_FILES) {
        rewritten = rewritten.replaceAll(
            `href="${LOCAL_ICON_HREF_PREFIX}${name}"`,
            `href="${name}"`
        );
    }
    if (rewritten.includes(LOCAL_BUNDLE_SRC)) {
        throw new Error('playground.html still points at ../dist/jsmind.js');
    }
    if (rewritten.includes(LOCAL_ICON_HREF_PREFIX)) {
        throw new Error(`playground.html still points at ${LOCAL_ICON_HREF_PREFIX}`);
    }
    if (!moduleScriptSrcs(rewritten).includes(SITE_BUNDLE_SRC)) {
        throw new Error('playground.html does not load jsmind.js as a module');
    }
    for (const name of SITE_ICON_FILES) {
        if (!rewritten.includes(`href="${name}"`)) {
            throw new Error(`playground.html does not link ${name}`);
        }
    }
    return rewritten;
}

/**
 * Writes the root product page, the playground, the bundle, the icons and the
 * skill directory into an already-created site directory. Does not wipe the
 * directory or build either VitePress site.
 *
 * The icons are copied from {@link PUBLIC_DIR} rather than read from the page:
 * the playground's href is the repository path, and the published name is
 * decided here, so renaming an icon on the site is this function's job and not
 * a second file to edit.
 *
 * The skill is copied as a directory, not file by file: its `references/`,
 * `INSTALL.md` and test fixtures are part of what an agent fetches, and a list
 * of names here would silently drop anything added later.
 *
 * @param root - Repository root.
 * @param siteDir - Output directory.
 */
export function assembleRootSite(root: string, siteDir: string): void {
    mkdirSync(siteDir, { recursive: true });

    writeFileSync(join(siteDir, 'index.html'), landingPageHtml(root));
    copyFileSync(join(root, 'dist', 'jsmind.js'), join(siteDir, 'jsmind.js'));

    for (const name of SITE_ICON_FILES) {
        copyFileSync(join(root, PUBLIC_DIR, name), join(siteDir, name));
    }

    const playground = readFileSync(join(root, 'example', 'playground.html'), 'utf8');
    writeFileSync(join(siteDir, 'playground.html'), rewritePlayground(playground));

    cpSync(join(root, SKILL_DIR), join(siteDir, SKILL_DIR), { recursive: true });

    for (const name of SITE_FILES) {
        const path = join(siteDir, name);
        const stat = statSync(path, { throwIfNoEntry: false });
        if (!stat?.isFile() || stat.size === 0) {
            throw new Error(`missing or empty site file: ${name}`);
        }
    }
}

/**
 * Writes a bilingual site's language redirect index.
 *
 * @param dir - Site output directory (`_site/docs`, `_site/tutorials`).
 * @param html - The redirect page to write.
 */
function writeLanguageRedirect(dir: string, html: string): void {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), html);
}

/**
 * Writes the `/docs/` language redirect index.
 *
 * @param docsDir - Docs output directory (`_site/docs`).
 * @param root - Repository root.
 */
export function writeDocsLanguageRedirect(docsDir: string, root: string = ROOT): void {
    writeLanguageRedirect(docsDir, docsLanguageRedirectHtml(root));
}

/**
 * Writes the `/tutorials/` language redirect index.
 *
 * @param tutorialsDir - Tutorials output directory (`_site/tutorials`).
 * @param root - Repository root.
 */
export function writeTutorialsLanguageRedirect(tutorialsDir: string, root: string = ROOT): void {
    writeLanguageRedirect(tutorialsDir, tutorialsLanguageRedirectHtml(root));
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
 * A static redirect page, rendered from {@link PAGE_REDIRECT_PAGE}. GitHub
 * Pages serves `name.html` for `/name`, so these cover both the extensionless
 * bookmark and the `.html` URL.
 *
 * @param to - Relative destination, without a query or hash.
 * @param root - Repository root.
 */
export function docsPageRedirectHtml(to: string, root: string = ROOT): string {
    return renderSitePage(root, PAGE_REDIRECT_PAGE, { TO: to });
}

/**
 * Writes retired-path redirects under `en/` and `zh/`.
 *
 * @param docsDir - Docs output directory (`_site/docs`).
 * @param root - Repository root.
 */
export function writeDocsPageRedirects(docsDir: string, root: string = ROOT): void {
    for (const locale of ['en', 'zh'] as const) {
        for (const { from, to } of DOCS_PAGE_REDIRECTS) {
            const path = join(docsDir, locale, from);
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, docsPageRedirectHtml(to, root));
        }
    }
}

/**
 * Writes the locale home redirects: `/docs/en/` and `/docs/zh/` send the
 * reader to that locale's guide.
 *
 * The locale home is not a page of its own any more. It used to be a
 * `layout: home` hero that repeated the product front page; the columns' real
 * entry is the guide, so the two `index.md` files are gone and this writes the
 * one-hop redirect in their place. Relative to the locale directory, so it
 * survives whatever the docs site is mounted under.
 *
 * @param docsDir - Docs output directory (`_site/docs`).
 * @param root - Repository root.
 */
export function writeDocsLocaleHomeRedirects(docsDir: string, root: string = ROOT): void {
    for (const locale of ['en', 'zh'] as const) {
        const dir = join(docsDir, locale);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'index.html'), docsPageRedirectHtml(DOCS_ENTRY_PATH, root));
    }
}

/**
 * Runs one VitePress build.
 *
 * Both sites are built the same way and both fail loudly: a missing install
 * or a non-zero exit stops the assembly instead of publishing a site with a
 * hole in it.
 *
 * @param root - Repository root, where `node_modules/` lives.
 * @param srcDir - Site source directory (`docs`, `tutorials`).
 * @param outDir - Output directory.
 * @param label - Site name for the failure message.
 */
function buildVitepressSite(root: string, srcDir: string, outDir: string, label: string): void {
    const vitepressBin = join(root, 'node_modules', 'vitepress', 'bin', 'vitepress.js');
    if (!existsSync(vitepressBin)) {
        throw new Error(`vitepress is not installed at ${vitepressBin}`);
    }

    const result = spawnSync(
        process.execPath,
        [vitepressBin, 'build', join(root, srcDir), '--outDir', outDir],
        { cwd: root, stdio: 'inherit' }
    );
    if (result.status !== 0) {
        throw new Error(`VitePress ${label} build failed with exit code ${result.status ?? 'null'}`);
    }
}

/**
 * Builds the VitePress documentation site into `docsDir`, then turns its entry
 * points into redirects: the language redirect at the docs root (`/docs/` is
 * not left as a VitePress index), the two locale homes onto their guide, and
 * the retired-path redirects under `en/` and `zh/`.
 *
 * @param root - Repository root.
 * @param docsDir - Docs output directory (`_site/docs`).
 */
export function assembleDocsSite(root: string, docsDir: string): void {
    buildVitepressSite(root, 'docs', docsDir, 'docs');
    writeDocsLanguageRedirect(docsDir, root);
    writeDocsLocaleHomeRedirects(docsDir, root);
    writeDocsPageRedirects(docsDir, root);
}

/**
 * Builds the tutorials site into `tutorialsDir`, writes the language redirect
 * at its root, and copies the site icons beside it.
 *
 * The icons come from {@link PUBLIC_DIR}, the repository's one checked-in
 * copy, so the tutorials site does not keep a second copy of the same file.
 * The tutorials `head` hrefs are built from that site's `base`, so the files
 * have to land in the tutorials output.
 *
 * `tutorials/_template.md` is excluded by the site's `srcExclude`: it is a
 * source for the next batch of articles, not a page in the column.
 *
 * @param root - Repository root.
 * @param tutorialsDir - Tutorials output directory (`_site/tutorials`).
 */
export function assembleTutorialsSite(root: string, tutorialsDir: string): void {
    buildVitepressSite(root, TUTORIALS_DIR, tutorialsDir, 'tutorials');
    writeTutorialsLanguageRedirect(tutorialsDir, root);
    for (const name of SITE_ICON_FILES) {
        copyFileSync(join(root, PUBLIC_DIR, name), join(tutorialsDir, name));
    }
}

/**
 * Writes `_site` (or `siteDir`) from a repository checkout.
 *
 * Wipes the output directory first, then writes the root site files, then
 * builds the docs site into `<siteDir>/docs` and the tutorials site into
 * `<siteDir>/tutorials`, so no VitePress output is deleted after it is
 * written.
 *
 * @param root - Repository root. Defaults to this repo.
 * @param siteDir - Output directory. Defaults to `<root>/_site`.
 */
export function assembleSite(root: string = ROOT, siteDir: string = join(root, '_site')): void {
    rmSync(siteDir, { recursive: true, force: true });
    mkdirSync(siteDir, { recursive: true });
    assembleRootSite(root, siteDir);
    assembleDocsSite(root, join(siteDir, 'docs'));
    assembleTutorialsSite(root, join(siteDir, TUTORIALS_DIR));
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
    assembleSite();
}
