/**
 * @fileoverview `npm run assemble-site` publishes the product front page, the
 * playground, the VitePress documentation site and the VitePress tutorials
 * site.
 *
 * The site root is a real page now, not a redirect: three entries
 * (documentation, tutorials, playground), the install line, the GitHub link
 * and the 2.x preview notice. The repository keeps no `index.html` of its own;
 * assembly writes it, which is what keeps the published root and this
 * template from drifting.
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
    DOCS_LANG_STORAGE_KEY,
    DOCS_LANGUAGE_REDIRECT_HTML,
    DOCS_PAGE_REDIRECTS,
    docsPageRedirectHtml,
    LANDING_PAGE_HTML,
    LOCAL_ICON_HREF_PREFIX,
    moduleScriptSrcs,
    PUBLIC_DIR,
    rewritePlayground,
    SITE_ICON_FILES,
    SKILL_DIR,
    SKILL_SITE_FILE,
    TUTORIALS_DIR,
    TUTORIALS_LANGUAGE_REDIRECT_HTML,
    writeDocsPageRedirects,
} from '../../scripts/assemble-site.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

// Both home pages show this version at build time. Nothing in the tree spells
// the version out (scripts/check-version-refs.mjs enforces that), so the value
// has to come from here or the placeholder ships verbatim.
const PACKAGE_VERSION = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version;

const DOCS_SITE_ENTRY = 'https://hizzgdev.github.io/jsmind-v2/docs/';
const TUTORIALS_SITE_ENTRY = 'https://hizzgdev.github.io/jsmind-v2/tutorials/';
const DOCS_README_BLOB = 'https://github.com/hizzgdev/jsmind-v2/blob/master/docs/README.md';
const FOOTER_TEXT = '本文档由 AI 协助生成 / This documentation was prepared with AI assistance';

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

const SITE_ORIGIN = 'https://hizzgdev.github.io';
const SITE_BASE = '/jsmind-v2/';
const DOCS_SITE_BASE = `${SITE_BASE}docs/`;
const TUTORIALS_SITE_BASE = `${SITE_BASE}tutorials/`;

/**
 * The file an href must resolve to in the published tree.
 *
 * The site is served under a URL prefix, not at the domain root, so the href
 * is resolved against the page's own published address first: a base-less
 * `/favicon.svg` resolves to `https://hizzgdev.github.io/favicon.svg`, lands
 * outside the prefix and fails here. Asserting that a `link` tag exists would
 * stay green on exactly that 404.
 */
