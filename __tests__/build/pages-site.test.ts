/**
 * @fileoverview `npm run assemble-site` publishes the product front page, the
 * playground, the VitePress documentation site and the VitePress tutorials
 * site.
 *
 * The site root is a real page now, not a redirect: three entries
 * (documentation, tutorials, playground), the install line, the GitHub link
 * and the 2.x preview notice. The markup is a source file in `site/`, next to
 * the two redirect templates, so the page reads like a page and the build
 * script holds no HTML. Nothing is published from the repository root:
 * assembly renders `site/index.html` into `_site/index.html`, and the checkout
 * keeps exactly one copy of the markup.
 *
 * The page in `example/` is a module script whose src is `../dist/jsmind.js`.
 * That relative path is what `npm run server` needs. The command copies the
 * page to the site root and the bundle beside it, and rewrites only the src.
 * `type` may sit on either side of `src`. The Pages workflow runs the command
 * and does not check the tag itself.
 *
 * Docs and tutorials output are verified by running the VitePress build
 * against this repository into a temporary directory. The root-file fixture
 * stays focused on the landing page and the playground rewrite, and does not
 * invoke VitePress.
 *
 * The three published faces share one header — a title naming the face
 * (`jsMind V2`, `jsMind V2 Docs`, `jsMind V2 Tutorials`) and leading into that
 * face's own entry, an icon, and that face's menu with its cross-site entries
 * opening in a new tab — and the docs entry is the guide: `/docs/` and
 * `/docs/<lang>/` are one-hop redirects onto it, so the product page is the
 * only landing page in the tree.
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
    assembleDocsSite,
    assembleRootSite,
    assembleTutorialsSite,
    DOCS_ENTRY_PATH,
    DOCS_LANG_STORAGE_KEY,
    DOCS_PAGE_REDIRECTS,
    docsLanguageRedirectHtml,
    docsPageRedirectHtml,
    landingPageHtml,
    LOCAL_ICON_HREF_PREFIX,
    moduleScriptSrcs,
    PUBLIC_DIR,
    renderSitePage,
    rewritePlayground,
    SITE_ICON_FILES,
    SITE_INDEX_PAGE,
    SITE_SRC_DIR,
    SKILL_DIR,
    SKILL_SITE_FILE,
    TUTORIALS_DIR,
    tutorialsLanguageRedirectHtml,
    writeDocsPageRedirects,
} from '../../scripts/assemble-site.ts';
// The published addresses come from the site's one source of truth, the same
// file both VitePress configs read. A hand-copied origin here would be a
// fourth place to edit on the day the site moves.
import {
    DOCS_BASE,
    DOCS_URL,
    HOME_URL,
    SITE_ORIGIN,
    SITE_PATH,
    TUTORIALS_BASE,
    TUTORIALS_URL,
} from '../../site.config.mjs';
import {
    listTutorialPosts,
    parseTutorialFrontmatter,
    recentTutorialPosts,
} from '../../scripts/tutorial-posts.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

// Both home pages show this version at build time. Nothing in the tree spells
// the version out (scripts/check-version-refs.mjs enforces that), so the value
// has to come from here or the placeholder ships verbatim.
const PACKAGE_VERSION = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version;

const DOCS_README_BLOB = 'https://github.com/hizzgdev/jsmind-v2/blob/master/docs/README.md';

/**
 * The AI-assistance notice is rendered in the page's own language now, so a
 * built page has to carry one of these and only that one. Both sentences are
 * pinned here because `assertVisibleAiNotice` needs to know which one to
 * require and which one must be absent; `readThemeNotice` reads the two theme
 * copies back so a sentence drifting in one of them fails this file.
 */
const AI_NOTICE_TEXT = {
    en: 'This documentation was prepared with AI assistance',
    zh: '本文档由 AI 协助生成',
} as const;

type NoticeLocale = keyof typeof AI_NOTICE_TEXT;

/**
 * Every repository address in a page needs the Gitee mirror of the same path
 * beside it.
 *
 * The GitHub URL is the primary one, but the reader who needs the mirror cannot
 * reach github.com at all — that is the situation the mirror exists for, and a
 * sentence that prints a GitHub URL alone sends that reader in a circle. The
 * pairing is asserted rather than trusted to survive the next edit.
 *
 * Run this on the Markdown sources, not on built HTML: the theme adds its own
 * repository links to every page, and those are not install instructions.
 *
 * @param body - A Markdown file read from the tree.
 * @param label - What is being checked, for the failure message.
 */
function assertMirrored(body: string, label: string): void {
    const PREFIXES: Array<[string, string]> = [
        ['https://raw.githubusercontent.com/hizzgdev/jsmind-v2/', 'https://gitee.com/hizzgdev/jsmind-v2/raw/'],
        ['https://github.com/hizzgdev/jsmind-v2/', 'https://gitee.com/hizzgdev/jsmind-v2/'],
    ];
    for (const [githubPrefix, giteePrefix] of PREFIXES) {
        let from = 0;
        for (;;) {
            const start = body.indexOf(githubPrefix, from);
            if (start === -1) {
                break;
            }
            const rest = body.slice(start);
            const end = rest.search(/[\s)"'<>]/);
            // Prose puts a comma or a full stop right after an address; neither
            // belongs to the URL, and a trailing one would look like a difference
            // between the two sources.
            const url = (end === -1 ? rest : rest.slice(0, end)).replace(/[.,;:]+$/, '');
            assert.ok(
                body.includes(`${giteePrefix}${url.slice(githubPrefix.length)}`),
                `${label}: ${url} has no Gitee mirror`
            );
            from = start + url.length;
        }
    }
}

const DOCS_PAGES = [
    'index.html',
    'guide/index.html',
    'guide/getting-started.html',
    'guide/skill.html',
    'guide/cli.html',
    'reference/index.html',
    'reference/api.html',
    'reference/api/jsmind.html',
    'reference/api/mind.html',
    'reference/api/node.html',
    'reference/api/edge.html',
    'reference/api/options.html',
    'reference/api/serialization.html',
    'reference/api/export.html',
    'reference/api/style.html',
    'reference/node-content.html',
    'reference/node-move.html',
    'reference/image-export.html',
    'reference/serialization.html',
    'reference/data-format.html',
    'design/index.html',
    'design/layout-system.html',
    'design/theme-system.html',
    'design/hybrid-edge-system.html',
    'community/index.html',
] as const;

const AI_NOTICE_CLASS = 'jsmind-docs-ai-notice';
const SECTION_HREFS = {
    en: [
        '/jsmind-v2/docs/en/guide/',
        '/jsmind-v2/docs/en/design/',
        '/jsmind-v2/docs/en/reference/',
        '/jsmind-v2/docs/en/community/',
    ],
    zh: [
        '/jsmind-v2/docs/zh/guide/',
        '/jsmind-v2/docs/zh/design/',
        '/jsmind-v2/docs/zh/reference/',
        '/jsmind-v2/docs/zh/community/',
    ],
} as const;

const STILL_PLACEHOLDER_PAGES = [
    'reference/data-format.html',
] as const;

function collectFiles(dir: string, base: string = dir): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectFiles(path, base));
        }
        else {
            files.push(relative(base, path).split(sep)
                .join('/'));
        }
    }
    return files;
}

function hasHref(haystack: string, href: string): boolean {
    return haystack.includes(`](${href})`) || haystack.includes(`href="${href}"`);
}

/**
 * Hrefs of every `<link>` whose `rel` names one of `rels`, in document order.
 *
 * Attribute order is not part of the HTML contract, so the tag is parsed
 * rather than matched with one literal pattern.
 */
