/**
 * @fileoverview `npm run assemble-site` publishes the landing page, the
 * playground, and the VitePress documentation site.
 *
 * The page in `example/` is a module script whose src is `../dist/jsmind.js`.
 * That relative path is what `npm run server` needs. The command copies the
 * page to the site root and the bundle beside it, and rewrites only the src.
 * `type` may sit on either side of `src`. The Pages workflow runs the command
 * and does not check the tag itself.
 *
 * The landing page is generated from `scripts/landing-page.ts`; the repository
 * keeps no `index.html`. These tests therefore assert against the renderer and
 * against what assembly writes, not against a checked-in file.
 *
 * Docs output is verified by running the VitePress build against this
 * repository into a temporary directory. The root-file fixture stays focused
 * on the playground rewrite and does not invoke VitePress.
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    assembleDocsSite,
    assembleRootSite,
    DOCS_LANG_STORAGE_KEY,
    DOCS_LANGUAGE_REDIRECT_HTML,
    DOCS_PAGE_REDIRECTS,
    docsPageRedirectHtml,
    moduleScriptSrcs,
    rewritePlayground,
    writeDocsPageRedirects,
} from '../../scripts/assemble-site.ts';
import { LANDING_PAGE, renderLandingPage } from '../../scripts/landing-page.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

const DOCS_SITE_ENTRY = 'https://hizzgdev.github.io/jsmind-v2/docs/';
const PLAYGROUND_ENTRY = 'playground.html';
const REPO_ENTRY = 'https://github.com/hizzgdev/jsmind-v2';
const DOCS_README_BLOB = 'https://github.com/hizzgdev/jsmind-v2/blob/master/docs/README.md';
const FOOTER_TEXT = '本文档由 AI 协助生成 / This documentation was prepared with AI assistance';

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

function withoutVpFooter(html: string): string {
    return html.replace(/<footer\b[^>]*class="[^"]*\bVPFooter\b[^"]*"[^>]*>[\s\S]*?<\/footer>/g, '');
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
    const page = renderLandingPage();

    it('is generated at build time, not checked in', () => {
        assert.ok(
            !existsSync(join(ROOT, 'index.html')),
            'the repository root must not carry a landing page'
        );
        assert.strictEqual(page, renderLandingPage(LANDING_PAGE));
        assert.match(page, /^<!DOCTYPE html>\n<html lang="zh-CN">/);
    });

    it('links the playground, the repository, and the docs site', () => {
        assert.deepStrictEqual(
            LANDING_PAGE.actions.map((action) => action.href),
            [PLAYGROUND_ENTRY, REPO_ENTRY, DOCS_SITE_ENTRY]
        );
        for (const href of [PLAYGROUND_ENTRY, REPO_ENTRY, DOCS_SITE_ENTRY]) {
            assert.ok(page.includes(`href="${href}"`), `landing page should link to ${href}`);
        }
        assert.strictEqual(LANDING_PAGE.actions.filter((action) => action.primary === true).length, 1);
    });

    it('lists the five features', () => {
        assert.strictEqual(LANDING_PAGE.features.length, 5);
        assert.strictEqual(page.match(/<dt>/g)?.length, 5);
        for (const { term } of LANDING_PAGE.features) {
            assert.ok(page.includes(`<dt>${term}</dt>`), `landing page should list ${term}`);
        }
    });

    it('follows the system color scheme', () => {
        assert.match(page, /<style>[\s\S]*@media \(prefers-color-scheme: dark\)[\s\S]*<\/style>/);
        assert.ok(page.includes('--bg: #14171c'), 'the dark palette should be present');
    });

    it('escapes content and keeps code segments as markup', () => {
        const escaped = renderLandingPage({
            lang: 'en',
            title: '<b>t</b>',
            kicker: 'k & k',
            lead: 'a & b',
            actions: [{ label: '<x>', href: 'a"b' }],
            features: [{ term: '<t>', detail: ['x < y ', { code: 'n<m' }, ' end'] }],
        });
        assert.ok(escaped.includes('<title>&lt;b&gt;t&lt;/b&gt;</title>'));
        assert.ok(escaped.includes('<span class="version">k &amp; k</span>'));
        assert.ok(escaped.includes('a &amp; b'));
        assert.ok(escaped.includes('href="a&quot;b"'));
        assert.ok(escaped.includes('<dt>&lt;t&gt;</dt>'));
        assert.ok(escaped.includes('x &lt; y <code>n&lt;m</code> end'));
    });
});

describe('pages site assembly', () => {
    it('keeps the source playground on the local bundle path', () => {
        const html = readFileSync(join(ROOT, 'example/playground.html'), 'utf8');
        assert.deepStrictEqual(moduleScriptSrcs(html), ['../dist/jsmind.js']);

        const published = rewritePlayground(html);
        assert.deepStrictEqual(moduleScriptSrcs(published), ['jsmind.js']);
        assert.ok(!published.includes('../dist/jsmind.js'));
    });

    it('accepts type after src, and rejects a classic script', () => {
        const reversed = '<script src="../dist/jsmind.js" type="module"></script>';
        assert.strictEqual(
            rewritePlayground(reversed),
            '<script src="jsmind.js" type="module"></script>'
        );

        assert.throws(
            () => rewritePlayground('<script src="../dist/jsmind.js"></script>'),
            /does not load jsmind\.js as a module/
        );
        assert.throws(
            () => rewritePlayground('<script type="module" src="jsmind.js"></script>'),
            /has no script/
        );
    });

    it('renders the landing page into the three root site files', () => {
        const dir = mkdtempSync(join(tmpdir(), 'jsmind-site-'));
        try {
            mkdirSync(join(dir, 'example'), { recursive: true });
            mkdirSync(join(dir, 'dist'), { recursive: true });
            writeFileSync(join(dir, 'dist', 'jsmind.js'), 'export {}\n');
            writeFileSync(
                join(dir, 'example', 'playground.html'),
                '<script src="../dist/jsmind.js" type="module"></script>\n'
            );

            mkdirSync(join(dir, '_site'), { recursive: true });
            assembleRootSite(dir, join(dir, '_site'));

            // The page is rendered from content, not copied from the checkout,
            // so the fixture needs no index.html of its own.
            assert.ok(!existsSync(join(dir, 'index.html')));
            assert.strictEqual(readFileSync(join(dir, '_site', 'index.html'), 'utf8'), renderLandingPage());
            assert.strictEqual(readFileSync(join(dir, '_site', 'jsmind.js'), 'utf8'), 'export {}\n');
            assert.strictEqual(
                readFileSync(join(dir, '_site', 'playground.html'), 'utf8'),
                '<script src="jsmind.js" type="module"></script>\n'
            );
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }

        const workflow = readFileSync(join(ROOT, '.github/workflows/static.yml'), 'utf8');
        assert.match(workflow, /npm run assemble-site/);
        assert.ok(!workflow.includes('grep'));
        assert.ok(!workflow.includes('sed '));
        assert.ok(!workflow.includes('assemble-pages'));
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

    it('points README and landing-page docs links at the site entry', () => {
        const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
        const readmeZh = readFileSync(join(ROOT, 'README.zh.md'), 'utf8');
        const landing = renderLandingPage();

        assert.ok(hasHref(readme, DOCS_SITE_ENTRY));
        assert.ok(hasHref(readmeZh, DOCS_SITE_ENTRY));
        assert.ok(hasHref(landing, DOCS_SITE_ENTRY));

        assert.ok(!hasHref(readme, DOCS_README_BLOB));
        assert.ok(!hasHref(readmeZh, DOCS_README_BLOB));
        assert.ok(!hasHref(landing, DOCS_README_BLOB));
        assert.ok(!landing.includes(DOCS_README_BLOB));

        assert.ok(!hasHref(readme, `${DOCS_SITE_ENTRY}en/`));
        assert.ok(!hasHref(readme, `${DOCS_SITE_ENTRY}zh/`));
        assert.ok(!hasHref(readmeZh, `${DOCS_SITE_ENTRY}en/`));
        assert.ok(!hasHref(readmeZh, `${DOCS_SITE_ENTRY}zh/`));
        assert.ok(!hasHref(landing, `${DOCS_SITE_ENTRY}en/`));
        assert.ok(!hasHref(landing, `${DOCS_SITE_ENTRY}zh/`));
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
            assertVisibleAiNotice(enGuide, builtCss, 'en guide');
            assertVisibleAiNotice(zhGuide, builtCss, 'zh guide');
            assertVisibleAiNotice(enApiPage, builtCss, 'en API');
            assertVisibleAiNotice(zhApiPage, builtCss, 'zh API');

            assertSectionOrder(enHome, 'en', 'en home nav');
            assertSectionOrder(zhHome, 'zh', 'zh home nav');
            assertSectionOrder(enGuide, 'en', 'en guide nav');
            assertSectionOrder(zhGuide, 'zh', 'zh guide nav');

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
            assert.ok(enSkill.includes('skills/jsmind/'));
            assert.ok(zhSkill.includes('skills/jsmind/'));
            assert.ok(enSkill.includes('https://github.com/hizzgdev/jsmind-v2/blob/master/skills/jsmind/SKILL.md'));
            assert.ok(zhSkill.includes('https://github.com/hizzgdev/jsmind-v2/blob/master/skills/jsmind/SKILL.zh.md'));
            assert.ok(enSkill.includes('do not hand-write the JSON'));
            assert.ok(zhSkill.includes('不要手写 JSON'));
            assert.ok(enSkill.includes('[topic]'));
            assert.ok(zhSkill.includes('[主题]'));
            assert.ok(enSkill.includes('npm i jsmind@2'));
            assert.ok(zhSkill.includes('npm i jsmind@2'));
            assert.ok(enSkill.includes('jsmind validate'));
            assert.ok(zhSkill.includes('jsmind validate'));

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