function resolvePublishedHref(href: string, pageUrl: string, prefix: string, root: string): string {
    const url = new URL(href, pageUrl);
    assert.strictEqual(url.origin, SITE_ORIGIN, `${pageUrl}: ${href} is not a published address`);
    assert.ok(url.pathname.startsWith(prefix), `${pageUrl}: ${href} resolves outside ${prefix}`);
    return join(root, url.pathname.slice(prefix.length));
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
 * A minimal repository tree for `assembleRootSite`: the bundle, the playground
 * and the one copy of the icons under `docs/public/`. This function reads
 * nothing else.
 *
 * @param dir - Fixture root.
 * @param options - `skill: false` leaves out `SKILL.md` but keeps the rest.
 */
function writeRootSiteFixture(dir: string, options: { skill?: boolean } = {}): void {
    mkdirSync(join(dir, 'example'), { recursive: true });
    mkdirSync(join(dir, 'dist'), { recursive: true });
    mkdirSync(join(dir, PUBLIC_DIR), { recursive: true });
    mkdirSync(join(dir, SKILL_DIR, 'jsmind', 'references'), { recursive: true });
    writeFileSync(join(dir, 'dist', 'jsmind.js'), 'export {}\n');
    writeFileSync(join(dir, 'example', 'playground.html'), fixturePlayground());
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

function assertVisibleAiNotice(html: string, css: string, label: string): void {
    const escaped = FOOTER_TEXT.replace(/[\\/]/g, '\\$&');
    const noticeRe = new RegExp(`<p class="${AI_NOTICE_CLASS}">${escaped}</p>`);
    assert.match(html, noticeRe, `${label} should render the custom always-visible AI notice`);
    assert.ok(
        withoutVpFooter(html).includes(FOOTER_TEXT),
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
}

/**
 * The home pages read the version from `package.json` at build time. Asserting
 * against the package version rather than a literal keeps this from becoming a
 * second place to edit on every release, and asserting the absence of the
 * placeholder catches the case the version guard cannot: a `{{ pkg.version }}`
 * that lands somewhere VitePress does not interpolate still builds green.
 */
function assertHomeVersion(html: string, label: string): void {
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

describe('landing page', () => {
    it('is a product page with the three entries, not a docs redirect', () => {
        // The repository still carries no root `index.html`: assembly writes
        // the page, so the published root and this template cannot drift.
        assert.ok(
            !existsSync(join(ROOT, 'index.html')),
            'the repository root must not carry a landing page'
        );

        for (const href of ['docs/', 'tutorials/', 'playground.html']) {
            assert.ok(
                LANDING_PAGE_HTML.includes(`href="${href}"`),
                `the page should link ${href}`
            );
        }
        assert.doesNotMatch(
            LANDING_PAGE_HTML,
            /location\.replace\('docs\/'/,
            'the root must no longer redirect to the docs site'
        );

        // A page someone lands on, not a stub: it needs a title, a heading and
        // enough text to explain what the three entries lead to.
        assert.ok(LANDING_PAGE_HTML.length > 1024, 'the page should be a real page, not a stub');
        assert.match(LANDING_PAGE_HTML, /<title>jsMind V2/);
        assert.match(LANDING_PAGE_HTML, /<h1>jsMind V2<\/h1>/);

        // Installation stays a one-line entry; the steps belong to the quick
        // start page and must not be copied onto the front page.
        assert.ok(LANDING_PAGE_HTML.includes('npm i jsmind@2'));
        assert.ok(LANDING_PAGE_HTML.includes('docs/en/guide/getting-started'));
        assert.ok(LANDING_PAGE_HTML.includes('2.x preview'));
        assert.ok(LANDING_PAGE_HTML.includes('https://github.com/hizzgdev/jsmind-v2'));

        // The recent-tutorials slot is reserved and empty: a `<li>` inside it
        // would mean something else was parked there.
        assert.ok(LANDING_PAGE_HTML.includes('id="recent-tutorials"'));
        assert.doesNotMatch(
            LANDING_PAGE_HTML,
            /<ul class="recent-list"[^>]*>[\s\S]*?<li/,
            'the recent-tutorials slot must stay empty until the first post ships'
        );

        // Language switching shares the docs key and defaults to English.
        assert.ok(LANDING_PAGE_HTML.includes(`var KEY = '${DOCS_LANG_STORAGE_KEY}';`));
        assert.ok(LANDING_PAGE_HTML.includes('var lang = \'en\''));
        assert.ok(LANDING_PAGE_HTML.includes('localStorage.setItem(KEY, next)'));
        assert.ok(LANDING_PAGE_HTML.includes('data-zh='));

        // A page people look at, so it dresses the tab like the playground.
        assert.deepStrictEqual(iconHrefs(LANDING_PAGE_HTML), [...SITE_ICON_FILES]);
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

            // Nothing is read from the checkout but the playground, the
            // bundle and the skill: the root page is the template, byte for
            // byte, and it is a page rather than a forwarding stub.
            const index = readFileSync(join(dir, '_site', 'index.html'), 'utf8');
            assert.strictEqual(index, LANDING_PAGE_HTML);
            for (const href of ['docs/', 'tutorials/', 'playground.html']) {
                assert.ok(index.includes(`href="${href}"`), `the published index should link ${href}`);
            }
            // Its icons are relative names, and they resolve to the files the
            // same step copied beside the page.
            assert.deepStrictEqual(iconHrefs(index), [...SITE_ICON_FILES]);
            for (const href of iconHrefs(index)) {
                const file = resolvePublishedHref(href, `${SITE_ORIGIN}${SITE_BASE}`, SITE_BASE, join(dir, '_site'));
                assert.ok(existsSync(file), `index.html: ${href} should resolve to ${file}`);
            }
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

    it('publishes the skill at the documented URL, and stops the build without it', () => {
        // docs/README.md and the skill guide quote this URL; it is the reason
        // the directory is published at all. Pinning the literal keeps the
        // published path and the documented one from drifting apart.
        const skillUrl = 'https://hizzgdev.github.io/jsmind-v2/skills/jsmind/SKILL.md';
        assert.strictEqual(new URL(SKILL_SITE_FILE, 'https://hizzgdev.github.io/jsmind-v2/').href, skillUrl);
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

        // Assets are shared by both languages, and `assets_override/` is only
        // created when an article actually needs a per-language file.
        assert.ok(!existsSync(join(ROOT, 'tutorials', 'en', 'assets')), 'assets are shared, not per language');
        assert.ok(!existsSync(join(ROOT, 'tutorials', 'zh', 'assets')), 'assets are shared, not per language');
        assert.ok(!existsSync(join(ROOT, 'tutorials', 'zh', 'assets_override')), 'no empty assets_override');

        // The template states the naming rule without pinning the first number:
        // that is decided when the first article is written.
        const template = readFileSync(join(ROOT, 'tutorials', '_template.md'), 'utf8');
        assert.ok(template.includes('<编号>'), 'the template should use a number placeholder');
        assert.ok(template.includes('tutorials/assets/'), 'the template should say where assets go');
        assert.doesNotMatch(template, /\b\d{3}-/, 'the template must not pin a concrete article number');

        // The column is its own VitePress site: that is what keeps its pages
        // out of the docs sidebars, and its own base is what leaves the
        // already-published docs URLs where they are.
        const docsConfig = readFileSync(join(ROOT, 'docs', '.vitepress', 'config.ts'), 'utf8');
        const tutorialsConfig = readFileSync(join(ROOT, TUTORIALS_DIR, '.vitepress', 'config.ts'), 'utf8');
        assert.ok(docsConfig.includes('const BASE = \'/jsmind-v2/docs/\';'));
        assert.ok(tutorialsConfig.includes('const BASE = \'/jsmind-v2/tutorials/\';'));
        assert.ok(tutorialsConfig.includes('_template.md'), 'the template must be excluded from the build');
    });

    it('builds the tutorials site with a language redirect and bilingual entry pages', () => {
        const dir = mkdtempSync(join(tmpdir(), 'jsmind-tutorials-'));
        const tutorialsDir = join(dir, 'tutorials');
        try {
            assembleTutorialsSite(ROOT, tutorialsDir);

            const redirect = readFileSync(join(tutorialsDir, 'index.html'), 'utf8');
            assert.strictEqual(redirect, TUTORIALS_LANGUAGE_REDIRECT_HTML);
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
                const pageUrl = new URL(rel, `${SITE_ORIGIN}${TUTORIALS_SITE_BASE}`).href;

                // The tab icon is the docs site's single checked-in copy,
                // addressed from the tutorials base, and it resolves to a file
                // in this build rather than to a 404 one level up.
                assert.deepStrictEqual(
                    iconHrefs(html),
                    SITE_ICON_FILES.map((name) => `${TUTORIALS_SITE_BASE}${name}`),
                    `${rel} should link the site icons`
                );
                for (const href of iconHrefs(html)) {
                    const file = resolvePublishedHref(href, pageUrl, TUTORIALS_SITE_BASE, tutorialsDir);
                    assert.ok(existsSync(file), `${rel}: ${href} should resolve to ${file}`);
                }

                assertVisibleAiNotice(html, css, rel);
                // The top bar hands the reader back to the docs site at its
                // published address, not at a path inside this base.
                assert.ok(
                    headerHtml(html).includes(`${DOCS_SITE_ENTRY}${locale}/`),
                    `${rel} top bar should link the ${locale} docs entry`
                );
                // The language menu switches between the two tutorial
                // locales, the same way it does on the docs site.
                const sibling = locale === 'en' ? 'zh' : 'en';
                assert.ok(
                    headerHtml(html).includes(`${TUTORIALS_SITE_BASE}${sibling}/`),
                    `${rel} language menu should offer the ${sibling} tutorials`
                );
                // A language page is a real page, so it is not a redirect.
                assert.ok(!html.includes(`localStorage.getItem('${DOCS_LANG_STORAGE_KEY}')`));
            }

            const enEntry = readFileSync(join(tutorialsDir, 'en', 'index.html'), 'utf8');
            const zhEntry = readFileSync(join(tutorialsDir, 'zh', 'index.html'), 'utf8');
            assert.ok(enEntry.includes('being built'), 'the en entry page should say the column is being built');
            assert.ok(zhEntry.includes('正在建设'), 'the zh entry page should say the column is being built');
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('points the README at the docs entry, not at the docs README blob', () => {
        const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
        const readmeZh = readFileSync(join(ROOT, 'README.zh.md'), 'utf8');

        assert.ok(hasHref(readme, DOCS_SITE_ENTRY));
        assert.ok(hasHref(readmeZh, DOCS_SITE_ENTRY));

        // The tutorial column is published, so both READMEs may point at it —
        // but only at the live entry, never at an empty or language-prefixed
        // address that could outlive the redirect.
        assert.ok(hasHref(readme, TUTORIALS_SITE_ENTRY), 'README.md should link the tutorials entry');
        assert.ok(hasHref(readmeZh, TUTORIALS_SITE_ENTRY), 'README.zh.md should link the tutorials entry');
        assert.ok(!hasHref(readme, `${TUTORIALS_SITE_ENTRY}en/`));
        assert.ok(!hasHref(readmeZh, `${TUTORIALS_SITE_ENTRY}zh/`));

        assert.ok(!hasHref(readme, DOCS_README_BLOB));
        assert.ok(!hasHref(readmeZh, DOCS_README_BLOB));

        assert.ok(!hasHref(readme, `${DOCS_SITE_ENTRY}en/`));
        assert.ok(!hasHref(readme, `${DOCS_SITE_ENTRY}zh/`));
        assert.ok(!hasHref(readmeZh, `${DOCS_SITE_ENTRY}en/`));
        assert.ok(!hasHref(readmeZh, `${DOCS_SITE_ENTRY}zh/`));
    });

    it('builds the docs site with a language redirect and bilingual pages', () => {
        const dir = mkdtempSync(join(tmpdir(), 'jsmind-docs-'));
        const docsDir = join(dir, 'docs');
        try {
            assembleDocsSite(ROOT, docsDir);

            const redirect = readFileSync(join(docsDir, 'index.html'), 'utf8');
            assert.strictEqual(redirect, DOCS_LANGUAGE_REDIRECT_HTML);
            assert.ok(redirect.includes(`localStorage.getItem('${DOCS_LANG_STORAGE_KEY}')`));
            assert.ok(redirect.includes('lang = \'en\''));
            assert.ok(redirect.includes('location.replace(lang + \'/\''));
            assert.deepStrictEqual(iconHrefs(redirect), [], 'the language redirect should carry no icon');

            const files = collectFiles(docsDir);
            for (const locale of ['en', 'zh'] as const) {
                for (const page of DOCS_PAGES) {
                    const rel = `${locale}/${page}`;
                    assert.ok(files.includes(rel), `missing ${rel}`);
                }
            }

            for (const locale of ['en', 'zh'] as const) {
                for (const { from, to } of DOCS_PAGE_REDIRECTS) {
                    const rel = `${locale}/${from}`;
                    assert.ok(files.includes(rel), `missing redirect ${rel}`);
                    const html = readFileSync(join(docsDir, locale, from), 'utf8');
                    assert.strictEqual(html, docsPageRedirectHtml(to), `${rel} should be a static redirect`);
                    assert.ok(!html.includes(FOOTER_TEXT), `${rel} should not be a VitePress content page`);
                    assert.deepStrictEqual(iconHrefs(html), [], `${rel} is a redirect and should carry no icon`);
                }
            }

            // Every generated page carries the tab icon, and its href resolves
            // inside the published docs tree. Presence alone is not the check:
            // a base-less `/favicon.svg` is a link tag pointing at a 404.
            const redirectPages = new Set(
                DOCS_PAGE_REDIRECTS.flatMap(({ from }) =>
                    (['en', 'zh'] as const).map((locale) => `${locale}/${from}`))
            );
            const contentPages = files.filter((name) => /^(en|zh)\/.+\.html$/.test(name) && !redirectPages.has(name));
            assert.strictEqual(
                contentPages.length,
                DOCS_PAGES.length * 2,
                'every en/zh page should be covered by the icon check'
            );
            for (const rel of contentPages) {
                const html = readFileSync(join(docsDir, rel), 'utf8');
                const pageUrl = new URL(rel, `${SITE_ORIGIN}${DOCS_SITE_BASE}`).href;
                const hrefs = iconHrefs(html);
                assert.deepStrictEqual(
                    hrefs,
                    SITE_ICON_FILES.map((name) => `${DOCS_SITE_BASE}${name}`),
                    `${rel} should link ${SITE_ICON_FILES.join(' and ')}`
                );
                for (const href of hrefs) {
                    const file = resolvePublishedHref(href, pageUrl, DOCS_SITE_BASE, docsDir);
                    assert.ok(existsSync(file), `${rel}: ${href} should resolve to ${file}`);
                }
            }

            const enHome = readFileSync(join(docsDir, 'en', 'index.html'), 'utf8');
            const zhHome = readFileSync(join(docsDir, 'zh', 'index.html'), 'utf8');
            const enGuide = readFileSync(join(docsDir, 'en', 'guide', 'index.html'), 'utf8');
            const zhGuide = readFileSync(join(docsDir, 'zh', 'guide', 'index.html'), 'utf8');
            const enApiPage = readFileSync(join(docsDir, 'en', 'reference', 'api', 'jsmind.html'), 'utf8');
            const zhApiPage = readFileSync(join(docsDir, 'zh', 'reference', 'api', 'jsmind.html'), 'utf8');
            const builtCss = readBuiltCss(docsDir);
            assertVisibleAiNotice(enHome, builtCss, 'en home');
            assertVisibleAiNotice(zhHome, builtCss, 'zh home');
            assertHomeVersion(enHome, 'en home');
            assertHomeVersion(zhHome, 'zh home');
            assertVisibleAiNotice(enGuide, builtCss, 'en guide');
            assertVisibleAiNotice(zhGuide, builtCss, 'zh guide');
            assertVisibleAiNotice(enApiPage, builtCss, 'en API');
            assertVisibleAiNotice(zhApiPage, builtCss, 'zh API');

            assertSectionOrder(enHome, 'en', 'en home nav');
            assertSectionOrder(zhHome, 'zh', 'zh home nav');
            assertSectionOrder(enGuide, 'en', 'en guide nav');
            assertSectionOrder(zhGuide, 'zh', 'zh guide nav');

            // The top bar reaches the tutorials site at its published address.
            // A base-less path would publish under the docs base instead.
            assert.ok(
                headerHtml(enHome).includes(`${TUTORIALS_SITE_ENTRY}en/`),
                'en docs top bar should link the en tutorials'
            );
            assert.ok(
                headerHtml(zhHome).includes(`${TUTORIALS_SITE_ENTRY}zh/`),
                'zh docs top bar should link the zh tutorials'
            );
            assert.ok(
                !enHome.includes('/jsmind-v2/docs/jsmind-v2/tutorials/'),
                'the tutorials link must not be rewritten into the docs base'
            );

            // The tutorials are a separate column: reachable from the top bar,
            // absent from every docs sidebar.
            for (const [label, page] of [['en guide', enGuide], ['zh guide', zhGuide], ['en API', enApiPage]] as const) {
                const aside = asideHtml(page);
                assert.ok(aside.length > 0, `${label} should render a sidebar`);
                assert.ok(!aside.includes('/tutorials/'), `${label} sidebar must not list tutorials`);
            }

            assert.ok(enHome.includes('/jsmind-v2/docs/zh/'));
            assert.ok(zhHome.includes('/jsmind-v2/docs/en/'));
            assert.ok(enHome.includes('/jsmind-v2/docs/en/guide/'));
            assert.ok(zhHome.includes('/jsmind-v2/docs/zh/guide/'));
            assert.ok(!enHome.includes('href="/jsmind-v2/docs/guide/'));
            assert.ok(!zhHome.includes('href="/jsmind-v2/docs/guide/'));
            assert.ok(!enHome.includes(`localStorage.getItem('${DOCS_LANG_STORAGE_KEY}')`));
            assert.ok(!zhHome.includes(`localStorage.getItem('${DOCS_LANG_STORAGE_KEY}')`));

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
                    prompt.includes('https://hizzgdev.github.io/jsmind-v2/skills/jsmind/INSTALL.md'),
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
                install.includes('https://hizzgdev.github.io/jsmind-v2/skills/jsmind/SKILL.md'),
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
});
