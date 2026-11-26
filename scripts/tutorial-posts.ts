/**
 * @fileoverview Lists published tutorial posts for the product front page.
 *
 * Each article lives twice, as the same `<id>-<slug>.md` file under
 * tutorials/en/posts and tutorials/zh/posts, with `title`, `id` and `date`
 * in the frontmatter.
 * The column index is built by VitePress; this module exists so the root
 * page, which is plain HTML, can show the two or three newest posts and
 * sort them the same way the column does: by `date`, newest first.
 *
 * A missing language is not a broken link: both language hrefs point at the
 * side that exists, so the switcher never sends a reader to an empty page.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Locales the tutorials site publishes. */
export const TUTORIAL_LOCALES = ['en', 'zh'] as const;

/** A published locale of the tutorials site. */
export type TutorialLocale = (typeof TUTORIAL_LOCALES)[number];

/** How many posts the front page lists under "Recent tutorials". */
export const RECENT_TUTORIALS_LIMIT = 3;

/**
 * One tutorial as the front page needs it: a shared filename and date, plus
 * a title and href for each language that has shipped.
 */
export interface TutorialPost {
    /** Frontmatter `id`, as a string (for example `"161"`). */
    id: string;
    /** Filename without `.md`, for example `161-first-mind-map-with-skill`. */
    slug: string;
    /** Frontmatter `date` (`YYYY-MM-DD`). */
    date: string;
    /** Title in each locale that has a file. */
    titles: Partial<Record<TutorialLocale, string>>;
    /** Site-root-relative href in each locale that has a file. */
    hrefs: Partial<Record<TutorialLocale, string>>;
}

/**
 * Frontmatter fields the front page and the column list both depend on.
 */
export interface TutorialFrontmatter {
    title: string;
    id: string;
    date: string;
    tags: string[];
}

/**
 * Parses the YAML-like frontmatter of a tutorial post.
 *
 * Only the fields this column uses are read: `title`, `id`, `date`, and a
 * simple `tags` list. The parser is intentionally small so the landing page
 * does not take on a YAML library for four keys.
 *
 * @param text - File contents.
 * @param file - Path, used in error messages.
 * @returns The fields the front page needs.
 */
export function parseTutorialFrontmatter(text: string, file: string): TutorialFrontmatter {
    if (!text.startsWith('---\n')) {
        throw new Error(`missing frontmatter in ${file}`);
    }
    const end = text.indexOf('\n---\n', 4);
    if (end === -1) {
        throw new Error(`unterminated frontmatter in ${file}`);
    }

    const values = new Map<string, string>();
    const tags: string[] = [];
    let inTags = false;
    for (const line of text.slice(4, end).split('\n')) {
        const tag = /^\s*-\s+(.+?)\s*$/.exec(line);
        if (inTags && tag !== null) {
            tags.push(stripQuotes(tag[1]));
            continue;
        }
        inTags = false;
        const field = /^([A-Za-z][\w-]*)\s*:\s*(.*?)\s*$/.exec(line);
        if (field === null) {
            continue;
        }
        const [, name, raw] = field;
        if (name === 'tags' && raw === '') {
            inTags = true;
            continue;
        }
        values.set(name, stripQuotes(raw));
    }

    const title = values.get('title');
    const id = values.get('id');
    const date = values.get('date');
    if (title === undefined || title === '') {
        throw new Error(`tutorial post ${file} is missing title`);
    }
    if (id === undefined || id === '') {
        throw new Error(`tutorial post ${file} is missing id`);
    }
    if (date === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error(`tutorial post ${file} needs a YYYY-MM-DD date`);
    }

    return { title, id, date, tags };
}

/**
 * Lists every tutorial post under `tutorials/<locale>/posts/`, paired by
 * filename, sorted by date (newest first) and then by slug.
 *
 * @param root - Repository root.
 * @returns Posts ready for the front page list.
 */
