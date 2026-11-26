import DefaultTheme from 'vitepress/theme';
import { inBrowser, useData } from 'vitepress';
import type { Theme } from 'vitepress';
import { h, watchEffect } from 'vue';
import './custom.css';

/** Persists the last chosen docs locale so `/docs/` can restore it. */
export const DOCS_LANG_STORAGE_KEY = 'jsmind-docs-lang';

/**
 * Shown on every docs page, including those with a sidebar.
 * VitePress hides `themeConfig.footer` when a sidebar is present.
 */
export const AI_ASSISTANCE_NOTICE = '本文档由 AI 协助生成 / This documentation was prepared with AI assistance';

export const AI_ASSISTANCE_NOTICE_CLASS = 'jsmind-docs-ai-notice';

/** The header of the docs site: the nav names this face and the columns. */
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
                localStorage.setItem(DOCS_LANG_STORAGE_KEY, locale);
            }
        });
    },
};

export default theme;
