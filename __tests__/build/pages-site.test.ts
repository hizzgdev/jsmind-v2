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
 * The landing page is rendered from `README.md` during assembly; the
 * repository keeps neither `index.html` nor a separate page module. These
 * tests therefore assert against the renderer and against what assembly
 * writes, not against a checked-in file.
 *
 * Docs output is verified by running the VitePress build against this
 * repository into a temporary directory. The root-file fixture stays focused
 * on the playground rewrite and does not invoke VitePress.
 *
 * Where the landing-page guard is enforced: this file's `landing page` tests
 * fail when the README grows markdown the renderer passes through as text, and
 * ci.yml raises a `landing` flag for a root README change and runs those tests
 * for it - a README edit sets no other flag, so without that wiring the one
 * change class the guard exists for would publish untested.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    assembleDocsSite,
    assembleRootSite,
    DOCS_LANG_STORAGE_KEY,
    DOCS_LANGUAGE_REDIRECT_HTML,
    DOCS_PAGE_REDIRECTS,
    docsPageRedirectHtml,
    LANDING_PAGE_SOURCE,
    moduleScriptSrcs,
    renderLandingPage,
    rewritePlayground,
    writeDocsPageRedirects,
} from '../../scripts/assemble-site.ts';
import { REPO_BLOB_BASE, renderMarkdown, renderReadmePage } from '../../scripts/readme-page.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CI_WORKFLOW = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');

const DOCS_SITE_ENTRY = 'https://hizzgdev.github.io/jsmind-v2/docs/';
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

/** A heading as written in the README, before inline markup is rendered. */
interface ReadmeHeading {
    readonly level: number;
    readonly text: string;
}

/** A link as written in the README. */
interface ReadmeLink {
    readonly label: string;
    readonly href: string;
}

/** What the landing-page tests read out of a README. */
interface ReadmeStructure {
    readonly headings: ReadmeHeading[];
    readonly links: ReadmeLink[];
    /** Fence marker lines, so the block count is this number halved. */
    readonly fenceLines: number;
}

