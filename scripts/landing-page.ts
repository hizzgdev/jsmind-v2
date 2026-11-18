/**
 * @fileoverview Content and renderer for the site landing page.
 *
 * `scripts/assemble-site.ts` renders this page into `_site/index.html`; no
 * landing page exists in the source tree. The copy is hand-maintained here
 * rather than derived from `README.md`: the README serves developers working
 * in the repository (install, API, contributing), while the landing page
 * serves site visitors (what this is, where to try it, where to read).
 *
 * No markdown or template engine is involved. The content is a typed object
 * and `renderLandingPage` is the only function that turns it into HTML.
 * Feature copy that needs an identifier wraps it in a `{ code }` segment, so
 * every literal string still goes through `escapeHtml`.
 */

/** A link in the action row. */
export interface LandingAction {
    /** Link text. */
    readonly label: string;
    /** Target. Site pages stay relative; off-site targets are absolute. */
    readonly href: string;
    /** Renders as the filled button. At most one action sets this. */
    readonly primary?: boolean;
}

/** Feature copy: literal text, or an identifier rendered as `<code>`. */
export type LandingText = string | { readonly code: string };

/** One row of the feature list. */
export interface LandingFeature {
    /** Short label in the term column. */
    readonly term: string;
    /** Inline copy, in order. */
    readonly detail: readonly LandingText[];
}

/** Everything `renderLandingPage` reads. */
export interface LandingPageContent {
    /** Document language. */
    readonly lang: string;
    /** Page title, also the heading prefix. */
    readonly title: string;
    /** Muted text after the heading. */
    readonly kicker: string;
    /** The one-sentence positioning line. */
    readonly lead: string;
    /** Entry links, in display order. */
    readonly actions: readonly LandingAction[];
    /** Feature rows, in display order. */
    readonly features: readonly LandingFeature[];
}

/** Landing page copy. This is the only place the page text lives. */
export const LANDING_PAGE: LandingPageContent = {
    lang: 'zh-CN',
    title: 'jsMind V2',
    kicker: '思维导图内核',
    lead: '面向人与 agent 的思维导图内核 —— 人能查看、编辑、导出，agent 能可靠地生成、读取、修改结构化导图。',
    actions: [
        { label: '打开 Playground', href: 'playground.html', primary: true },
        { label: 'GitHub 仓库', href: 'https://github.com/hizzgdev/jsmind-v2' },
        { label: '文档', href: 'https://hizzgdev.github.io/jsmind-v2/docs/' },
    ],
    features: [
        {
            term: '数据格式',
            detail: [
                'JSON，带 ',
                { code: 'format' },
                ' / ',
                { code: 'theme' },
                ' / ',
                { code: 'style' },
                ' 字段。这是一次重写，目前还不是 v1 的即插即用替代',
            ],
        },
        {
            term: '校验',
            detail: ['22 个错误码，写后校验失败逐字节回滚'],
        },
        {
            term: '渲染',
            detail: ['Shadow DOM 隔离、主题变量、贝塞尔连线、节点级样式'],
        },
        {
            term: '导出',
            detail: ['PNG / JPEG / WebP，走 ', { code: 'jsMind.exportImage()' }, ' 或 CLI'],
        },
        {
            term: '命令行',
            detail: [
                { code: 'jsmind validate' },
                ' · ',
                { code: 'jsmind export' },
                ' · ',
                { code: 'jsmind mind' },
                ' / ',
                { code: 'node' },
                ' 增删改',
            ],
        },
    ],
};

/** Stylesheet for the landing page, inlined into the generated document. */
export const LANDING_PAGE_STYLES = `  :root {
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
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
    color: var(--fg);
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue",
          "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  }
  main {
    width: min(680px, calc(100% - 3rem));
    padding: 2rem 0;
  }
  h1 {
    margin: 0 0 .5rem;
    font-size: 2.25rem;
    letter-spacing: -.02em;
  }
  .version {
    font-size: .95rem;
    font-weight: 400;
    color: var(--muted);
    letter-spacing: 0;
  }
  p.lead {
    margin: 0 0 2.5rem;
    color: var(--muted);
    font-size: 1.05rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: .75rem;
    margin-bottom: 3rem;
  }
  a.button {
    display: inline-block;
    padding: .7rem 1.4rem;
    border-radius: 8px;
    border: 1px solid var(--line);
    color: var(--fg);
    text-decoration: none;
    font-weight: 500;
    transition: border-color .15s, color .15s;
  }
  a.button:hover { border-color: var(--accent); color: var(--accent); }
  a.button.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  a.button.primary:hover { filter: brightness(1.1); color: #fff; }
  dl {
    margin: 0;
    border-top: 1px solid var(--line);
  }
  dl > div {
    display: flex;
    gap: 1rem;
    padding: .85rem 0;
    border-bottom: 1px solid var(--line);
  }
  dt {
    flex: 0 0 7rem;
    color: var(--muted);
    font-size: .9rem;
  }
  dd {
    margin: 0;
    font-size: .9rem;
  }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: .88em;
    padding: .1em .35em;
    border-radius: 4px;
    background: color-mix(in srgb, var(--fg) 8%, transparent);
  }
`;

const HTML_ESCAPES: Readonly<Record<string, string>> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;',
};

/**
 * Escapes text for use in HTML body content or a double-quoted attribute.
 *
 * @param text - Untrusted text.
 * @returns The text with `&`, `<`, `>`, `"`, and `'` replaced by entities.
 */
export function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/**
 * Renders one feature's inline copy.
 *
 * @param segments - Literal text and `{ code }` segments, in order.
 * @returns HTML with identifiers wrapped in `<code>`.
 */
export function renderLandingText(segments: readonly LandingText[]): string {
    const parts = segments.map((segment) =>
        typeof segment === 'string' ? escapeHtml(segment) : `<code>${escapeHtml(segment.code)}</code>`);
    return parts.join('');
}

/**
 * Renders the landing page served at the site root.
 *
 * @param content - Page content. Defaults to `LANDING_PAGE`.
 * @returns A complete HTML document.
 */
export function renderLandingPage(content: LandingPageContent = LANDING_PAGE): string {
    const actions = content.actions.map((action) => {
        const className = action.primary === true ? 'button primary' : 'button';
        return `    <a class="${className}" href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>`;
    });

    const features = content.features.map((feature) =>
        [
            '    <div>',
            `      <dt>${escapeHtml(feature.term)}</dt>`,
            `      <dd>${renderLandingText(feature.detail)}</dd>`,
            '    </div>',
        ].join('\n'));

    return `<!DOCTYPE html>
<html lang="${escapeHtml(content.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(content.title)}</title>
<style>
${LANDING_PAGE_STYLES}</style>
</head>
<body>
<main>
  <h1>${escapeHtml(content.title)} <span class="version">${escapeHtml(content.kicker)}</span></h1>

  <p class="lead">${escapeHtml(content.lead)}</p>

  <div class="actions">
${actions.join('\n')}
  </div>

  <dl>
${features.join('\n')}
  </dl>
</main>
</body>
</html>
`;
}
