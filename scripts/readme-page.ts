/**
 * @fileoverview Renders the site landing page from `README.md`.
 *
 * The repository keeps no landing page of its own: `scripts/assemble-site.ts`
 * turns the README into `_site/index.html`. One description of the project,
 * two readers — GitHub renders the markdown, the site gets HTML — instead of
 * a second hand-written page that drifts. The earlier attempt moved the page
 * body into TypeScript, which changed where the copy lived without changing
 * that there were two copies of it.
 *
 * This is a line-oriented renderer for the markdown subset the README uses:
 * headings, paragraphs, lists, fenced code, inline code, and links. Emphasis,
 * tables, images, and raw HTML are not interpreted — they pass through as
 * text. A full markdown engine is a dependency for one page; extending this
 * file is cheaper and keeps the output predictable.
 *
 * Relative README links point at files that are not published to the site
 * (`LICENSE`, `AGENTS.md`, `skills/`, `README.zh.md`). Assembly passes
 * `REPO_BLOB_BASE` so those links reach the file on GitHub instead of 404ing.
 */

/** Web base for relative README links on the published site. */
export const REPO_BLOB_BASE = 'https://github.com/hizzgdev/jsmind-v2/blob/master/';

/** Hrefs that must not be rebased: a scheme, a site-absolute path, or an anchor. */
const ABSOLUTE_HREF = /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i;

const HEADING = /^(#{1,6})\s+(.*\S)\s*$/;
const FENCE_OPEN = /^```(\S*)\s*$/;
const FENCE_CLOSE = /^```\s*$/;
const BULLET = /^\s*[-*+]\s+(.*\S)\s*$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*\S)\s*$/;
const INLINE = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
const CODE_SPAN = /`([^`]+)`/g;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

/** What `renderReadmePage` needs; every field has a default. */
export interface ReadmePageOptions {
    /** `<html lang>`. The README it renders is English. */
    readonly lang?: string;
    /** `<title>`. Defaults to the README's first heading. */
    readonly title?: string;
    /** Prefix for relative link targets. Undefined keeps them relative. */
    readonly linkBase?: string;
}

/** Options for `renderMarkdown`. */
export interface MarkdownOptions {
    /** Prefix for relative link targets. Undefined keeps them relative. */
    readonly linkBase?: string;
}

/**
 * Escapes text for HTML text nodes and double-quoted attributes.
 *
 * @param text - Raw text.
 * @returns The same text with the five HTML-significant characters escaped.
 */
export function escapeHtml(text: string): string {
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll('\'', '&#39;');
}

/**
 * Rebases a relative link onto the repository, leaving absolute and in-page
 * targets alone.
 *
 * @param href - Href as written in the markdown.
 * @param linkBase - Repository blob base, or undefined to keep hrefs as written.
 * @returns The href to emit.
 */
export function resolveHref(href: string, linkBase: string | undefined): string {
    if (linkBase === undefined || ABSOLUTE_HREF.test(href)) {
        return href;
    }
    return linkBase + href.replace(/^\.\//, '');
}

/**
 * Renders the inline span of one block: code spans and, unless disabled,
 * links. Link labels are rendered without links so nesting cannot occur.
 *
 * @param text - Raw inline markdown.
 * @param linkBase - Repository blob base for relative links.
 * @param allowLinks - False while rendering a link label.
 * @returns HTML with every literal string escaped.
 */
function renderInline(text: string, linkBase: string | undefined, allowLinks: boolean): string {
    const pattern = allowLinks ? INLINE : CODE_SPAN;

    let out = '';
    let end = 0;
    for (const match of text.matchAll(pattern)) {
        const whole = match[0];
        const index = match.index ?? 0;
        out += escapeHtml(text.slice(end, index));
        end = index + whole.length;

        if (whole.startsWith('`')) {
            out += `<code>${escapeHtml(whole.slice(1, -1))}</code>`;
            continue;
        }
        const split = whole.lastIndexOf('](');
        const label = whole.slice(1, split);
        const href = whole.slice(split + 2, -1);
        out += `<a href="${escapeHtml(resolveHref(href, linkBase))}">${renderInline(label, linkBase, false)}</a>`;
    }
    return out + escapeHtml(text.slice(end));
}

/** A list being collected before it is emitted. */
interface OpenList {
    readonly tag: 'ul' | 'ol';
    readonly items: string[];
}

/**
 * Renders markdown into HTML blocks.
 *
 * @param markdown - Markdown source.
 * @param options - Link rebasing options.
 * @returns Block-level HTML, one element per line.
 */