const HEADING_LINE = /^(#{1,6})\s+(.*\S)\s*$/;
const FENCE_LINE = /^```/;
const LINK_SPAN = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const README_COMMENT = /<!--[\s\S]*?-->/g;
const ENTITY = /&(?:amp|lt|gt|quot|#39);/g;
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': '\'',
};

/**
 * Reads headings, links, and the fence count from markdown.
 *
 * Fenced blocks and HTML comments are skipped: a `#` in a shell transcript is
 * not a heading, and a link inside a comment is not a link.
 *
 * @param markdown - Markdown source.
 * @returns Block structure as written, with no assumptions about the wording.
 */
function readReadmeStructure(markdown: string): ReadmeStructure {
    const lines = markdown.replace(README_COMMENT, '')
        .replaceAll('\r\n', '\n')
        .split('\n');
    const headings: ReadmeHeading[] = [];
    const links: ReadmeLink[] = [];
    let fenceLines = 0;
    let inFence = false;

    for (const line of lines) {
        if (FENCE_LINE.test(line)) {
            inFence = !inFence;
            fenceLines += 1;
            continue;
        }
        if (inFence) {
            continue;
        }

        const heading = line.match(HEADING_LINE);
        if (heading !== null) {
            headings.push({ level: heading[1].length, text: heading[2] });
        }
        for (const link of line.matchAll(LINK_SPAN)) {
            links.push({ label: link[1], href: link[2] });
        }
    }

    return { headings, links, fenceLines };
}

/**
 * Flattens the inline markup the renderer interprets to the text it renders as.
 *
 * @param text - Inline markdown.
 * @returns Code spans unwrapped, link labels without their target.
 */
function flattenInline(text: string): string {
    return text.replaceAll('`', '')
        .replace(LINK_SPAN, '$1')
        .trim();
}

/**
 * Text content of an HTML fragment, with entities decoded.
 *
 * @param fragment - HTML.
 * @returns The readable text it contains.
 */
function textOf(fragment: string): string {
    return fragment.replace(/<[^>]*>/g, '')
        .replace(ENTITY, (entity) => NAMED_ENTITIES[entity]);
}

/**
 * Markdown that reached the page as literal text instead of markup.
 *
 * The renderer interprets headings, paragraphs, lists, fences, code spans and
 * links; anything else it escapes and passes through. That is a deliberate
 * subset, so the page is only correct while the README stays inside it. These
 * patterns are what a README edit outside the subset leaves behind.
 */
const UNRENDERED_MARKDOWN: ReadonlyArray<{ readonly syntax: string; readonly pattern: RegExp }> = [
    { syntax: 'emphasis', pattern: /\*\*|__/ },
    { syntax: 'image', pattern: /!\[/ },
    { syntax: 'link', pattern: /\]\(/ },
    { syntax: 'table', pattern: /(?:^|\n)\s*\|/ },
    // Raw HTML is escaped into text, so a tag-shaped run is residue, not markup.
    { syntax: 'raw HTML', pattern: /<[/]?[a-z][a-z0-9-]*[\s/>]/ },
    // A blockquote is not a paragraph that happens to start with a caret: the
    // renderer keeps that caret, and the page shows it.
    { syntax: 'blockquote', pattern: /(?:^|\n)[ \t]*>/ },
    // Thematic breaks survive as a line of hyphens, asterisks or underscores.
    { syntax: 'horizontal rule', pattern: /(?:^|\n)[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*(?:\n|$)/ },
    // `<https://...>` is markdown's bare link; escaped, it reads as a tag-shaped
    // run without matching the raw-HTML pattern above.
    { syntax: 'autolink', pattern: /<[a-z][a-z0-9+.-]*:[^\s<>]*>/ },
];

/**
 * Reports the markdown syntax that the page shows verbatim.
 *
 * Rendered markup, stylesheet, code blocks and code spans are removed before
 * the scan: their contents are supposed to be literal.
 *
 * @param page - A complete HTML document.
 * @returns One entry per unrendered syntax family, empty when the page is clean.
 */
function findUnrenderedMarkdown(page: string): string[] {
    const text = textOf(page.replace(/<style>[\s\S]*?<\/style>/g, '')
        .replace(/<pre>[\s\S]*?<\/pre>/g, '')
        .replace(/<code>[\s\S]*?<\/code>/g, ''));
    return UNRENDERED_MARKDOWN.filter(({ pattern }) => pattern.test(text))
        .map(({ syntax }) => syntax);
}

/**
 * The shell body of a `run: |` step in a workflow file, dedented.
 *
 * The `changes` step is exercised by running it rather than by matching its
 * text: which flags a file list raises is the behaviour the rest of CI reads,
 * and a comment saying "README.md means landing" would not prove it.
 *
 * @param workflow - Workflow file contents.
 * @param stepName - The `name:` of the step to extract.
 * @returns The step's script, ready to hand to bash.
 */
function readRunStep(workflow: string, stepName: string): string {
    const lines = workflow.split('\n');
    const start = lines.findIndex((line) => line.trim() === `- name: ${stepName}`);
    assert.ok(start >= 0, `ci.yml should carry a step named "${stepName}"`);

    const runIndex = lines.findIndex((line, index) => index > start && /^\s*run: \|$/.test(line));
    assert.ok(runIndex > start, `the "${stepName}" step should be a multi-line run step`);
    const runIndent = lines[runIndex].length - lines[runIndex].trimStart().length;

    const body: string[] = [];
    for (let index = runIndex + 1; index < lines.length; index += 1) {
        const line = lines[index];
        const indent = line.length - line.trimStart().length;
        if (line.trim() !== '' && indent <= runIndent) {
            break;
        }
        body.push(line);
    }

    const indents = body.filter((line) => line.trim() !== '')
        .map((line) => line.length - line.trimStart().length);
    const dedent = Math.min(...indents);
    return body.map((line) => line.slice(dedent))
        .join('\n')
        .trimEnd();
}

/**
 * `process.env` with git's repository selection removed.
 *
 * Git exports `GIT_DIR` (and friends) to hooks, and `scripts/git-hooks/pre-push`
 * runs the full test suite. A test spawned from that hook inherits them, so an
 * unscrubbed `git init` in a temporary directory re-initialises the
 * developer's repository and commits into it instead. The isolation is not a
 * nicety: without it this test rewrites the branch it is meant to describe.
 *
 * @returns The environment with every `GIT_*` variable dropped.
 */
function isolatedGitEnv(): Record<string, string | undefined> {
    const env: Record<string, string | undefined> = { ...process.env };
    for (const key of Object.keys(env)) {
        if (key.startsWith('GIT_')) {
            delete env[key];
        }
    }
    return env;
}

/**
 * Runs the `changes` job's classification over a file list.
 *
 * A throwaway repository provides the two commits the step diffs, so the real
 * shell block answers for the real paths.
 *
 * @param files - Paths that differ between the base commit and the head.
 * @returns `$GITHUB_OUTPUT` as a map of flag to value.
 */
function classifyChanges(files: readonly string[]): Record<string, string> {
    const dir = mkdtempSync(join(tmpdir(), 'jsmind-ci-changes-'));
    const env = isolatedGitEnv();
    try {
        const git = (...args: string[]): string => {
            const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8', env });
            assert.strictEqual(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
            return result.stdout.trim();
        };

        git('init', '-q');
        // Fail before writing anything if the repository selection leaked: the
        // commits below must land here and nowhere else.
        assert.strictEqual(
            realpathSync(git('rev-parse', '--show-toplevel')),
            realpathSync(dir),
            'the throwaway repository must resolve to its own directory'
        );
        git('config', 'user.email', 'ci@example.com');
        git('config', 'user.name', 'CI');
        writeFileSync(join(dir, 'unchanged.txt'), 'base\n');
        git('add', '.');
        git('commit', '-q', '-m', 'base');
        const base = git('rev-parse', 'HEAD');

        for (const file of files) {
            mkdirSync(dirname(join(dir, file)), { recursive: true });
            writeFileSync(join(dir, file), 'changed\n');
        }
        git('add', '.');
        git('commit', '-q', '-m', 'change');
        const head = git('rev-parse', 'HEAD');

        const outputPath = join(dir, 'github-output');
        writeFileSync(outputPath, '');
        const result = spawnSync('bash', ['-c', readRunStep(CI_WORKFLOW, 'Compare against the base')], {
            cwd: dir,
            encoding: 'utf8',
            env: {
                ...env,
                EVENT_NAME: 'pull_request',
                PR_BASE: base,
                PR_HEAD: head,
                PUSH_BEFORE: '',
                PUSH_AFTER: '',
                GITHUB_OUTPUT: outputPath,
            },
        });
        assert.strictEqual(result.status, 0, `the changes step failed: ${result.stderr}`);

        return Object.fromEntries(readFileSync(outputPath, 'utf8')
            .split('\n')
            .filter((line) => line.includes('='))
            .map((line) => [
                line.slice(0, line.indexOf('=')),
                line.slice(line.indexOf('=') + 1),
            ]));
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * HEAD of the repository these tests belong to.
 *
 * Read with the caller's environment on purpose: this is the observation the
 * isolation above has to leave unchanged.
 *
 * @returns The commit sha.
 */
function repositoryHead(): string {
    const result = spawnSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, `git rev-parse HEAD failed: ${result.stderr}`);
    return result.stdout.trim();
}

describe('landing page', () => {
    const readme = readFileSync(join(ROOT, LANDING_PAGE_SOURCE), 'utf8');
    const page = renderLandingPage(ROOT);
    const structure = readReadmeStructure(readme);

    it('is rendered from the README at assembly time, not checked in', () => {
        assert.ok(
            !existsSync(join(ROOT, 'index.html')),
            'the repository root must not carry a landing page'
        );
        assert.match(page, /^<!DOCTYPE html>\n<html lang="en">/);

        // The title is the README's first heading, whatever it happens to say.
        const title = /<title>([\s\S]*?)<\/title>/.exec(page);
        assert.ok(title !== null, 'the page should carry a title');
        const firstHeading = structure.headings.find((heading) => heading.level === 1);
        assert.ok(firstHeading !== undefined, 'the README should open with an h1');
        assert.strictEqual(textOf(title[1]), flattenInline(firstHeading.text));
    });

    it('renders every README heading, in order, as a heading element', () => {
        const rendered = [...page.matchAll(/<h([1-6])>([\s\S]*?)<\/h\1>/g)]
            .map((match) => ({ level: Number(match[1]), text: textOf(match[2]) }));
        assert.deepStrictEqual(
            rendered,
            structure.headings.map((heading) => ({
                level: heading.level,
                text: flattenInline(heading.text),
            })),
            'every README heading should reach the page as an <hN> with the same text'
        );
    });

    it('rebases every README link and drops none', () => {
        const anchors = [...page.matchAll(/<a href="([^"]*)">([\s\S]*?)<\/a>/g)]
            .map((match) => ({ href: match[1], text: textOf(match[2]) }));
        assert.strictEqual(anchors.length, structure.links.length);

        for (const [index, link] of structure.links.entries()) {
            // Relative README links point at files the site does not publish, so
            // they are rebased onto the repository instead of 404ing; absolute,
            // site-absolute, and in-page hrefs are left as written.
            const rebased = /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(link.href)
                ? link.href
                : `${REPO_BLOB_BASE}${link.href.replace(/^\.\//, '')}`;
            assert.deepStrictEqual(
                anchors[index],
                { href: rebased, text: flattenInline(link.label) },
                `README link ${index + 1} (${link.label}) should reach the page rebased`
            );
        }
    });

    it('renders every fenced block as pre/code and leaks no fence', () => {
        assert.ok(structure.fenceLines > 0, 'the README should carry a code fence');
        assert.strictEqual(
            (page.match(/<pre><code/g) ?? []).length,
            structure.fenceLines / 2
        );
        assert.ok(!page.includes('```'));
        assert.ok(!page.includes('<!--'), 'README comments must not reach the page');
    });

    it('never shows markdown the renderer does not interpret', () => {
        assert.deepStrictEqual(
            findUnrenderedMarkdown(page),
            [],
            'README grew syntax that scripts/readme-page.ts does not render: extend the '
            + 'renderer, or keep that syntax out of the README'
        );
    });

    it('reports the constructs the guard exists to catch', () => {
        // Without this the guard above can rot into a test that passes because
        // it stopped looking, so feed it the next likely README edits.
        const unsupported = renderReadmePage(
            '# Guard\n\n'
            + '[![npm](https://img.shields.io/npm/v/jsmind.svg)](https://www.npmjs.com/package/jsmind)\n\n'
            + '**v2**\n\n'
            + '| a | b |\n| --- | --- |\n| 1 | 2 |\n\n'
            + '<details><summary>more</summary></details>\n'
        );
        const found = findUnrenderedMarkdown(unsupported);
        for (const syntax of ['emphasis', 'image', 'link', 'table', 'raw HTML']) {
            assert.ok(found.includes(syntax), `expected ${syntax} residue, got [${found.join(', ')}]`);
        }
    });

    it('reports the block-level constructs it had missed', () => {
        // Each of these renders as literal text and used to slip past the
        // guard, so they are fed in one at a time: a combined fixture would
        // still pass if the scan only ever reported the first match.
        const constructs: ReadonlyArray<{ readonly syntax: string; readonly markdown: string }> = [
            { syntax: 'blockquote', markdown: '> note: install with npm\n' },
            { syntax: 'horizontal rule', markdown: '---\n' },
            { syntax: 'autolink', markdown: 'See <https://example.com> for more.\n' },
        ];
        for (const { syntax, markdown } of constructs) {
            const found = findUnrenderedMarkdown(renderReadmePage(`# ${syntax}\n\n${markdown}`));
            assert.ok(found.includes(syntax), `expected ${syntax} residue, got [${found.join(', ')}]`);
        }
    });

    it('runs on the one change class that can break the page', () => {
        // The guard above is only worth its lines if CI runs it for the change
        // it exists to catch: a README edit is prose, so every other job in the
        // workflow skips and the page would publish untested. `landing` is the
        // flag that keeps it on the path; classifyChanges runs the real
        // classification block from ci.yml over a real diff.
        const headBefore = repositoryHead();
        const readmeOnly = classifyChanges(['README.md']);
        assert.strictEqual(readmeOnly.landing, 'true', 'a README.md change should raise the landing flag');
        assert.strictEqual(readmeOnly.library, 'false', 'a README.md change should not run the library suite');
        assert.strictEqual(readmeOnly.docs, 'false');

        // Only the root README is rendered into the site.
        assert.strictEqual(classifyChanges(['README.zh.md']).landing, 'false');
        assert.strictEqual(classifyChanges(['docs/en/guide.md']).landing, 'false');
        assert.strictEqual(classifyChanges(['src/model/mind.ts']).landing, 'false');
        assert.strictEqual(classifyChanges(['README.md', 'docs/en/guide.md']).landing, 'true');

        // Running under scripts/git-hooks/pre-push exports GIT_DIR, which this
        // helper has to scrub - otherwise its commits land in this repository.
        assert.strictEqual(
            repositoryHead(),
            headBefore,
            'classifying a file list must not commit into this repository'
        );
    });

    it('gates a landing-page test step on that flag', () => {
        assert.match(
            CI_WORKFLOW,
            /^\s+landing: \$\{\{ steps\.paths\.outputs\.landing \}\}$/m,
            'the changes job should publish the landing flag as an output'
        );
        assert.match(
            CI_WORKFLOW,
            /if: needs\.changes\.outputs\.landing == 'true'\n\s+run: node --test --test-name-pattern='landing page' /,
            'a step should run the landing-page tests when the flag is set'
        );
    });

    it('escapes markdown text instead of trusting it', () => {
        const html = renderMarkdown('# <b>t</b> & co\n\nA & B `a<b` [rel](docs/x.md)\n', {
            linkBase: REPO_BLOB_BASE,
        });
        assert.ok(html.includes('<h1>&lt;b&gt;t&lt;/b&gt; &amp; co</h1>'));
        assert.ok(html.includes('A &amp; B <code>a&lt;b</code>'));
        assert.ok(html.includes(`<a href="${REPO_BLOB_BASE}docs/x.md">rel</a>`));
    });

    it('keeps fenced code and lists as blocks', () => {
        const html = renderMarkdown('```\nx < y\n```\n\n- one\n- `two`\n\n1. first\n');
        assert.strictEqual(
            html,
            '<pre><code>x &lt; y\n</code></pre>\n'
            + '<ul>\n    <li>one</li>\n    <li><code>two</code></li>\n</ul>\n'
            + '<ol>\n    <li>first</li>\n</ol>'
        );
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

    it('renders the landing page from the README into the three root site files', () => {
        const dir = mkdtempSync(join(tmpdir(), 'jsmind-site-'));
        try {
            mkdirSync(join(dir, 'example'), { recursive: true });
            mkdirSync(join(dir, 'dist'), { recursive: true });
            writeFileSync(join(dir, LANDING_PAGE_SOURCE), '# Fixture site\n\nRendered during assembly.\n');
            writeFileSync(join(dir, 'dist', 'jsmind.js'), 'export {}\n');
            writeFileSync(
                join(dir, 'example', 'playground.html'),
                '<script src="../dist/jsmind.js" type="module"></script>\n'
            );

            mkdirSync(join(dir, '_site'), { recursive: true });
            assembleRootSite(dir, join(dir, '_site'));

            // The page comes from the README, not from the checkout, so the
            // fixture needs no index.html of its own.
            assert.ok(!existsSync(join(dir, 'index.html')));
            const index = readFileSync(join(dir, '_site', 'index.html'), 'utf8');
            assert.ok(index.includes('<h1>Fixture site</h1>'));
            assert.ok(index.includes('<p>Rendered during assembly.</p>'));
            assert.strictEqual(
                index,
                renderReadmePage(readFileSync(join(dir, LANDING_PAGE_SOURCE), 'utf8'), {
                    linkBase: REPO_BLOB_BASE,
                })
            );
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

    it('points the README and the rendered landing page at the docs entry', () => {
        const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
        const readmeZh = readFileSync(join(ROOT, 'README.zh.md'), 'utf8');
        const landing = renderLandingPage(ROOT);

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