function linkHrefs(html: string, rels: readonly string[]): string[] {
    const hrefs: string[] = [];
    for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
        const attrs = new Map<string, string>();
        for (const match of tag.matchAll(/\b([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g)) {
            attrs.set(match[1].toLowerCase(), match[2]);
        }
        const names = (attrs.get('rel') ?? '').toLowerCase()
            .split(/\s+/);
        const href = attrs.get('href');
        if (href !== undefined && names.some((name) => rels.includes(name))) {
            hrefs.push(href);
        }
    }
    return hrefs;
}

/** Every browser-tab icon href on a page: the tab icon and the touch icon. */
function iconHrefs(html: string): string[] {
    return linkHrefs(html, ['icon', 'apple-touch-icon']);
}

/**
 * The file an href must resolve to in the published tree.
 *
 * The site is served under a URL prefix, not at the domain root, so the href
 * is resolved against the page's own published address first: a base-less
 * `/favicon.svg` resolves one level above the prefix and fails here.
 * Asserting that a `link` tag exists would stay green on exactly that 404.
 */
function resolvePublishedHref(href: string, pageUrl: string, prefix: string, root: string): string {
    const url = new URL(href, pageUrl);
    assert.strictEqual(url.origin, SITE_ORIGIN, `${pageUrl}: ${href} is not a published address`);
    assert.ok(url.pathname.startsWith(prefix), `${pageUrl}: ${href} resolves outside ${prefix}`);
    return join(root, url.pathname.slice(prefix.length));
}


/**
 * Bytes of the published file an `<img>` with this `alt` points at.
 */
function publishedAsset(html: string, alt: string, pageUrl: string, root: string): Buffer {
    const href = imgSrcByAlt(html, alt);
    assert.ok(href !== null, `${pageUrl} is missing an image with alt ${alt}`);
    const file = resolvePublishedHref(href, pageUrl, TUTORIALS_BASE, root);
    assert.ok(existsSync(file), `${pageUrl}: ${href} should resolve to ${file}`);
    return readFileSync(file);
}

/**
 * Bytes of the published file a link whose text or href mentions `name` points at.
 *
 * The build renames an asset to `<stem>.<hash>.<ext>`, so the href cannot be
 * compared with `name` as a whole. The comparison is on the stem instead, which
 * keeps the matcher independent of the file extension.
 */
function publishedHrefAsset(html: string, name: string, pageUrl: string, root: string): Buffer {
    const stem = name.replace(/\.[^.]+$/, '');
    const hrefs: string[] = [];
    for (const tag of html.match(/<a\b[^>]*>/gi) ?? []) {
        const attrs = new Map<string, string>();
        for (const match of tag.matchAll(/\b([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g)) {
            attrs.set(match[1].toLowerCase(), match[2]);
        }
        const href = attrs.get('href');
        if (href !== undefined && (tag.includes(name) || hrefHasStem(href, stem))) {
            hrefs.push(href);
        }
    }
    assert.ok(hrefs.length > 0, `${pageUrl} should link ${name}`);
    const file = resolvePublishedHref(hrefs[0], pageUrl, TUTORIALS_BASE, root);
    assert.ok(existsSync(file), `${pageUrl}: ${hrefs[0]} should resolve to ${file}`);
    return readFileSync(file);
}

/** Whether a published href names the asset file that starts with `<stem>.`. */
function hrefHasStem(href: string, stem: string): boolean {
    const path = href.split('?')[0];
    const base = path.slice(path.lastIndexOf('/') + 1);
    return base === stem || base.startsWith(`${stem}.`);
}

/** Every `href` an `<a>` on the page points at. */
function anchorHrefs(html: string): string[] {
    const hrefs: string[] = [];
    for (const tag of html.match(/<a\b[^>]*>/gi) ?? []) {
        const match = /\bhref\s*=\s*"([^"]*)"/i.exec(tag);
        if (match !== null) {
            hrefs.push(match[1]);
        }
    }
    return hrefs;
}

function imgSrcByAlt(html: string, alt: string): string | null {
    for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
        const attrs = new Map<string, string>();
        for (const match of tag.matchAll(/\b([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g)) {
            attrs.set(match[1].toLowerCase(), match[2]);
        }
        if (attrs.get('alt') === alt) {
            return attrs.get('src') ?? null;
        }
    }
    return null;
}


/**
 * The source page every root-site fixture starts from: the icons under
 * `docs/public/` and the bundle under `dist/`, both addressed as the repository
 * checkout addresses them.
 */
function fixturePlayground(): string {
    const icons = SITE_ICON_FILES.map((name) => `<link rel="icon" href="${LOCAL_ICON_HREF_PREFIX}${name}">`)
        .join('\n');
    return `${icons}\n<script src="../dist/jsmind.js" type="module"></script>\n`;
}

/**
 * The `site/index.html` a root-site fixture starts from: one link and one
 * slot. It is not the real front page on purpose — these tests are about the
 * mechanism (the slot is filled, the rendered page lands at the site root),
 * and the `landing page` tests own the wording.
 */
const FIXTURE_SITE_PAGE = `<!DOCTYPE html>
<html lang="en">
<head><title>jsMind V2 fixture</title></head>
<body>
<p><a href="docs/">docs</a></p>
<script>var KEY = '{{DOCS_LANG_STORAGE_KEY}}';</script>
</body>
</html>
`;

/**
 * A minimal repository tree for `assembleRootSite`: the bundle, the playground,
 * the page source under `site/` and the one copy of the icons under
 * `docs/public/`. This function reads nothing else.
 *
 * @param dir - Fixture root.
 * @param options - `skill: false` leaves out `SKILL.md`; `page: false` leaves
 * out the page source. Both keep the rest.
 */
function writeRootSiteFixture(dir: string, options: { skill?: boolean; page?: boolean } = {}): void {
    mkdirSync(join(dir, 'example'), { recursive: true });
    mkdirSync(join(dir, 'dist'), { recursive: true });
    mkdirSync(join(dir, PUBLIC_DIR), { recursive: true });
    mkdirSync(join(dir, SKILL_DIR, 'jsmind', 'references'), { recursive: true });
    writeFileSync(join(dir, 'dist', 'jsmind.js'), 'export {}\n');
    writeFileSync(join(dir, 'example', 'playground.html'), fixturePlayground());
    if (options.page !== false) {
        mkdirSync(join(dir, SITE_SRC_DIR), { recursive: true });
        writeFileSync(join(dir, SITE_SRC_DIR, SITE_INDEX_PAGE), FIXTURE_SITE_PAGE);
    }
    for (const name of SITE_ICON_FILES) {
        writeFileSync(join(dir, PUBLIC_DIR, name), `${name} from ${PUBLIC_DIR}\n`);
    }
    if (options.skill !== false) {
        writeFileSync(join(dir, SKILL_DIR, 'jsmind', 'SKILL.md'), '# Skill\n');
        // A file one level deeper than SKILL.md: the step copies the directory,
        // so a fixture that only proves SKILL.md would not catch a rewrite that
        // stopped copying references/.
        writeFileSync(join(dir, SKILL_DIR, 'jsmind', 'references', 'build-session.md'), 'reference\n');
    }
}

function withoutVpFooter(html: string): string {
    return html.replace(/<footer\b[^>]*class="[^"]*\bVPFooter\b[^"]*"[^>]*>[\s\S]*?<\/footer>/g, '');
}

/**
 * The `<aside>` block of a built page: the sidebar, as opposed to the top bar.
 *
 * VitePress renders the nav and the sidebar in different containers, so this
 * is how a test tells "the other column is reachable from the top bar" apart
 * from "the other column's pages were added to the docs sidebars".
 */
function asideHtml(html: string): string {
    const start = html.indexOf('<aside');
    const end = html.indexOf('</aside>', start);
    return start === -1 || end === -1 ? '' : html.slice(start, end);
}

/**
 * The top bar of a built page.
 *
 * The page also carries the theme config of every locale as site data, so
 * asking whether a link "appears somewhere in the HTML" would be answered yes
 * by an entry that is not rendered at all. The nav assertion has to look at
 * the element a reader can click.
 */
function headerHtml(html: string): string {
    const start = html.indexOf('<header');
    const end = html.indexOf('</header>', start);
    return start === -1 || end === -1 ? '' : html.slice(start, end);
}

function readBuiltCss(docsDir: string): string {
    const assets = join(docsDir, 'assets');
    const files = collectFiles(assets).filter((name) => name.endsWith('.css'));
    return files.map((name) => readFileSync(join(assets, name), 'utf8')).join('\n');
}

function assertVisibleAiNotice(html: string, css: string, label: string, locale: NoticeLocale): void {
    const expected = AI_NOTICE_TEXT[locale];
    const escaped = expected.replace(/[\\/]/g, '\\$&');
    const noticeRe = new RegExp(`<p class="${AI_NOTICE_CLASS}">${escaped}</p>`);
    assert.match(html, noticeRe, `${label} should render the ${locale} AI notice`);
    // The notice used to be one bilingual sentence. A page that still carries
    // the other language means the sentence was resolved once for the whole
    // site instead of per page.
    const other: NoticeLocale = locale === 'en' ? 'zh' : 'en';
    assert.ok(!html.includes(AI_NOTICE_TEXT[other]), `${label} should not render the ${other} AI notice`);
    assert.ok(
        withoutVpFooter(html).includes(expected),
        `${label} should not rely on VPFooter, which VitePress hides when a sidebar is present`
    );
    // VitePress hides `.VPFooter.has-sidebar`, so the notice must live in our
    // custom element and stay displayed in the built CSS.
    assert.match(
        css,
        new RegExp(`\\.${AI_NOTICE_CLASS}\\s*\\{[^}]*display:\\s*block`),
        `${label} custom notice CSS should keep the notice displayed`
    );
    assert.doesNotMatch(
        css,
        new RegExp(`\\.${AI_NOTICE_CLASS}[^{]*\\{[^}]*display:\\s*none`),
        `${label} custom notice CSS must not hide the notice`
    );
    // The notice sits one size below body text, and the rule this change edited
    // is the only place that decides it.
    assert.match(
        css,
        new RegExp(`\\.${AI_NOTICE_CLASS}\\s*\\{[^}]*font-size:\\s*13px`),
        `${label} custom notice CSS should size the notice at 13px`
    );
}

/**
 * The notice map a theme file declares, read from the source.
 *
 * The tutorials theme is a copy of the docs theme, and each site's build only
 * ever renders its own copy — so a sentence that drifted in one of the two
 * files would pass every assertion above. Reading both sources is the only
 * check that catches it.
 */
function readThemeNotice(themePath: string): Record<NoticeLocale, string> {
    const source = readFileSync(join(ROOT, themePath), 'utf8');
    const declaration = /AI_ASSISTANCE_NOTICE\s*=\s*\{([\s\S]*?)\};/.exec(source);
    assert.ok(declaration, `${themePath} should declare AI_ASSISTANCE_NOTICE as a locale map`);
    const read = (locale: NoticeLocale): string => {
        const entry = new RegExp(`\\b${locale}:\\s*'([^']*)'`).exec(declaration[1]);
        assert.ok(entry, `${themePath}: AI_ASSISTANCE_NOTICE should carry a ${locale} sentence`);
        return entry[1];
    };
    return { en: read('en'), zh: read('zh') };
}

/**
 * The docs entry reads the version from `package.json` at build time.
 *
 * It used to be the home hero's `::: info` line; the hero is gone and the
 * guide is the entry, so the one place the reader sees the current preview
 * version is the guide. Asserting against the package version rather than a
 * literal keeps this from becoming a second place to edit on every release,
 * and asserting the absence of the placeholder catches the case the version
 * guard cannot: a `{{ pkg.version }}` that lands somewhere VitePress does not
 * interpolate still builds green.
 */
function assertEntryVersion(html: string, label: string): void {
    assert.ok(html.includes(`v${PACKAGE_VERSION}`), `${label} should render v${PACKAGE_VERSION} from package.json`);
    assert.ok(!html.includes('{{ pkg.version }}'), `${label} should not ship the uninterpolated placeholder`);
}

function assertSectionOrder(html: string, locale: 'en' | 'zh', label: string): void {
    const hrefs = SECTION_HREFS[locale];
    const positions = hrefs.map((href) => html.indexOf(`href="${href}"`));
    for (const [index, href] of hrefs.entries()) {
        assert.ok(positions[index] >= 0, `${label} should link to ${href}`);
        if (index > 0) {
            assert.ok(
                positions[index] > positions[index - 1],
                `${label} should list ${hrefs[index - 1]} before ${href}`
            );
        }
    }
}

/**
 * Attributes of one start tag, keyed by lower-case name.
 *
 * Attribute order is not part of the HTML contract, so the tags these helpers
 * read are parsed rather than matched with one literal pattern.
 */
function tagAttrs(tag: string): Map<string, string> {
    const attrs = new Map<string, string>();
    for (const match of tag.matchAll(/\b([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g)) {
        attrs.set(match[1].toLowerCase(), match[2]);
    }
    return attrs;
}

/**
 * The text of an HTML fragment: tags stripped, whitespace collapsed.
 */
function textOf(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ')
        .trim();
}

/** One entry of the header's menu, as the owner's list describes it. */
interface HeaderMenuEntry {
    text: string;
    href: string;
    newTab?: boolean;
}

/**
 * The links in the header's menu, in the order a reader meets them.
 *
 * The product page writes its own `<nav class="site-nav">`; the two VitePress
 * sites render their nav config into `VPNavBarMenu`. Both are the menu the
 * owner's list describes, so this reads either shape in document order — and
 * document order is the assertion, not a lookup by name. The header is read
 * rather than the whole document because the same addresses also sit in the
 * page's theme-config blob, and the question is what a reader can click.
 */
function headerMenu(html: string): Array<{ text: string; href: string; target?: string; rel?: string }> {
    const header = headerHtml(html);
    const nav = /<nav\b[^>]*class="[^"]*(?:VPNavBarMenu|site-nav)[^"]*"[^>]*>([\s\S]*?)<\/nav>/.exec(header);
    assert.ok(nav, 'the header should carry the menu nav');
    const links: Array<{ text: string; href: string; target?: string; rel?: string }> = [];
    for (const match of nav[1].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
        const attrs = tagAttrs(match[0]);
        const href = attrs.get('href');
        assert.ok(href !== undefined, `the ${textOf(match[2])} menu entry should have an href`);
        links.push({
            text: textOf(match[2]),
            href,
            target: attrs.get('target'),
            rel: attrs.get('rel'),
        });
    }
    return links;
}

/**
 * Header parts in the order the owner's list puts them: menu, language menu,
 * appearance switch, GitHub.
 *
 * The bar itself is VitePress's, so its order is what the docs and tutorials
 * site render; the product page repeats it by hand. Pinning the order on the
 * built pages is what catches a theme upgrade that moves one of the four, or a
 * later edit that drops one while adding another.
 */
function assertHeaderOrder(header: string, markers: readonly string[], label: string): void {
    let previous = -1;
    for (const marker of markers) {
        const at = header.indexOf(marker);
        assert.ok(at > previous, `${label}: ${marker} should come after the header part before it`);
        previous = at;
    }
}

/**
 * The one header the three published faces share.
 *
 * The title names the face (`jsMind V2`, `jsMind V2 Docs`, `jsMind V2
 * Tutorials`) and leads into that face's own entry — the product page to
 * itself, the docs to the locale's guide, the tutorials to the locale's column
 * index; the way back to the product page is the Home entry in the menu. The
 * icon resolves to a file this build publishes; the menu is the owner's list
 * for that face, in order, with the cross-site entries opening in a new tab;
 * and the four right-hand parts appear in the order the owner gave. Run it on
 * the product page, the docs guides and the tutorials entries: a header change
 * that reaches one face and not the others is exactly the drift the shared
 * header exists to prevent.
 *
 * Which face the reader is on is now the title. The header before this change
 * carried the column as a link with `aria-current="page"`; the owner's list has
 * no such entry on any face — the docs site lists the tutorials, not itself —
 * so what this asserts in its place is the title text.
 *
 * @param options.html - The built page.
 * @param options.label - Which face, for the failure messages.
 * @param options.pageUrl - The page's published address, for resolving hrefs.
 * @param options.base - The published base the icon has to stay inside.
 * @param options.root - Output directory the icon's href resolves against.
 * @param options.title - The title this face must carry.
 * @param options.titleLink - Where that title leads, as a published address.
 * @param options.menu - The menu entries, in order, at their published addresses.
 * @param options.order - Markers identifying the four right-hand parts, in order.
 */
function assertSharedHeader(options: {
    html: string;
    label: string;
    pageUrl: string;
    base: string;
    root: string;
    title: string;
    titleLink: string;
    menu: readonly HeaderMenuEntry[];
    order: readonly string[];
}): void {
    const { html, label, pageUrl, base, root, title, titleLink, menu, order } = options;
    const header = headerHtml(html);
    assert.ok(header.length > 0, `${label} should render a header`);

    // The title leads into this face's own entry: a reader who arrives from a
    // search result is one click from the column they are reading, and the
    // product page is one click further, on Home.
    const titleAnchor = /<a\b[^>]*>[\s\S]*?<\/a>/.exec(header);
    assert.ok(titleAnchor, `${label} header should start with the title link`);
    const titleHref = tagAttrs(titleAnchor[0]).get('href');
    assert.ok(titleHref !== undefined, `${label} title link should have an href`);
    assert.strictEqual(
        new URL(titleHref, pageUrl).href,
        titleLink,
        `${label} title should lead to this face's own entry`
    );
    assert.strictEqual(textOf(titleAnchor[0]), title, `${label} title should name this face`);

    // The icon has to point at a file this build publishes, not at a base-less
    // path that 404s one level above the site.
    const img = /<img\b[^>]*>/.exec(header);
    assert.ok(img, `${label} header should carry the product icon`);
    const src = tagAttrs(img[0]).get('src');
    assert.ok(src !== undefined, `${label} header icon should have a src`);
    const iconFile = resolvePublishedHref(src, pageUrl, base, root);
    assert.ok(existsSync(iconFile), `${label}: ${src} should resolve to ${iconFile}`);

    // The menu, in the owner's order, at their published addresses. The
    // product page writes them relative to the site root and the VitePress
    // faces write them absolute, so each href is resolved against the page
    // before it is compared: the address a reader reaches is the contract.
    const rendered = headerMenu(html);
    assert.deepStrictEqual(
        rendered.map(({ text, href }) => ({ text, href: new URL(href, pageUrl).href })),
        menu.map(({ text, href }) => ({ text, href })),
        `${label} menu should be this face's list, in order`
    );
    for (const [index, entry] of menu.entries()) {
        const link = rendered[index];
        if (entry.newTab) {
            assert.strictEqual(link.target, '_blank', `${label}: ${link.text} should open in a new tab`);
            assert.match(link.rel ?? '', /\bnoopener\b/, `${label}: ${link.text} should carry noopener`);
            assert.match(link.rel ?? '', /\bnoreferrer\b/, `${label}: ${link.text} should carry noreferrer`);
        } else {
            // No `target`, or `_self`: VitePress's router intercepts any
            // same-origin link that carries none, and the product page lives
            // outside both sites' bases, so an intercepted Home would route
            // into a page this site does not have.
            assert.strictEqual(link.target ?? '_self', '_self', `${label}: ${link.text} should stay in this tab`);
        }
    }

    assertHeaderOrder(header, order, label);
}

describe('landing page', () => {
    it('is a product page rendered from site/, with the three entries and no docs redirect', () => {
        // The markup is a source file in `site/`, not a string inside the build
        // script, and not a page at the repository root: assembly renders it
        // into `_site/index.html`.
        assert.ok(
            !existsSync(join(ROOT, 'index.html')),
            'the repository root must not carry a landing page'
        );
        const source = readFileSync(join(ROOT, SITE_SRC_DIR, SITE_INDEX_PAGE), 'utf8');
        assert.ok(
            source.includes('{{DOCS_LANG_STORAGE_KEY}}'),
            'the page source should leave the language key to the build'
        );

        const page = landingPageHtml();
        assert.ok(!page.includes('{{'), 'the rendered page should carry no unfilled slot');
        for (const href of ['docs/', 'tutorials/', 'playground.html']) {
            assert.ok(
                page.includes(`href="${href}"`),
                `the page should link ${href}`
            );
        }
        assert.doesNotMatch(
            page,
            /location\.replace\('docs\//,
            'the root must no longer redirect to the docs site'
        );

        // A page someone lands on, not a stub: it needs a title, a heading and
        // enough text to explain what the three entries lead to.
        assert.ok(page.length > 1024, 'the page should be a real page, not a stub');
        assert.match(page, /<title>jsMind V2/);
        assert.match(page, /<h1>jsMind V2<\/h1>/);

        // Installation stays a one-line entry; the steps belong to the quick
        // start page and must not be copied onto the front page.
        assert.ok(page.includes('npm i jsmind@2'));
        assert.ok(page.includes('docs/en/guide/getting-started'));
        assert.ok(page.includes('2.x preview'));
        assert.ok(page.includes('https://github.com/hizzgdev/jsmind-v2'));

        // The source keeps slots; the rendered page lists the newest posts
        // from tutorials/*/posts/, and must not keep the empty-state sentence
        // under a real list.
        assert.ok(source.includes('{{RECENT_TUTORIALS}}'));
        assert.ok(source.includes('{{RECENT_EMPTY}}'));
        assert.ok(!source.includes('161-first-mind-map-with-skill'));

        assert.ok(page.includes('id="recent-tutorials"'));
        assert.match(
            page,
            /<ul class="recent-list"[^>]*>[\s\S]*?<li/,
            'the first tutorial should appear in the recent-tutorials list'
        );
        assert.ok(page.includes('Build your first mind map with the jsMind Skill'));
        assert.ok(page.includes('用 jsMind Skill 做你的第一张思维导图'));
        assert.ok(page.includes('tutorials/en/posts/161-first-mind-map-with-skill.html'));
        assert.ok(page.includes('tutorials/zh/posts/161-first-mind-map-with-skill.html'));
        assert.ok(
            !page.includes('class="recent-empty"'),
            'the empty-state sentence must not sit under a real list'
        );
        assert.ok(!page.includes('The first tutorials are being written.'));

        // Language switching shares the docs key and defaults to English.
        assert.ok(page.includes(`var LANG_KEY = '${DOCS_LANG_STORAGE_KEY}';`));
        assert.ok(page.includes('var lang = \'en\''));
        assert.ok(page.includes('localStorage.setItem(LANG_KEY, next)'));
        assert.ok(page.includes('data-zh='));

        // Appearance is VitePress's own storage key and its `dark` class, not a
        // fourth state of this page: a reader who picked dark on either
        // VitePress site arrives in dark, and a choice made here carries back.
        assert.ok(page.includes('var APPEARANCE_KEY = \'vitepress-theme-appearance\';'));
        assert.ok(page.includes('localStorage.setItem(APPEARANCE_KEY, dark ? \'dark\' : \'light\')'));
        assert.ok(
            page.includes('classList.toggle(\'dark\', dark)'),
            'the switch and the head script should set the same class'
        );
        // The head script decides before the body paints; after it is a flash.
        assert.ok(
            page.indexOf('localStorage.getItem(\'vitepress-theme-appearance\')') < page.indexOf('<body>'),
            'appearance has to be decided in <head>'
        );

        // The right-hand area in the owner's order: the two columns, then the
        // language menu, the appearance switch and the GitHub link.
        assert.match(
            page,
            /<button type="button" class="[^"]*header-lang-button[^"]*" aria-haspopup="true" aria-expanded="false"/,
            'the language menu should be a button that opens a list, like the one on the two VitePress sites'
        );
        assert.match(
            page,
            /<button type="button" class="appearance-switch" role="switch" aria-checked="(?:true|false)"/,
            'the product page should carry the appearance switch'
        );
        assert.match(
            page,
            /<a class="[^"]*header-social[^"]*" href="https:\/\/github\.com\/hizzgdev\/jsmind-v2"/,
            'the GitHub link should be the one icon in the right-hand area'
        );
        // The old pill of two buttons is gone: the switch is a menu now.
        assert.ok(!page.includes('class="lang-switch"'));
        assert.ok(!page.includes('aria-pressed'), 'the language entries mark the current one with aria-current');

        // A page people look at, so it dresses the tab like the playground.
        assert.deepStrictEqual(iconHrefs(page), [...SITE_ICON_FILES]);

        // The same header the two VitePress sites render: the brand with the
        // icon leads home, then the two columns. The icon is published from
        // the one checked-in copy — `assembleRootSite` copies `docs/public/`
        // to the site root — so that is the file the relative `favicon.svg`
        // has to name.
        assertSharedHeader({
            html: page,
            label: 'the product page',
            pageUrl: `${SITE_ORIGIN}${SITE_PATH}${SITE_INDEX_PAGE}`,
            base: SITE_PATH,
            root: join(ROOT, PUBLIC_DIR),
            title: 'jsMind V2',
            titleLink: HOME_URL,
            menu: [
                { text: 'Docs', href: `${DOCS_URL}en/`, newTab: true },
                { text: 'Tutorials', href: `${TUTORIALS_URL}en/`, newTab: true },
            ],
            order: ['site-nav', 'header-lang', 'appearance-switch', 'header-social'],
        });

        // ...and the two column links follow the page's language switch, like
        // the quick-start link does: an English visitor gets the English column
        // and the stored Chinese one gets the Chinese column.
        const nav = /<nav class="[^"]*site-nav[^"]*"[^>]*>([\s\S]*?)<\/nav>/.exec(page);
        assert.ok(nav, 'the product page should carry the header nav');
        for (const [label, url] of [['Docs', DOCS_URL], ['Tutorials', TUTORIALS_URL]] as const) {
            const tag = new RegExp(`<a\\b[^>]*>${label}</a>`).exec(nav[1]);
            assert.ok(tag, `the header should link ${label}`);
            const attrs = tagAttrs(tag[0]);
            assert.strictEqual(
                new URL(attrs.get('href') ?? '', `${SITE_ORIGIN}${SITE_PATH}${SITE_INDEX_PAGE}`).href,
                `${url}en/`,
                `the ${label} link should reach the English entry`
            );
            assert.strictEqual(
                new URL(attrs.get('data-href-zh') ?? '', `${SITE_ORIGIN}${SITE_PATH}${SITE_INDEX_PAGE}`).href,
                `${url}zh/`,
                `the ${label} link should follow the page into Chinese`
            );
            // The label is text, not just a link: without a `data-en` /
            // `data-zh` pair `applyLanguage()` leaves it in English while the
            // rest of the page switches, so the two have to exist and differ.
            assert.strictEqual(
                attrs.get('data-en'),
                label,
                `the ${label} label should carry its English text`
            );
            const zhLabel = attrs.get('data-zh');
            assert.ok(zhLabel, `the ${label} label should carry a Chinese counterpart`);
            assert.notStrictEqual(
                zhLabel,
                label,
                `the ${label} label should actually change with the language`
            );
        }
    });
});

describe('pages site assembly', () => {
    it('refuses a GitHub address that has no Gitee mirror beside it', () => {
        // The pairing check is the only thing standing between the next edit and
        // a page that sends a blocked reader back to GitHub, so it is shown to
        // fail on a single-sided address rather than assumed to.
        assert.doesNotThrow(() =>
            assertMirrored(
                'browse https://github.com/hizzgdev/jsmind-v2/tree/master/skills/jsmind, or https://gitee.com/hizzgdev/jsmind-v2/tree/master/skills/jsmind.',
                'paired'
            )
        );
        assert.throws(
            () =>
                assertMirrored(
                    'see https://github.com/hizzgdev/jsmind-v2/tree/master/skills/jsmind.',
                    'single sided'
                ),
            /has no Gitee mirror/
        );
        assert.throws(
            () => assertMirrored('https://raw.githubusercontent.com/hizzgdev/jsmind-v2/master/skills/jsmind/SKILL.md', 'raw'),
            /has no Gitee mirror/
        );
    });

    it('keeps the source playground on the local bundle path', () => {
        const html = readFileSync(join(ROOT, 'example/playground.html'), 'utf8');
        assert.deepStrictEqual(moduleScriptSrcs(html), ['../dist/jsmind.js']);

        const published = rewritePlayground(html);
        assert.deepStrictEqual(moduleScriptSrcs(published), ['jsmind.js']);
        assert.ok(!published.includes('../dist/jsmind.js'));
    });

    it('points the playground at icons that exist beside it, in both layouts', () => {
        const source = join(ROOT, 'example/playground.html');
        const html = readFileSync(source, 'utf8');

        // Opened straight from the repository, the page sits in `example/` and
        // draws the icons from the one copy under `docs/public/`.
        assert.deepStrictEqual(
            iconHrefs(html),
            SITE_ICON_FILES.map((name) => `${LOCAL_ICON_HREF_PREFIX}${name}`)
        );
        const pageUrl = pathToFileURL(source).href;
        for (const href of iconHrefs(html)) {
            const file = fileURLToPath(new URL(href, pageUrl));
            assert.ok(existsSync(file), `example/playground.html icon ${href} should resolve to ${file}`);
        }

        // On the site the page and the copied icons share the root, so the
        // published hrefs are names, not paths back into the repository.
        const published = rewritePlayground(html);
        assert.deepStrictEqual(iconHrefs(published), [...SITE_ICON_FILES]);
        assert.ok(!published.includes(LOCAL_ICON_HREF_PREFIX));
    });

    it('accepts type after src, and rejects a classic script', () => {
        // The page must also link the icons: `rewritePlayground` refuses a
        // published playground whose tab icon the site has no address for, so
        // the fixture a minimal page is allowed to be still carries them.
        const icons = SITE_ICON_FILES.map((name) => `<link rel="icon" href="${LOCAL_ICON_HREF_PREFIX}${name}">`)
            .join('');
        const publishedIcons = SITE_ICON_FILES.map((name) => `<link rel="icon" href="${name}">`)
            .join('');
        const reversed = `${icons}<script src="../dist/jsmind.js" type="module"></script>`;
        assert.strictEqual(
            rewritePlayground(reversed),
            `${publishedIcons}<script src="jsmind.js" type="module"></script>`
        );

        assert.throws(
            () => rewritePlayground(`${icons}<script src="../dist/jsmind.js"></script>`),
            /does not load jsmind\.js as a module/
        );
        assert.throws(
            () => rewritePlayground(`${icons}<script type="module" src="jsmind.js"></script>`),
            /has no script/
        );
        assert.throws(
            () => rewritePlayground('<script src="../dist/jsmind.js" type="module"></script>'),
            /does not link favicon\.svg/
        );
    });

    it('writes the product page, the playground, the bundle, the icons and the skill into the site root', () => {
        const dir = mkdtempSync(join(tmpdir(), 'jsmind-site-'));
        try {
            writeRootSiteFixture(dir);

            assembleRootSite(dir, join(dir, '_site'));

            // The published page is `site/index.html` rendered: the slot is
            // filled, and the file that lands at the site root is not the
            // source copied verbatim.
            const index = readFileSync(join(dir, '_site', 'index.html'), 'utf8');
            assert.strictEqual(
                index,
                FIXTURE_SITE_PAGE.replace('{{DOCS_LANG_STORAGE_KEY}}', DOCS_LANG_STORAGE_KEY)
            );
            assert.ok(!index.includes('{{'), 'no slot should reach the published page');
            assert.ok(index.includes('href="docs/"'), 'the published index should keep the page links');
            assert.strictEqual(readFileSync(join(dir, '_site', 'jsmind.js'), 'utf8'), 'export {}\n');
            const publishedIcons = SITE_ICON_FILES.map((name) => `<link rel="icon" href="${name}">`)
                .join('\n');
            const publishedPlayground = readFileSync(join(dir, '_site', 'playground.html'), 'utf8');
            assert.strictEqual(
                publishedPlayground,
                `${publishedIcons}\n<script src="jsmind.js" type="module"></script>\n`
            );
            assert.deepStrictEqual(iconHrefs(publishedPlayground), [...SITE_ICON_FILES]);
            // Every published icon is the `docs/public/` file itself, so the two
            // published locations cannot drift from one another.
            for (const name of SITE_ICON_FILES) {
                assert.strictEqual(
                    readFileSync(join(dir, '_site', name), 'utf8'),
                    readFileSync(join(dir, PUBLIC_DIR, name), 'utf8'),
                    `${name} should be copied from ${PUBLIC_DIR}`
                );
            }
            assert.strictEqual(
                readFileSync(join(dir, '_site', SKILL_SITE_FILE), 'utf8'),
                readFileSync(join(dir, SKILL_SITE_FILE), 'utf8'),
                'the published skill file should be a copy, not a rendering'
            );
            assert.strictEqual(
                readFileSync(join(dir, '_site', 'skills', 'jsmind', 'references', 'build-session.md'), 'utf8'),
                'reference\n',
                'the skill directory should be copied whole'
            );
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }

        const workflow = readFileSync(join(ROOT, '.github/workflows/static.yml'), 'utf8');
        assert.match(workflow, /npm run assemble-site/);
        // The whole `_site` is uploaded: narrowing this to the page and the
        // bundle would drop `skills/` from the published site while the build
        // wrote it.
        assert.match(workflow, /^ {10}path: \.\/_site$/m);
        assert.ok(!workflow.includes('grep'));
        assert.ok(!workflow.includes('sed '));
        assert.ok(!workflow.includes('assemble-pages'));
    });

    it('stops the build when the page source is missing or a slot is left unfilled', () => {
        // A build that published a page with a literal `{{...}}` in it would
        // ship a broken language key to readers, and a missing source would
        // otherwise surface as an ENOENT from somewhere deeper.
        const missing = mkdtempSync(join(tmpdir(), 'jsmind-site-nopage-'));
        try {
            writeRootSiteFixture(missing, { page: false });
            assert.throws(
                () => assembleRootSite(missing, join(missing, '_site')),
                new RegExp(`missing site page source: ${SITE_SRC_DIR}/${SITE_INDEX_PAGE}`)
            );
        }
        finally {
            rmSync(missing, { recursive: true, force: true });
        }

        const unfilled = mkdtempSync(join(tmpdir(), 'jsmind-site-slot-'));
        try {
            writeRootSiteFixture(unfilled);
            writeFileSync(
                join(unfilled, SITE_SRC_DIR, SITE_INDEX_PAGE),
                '<p>{{NOBODY_FILLS_THIS}}</p>\n'
            );
            assert.throws(
                () => assembleRootSite(unfilled, join(unfilled, '_site')),
                /has an unfilled slot: \{\{NOBODY_FILLS_THIS\}\}/
            );
            // The renderer itself, in both directions: an unprovided slot
            // throws instead of reaching the output, and a provided one is
            // replaced.
            assert.throws(
                () => renderSitePage(unfilled, SITE_INDEX_PAGE, {}),
                /has an unfilled slot: \{\{NOBODY_FILLS_THIS\}\}/
            );
            writeFileSync(join(unfilled, SITE_SRC_DIR, SITE_INDEX_PAGE), '<p>{{TO}}</p>\n');
            assert.strictEqual(renderSitePage(unfilled, SITE_INDEX_PAGE, { TO: 'eng' }), '<p>eng</p>\n');
        }
        finally {
            rmSync(unfilled, { recursive: true, force: true });
        }
    });

    it('publishes the skill at the documented URL, and stops the build without it', () => {
        // docs/README.md and the skill guide quote this URL; it is the reason
        // the directory is published at all. Those copies are literal text in
        // Markdown and nothing here reads them. What the two assertions below
        // pin is the trailing slash in `SITE_PATH` — without it the resolution
        // would glue the file path onto the last segment — and the shape of the
        // published path: `SKILL_DIR` plus `jsmind/SKILL.md`.
        const skillUrl = `${SITE_ORIGIN}${SITE_PATH}${SKILL_SITE_FILE}`;
        assert.strictEqual(new URL(SKILL_SITE_FILE, SITE_ORIGIN + SITE_PATH).href, skillUrl);
        assert.strictEqual(SKILL_SITE_FILE, `${SKILL_DIR}/jsmind/SKILL.md`);

        // The copy only means something if its source is the real skill, with
        // the frontmatter an agent's harness reads.
        const skill = readFileSync(join(ROOT, SKILL_SITE_FILE), 'utf8');
        assert.ok(skill.startsWith('---\n'), 'the published SKILL.md should be the file with its frontmatter');
        assert.ok(skill.length > 1024, 'the published SKILL.md should be the full text');

        // A skill directory that lost SKILL.md fails the build instead of
        // publishing a site where the documented URL answers 404.
        const dir = mkdtempSync(join(tmpdir(), 'jsmind-site-noskill-'));
        try {
            writeRootSiteFixture(dir, { skill: false });
            assert.throws(
                () => assembleRootSite(dir, join(dir, '_site')),
                new RegExp(`missing or empty site file: ${SKILL_SITE_FILE}`)
            );
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('uploads the site and deploys it from separate jobs', () => {
        // Sharing a job makes deploy-pages ask the artifacts API a few hundred
        // milliseconds after the upload finalizes, and that list is eventually
        // consistent: it intermittently answers "Found 0 artifact(s)" for an
        // artifact that does exist (actions/deploy-pages#451). Re-running a
        // failed deploy then reuses the artifact already in the run instead of
        // uploading a second `github-pages` and failing on the duplicate
        // (actions/deploy-pages#338). Both need the job boundary.
        const workflow = readFileSync(join(ROOT, '.github/workflows/static.yml'), 'utf8');
        const lines = workflow.split('\n');
        const jobsStart = lines.indexOf('jobs:');
        assert.ok(jobsStart >= 0, 'the workflow should have a jobs section');

        // Job names are the only keys at two-space indentation inside `jobs:`;
        // steps, their inputs and the environment sit deeper.
        const jobs = new Map<string, string>();
        let current: string | null = null;
        for (const line of lines.slice(jobsStart + 1)) {
            const job = /^ {2}([a-z][a-z-]*):\s*$/.exec(line);
            if (job) {
                current = job[1];
                jobs.set(current, '');
                continue;
            }
            if (current !== null) {
                jobs.set(current, `${jobs.get(current) ?? ''}${line}\n`);
            }
        }

        const jobRunning = (action: string): string => {
            const found = Array.from(jobs.entries()).filter(([, body]) => body.includes(action));
            assert.strictEqual(found.length, 1, `${action} should run in exactly one job`);
            return found[0][0];
        };

        const uploadJob = jobRunning('actions/upload-pages-artifact@');
        const deployJob = jobRunning('actions/deploy-pages@');
        assert.notStrictEqual(uploadJob, deployJob, 'the upload and the deploy should not share a job');
        assert.match(
            jobs.get(deployJob) ?? '',
            new RegExp(`^ {4}needs: ${uploadJob}$`, 'm'),
            'the deploy job should wait for the job that uploads the artifact'
        );
        assert.doesNotMatch(
            jobs.get(deployJob) ?? '',
            /\n {6}- name: (Checkout|Setup Node|Build the library|Assemble the site)$/m,
            'the deploy job should not redo the build'
        );
    });

    it('writes retired docs path redirects for both locales', () => {
        const dir = mkdtempSync(join(tmpdir(), 'jsmind-docs-redirects-'));
        try {
            writeDocsPageRedirects(dir);
            for (const locale of ['en', 'zh'] as const) {
                for (const { from, to } of DOCS_PAGE_REDIRECTS) {
                    const html = readFileSync(join(dir, locale, from), 'utf8');
                    assert.strictEqual(html, docsPageRedirectHtml(to));
                    assert.ok(html.includes(`location.replace('${to}'`));
                    assert.ok(html.includes(`url=${to}`));
                    assert.ok(html.includes(`href="${to}"`));
                }
            }
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('lays out the tutorials column with one shared asset directory', () => {
        for (const path of [
            'tutorials/_template.md',
            'tutorials/en/index.md',
            'tutorials/zh/index.md',
            'tutorials/en/posts/.gitkeep',
            'tutorials/zh/posts/.gitkeep',
            'tutorials/assets/.gitkeep',
        ]) {
            assert.ok(existsSync(join(ROOT, path)), `${path} should exist`);
        }

        // Assets are shared by both languages in source. A language directory
        // may have `assets_override/` only when it holds real, differing files;
        // there is still no per-language `assets/` tree in the checkout.
        assert.ok(!existsSync(join(ROOT, 'tutorials', 'en', 'assets')), 'assets are shared, not per language');
        assert.ok(!existsSync(join(ROOT, 'tutorials', 'zh', 'assets')), 'assets are shared, not per language');
        assert.ok(!existsSync(join(ROOT, 'tutorials', 'en', 'assets_override')), 'no empty en assets_override');
        const zhOverride = join(ROOT, 'tutorials', 'zh', 'assets_override');
        assert.ok(existsSync(zhOverride), 'the first article needs Chinese map and PNG overrides');
        const overrideFiles = readdirSync(zhOverride);
        assert.ok(overrideFiles.length > 0, 'assets_override must not be an empty directory');
        for (const name of overrideFiles) {
            const shared = join(ROOT, 'tutorials', 'assets', name);
            const local = join(zhOverride, name);
            assert.ok(existsSync(shared), `${name} should override a shared file of the same name`);
            assert.notDeepStrictEqual(
                readFileSync(shared),
                readFileSync(local),
                `${name}: an override must differ from the shared file, and must not overwrite it`
            );
        }

        // The template states the naming rule without pinning the first number:
        // that is decided when the first article is written.
        const template = readFileSync(join(ROOT, 'tutorials', '_template.md'), 'utf8');
        assert.ok(template.includes('<编号>'), 'the template should use a number placeholder');
        assert.ok(template.includes('tutorials/assets/'), 'the template should say where assets go');
        assert.doesNotMatch(template, /\b\d{3}-/, 'the template must not pin a concrete article number');

        // The column is its own VitePress site: that is what keeps its pages
        // out of the docs sidebars, and its own base is what leaves the
        // already-published docs URLs where they are. Each config takes its
        // base from `site.config.mjs` instead of spelling the path out — a
        // literal here would be a second place to edit on the day the site
        // moves, and `base` is the one field that must be a path, never an
        // address.
        const docsConfig = readFileSync(join(ROOT, 'docs', '.vitepress', 'config.ts'), 'utf8');
        const tutorialsConfig = readFileSync(join(ROOT, TUTORIALS_DIR, '.vitepress', 'config.ts'), 'utf8');
        assert.ok(docsConfig.includes('base: DOCS_BASE'), 'the docs config should use the shared base');
        assert.ok(tutorialsConfig.includes('base: TUTORIALS_BASE'), 'the tutorials config should use the shared base');
        assert.ok(
            !docsConfig.includes(`'${DOCS_BASE}'`),
            'the docs base must come from site.config.mjs, not from a literal'
        );
        assert.ok(
            !tutorialsConfig.includes(`'${TUTORIALS_BASE}'`),
            'the tutorials base must come from site.config.mjs, not from a literal'
        );
        assert.ok(tutorialsConfig.includes('_template.md'), 'the template must be excluded from the build');
    });

    it('builds the tutorials site with a language redirect and bilingual entry pages', () => {
        const dir = mkdtempSync(join(tmpdir(), 'jsmind-tutorials-'));
        const tutorialsDir = join(dir, 'tutorials');
        try {
            assembleTutorialsSite(ROOT, tutorialsDir);

            const redirect = readFileSync(join(tutorialsDir, 'index.html'), 'utf8');
            assert.strictEqual(redirect, tutorialsLanguageRedirectHtml());
            assert.ok(redirect.includes(`localStorage.getItem('${DOCS_LANG_STORAGE_KEY}')`));
            assert.ok(redirect.includes('lang = \'en\''));
            assert.ok(redirect.includes('location.replace(lang + \'/\''));
            assert.deepStrictEqual(iconHrefs(redirect), [], 'the language redirect should carry no icon');

            const files = collectFiles(tutorialsDir);
            for (const page of ['en/index.html', 'zh/index.html']) {
                assert.ok(files.includes(page), `missing ${page}`);
            }
            // The template is a source for the next phase, not a page, and
            // nothing from `team/` or the repository root may leak in.
            assert.ok(!files.includes('_template.html'), 'the template must not be published as a page');
            assert.ok(!files.some((name) => name === 'AGENTS.md' || name.endsWith('/AGENTS.md')));
            assert.ok(!files.some((name) => name === 'team' || name.startsWith('team/')));

            const css = readBuiltCss(tutorialsDir);
            for (const locale of ['en', 'zh'] as const) {
                const rel = `${locale}/index.html`;
                const html = readFileSync(join(tutorialsDir, rel), 'utf8');
                const pageUrl = new URL(rel, `${SITE_ORIGIN}${TUTORIALS_BASE}`).href;

                // The tab icon is the docs site's single checked-in copy,
                // addressed from the tutorials base, and it resolves to a file
                // in this build rather than to a 404 one level up.
                assert.deepStrictEqual(
                    iconHrefs(html),
                    SITE_ICON_FILES.map((name) => `${TUTORIALS_BASE}${name}`),
                    `${rel} should link the site icons`
                );
                for (const href of iconHrefs(html)) {
                    const file = resolvePublishedHref(href, pageUrl, TUTORIALS_BASE, tutorialsDir);
                    assert.ok(existsSync(file), `${rel}: ${href} should resolve to ${file}`);
                }

                // The post list comes from a content loader, whose `url` is a
                // clean path with no base. Rendered as-is it resolves under the
                // domain root and 404s, so every link into `posts/` has to land
                // inside this locale's posts directory.
                const postHrefs = anchorHrefs(html).filter((href) => href.includes('/posts/'));
                assert.ok(postHrefs.length > 0, `${rel} should link its posts`);
                for (const href of postHrefs) {
                    assert.ok(
                        new URL(href, pageUrl).pathname.startsWith(`${TUTORIALS_BASE}${locale}/posts/`),
                        `${rel}: ${href} should resolve under ${TUTORIALS_BASE}${locale}/posts/`
                    );
                    const file = resolvePublishedHref(href, pageUrl, TUTORIALS_BASE, tutorialsDir);
                    assert.ok(existsSync(file), `${rel}: ${href} should resolve to ${file}`);
                }

                assertVisibleAiNotice(html, css, rel, locale);

                // The same header as the product page and the docs site: this
                // face names itself, and what a reader can reach from here is
                // the docs site (in a new tab) and the product page.
                assertSharedHeader({
                    html,
                    label: `${rel} tutorials`,
                    pageUrl,
                    base: TUTORIALS_BASE,
                    root: tutorialsDir,
                    title: 'jsMind V2 Tutorials',
                    titleLink: `${TUTORIALS_URL}${locale}/`,
                    menu:
                        locale === 'en'
                            ? [
                                { text: 'Docs', href: `${DOCS_URL}en/`, newTab: true },
                                { text: 'Home', href: HOME_URL },
                            ]
                            : [
                                { text: '文档', href: `${DOCS_URL}zh/`, newTab: true },
                                { text: '首页', href: HOME_URL },
                            ],
                    order: ['VPNavBarMenu', 'VPNavBarTranslations', 'VPNavBarAppearance', 'VPNavBarSocialLinks'],
                });

                // The top bar hands the reader back to the docs site at its
                // published address, not at a path inside this base.
                assert.ok(
                    headerHtml(html).includes(`${DOCS_URL}${locale}/`),
                    `${rel} top bar should link the ${locale} docs entry`
                );
                // The language menu switches between the two tutorial
                // locales, the same way it does on the docs site.
                const sibling = locale === 'en' ? 'zh' : 'en';
                assert.ok(
                    headerHtml(html).includes(`${TUTORIALS_BASE}${sibling}/`),
                    `${rel} language menu should offer the ${sibling} tutorials`
                );
                // A language page is a real page, so it is not a redirect.
                assert.ok(!html.includes(`localStorage.getItem('${DOCS_LANG_STORAGE_KEY}')`));
            }

            const enEntry = readFileSync(join(tutorialsDir, 'en', 'index.html'), 'utf8');
            const zhEntry = readFileSync(join(tutorialsDir, 'zh', 'index.html'), 'utf8');
            assert.ok(
                enEntry.includes('Build your first mind map with the jsMind Skill'),
                'the en entry page should list the first tutorial'
            );
            assert.ok(
                zhEntry.includes('用 jsMind Skill 做你的第一张思维导图'),
                'the zh entry page should list the first tutorial'
            );
            assert.ok(enEntry.includes('161-first-mind-map-with-skill'));
            assert.ok(zhEntry.includes('161-first-mind-map-with-skill'));

            // The first article is built for both locales, and Chinese pages
            // must receive the override assets without rewriting the shared
            // files in tutorials/assets/.
            const enArticle = 'en/posts/161-first-mind-map-with-skill.html';
            const zhArticle = 'zh/posts/161-first-mind-map-with-skill.html';
            assert.ok(files.includes(enArticle), `missing ${enArticle}`);
            assert.ok(files.includes(zhArticle), `missing ${zhArticle}`);

            const enHtml = readFileSync(join(tutorialsDir, enArticle), 'utf8');
            const zhHtml = readFileSync(join(tutorialsDir, zhArticle), 'utf8');
            const enPageUrl = new URL(enArticle, `${SITE_ORIGIN}${TUTORIALS_BASE}`).href;
            const zhPageUrl = new URL(zhArticle, `${SITE_ORIGIN}${TUTORIALS_BASE}`).href;
            const enResult = publishedAsset(enHtml, 'The finished weekend outing mind map', enPageUrl, tutorialsDir);
            const zhResult = publishedAsset(zhHtml, '完成后的周末出游思维导图', zhPageUrl, tutorialsDir);
            const sharedResult = readFileSync(join(ROOT, 'tutorials', 'assets', '161-result.png'));
            const overrideResult = readFileSync(join(ROOT, 'tutorials', 'zh', 'assets_override', '161-result.png'));
            assert.deepStrictEqual(enResult, sharedResult, 'the English page should use the shared PNG');
            assert.deepStrictEqual(zhResult, overrideResult, 'the Chinese page should use the override PNG');
            assert.notDeepStrictEqual(enResult, zhResult, 'the two language pages must not share one picture');
            assert.deepStrictEqual(
                readFileSync(join(ROOT, 'tutorials', 'assets', '161-result.png')),
                sharedResult,
                'applying an override must not rewrite the shared source file'
            );

            const enMap = publishedHrefAsset(enHtml, '161-example.json', enPageUrl, tutorialsDir);
            const zhMap = publishedHrefAsset(zhHtml, '161-example.json', zhPageUrl, tutorialsDir);
            assert.deepStrictEqual(
                enMap,
                readFileSync(join(ROOT, 'tutorials', 'assets', '161-example.json'))
            );
            assert.deepStrictEqual(
                zhMap,
                readFileSync(join(ROOT, 'tutorials', 'zh', 'assets_override', '161-example.json'))
            );
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('points the README at the docs entry, not at the docs README blob', () => {
        const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
        const readmeZh = readFileSync(join(ROOT, 'README.zh.md'), 'utf8');

        assert.ok(hasHref(readme, DOCS_URL));
        assert.ok(hasHref(readmeZh, DOCS_URL));

        // The tutorial column is published, so both READMEs may point at it —
        // but only at the live entry, never at an empty or language-prefixed
        // address that could outlive the redirect.
        assert.ok(hasHref(readme, TUTORIALS_URL), 'README.md should link the tutorials entry');
        assert.ok(hasHref(readmeZh, TUTORIALS_URL), 'README.zh.md should link the tutorials entry');
        assert.ok(!hasHref(readme, `${TUTORIALS_URL}en/`));
        assert.ok(!hasHref(readmeZh, `${TUTORIALS_URL}zh/`));

        assert.ok(!hasHref(readme, DOCS_README_BLOB));
        assert.ok(!hasHref(readmeZh, DOCS_README_BLOB));

        assert.ok(!hasHref(readme, `${DOCS_URL}en/`));
        assert.ok(!hasHref(readme, `${DOCS_URL}zh/`));
        assert.ok(!hasHref(readmeZh, `${DOCS_URL}en/`));
        assert.ok(!hasHref(readmeZh, `${DOCS_URL}zh/`));
    });

    it('builds the docs site with a language redirect and bilingual pages', () => {
        const dir = mkdtempSync(join(tmpdir(), 'jsmind-docs-'));
        const docsDir = join(dir, 'docs');
        try {
            assembleDocsSite(ROOT, docsDir);

            const redirect = readFileSync(join(docsDir, 'index.html'), 'utf8');
            assert.strictEqual(redirect, docsLanguageRedirectHtml());
            assert.ok(redirect.includes(`localStorage.getItem('${DOCS_LANG_STORAGE_KEY}')`));
            assert.ok(redirect.includes('lang = \'en\''));
            // One hop: the language redirect lands on the guide, not on the
            // locale home that then redirects again.
            assert.ok(
                redirect.includes(`location.replace(lang + '/${DOCS_ENTRY_PATH}'`),
                'the docs language redirect should land on the guide'
            );
            assert.ok(redirect.includes(`href="en/${DOCS_ENTRY_PATH}"`));
            assert.deepStrictEqual(iconHrefs(redirect), [], 'the language redirect should carry no icon');

            const files = collectFiles(docsDir);
            for (const locale of ['en', 'zh'] as const) {
                for (const page of DOCS_PAGES) {
                    const rel = `${locale}/${page}`;
                    assert.ok(files.includes(rel), `missing ${rel}`);
                }
            }

            // The locale home is not a page: it is the guide. Two static
            // redirects, one hop each, and the destination is a real page in
            // this build — which is what keeps `/docs/`, `/docs/en/` and
            // `/docs/zh/` from chaining.
            for (const locale of ['en', 'zh'] as const) {
                const rel = `${locale}/index.html`;
                const home = readFileSync(join(docsDir, rel), 'utf8');
                assert.strictEqual(
                    home,
                    docsPageRedirectHtml(DOCS_ENTRY_PATH),
                    `${rel} should be a static redirect to the guide`
                );
                assert.ok(
                    !home.includes(AI_NOTICE_TEXT.en) && !home.includes(AI_NOTICE_TEXT.zh),
                    `${rel} should not be a VitePress content page`
                );
                assert.deepStrictEqual(iconHrefs(home), [], `${rel} is a redirect and should carry no icon`);
                assert.ok(
                    files.includes(`${locale}/${DOCS_ENTRY_PATH}index.html`),
                    `${rel} redirects to ${locale}/${DOCS_ENTRY_PATH}, which should be a page`
                );
            }

            for (const locale of ['en', 'zh'] as const) {
                for (const { from, to } of DOCS_PAGE_REDIRECTS) {
                    const rel = `${locale}/${from}`;
                    assert.ok(files.includes(rel), `missing redirect ${rel}`);
                    const html = readFileSync(join(docsDir, locale, from), 'utf8');
                    assert.strictEqual(html, docsPageRedirectHtml(to), `${rel} should be a static redirect`);
                    assert.ok(
                        !html.includes(AI_NOTICE_TEXT.en) && !html.includes(AI_NOTICE_TEXT.zh),
                        `${rel} should not be a VitePress content page`
                    );
                    assert.deepStrictEqual(iconHrefs(html), [], `${rel} is a redirect and should carry no icon`);
                }
            }

            // Every generated page carries the tab icon, and its href resolves
            // inside the published docs tree. Presence alone is not the check:
            // a base-less `/favicon.svg` is a link tag pointing at a 404.
            const redirectPages = new Set([
                ...DOCS_PAGE_REDIRECTS.flatMap(({ from }) =>
                    (['en', 'zh'] as const).map((locale) => `${locale}/${from}`)),
                // The locale home is a redirect onto the guide, so it is not a
                // content page and carries no icon to check.
                ...(['en', 'zh'] as const).map((locale) => `${locale}/index.html`),
            ]);
            const contentPages = files.filter((name) => /^(en|zh)\/.+\.html$/.test(name) && !redirectPages.has(name));
            assert.strictEqual(
                contentPages.length,
                (DOCS_PAGES.length - 1) * 2,
                'every en/zh page except the locale home should be covered by the icon check'
            );
            for (const rel of contentPages) {
                const html = readFileSync(join(docsDir, rel), 'utf8');
                const pageUrl = new URL(rel, `${SITE_ORIGIN}${DOCS_BASE}`).href;
                const hrefs = iconHrefs(html);
                assert.deepStrictEqual(
                    hrefs,
                    SITE_ICON_FILES.map((name) => `${DOCS_BASE}${name}`),
                    `${rel} should link ${SITE_ICON_FILES.join(' and ')}`
                );
                for (const href of hrefs) {
                    const file = resolvePublishedHref(href, pageUrl, DOCS_BASE, docsDir);
                    assert.ok(existsSync(file), `${rel}: ${href} should resolve to ${file}`);
                }
            }

            const enGuide = readFileSync(join(docsDir, 'en', 'guide', 'index.html'), 'utf8');
            const zhGuide = readFileSync(join(docsDir, 'zh', 'guide', 'index.html'), 'utf8');
            const enApiPage = readFileSync(join(docsDir, 'en', 'reference', 'api', 'jsmind.html'), 'utf8');
            const zhApiPage = readFileSync(join(docsDir, 'zh', 'reference', 'api', 'jsmind.html'), 'utf8');
            const builtCss = readBuiltCss(docsDir);
            // The guide is the documentation's entry now, so it is where the
            // notice and the build-time version have to show up: they used to
            // ride on the home hero, and deleting the hero must not delete them.
            assertVisibleAiNotice(enGuide, builtCss, 'en guide', 'en');
            assertVisibleAiNotice(zhGuide, builtCss, 'zh guide', 'zh');
            assertEntryVersion(enGuide, 'en guide');
            assertEntryVersion(zhGuide, 'zh guide');
            assertVisibleAiNotice(enApiPage, builtCss, 'en API', 'en');
            assertVisibleAiNotice(zhApiPage, builtCss, 'zh API', 'zh');

            assertSectionOrder(enGuide, 'en', 'en guide nav');
            assertSectionOrder(zhGuide, 'zh', 'zh guide nav');

            // One header on all three faces: the title names this face and
            // leads into its own entry, the icon exists, and the menu is the
            // owner's list for this site — the four in-site sections, the
            // tutorials in a new tab, then the way back to the product page.
            const docsMenu: Record<'en' | 'zh', HeaderMenuEntry[]> = {
                en: [
                    { text: 'Guide', href: `${DOCS_URL}en/guide/` },
                    { text: 'Design', href: `${DOCS_URL}en/design/` },
                    { text: 'Reference', href: `${DOCS_URL}en/reference/` },
                    { text: 'Community', href: `${DOCS_URL}en/community/` },
                    { text: 'Tutorials', href: `${TUTORIALS_URL}en/`, newTab: true },
                    { text: 'Home', href: HOME_URL },
                ],
                zh: [
                    { text: '指南', href: `${DOCS_URL}zh/guide/` },
                    { text: '设计', href: `${DOCS_URL}zh/design/` },
                    { text: '参考', href: `${DOCS_URL}zh/reference/` },
                    { text: '社区', href: `${DOCS_URL}zh/community/` },
                    { text: '教程', href: `${TUTORIALS_URL}zh/`, newTab: true },
                    { text: '首页', href: HOME_URL },
                ],
            };
            for (const [locale, html] of [['en', enGuide], ['zh', zhGuide]] as const) {
                assertSharedHeader({
                    html,
                    label: `${locale} docs guide`,
                    pageUrl: new URL(`${locale}/guide/index.html`, `${SITE_ORIGIN}${DOCS_BASE}`).href,
                    base: DOCS_BASE,
                    root: docsDir,
                    title: 'jsMind V2 Docs',
                    titleLink: `${DOCS_URL}${locale}/guide/`,
                    menu: docsMenu[locale],
                    order: ['VPNavBarMenu', 'VPNavBarTranslations', 'VPNavBarAppearance', 'VPNavBarSocialLinks'],
                });
            }

            // The tutorials are a separate column: reachable from the header,
            // absent from every docs sidebar.
            for (const [label, page] of [['en guide', enGuide], ['zh guide', zhGuide], ['en API', enApiPage]] as const) {
                const aside = asideHtml(page);
                assert.ok(aside.length > 0, `${label} should render a sidebar`);
                assert.ok(!aside.includes('/tutorials/'), `${label} sidebar must not list tutorials`);
            }

            // The tutorials entry leaves this site, so it is written out in
            // full: a base-less path would publish under the docs base instead.
            assert.ok(
                !enGuide.includes('/jsmind-v2/docs/jsmind-v2/tutorials/'),
                'the tutorials link must not be rewritten into the docs base'
            );

            // The docs nav keeps the in-site sections; the language switch and
            // the page links stay inside this site.
            assert.ok(enGuide.includes('/jsmind-v2/docs/zh/'));
            assert.ok(zhGuide.includes('/jsmind-v2/docs/en/'));
            assert.ok(!enGuide.includes('href="/jsmind-v2/docs/guide/'));
            assert.ok(!zhGuide.includes('href="/jsmind-v2/docs/guide/'));

            for (const page of STILL_PLACEHOLDER_PAGES) {
                const enPage = readFileSync(join(docsDir, 'en', page), 'utf8');
                const zhPage = readFileSync(join(docsDir, 'zh', page), 'utf8');
                assert.ok(enPage.includes('Coming soon.'), `expected placeholder in en/${page}`);
                assert.ok(zhPage.includes('内容即将推出。'), `expected placeholder in zh/${page}`);
            }

            const enCli = readFileSync(join(docsDir, 'en', 'guide', 'cli.html'), 'utf8');
            const zhCli = readFileSync(join(docsDir, 'zh', 'guide', 'cli.html'), 'utf8');
            assert.ok(enCli.includes('Preview version'));
            assert.ok(zhCli.includes('预览版本'));
            assert.ok(!enCli.includes('Coming soon.'));
            assert.ok(!zhCli.includes('内容即将推出。'));

            const enSkill = readFileSync(join(docsDir, 'en', 'guide', 'skill.html'), 'utf8');
            const zhSkill = readFileSync(join(docsDir, 'zh', 'guide', 'skill.html'), 'utf8');
            // The guide is a pointer, not a second copy of the install: one skill file,
            // English only, plus the install steps as a separate file inside the skill
            // directory. The inline install prompt used to have to be kept in step with
            // the CLI by hand, and drifted.
            // The guide hands an agent *raw* URLs: a blob page is a web page, so
            // fetching one installs HTML instead of the file.
            for (const [label, page] of [
                ['en guide', enSkill],
                ['zh guide', zhSkill],
            ] as const) {
                assert.ok(
                    page.includes('https://raw.githubusercontent.com/hizzgdev/jsmind-v2/master/skills/jsmind/SKILL.md'),
                    `${label}: the skill has to be handed over as a raw URL`
                );
                assert.ok(
                    !page.includes('/blob/master/skills/jsmind/'),
                    `${label}: a blob link returns HTML, not the file it names`
                );
            }
            for (const lang of ['en', 'zh'] as const) {
                const source = readFileSync(join(ROOT, 'docs', lang, 'guide', 'skill.md'), 'utf8');
                assertMirrored(source, `${lang} skill guide`);
                // The prompt is one line, and the one address it names is the copy this
                // site publishes: a reader of this page reached the site by definition,
                // so that address works for them, which is not true of github.com.
                // Everything else the install needs — the mirror, the version check, the
                // report — is in INSTALL.md, so the prompt cannot grow back into a
                // second copy of the runbook.
                const heading = lang === 'en' ? '### Automatic install' : '### 自动安装';
                const at = source.indexOf(heading);
                assert.notStrictEqual(at, -1, `${lang} guide: the automatic install section is missing`);
                const block = /```\r?\n([\s\S]*?)\r?\n```/.exec(source.slice(at));
                assert.ok(block, `${lang} guide: the automatic install prompt is not fenced`);
                const prompt = block[1];
                assert.ok(!prompt.includes('\n'), `${lang} guide: the install prompt has to stay one line`);
                assert.ok(
                    prompt.includes(`${SITE_ORIGIN}${SITE_PATH}skills/jsmind/INSTALL.md`),
                    `${lang} guide: the prompt hands over the docs-site copy of the runbook`
                );
                assert.ok(
                    !prompt.includes('gitee.com') && !prompt.includes('githubusercontent.com'),
                    `${lang} guide: one address in the prompt; the mirror belongs to INSTALL.md`
                );
            }
            assert.ok(enSkill.includes('skills/jsmind/INSTALL.md'));
            assert.ok(zhSkill.includes('skills/jsmind/INSTALL.md'));
            assert.ok(!enSkill.includes('SKILL.zh.md'));
            assert.ok(!zhSkill.includes('SKILL.zh.md'));
            // Install and invocation detail belongs to INSTALL.md; the guide does not
            // repeat it.
            assert.ok(!enSkill.includes('npx jsmind'));
            assert.ok(!zhSkill.includes('npx jsmind'));
            // The example prompt names the output and what counts as done, and leaves
            // the command order to the skill.
            assert.ok(enSkill.includes('solar-system.json'));
            assert.ok(zhSkill.includes('solar-system.json'));
            assert.ok(!enSkill.includes('npx jsmind context'));
            assert.ok(!zhSkill.includes('npx jsmind context'));

            // INSTALL.md is the instrument the guide hands to an agent.
            const install = readFileSync(join(ROOT, 'skills', 'jsmind', 'INSTALL.md'), 'utf8');
            // The guide hands over a URL, not a clone, and a relative link does not
            // survive a raw read of the file: every reference to the skill inside it has
            // to be a path that works from that URL alone.
            // Three addresses for SKILL.md, docs site first. This file is read both on
            // the site and out of a repository, and the site copy is the only one known
            // to work for someone who arrived by reading the install page; the GitHub and
            // Gitee pair below it is for the reader who got here from a raw URL instead.
            // None of them is a blob link, because a blob link fetches a web page.
            assert.ok(
                install.includes(`${SITE_ORIGIN}${SITE_PATH}skills/jsmind/SKILL.md`),
                'INSTALL.md names the docs-site copy of SKILL.md'
            );
            assert.ok(
                install.includes('https://raw.githubusercontent.com/hizzgdev/jsmind-v2/master/skills/jsmind/SKILL.md')
            );
            assert.ok(install.includes('https://gitee.com/hizzgdev/jsmind-v2/raw/master/skills/jsmind/SKILL.md'));
            assert.ok(install.includes('https://github.com/hizzgdev/jsmind-v2/tree/master/skills/jsmind'));
            assert.ok(install.includes('https://gitee.com/hizzgdev/jsmind-v2/tree/master/skills/jsmind'));
            assert.ok(!install.includes('/blob/master/skills/jsmind/'), 'a blob link returns HTML, not the file');
            assertMirrored(install, 'skills/jsmind/INSTALL.md');
            // The mirror syncs periodically, so the file it serves can be older
            // than the CLI: the installer has to compare the version it got with
            // the range the skill claims, not assume the two arrived together.
            assert.ok(install.includes('--version'));
            assert.ok(install.includes('metadata.jsmind.cli'));
            assert.ok(!install.includes('](SKILL.md)'));
            assert.ok(install.includes('npm i jsmind@2'));
            assert.ok(install.includes('npx jsmind@2 <command>'));
            // The version is part of the command, not an optional extra: bare npx
            // resolves `latest`, which is 0.9.1, and 0.9.1 ships no bin at all, so
            // the failure reads as a missing executable and says nothing about the
            // version. That is the mistake this line exists to prevent.
            assert.ok(install.includes('Never run bare `npx jsmind`'));
            assert.ok(install.includes('No Chromium found'));
            // An explicit range is what makes the install directory stop mattering:
            // `npx jsmind@2` uses a local 2.x or fetches the range, so working in a
            // different directory no longer lands back on 0.9.1.
            assert.ok(install.includes('does not matter which directory you installed from'));
            assert.ok(install.includes('Done means'));
            // The one-line prompt no longer asks for a report, so the reporting step
            // belongs to the checklist the prompt points at.
            assert.ok(install.includes('report the result of each one'));
            assert.ok(!existsSync(join(ROOT, 'skills', 'jsmind', 'SKILL.zh.md')));

            const enApi = readFileSync(join(docsDir, 'en', 'reference', 'api.html'), 'utf8');
            const zhApi = readFileSync(join(docsDir, 'zh', 'reference', 'api.html'), 'utf8');
            assert.ok(enApi.includes('Preview version'));
            assert.ok(zhApi.includes('预览版本'));
            assert.ok(!enApi.includes('Coming soon.'));
            assert.ok(!zhApi.includes('内容即将推出。'));
            assert.ok(enApi.includes('npm i jsmind@2'));
            assert.ok(zhApi.includes('npm i jsmind@2'));
            assert.ok(enApi.includes('addChildNode'));
            assert.ok(zhApi.includes('addChildNode'));
            assert.ok(enApi.includes('jsmind_container'));
            assert.ok(zhApi.includes('jsmind_container'));

            const enCommunity = readFileSync(join(docsDir, 'en', 'community', 'index.html'), 'utf8');
            const zhCommunity = readFileSync(join(docsDir, 'zh', 'community', 'index.html'), 'utf8');
            assert.ok(enCommunity.includes('https://github.com/hizzgdev/jsmind-v2/issues'));
            assert.ok(zhCommunity.includes('https://github.com/hizzgdev/jsmind-v2/issues'));
            assert.ok(!enCommunity.includes('Coming soon.'));
            assert.ok(!zhCommunity.includes('内容即将推出。'));

            const enDesign = readFileSync(join(docsDir, 'en', 'design', 'index.html'), 'utf8');
            const zhDesign = readFileSync(join(docsDir, 'zh', 'design', 'index.html'), 'utf8');
            assert.ok(enDesign.includes('JmMindChangeCoordinator'));
            assert.ok(zhDesign.includes('JmMindChangeCoordinator'));
            assert.ok(!enDesign.includes('Coming soon.'));
            assert.ok(!zhDesign.includes('内容即将推出。'));

            const enJsMind = readFileSync(join(docsDir, 'en', 'reference', 'api', 'jsmind.html'), 'utf8');
            const zhJsMind = readFileSync(join(docsDir, 'zh', 'reference', 'api', 'jsmind.html'), 'utf8');
            assert.ok(enJsMind.includes('Preview version'));
            assert.ok(zhJsMind.includes('预览版本'));
            assert.ok(enJsMind.includes('JsMind.create'));
            assert.ok(zhJsMind.includes('JsMind.create'));
            assert.ok(enJsMind.includes('Creates a jsMind instance'));
            assert.ok(zhJsMind.includes('创建 jsMind 实例'));

            const bundled = files
                .filter((name) => name.endsWith('.js') || name.endsWith('.html'))
                .map((name) => readFileSync(join(docsDir, name), 'utf8'))
                .join('\n');
            assert.ok(bundled.includes('localStorage.setItem'));
            assert.ok(bundled.includes(DOCS_LANG_STORAGE_KEY));

            assert.ok(!files.some((name) => name === 'AGENTS.md' || name.endsWith('/AGENTS.md')));
            assert.ok(!files.some((name) => name === 'team' || name.startsWith('team/')));
            assert.ok(!files.some((name) => /(^|\/)architecture\//.test(name)));
            assert.ok(!files.some((name) => /(^|\/)features\//.test(name)));
            assert.ok(!files.some((name) => /(^|\/)requirements\//.test(name)));
            assert.ok(!files.some((name) => name.includes('architecture-overview')));
            assert.ok(!files.some((name) => name.includes('AGENTS')));
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    /**
     * Each site's build only renders its own theme's copy, so a sentence that
     * drifted in one of the two files passes every assertion above. The
     * tutorials theme is a copy of the docs theme, and this is what keeps the
     * two copies from drifting apart.
     */
    it('keeps the AI notice sentences identical in both themes', () => {
        const docsNotice = readThemeNotice('docs/.vitepress/theme/index.ts');
        const tutorialsNotice = readThemeNotice('tutorials/.vitepress/theme/index.ts');
        assert.deepStrictEqual(tutorialsNotice, docsNotice, 'the tutorials theme is a copy of the docs theme');
        assert.deepStrictEqual(docsNotice, AI_NOTICE_TEXT, 'the built pages are asserted against these sentences');
    });
});


describe('tutorial post listing', () => {
    it('reads frontmatter and lists posts newest first', () => {
        const file = join(ROOT, 'tutorials', 'en', 'posts', '161-first-mind-map-with-skill.md');
        const matter = parseTutorialFrontmatter(readFileSync(file, 'utf8'), file);
        assert.strictEqual(matter.id, '161');
        assert.strictEqual(matter.date, '2026-11-26');
        assert.strictEqual(matter.title, 'Build your first mind map with the jsMind Skill');
        assert.deepStrictEqual(matter.tags, ['How-to']);

        const posts = listTutorialPosts(ROOT);
        assert.ok(posts.length >= 1);
        const first = posts[0];
        assert.strictEqual(first.id, '161');
        assert.strictEqual(first.slug, '161-first-mind-map-with-skill');
        assert.strictEqual(first.date, '2026-11-26');
        assert.strictEqual(first.titles.en, 'Build your first mind map with the jsMind Skill');
        assert.strictEqual(first.titles.zh, '用 jsMind Skill 做你的第一张思维导图');
        assert.strictEqual(first.hrefs.en, 'tutorials/en/posts/161-first-mind-map-with-skill.html');
        assert.strictEqual(first.hrefs.zh, 'tutorials/zh/posts/161-first-mind-map-with-skill.html');

        const dates = posts.map((post) => post.date);
        const sorted = [...dates].sort((a, b) => b.localeCompare(a));
        assert.deepStrictEqual(dates, sorted, 'posts should be sorted by date, newest first');
        assert.strictEqual(recentTutorialPosts(posts).length, Math.min(3, posts.length));
    });

    it('leaves the recent list empty when a tree has no posts yet', () => {
        const dir = mkdtempSync(join(tmpdir(), 'jsmind-tutorial-posts-'));
        try {
            mkdirSync(join(dir, 'tutorials', 'en', 'posts'), { recursive: true });
            mkdirSync(join(dir, 'tutorials', 'zh', 'posts'), { recursive: true });
            assert.deepStrictEqual(listTutorialPosts(dir), []);
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