export function renderMarkdown(markdown: string, options: MarkdownOptions = {}): string {
    const linkBase = options.linkBase;
    const lines = markdown.replaceAll('\r\n', '\n').replace(HTML_COMMENT, '')
        .split('\n');
    const blocks: string[] = [];
    let paragraph: string[] = [];
    let list: OpenList | undefined;

    const flushParagraph = (): void => {
        if (paragraph.length > 0) {
            blocks.push(`<p>${renderInline(paragraph.join(' '), linkBase, true)}</p>`);
            paragraph = [];
        }
    };
    const flushList = (): void => {
        if (list !== undefined) {
            const items = list.items.map((item) => `    <li>${renderInline(item, linkBase, true)}</li>`);
            blocks.push(`<${list.tag}>\n${items.join('\n')}\n</${list.tag}>`);
            list = undefined;
        }
    };
    const flush = (): void => {
        flushParagraph();
        flushList();
    };

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];

        if (line.trim() === '') {
            flush();
            continue;
        }

        const fence = line.match(FENCE_OPEN);
        if (fence !== null) {
            flush();
            const body: string[] = [];
            for (index += 1; index < lines.length && !FENCE_CLOSE.test(lines[index]); index += 1) {
                body.push(lines[index]);
            }
            const language = fence[1];
            const className = language === '' ? '' : ` class="language-${escapeHtml(language)}"`;
            blocks.push(`<pre><code${className}>${escapeHtml(body.join('\n'))}\n</code></pre>`);
            continue;
        }

        const heading = line.match(HEADING);
        if (heading !== null) {
            flush();
            const level = heading[1].length;
            blocks.push(`<h${level}>${renderInline(heading[2], linkBase, true)}</h${level}>`);
            continue;
        }

        const item = line.match(BULLET) ?? line.match(NUMBERED);
        if (item !== null) {
            flushParagraph();
            const tag = line.match(BULLET) === null ? 'ol' : 'ul';
            if (list === undefined || list.tag !== tag) {
                flushList();
                list = { tag, items: [] };
            }
            list.items.push(item[1]);
            continue;
        }

        flushList();
        paragraph.push(line.trim());
    }

    flush();
    return blocks.join('\n');
}

/**
 * Reads the `<title>` from the README's first heading.
 *
 * @param markdown - Markdown source.
 * @returns Heading text without markup, or `jsMind` when there is no heading.
 */
function readmeTitle(markdown: string): string {
    for (const line of markdown.split('\n')) {
        const heading = line.match(HEADING);
        if (heading !== null && heading[1].length === 1) {
            return heading[2]
                .replace(CODE_SPAN, '$1')
                .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
                .trim();
        }
    }
    return 'jsMind';
}

/** Stylesheet for the rendered page, inlined into the document. */
const PAGE_STYLE = `    :root {
      --bg: #f7f8fa;
      --fg: #1f2430;
      --muted: #5b6570;
      --line: #dfe3e8;
      --accent: #2f6feb;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #14171c;
        --fg: #e6e9ee;
        --muted: #98a2b0;
        --line: #2a2f38;
        --accent: #6f9dff;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0 auto;
      max-width: 46rem;
      padding: 3rem 1.25rem 4rem;
      background: var(--bg);
      color: var(--fg);
      font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue",
            "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    }
    h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 2.5rem 0 0.75rem; }
    h1 { margin-top: 0; font-size: 2rem; letter-spacing: -0.02em; }
    h2 { font-size: 1.25rem; padding-bottom: 0.3rem; border-bottom: 1px solid var(--line); }
    p { margin: 0 0 1rem; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    ul, ol { margin: 0 0 1rem; padding-left: 1.5rem; }
    li { margin: 0.2rem 0; }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.88em;
      padding: 0.1em 0.35em;
      border-radius: 4px;
      background: color-mix(in srgb, var(--fg) 8%, transparent);
    }
    pre {
      margin: 0 0 1rem;
      padding: 0.85rem 1rem;
      overflow-x: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    pre code { padding: 0; background: none; font-size: 0.85rem; }`;

/**
 * Renders a README as the page served at the site root.
 *
 * @param markdown - Markdown source, normally `README.md`.
 * @param options - Document language, title override, and link rebasing.
 * @returns A complete HTML document.
 */
export function renderReadmePage(markdown: string, options: ReadmePageOptions = {}): string {
    const lang = options.lang ?? 'en';
    const title = options.title ?? readmeTitle(markdown);
    const body = renderMarkdown(markdown, { linkBase: options.linkBase });

    return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${PAGE_STYLE}
</style>
</head>
<body>
${body}
</body>
</html>
`;
}
