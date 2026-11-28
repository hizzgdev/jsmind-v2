/**
 * @fileoverview `toTutorialList()` breaks a same-date tie the way
 * `scripts/tutorial-posts.ts` does, so the tutorials column and the front page
 * cannot disagree on a day with two posts.
 *
 * The two lists are built by different code paths — the column from a VitePress
 * content loader, the front page from `scripts/` — so nothing but this test
 * compares their tie-break keys. The fixture puts the titles in the opposite
 * order to the urls: a rule that sorts by title returns the list reversed.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ContentData } from 'vitepress';

import { toTutorialList } from '../../tutorials/.vitepress/tutorial-list.ts';

describe('toTutorialList', () => {
    it('breaks a same-date tie by the post path, not the title', () => {
        const raw = [
            {
                url: '/en/posts/163-a-same-day-post.html',
                frontmatter: { title: 'Alpha title', date: '2026-11-26' },
            },
            {
                url: '/en/posts/162-color-nodes-with-tones.html',
                frontmatter: { title: 'Zeta title', date: '2026-11-26' },
            },
        ];
        assert.deepStrictEqual(
            toTutorialList(raw as unknown as ContentData[]).map((item) => item.url),
            ['/en/posts/162-color-nodes-with-tones.html', '/en/posts/163-a-same-day-post.html'],
            'a same-date tie should come out in the order scripts/tutorial-posts.ts produces'
        );
    });
});
