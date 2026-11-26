import { defineConfig } from 'vitepress';

import { HOME_URL, TUTORIALS_BASE } from '../../site.config.mjs';
import { tutorialAssetOverrides } from './asset-overrides';

/**
 * The tutorials are a second VitePress site, published beside the docs site.
 *
 * The docs site keeps its own base — those URLs are already published, so the
 * tutorials cannot be a route inside it. This site is built into
 * `_site/tutorials` instead, with its own base, and cross-links between the
 * two sites are absolute because a `link` starting with `/` is prefixed with
 * this site's base by VitePress.
 *
 * There is no nav here: the column's identity comes from the header's section
 * links (`theme/section-links.ts`), which name both columns and mark the one
 * the reader is in, so a "Docs" nav entry would be a second copy of the same
 * link. The columns are the sections; the nav would only repeat them.
 *
 * Both addresses come from `site.config.mjs`, which holds the origin, the
 * mount path and the derived `*_BASE` / `*_URL` pairs. `*_BASE` is a path and
 * `*_URL` is an absolute address: only the former can be handed to VitePress,
 * only the latter survives a link on a page of unknown depth.
 *
 * The repository has no copy of the site icons: `scripts/assemble-site.ts`
 * copies `docs/public/` beside both built sites, so the one checked-in copy
 * stays the only one.
 */

export default defineConfig({
    base: TUTORIALS_BASE,
    head: [
        ['link', { rel: 'icon', type: 'image/svg+xml', href: `${TUTORIALS_BASE}favicon.svg` }],
        ['link', { rel: 'apple-touch-icon', href: `${TUTORIALS_BASE}favicon.png` }],
    ],
    // The template is a source for the next phase, not a page in the column.
    srcExclude: [
        '_template.md',
    ],
    vite: {
        // `.jm` example maps are downloaded from the article, so they have
        // to be treated as assets the same way the PNGs are. The override
        // plugin rewrites a shared `assets/` path to a locale file when
        // one exists, without touching the checked-in shared copy.
        // Vite would otherwise inline a small `.jm` as a data: URL, which
        // is a poor download target, so those files are always emitted.
        assetsInclude: ['**/*.jm'],
        plugins: [tutorialAssetOverrides()],
        build: {
            assetsInlineLimit(filePath) {
                if (filePath.endsWith('.jm')) {
                    return false;
                }
                return undefined;
            },
        },
    },
    title: 'jsMind V2 Tutorials',
    lastUpdated: false,
    locales: {
        en: {
            label: 'English',
            lang: 'en',
            description: 'Tutorials for jsMind V2: a technique, or a complete scenario with example files.',
            themeConfig: {
                outline: { label: 'On this page' },
            },
        },
        zh: {
            label: '简体中文',
            lang: 'zh-CN',
            description: 'jsMind V2 教程：一个具体技巧，或者一个带示例文件的完整场景。',
            themeConfig: {
                outline: { label: '本页目录' },
                docFooter: {
                    prev: '上一页',
                    next: '下一页',
                },
                darkModeSwitchLabel: '外观',
                lightModeSwitchTitle: '切换到浅色模式',
                darkModeSwitchTitle: '切换到深色模式',
                sidebarMenuLabel: '菜单',
                returnToTopLabel: '回到顶部',
                langMenuLabel: '切换语言',
            },
        },
    },
    themeConfig: {
        // The same product name as the product page and the docs site: which
        // column the reader is in comes from the section links, not from a
        // second product name in the title.
        siteTitle: 'jsMind V2',
        logo: '/favicon.svg',
        logoLink: { link: HOME_URL },
        socialLinks: [
            { icon: 'github', link: 'https://github.com/hizzgdev/jsmind-v2' },
        ],
    },
});
