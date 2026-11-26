import DefaultTheme from 'vitepress/theme';
import { inBrowser, useData } from 'vitepress';
import type { Theme } from 'vitepress';
import { h, watchEffect } from 'vue';
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
 * The tutorials share the docs site's language key and notice, so a reader who
 * switched language in one site is greeted in the same language by the other.
 * The stylesheet and the notice element are copies of the docs theme; a page
 * that lost one of them fails `__tests__/build/pages-site.test.ts`.
 */
const theme: Theme = {
    extends: DefaultTheme,
    Layout: () => h(DefaultTheme.Layout, null, {
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
