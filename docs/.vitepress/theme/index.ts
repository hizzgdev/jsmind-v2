import DefaultTheme from 'vitepress/theme';
import { inBrowser, useData } from 'vitepress';
import type { Theme } from 'vitepress';
import { watchEffect } from 'vue';

/** Persists the last chosen docs locale so `/docs/` can restore it. */
export const DOCS_LANG_STORAGE_KEY = 'jsmind-docs-lang';

const theme: Theme = {
    extends: DefaultTheme,
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
