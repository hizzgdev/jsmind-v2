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
 * tutorials and the playground each get an entry there. It is generated, not
 * checked in — the repository keeps no `index.html` of its own — so the
 * published root page and this command cannot drift apart.
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
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * localStorage key shared by `/docs/`, `/tutorials/`, the root page and every
 * language switcher: a reader picks a language once, and each entry restores
 * it. Declared before the templates that interpolate it.
 */
export const DOCS_LANG_STORAGE_KEY = 'jsmind-docs-lang';

/**
 * The site root: the product front door.
 *
 * Three entries — documentation, tutorials, playground — plus the install
 * line, the GitHub link and the 2.x preview notice. The "recent tutorials"
 * slot is deliberately empty until the first post ships: it is a reserved
 * structure, not a stand-in for something else.
 *
 * The page is generated rather than checked in, as the redirect it replaced
 * was: the repository keeps no `index.html`, so the published root page and
 * this command cannot drift apart.
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
 */
export const LANDING_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>jsMind V2 — a mind-map kernel for people and agents</title>
<link rel="icon" type="image/svg+xml" href="favicon.svg">
<link rel="apple-touch-icon" href="favicon.png">
<style>
:root {
    color-scheme: light dark;
    --bg: #ffffff;
    --fg: #1b1b1f;
    --muted: #5c5f66;
    --line: #e2e2e6;
    --card: #f6f6f7;
    --accent: #3451b2;
}
@media (prefers-color-scheme: dark) {
    :root {
        --bg: #1b1b1f;
        --fg: #e5e5e6;
        --muted: #a8abb2;
        --line: #2e2e32;
        --card: #202024;
        --accent: #a8b8f0;
    }
}
* {
    box-sizing: border-box;
}
body {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    line-height: 1.6;
}
a {
    color: var(--accent);
}
.wrap {
    max-width: 960px;
    margin: 0 auto;
    padding: 0 24px;
}
.site-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 20px 0;
    border-bottom: 1px solid var(--line);
}
.brand {
    font-size: 18px;
    font-weight: 700;
    color: inherit;
    text-decoration: none;
}
.site-header nav {
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: 14px;
}
.lang-switch {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 999px;
    overflow: hidden;
}
.lang-switch button {
    padding: 4px 12px;
    border: 0;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
}
.lang-switch button[aria-pressed="true"] {
    background: var(--card);
    color: var(--fg);
    font-weight: 600;
}
.hero {
    padding: 48px 0 8px;
}
h1 {
    margin: 0 0 12px;
    font-size: 40px;
    line-height: 1.2;
}
.tagline {
    margin: 0 0 16px;
    max-width: 44em;
    font-size: 18px;
    color: var(--muted);
}
.preview {
    display: inline-block;
    margin: 0;
    padding: 2px 10px;
    border: 1px solid var(--line);
    border-radius: 999px;
    font-size: 13px;
    color: var(--muted);
}
.entries {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 16px;
    margin: 32px 0 0;
    padding: 0;
    list-style: none;
}
.entry {
    display: block;
    height: 100%;
    padding: 20px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--card);
    color: inherit;
    text-decoration: none;
}
.entry:hover {
    border-color: var(--accent);
}
.entry-title {
    display: block;
    margin-bottom: 6px;
    font-size: 18px;
    font-weight: 600;
    color: var(--accent);
}
.entry-text {
    display: block;
    font-size: 14px;
    color: var(--muted);
}
section {
    padding: 32px 0 0;
}
h2 {
    margin: 0 0 12px;
    font-size: 20px;
}
.install code {
    padding: 2px 8px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--card);
    font-size: 15px;
}
.recent-list {
    margin: 0;
    padding: 0;
    list-style: none;
}
.recent-empty {
    margin: 0;
    color: var(--muted);
}
.site-footer {
    margin-top: 48px;
    padding: 20px 0 40px;
    border-top: 1px solid var(--line);
    font-size: 13px;
    color: var(--muted);
}
</style>
</head>
<body>
<div class="wrap">
    <header class="site-header">
        <a class="brand" href="./">jsMind V2</a>
        <nav>
            <a href="https://github.com/hizzgdev/jsmind-v2">GitHub</a>
            <span class="lang-switch" role="group">
                <button type="button" data-lang="en" aria-pressed="true">English</button>
                <button type="button" data-lang="zh" aria-pressed="false">中文</button>
            </span>
        </nav>
    </header>
    <main>
        <section class="hero">
            <h1>jsMind V2</h1>
            <p class="tagline" data-en="A mind-map kernel for people and agents: people can view, edit and export maps; agents can reliably create, read and modify them." data-zh="面向人与 agent 的思维导图内核：人能查看、编辑、导出导图，agent 能可靠地生成、读取、修改结构化的脑图数据。">A mind-map kernel for people and agents: people can view, edit and export maps; agents can reliably create, read and modify them.</p>
            <p class="preview" data-en="2.x preview — the API may still change between minor releases." data-zh="2.x 预览版 —— 次版本之间仍可能有不兼容改动。">2.x preview — the API may still change between minor releases.</p>
        </section>

        <ul class="entries">
            <li>
                <a class="entry" href="docs/">
                    <span class="entry-title" data-en="Documentation" data-zh="文档">Documentation</span>
                    <span class="entry-text" data-en="Installation, the API reference and the design notes." data-zh="安装、API 参考与设计说明。">Installation, the API reference and the design notes.</span>
                </a>
            </li>
            <li>
                <a class="entry" href="tutorials/">
                    <span class="entry-title" data-en="Tutorials" data-zh="教程">Tutorials</span>
                    <span class="entry-text" data-en="One task, start to finish, with example files." data-zh="带示例文件，把一件事从头做一遍。">One task, start to finish, with example files.</span>
                </a>
            </li>
            <li>
                <a class="entry" href="playground.html">
                    <span class="entry-title" data-en="Playground" data-zh="Playground">Playground</span>
                    <span class="entry-text" data-en="Open a mind map in the browser and edit it." data-zh="在浏览器里打开一张脑图并直接编辑。">Open a mind map in the browser and edit it.</span>
                </a>
            </li>
        </ul>

        <section class="install">
            <h2 data-en="Install" data-zh="安装">Install</h2>
            <p><code>npm i jsmind@2</code></p>
            <p>
                <a href="docs/en/guide/getting-started" data-href-en="docs/en/guide/getting-started" data-href-zh="docs/zh/guide/getting-started" data-en="Quick start" data-zh="快速上手">Quick start</a>
                <span data-en="has the full steps; this page does not repeat them." data-zh="里有完整步骤，这里不再重复。">has the full steps; this page does not repeat them.</span>
            </p>
        </section>

        <section class="recent">
            <h2 data-en="Recent tutorials" data-zh="最近教程">Recent tutorials</h2>
            <!-- Reserved for the two or three newest posts. Empty until the
                 first tutorial ships; the tutorials site owns the full list. -->
            <ul class="recent-list" id="recent-tutorials"></ul>
            <p class="recent-empty" data-en="The first tutorials are being written. They will be listed on the tutorials page once published." data-zh="第一批教程正在撰写，发布后会出现在教程栏目里。">The first tutorials are being written. They will be listed on the tutorials page once published.</p>
        </section>
    </main>
    <footer class="site-footer">
        <p data-en="jsMind is BSD-3-Clause licensed." data-zh="jsMind 采用 BSD-3-Clause 许可。">jsMind is BSD-3-Clause licensed.</p>
    </footer>
