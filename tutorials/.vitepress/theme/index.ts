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
 *
 * One sentence per locale: the page renders the one matching its language, so
 * an English page never carries the Chinese sentence and the other way round.
 */
export const AI_ASSISTANCE_NOTICE = {
    en: 'This documentation was prepared with AI assistance',
    zh: '本文档由 AI 协助生成',
};

export const AI_ASSISTANCE_NOTICE_CLASS = 'jsmind-docs-ai-notice';

/**
 * The notice for a page's locale. `localeIndex` is `'root'` on the site root,
 * which has no language of its own, so every locale other than `zh` reads as
 * English.
 */
function noticeForLocale(localeIndex: string): string {
    return AI_ASSISTANCE_NOTICE[localeIndex as keyof typeof AI_ASSISTANCE_NOTICE] ?? AI_ASSISTANCE_NOTICE.en;
}

/**
 * The tutorials share the docs site's language key and notice, so a reader who
 * switched language in one site is greeted in the same language by the other.
 * The stylesheet and the notice element are copies of the docs theme; a page
 * that lost one of them fails `__tests__/build/pages-site.test.ts`.
 */
const theme: Theme = {
    extends: DefaultTheme,
    Layout: () => {
        const { localeIndex } = useData();
        return h(DefaultTheme.Layout, null, {
            // `localeIndex` has to be read inside the render function: a
            // sentence computed out here would be frozen at the first render
            // and would not follow a language switch.
            'layout-bottom': () => h('p', { class: AI_ASSISTANCE_NOTICE_CLASS }, noticeForLocale(localeIndex.value)),
        });
    },
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
