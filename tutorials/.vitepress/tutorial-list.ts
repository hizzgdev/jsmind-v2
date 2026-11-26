/**
 * @fileoverview Turns VitePress content records into a date-sorted list.
 *
 * The English and Chinese column indexes each have a `posts.data.ts` that
 * loads the posts markdown for that language. This helper keeps the sort and the shape in one
 * place so the two pages cannot drift.
 */

import type { ContentData } from 'vitepress';

/** One row on a tutorials index page. */
export interface TutorialListItem {
    title: string;
    date: string;
    tags: string[];
    url: string;
}

/**
 * Drops posts that are missing a title or a date, then sorts by date,
 * newest first, and by title when two dates match.
 *
 * @param raw - Records from `createContentLoader`.
 * @returns The list the index page renders.
 */
export function toTutorialList(raw: ContentData[]): TutorialListItem[] {
    const items: TutorialListItem[] = [];
    for (const post of raw) {
        const title = asString(post.frontmatter.title);
        const date = asDate(post.frontmatter.date);
        if (title === null || date === null) {
            continue;
        }
        const tags = Array.isArray(post.frontmatter.tags)
            ? post.frontmatter.tags.map((tag) => String(tag))
            : [];
        items.push({ title, date, tags, url: post.url });
    }
    return items.sort((a, b) => {
        const dates = b.date.localeCompare(a.date);
        return dates !== 0 ? dates : a.title.localeCompare(b.title);
    });
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value !== '' ? value : null;
}

function asDate(value: unknown): string | null {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return null;
}