</div>
<script>
(function () {
    var KEY = '${DOCS_LANG_STORAGE_KEY}';
    var lang = 'en';
    try {
        if (localStorage.getItem(KEY) === 'zh') {
            lang = 'zh';
        }
    } catch (error) {
        lang = 'en';
    }

    function apply(next) {
        lang = next;
        document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
        document.title = next === 'zh'
            ? 'jsMind V2 —— 面向人与 agent 的思维导图内核'
            : 'jsMind V2 — a mind-map kernel for people and agents';

        var group = document.querySelector('.lang-switch');
        if (group) {
            group.setAttribute('aria-label', next === 'zh' ? '语言' : 'Language');
        }

        var texts = document.querySelectorAll('[data-en], [data-zh]');
        for (var i = 0; i < texts.length; i += 1) {
            var value = texts[i].getAttribute('data-' + next);
            if (value !== null) {
                texts[i].textContent = value;
            }
        }

        var links = document.querySelectorAll('[data-href-en], [data-href-zh]');
        for (var j = 0; j < links.length; j += 1) {
            var href = links[j].getAttribute('data-href-' + next);
            if (href !== null) {
                links[j].setAttribute('href', href);
            }
        }

        var buttons = document.querySelectorAll('.lang-switch button');
        for (var k = 0; k < buttons.length; k += 1) {
            buttons[k].setAttribute('aria-pressed', buttons[k].getAttribute('data-lang') === next ? 'true' : 'false');
        }
    }

    var buttons = document.querySelectorAll('.lang-switch button');
    for (var b = 0; b < buttons.length; b += 1) {
        buttons[b].addEventListener('click', function (event) {
            var next = event.currentTarget.getAttribute('data-lang');
            try {
                localStorage.setItem(KEY, next);
            } catch (error) {
                // Storage can be disabled; the page still switches for this visit.
            }
            apply(next);
        });
    }

    apply(lang);
})();
</script>
</body>
</html>
`;

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
 * A language redirect for a bilingual site root.
 *
 * `/docs/` and `/tutorials/` share one rule: read `jsmind-docs-lang`, default
 * to English, and forward to the stored language with the query and hash
 * intact. It is written after the VitePress build, replacing any root index
 * the generator may have emitted. A page that already names its language
 * (`/docs/zh/`, `/tutorials/en/`) is a real page and is never rewritten.
 *
 * @param title - Page title, so a reader who lands here knows which site it is.
 */
export function languageRedirectHtml(title: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
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
}

/** Language redirect written to `_site/docs/index.html`. */
export const DOCS_LANGUAGE_REDIRECT_HTML = languageRedirectHtml('jsMind V2 Documentation');

/** Language redirect written to `_site/tutorials/index.html`. */
export const TUTORIALS_LANGUAGE_REDIRECT_HTML = languageRedirectHtml('jsMind V2 Tutorials');

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

    writeFileSync(join(siteDir, 'index.html'), LANDING_PAGE_HTML);
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
 */
export function writeDocsLanguageRedirect(docsDir: string): void {
    writeLanguageRedirect(docsDir, DOCS_LANGUAGE_REDIRECT_HTML);
}

/**
 * Writes the `/tutorials/` language redirect index.
 *
 * @param tutorialsDir - Tutorials output directory (`_site/tutorials`).
 */
export function writeTutorialsLanguageRedirect(tutorialsDir: string): void {
    writeLanguageRedirect(tutorialsDir, TUTORIALS_LANGUAGE_REDIRECT_HTML);
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
 * Builds the VitePress documentation site into `docsDir`, then writes the
 * language redirect at the docs root so `/docs/` is not left as a VitePress
 * index, and writes retired-path redirects under `en/` and `zh/`.
 *
 * @param root - Repository root.
 * @param docsDir - Docs output directory (`_site/docs`).
 */
export function assembleDocsSite(root: string, docsDir: string): void {
    buildVitepressSite(root, 'docs', docsDir, 'docs');
    writeDocsLanguageRedirect(docsDir);
    writeDocsPageRedirects(docsDir);
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
    writeTutorialsLanguageRedirect(tutorialsDir);
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
