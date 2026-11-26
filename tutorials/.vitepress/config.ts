import { defineConfig, type DefaultTheme } from 'vitepress';

/**
 * The tutorials are a second VitePress site, published beside the docs site.
 *
 * The docs site keeps `base: '/jsmind-v2/docs/'` — those URLs are already
 * published, so the tutorials cannot be a route inside it. This site is built
 * into `_site/tutorials` instead, with its own base, and cross-links between
 * the two sites are absolute because a `link` starting with `/` is prefixed
 * with this site's base by VitePress.
 *
 * The repository has no copy of the site icons: `scripts/assemble-site.ts`
 * copies `docs/public/` beside both built sites, so the one checked-in copy
 * stays the only one.
 */
const BASE = '/jsmind-v2/tutorials/';

const SITE_BASE = 'https://hizzgdev.github.io/jsmind-v2/';
const DOCS_SITE = `${SITE_BASE}docs/`;

const enNav: DefaultTheme.NavItem[] = [
    { text: 'Docs', link: `${DOCS_SITE}en/` },
];

const zhNav: DefaultTheme.NavItem[] = [
    { text: '文档', link: `${DOCS_SITE}zh/` },
];

export default defineConfig({
    base: BASE,
    head: [
        ['link', { rel: 'icon', type: 'image/svg+xml', href: `${BASE}favicon.svg` }],
        ['link', { rel: 'apple-touch-icon', href: `${BASE}favicon.png` }],
    ],
    // The template is a source for the next phase, not a page in the column.
    srcExclude: [
        '_template.md',
    ],
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
            },
        },
        zh: {
            label: '简体中文',
            lang: 'zh-CN',
            description: 'jsMind V2 教程：一个具体技巧，或者一个带示例文件的完整场景。',
            themeConfig: {
                nav: zhNav,
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
        siteTitle: 'jsMind Tutorials',
        socialLinks: [
            { icon: 'github', link: 'https://github.com/hizzgdev/jsmind-v2' },
        ],
    },
});
