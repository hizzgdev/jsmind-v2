import DefaultTheme from 'vitepress/theme';
import { inBrowser, useData } from 'vitepress';
import type { Theme } from 'vitepress';
import { h, watchEffect } from 'vue';
import { createSectionLinks } from './section-links';
import './custom.css';

/** Persists the last chosen locale so `/tutorials/` can restore it. */
export const TUTORIALS_LANG_STORAGE_KEY = 'jsmind-docs-lang';

/**
 * Shown on every tutorial page, including those with a sidebar.
 * VitePress hides `themeConfig.footer` when a sidebar is present.
 */
export const AI_ASSISTANCE_NOTICE = '本文档由 AI 协助生成 / This documentation was prepared with AI assistance';

export const AI_ASSISTANCE_NOTICE_CLASS = 'jsmind-docs-ai-notice';

/**
 * The tutorials share the docs site's language key, notice and header, so a
 * reader who switched language in one site is greeted in the same language by
 * the other. The stylesheet, the notice element and the section links are
 * copies of the docs theme; a page that lost one of them fails
 * `__tests__/build/pages-site.test.ts`.
 */

/** The header of the tutorials site: current section is Tutorials. */
const SectionLinks = createSectionLinks('tutorials');

const theme: Theme = {
    extends: DefaultTheme,
    Layout: () => h(DefaultTheme.Layout, null, {
        // The two published columns, in the nav bar and at the top of the
        // mobile menu. Above 768px the bar shows them beside the title; below
        // it VitePress hides the bar's content, so the menu carries the same
        // links and the header keeps its two columns on a phone.
        'nav-bar-content-before': () => h(SectionLinks, { class: 'jsmind-section-links-bar' }),
        'nav-screen-content-before': () => h(SectionLinks, { class: 'jsmind-section-links-screen' }),
        'layout-bottom': () => h('p', { class: AI_ASSISTANCE_NOTICE_CLASS }, AI_ASSISTANCE_NOTICE),
    }),
    setup() {
        if (!inBrowser) {
            return;
        }

        const { localeIndex } = useData();
        watchEffect(() => {
            const locale = localeIndex.value;
            if (locale === 'en' || locale === 'zh') {
                localStorage.setItem(TUTORIALS_LANG_STORAGE_KEY, locale);
            }
        });
    },
};

export default theme;
