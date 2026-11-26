import { defineConfig, type DefaultTheme } from 'vitepress';

import { DOCS_URL, HOME_URL, TUTORIALS_BASE } from '../../site.config.mjs';
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
 * The header is the one on all three faces: the title names this face
 * (`jsMind V2 Tutorials`) and leads into the column's own index, and the nav
 * carries the two things reachable from here — the docs site and the product
 * page. The tutorials are one column, so there is no in-site section list to go
 * before them the way there is on the docs site. VitePress appends the language
 * menu, the appearance switch and the GitHub link to the same row by itself.
 *
 * Both addresses come from `site.config.mjs`, which holds the origin, the
 * mount path and the derived `*_BASE` / `*_URL` pairs. `*_BASE` is a path and
 * `*_URL` is an absolute address: only the former can be handed to VitePress,
 * only the latter survives a link on a page of unknown depth.
 *
 * The docs entry opens in a new tab, the way the tutorials entry in the docs
 * nav and both column entries on the product page do.
 *
 * The repository has no copy of the site icons: `scripts/assemble-site.ts`
 * copies `docs/public/` beside both built sites, so the one checked-in copy
 * stays the only one.
 */

const enNav: DefaultTheme.NavItem[] = [
    {
        text: 'Docs',
        link: `${DOCS_URL}en/`,
        target: '_blank',
        rel: 'noopener noreferrer',
    },
    // `target: '_self'`: Home stays in this tab (VPLink opens an absolute href
    // in a new one otherwise), and the attribute is what keeps VitePress's
    // router from intercepting the click.
    { text: 'Home', link: HOME_URL, target: '_self' },
];

const zhNav: DefaultTheme.NavItem[] = [
    {
        text: '文档',
        link: `${DOCS_URL}zh/`,
        target: '_blank',
        rel: 'noopener noreferrer',
    },
    { text: '首页', link: HOME_URL, target: '_self' },
];

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
                nav: enNav,
                outline: { label: 'On this page' },
                // `logoLink` is used verbatim — VitePress does not run it
                // through `withBase` — so the mount path is written out in full,
                // and each locale links its own column index.
                logoLink: { link: `${TUTORIALS_BASE}en/` },
            },
        },
        zh: {
            label: '简体中文',
            lang: 'zh-CN',
            description: 'jsMind V2 教程：一个具体技巧，或者一个带示例文件的完整场景。',
            themeConfig: {
                nav: zhNav,
                outline: { label: '本页目录' },
                logoLink: { link: `${TUTORIALS_BASE}zh/` },
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
        // The title names this face, the same way the product page and the docs
        // site name theirs: three tabs and three headers, one product. Each
        // locale's own `themeConfig` sets `logoLink`, so the title leads into
        // that locale's column index and not to a second copy of the product
        // page.
        siteTitle: 'jsMind V2 Tutorials',
        logo: '/favicon.svg',
        socialLinks: [
            { icon: 'github', link: 'https://github.com/hizzgdev/jsmind-v2' },
        ],
    },
});