export function listTutorialPosts(root: string): TutorialPost[] {
    const bySlug = new Map<string, TutorialPost>();

    for (const locale of TUTORIAL_LOCALES) {
        const dir = join(root, 'tutorials', locale, 'posts');
        if (!existsSync(dir)) {
            continue;
        }
        for (const name of readdirSync(dir)) {
            if (!name.endsWith('.md')) {
                continue;
            }
            const slug = name.slice(0, -'.md'.length);
            const file = join(dir, name);
            const matter = parseTutorialFrontmatter(readFileSync(file, 'utf8'), file);
            const current = bySlug.get(slug) ?? {
                id: matter.id,
                slug,
                date: matter.date,
                titles: {},
                hrefs: {},
            };
            if (current.id !== matter.id) {
                throw new Error(
                    `tutorial slug ${slug} has id ${current.id} in one locale and ${matter.id} in ${locale}`
                );
            }
            if (current.date !== matter.date) {
                throw new Error(
                    `tutorial slug ${slug} has date ${current.date} in one locale and ${matter.date} in ${locale}`
                );
            }
            current.titles[locale] = matter.title;
            current.hrefs[locale] = `tutorials/${locale}/posts/${slug}.html`;
            bySlug.set(slug, current);
        }
    }

    return [...bySlug.values()].sort((a, b) => {
        const dates = b.date.localeCompare(a.date);
        return dates !== 0 ? dates : a.slug.localeCompare(b.slug);
    });
}

/**
 * The two or three newest posts, in the same order as {@link listTutorialPosts}.
 *
 * @param posts - The full, already-sorted list.
 * @returns At most {@link RECENT_TUTORIALS_LIMIT} entries.
 */
export function recentTutorialPosts(posts: TutorialPost[]): TutorialPost[] {
    return posts.slice(0, RECENT_TUTORIALS_LIMIT);
}

/**
 * Markup for the front page's "Recent tutorials" list items.
 *
 * Each item carries `data-en` / `data-zh` and `data-href-en` / `data-href-zh`
 * so the existing language switcher can rewrite the title and the target.
 * If only one language has shipped, both hrefs point at that page.
 *
 * @param posts - Newest-first posts, already limited.
 * @returns Inner HTML of the `#recent-tutorials` list, or an empty string.
 */
export function renderRecentTutorialItems(posts: TutorialPost[]): string {
    return posts.map((post) => {
        const enTitle = post.titles.en ?? post.titles.zh ?? post.slug;
        const zhTitle = post.titles.zh ?? post.titles.en ?? post.slug;
        const enHref = post.hrefs.en ?? post.hrefs.zh ?? '#';
        const zhHref = post.hrefs.zh ?? post.hrefs.en ?? '#';
        return [
            '            <li>',
            `                <a href="${escapeHtml(enHref)}" data-href-en="${escapeHtml(enHref)}" data-href-zh="${escapeHtml(zhHref)}" data-en="${escapeHtml(enTitle)}" data-zh="${escapeHtml(zhTitle)}">${escapeHtml(enTitle)}</a>`,
            `                <span class="recent-date">${escapeHtml(post.date)}</span>`,
            '            </li>',
        ].join('\n');
    }).join('\n');
}

/**
 * The empty-state paragraph shown when no post has shipped yet.
 *
 * Kept here so the source page can leave a slot, and the assembled page
 * either lists posts or explains that the first ones are still being written
 * — not both, and not a leftover sentence under a real list.
 */
export const RECENT_TUTORIALS_EMPTY_HTML = [
    '            <p class="recent-empty" data-en="The first tutorials are being written. They will be listed on the tutorials page once published." data-zh="第一批教程正在撰写，发布后会出现在教程栏目里。">The first tutorials are being written. They will be listed on the tutorials page once published.</p>',
    '',
].join('\n');

function stripQuotes(value: string): string {
    if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith('\'') && value.endsWith('\''))
    ) {
        return value.slice(1, -1);
    }
    return value;
}

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}
