import { defineConfig, type DefaultTheme } from 'vitepress';

import { DOCS_BASE, HOME_URL, TUTORIALS_URL } from '../../site.config.mjs';

/**
 * The header is the one on all three faces (product page, docs, tutorials):
 * the title names the face, and the nav to the right carries everything the
 * reader can reach from here.
 *
 * The title leads into this face's own entry — the guide for the docs, the
 * column index for the tutorials — and the way back to the product page is the
 * Home entry in the nav. (The product page's own title leads to itself, so the
 * rule is the same on all three.)
 *
 * The nav is the whole right-hand side, in this order: the four in-site
 * sections, the other published column, then the way back to the product
 * page. VitePress appends the language menu, the appearance switch and the
 * GitHub link to the same row by itself, so nothing here has to place them.
 *
 * The tutorials entry and Home are absolute addresses from
 * `site.config.mjs`. A nav `link` starting with `/` is prefixed with this
 * site's `base`, so `/jsmind-v2/tutorials/` would publish as
 * `/jsmind-v2/docs/jsmind-v2/tutorials/`; anything that leaves this site has
 * to be written out in full.
 *
 * The tutorials entry opens in a new tab — a reader keeps the page they were
 * reading when they glance at a tutorial — and the product page and the
 * tutorials site carry the same `target`/`rel` on their cross-site entries.
 */

const enNav: DefaultTheme.NavItem[] = [
    { text: 'Guide', link: '/en/guide/', activeMatch: '/en/guide/' },
    { text: 'Design', link: '/en/design/', activeMatch: '/en/design/' },
    { text: 'Reference', link: '/en/reference/', activeMatch: '/en/reference/' },
    { text: 'Community', link: '/en/community/', activeMatch: '/en/community/' },
    {
        text: 'Tutorials',
        link: `${TUTORIALS_URL}en/`,
        target: '_blank',
        rel: 'noopener noreferrer',
    },
    // `target: '_self'` keeps Home in this tab. The address is absolute, and
    // VPLink opens an external href in a new tab unless a `target` says
    // otherwise; the attribute is also what stops VitePress's router from
    // intercepting the click and routing the product page into this site.
    { text: 'Home', link: HOME_URL, target: '_self' },
];

const enSidebar: DefaultTheme.Sidebar = [
    {
        text: 'Guide',
        items: [
            { text: 'Overview', link: '/en/guide/' },
            { text: 'Getting Started', link: '/en/guide/getting-started' },
            { text: 'Skill', link: '/en/guide/skill' },
            { text: 'CLI', link: '/en/guide/cli' },
        ],
    },
    {
        text: 'Design',
        items: [
            { text: 'Overview', link: '/en/design/' },
            { text: 'Layout system', link: '/en/design/layout-system' },
            { text: 'Theme system', link: '/en/design/theme-system' },
            { text: 'Hybrid edge system', link: '/en/design/hybrid-edge-system' },
        ],
    },
    {
        text: 'Reference',
        items: [
            { text: 'Overview', link: '/en/reference/' },
            {
                text: 'API',
                collapsed: false,
                items: [
                    { text: 'API quick start', link: '/en/reference/api' },
                    { text: 'JsMind', link: '/en/reference/api/jsmind' },
                    { text: 'JmMind', link: '/en/reference/api/mind' },
                    { text: 'Nodes', link: '/en/reference/api/node' },
                    { text: 'Edges', link: '/en/reference/api/edge' },
                    { text: 'Options', link: '/en/reference/api/options' },
                    { text: 'Serialization', link: '/en/reference/api/serialization' },
                    { text: 'Image export', link: '/en/reference/api/export' },
                    { text: 'Style and theme', link: '/en/reference/api/style' },
                ],
            },
            {
                text: 'Features',
                collapsed: false,
                items: [
                    { text: 'Node content', link: '/en/reference/node-content' },
                    { text: 'Moving nodes', link: '/en/reference/node-move' },
                    { text: 'Image export', link: '/en/reference/image-export' },
                    { text: 'Serialization', link: '/en/reference/serialization' },
                ],
            },
            { text: 'Data Format', link: '/en/reference/data-format' },
        ],
    },
    {
        text: 'Community',
        items: [
            { text: 'Overview', link: '/en/community/' },
        ],
    },
];

const zhNav: DefaultTheme.NavItem[] = [
    { text: '指南', link: '/zh/guide/', activeMatch: '/zh/guide/' },
    { text: '设计', link: '/zh/design/', activeMatch: '/zh/design/' },
    { text: '参考', link: '/zh/reference/', activeMatch: '/zh/reference/' },
    { text: '社区', link: '/zh/community/', activeMatch: '/zh/community/' },
    {
        text: '教程',
        link: `${TUTORIALS_URL}zh/`,
        target: '_blank',
        rel: 'noopener noreferrer',
    },
    { text: '首页', link: HOME_URL, target: '_self' },
];

const zhSidebar: DefaultTheme.Sidebar = [
    {
        text: '指南',
        items: [
            { text: '概述', link: '/zh/guide/' },
            { text: '快速上手', link: '/zh/guide/getting-started' },
            { text: 'Skill', link: '/zh/guide/skill' },
            { text: 'CLI', link: '/zh/guide/cli' },
        ],
    },
    {
        text: '设计',
        items: [
            { text: '概述', link: '/zh/design/' },
            { text: '布局系统', link: '/zh/design/layout-system' },
            { text: '主题系统', link: '/zh/design/theme-system' },
            { text: '混合边系统', link: '/zh/design/hybrid-edge-system' },
        ],
    },
    {
        text: '参考',
        items: [
            { text: '概述', link: '/zh/reference/' },
            {
                text: 'API',
                collapsed: false,
                items: [
                    { text: 'API 快速上手', link: '/zh/reference/api' },
                    { text: 'JsMind', link: '/zh/reference/api/jsmind' },
                    { text: 'JmMind', link: '/zh/reference/api/mind' },
                    { text: '节点', link: '/zh/reference/api/node' },
                    { text: '边', link: '/zh/reference/api/edge' },
                    { text: '选项', link: '/zh/reference/api/options' },
                    { text: '序列化', link: '/zh/reference/api/serialization' },
                    { text: '图片导出', link: '/zh/reference/api/export' },
                    { text: '样式与主题', link: '/zh/reference/api/style' },
                ],
            },
            {
                text: '功能说明',
                collapsed: false,
                items: [
                    { text: '节点内容', link: '/zh/reference/node-content' },
                    { text: '节点移动', link: '/zh/reference/node-move' },
                    { text: '导出图片', link: '/zh/reference/image-export' },
                    { text: '序列化', link: '/zh/reference/serialization' },
                ],
            },
            { text: '数据格式', link: '/zh/reference/data-format' },
        ],
    },
    {
        text: '社区',
        items: [
            { text: '概述', link: '/zh/community/' },
        ],
    },
];

/**
 * The site is published under a sub-path of its origin, not at the domain
 * root; the mount path lives in `site.config.mjs` with the origin.
 *
 * VitePress prefixes only the assets it generates itself: a `head` entry's
 * `href` is emitted verbatim (vitepress 1.6.4 `renderHead`). A bare
 * `/favicon.svg` would therefore resolve one level above the base and 404, so
 * the one copy of the base feeds both `base` and the icon hrefs.
 */

export default defineConfig({
    base: DOCS_BASE,
    // The icons live in `docs/public/`, which VitePress copies to the output
    // root, and are addressed from the base because of the note above.
    head: [
        ['link', { rel: 'icon', type: 'image/svg+xml', href: `${DOCS_BASE}favicon.svg` }],
        ['link', { rel: 'apple-touch-icon', href: `${DOCS_BASE}favicon.png` }],
    ],
    srcExclude: [
        'README.md',
        'requirements/**',
        'images/**',
    ],
    title: 'jsMind V2 Docs',
    lastUpdated: false,
    locales: {
        en: {
            label: 'English',
            lang: 'en',
            description: 'The next generation of jsMind: a mind-map kernel for people and agents.',
            themeConfig: {
                nav: enNav,
                sidebar: enSidebar,
                outline: { label: 'On this page' },
                // The title leads into this locale's column entry. `logoLink`
                // is used verbatim — VitePress does not run it through
                // `withBase` — so the mount path has to be written out in full.
                logoLink: { link: `${DOCS_BASE}en/guide/` },
            },
        },
        zh: {
            label: '简体中文',
            lang: 'zh-CN',
            description: 'jsMind 的下一代：面向人与 agent 的思维导图内核。',
            themeConfig: {
                nav: zhNav,
                sidebar: zhSidebar,
                outline: { label: '本页目录' },
                logoLink: { link: `${DOCS_BASE}zh/guide/` },
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
        // Each face names itself in the title: the product page says jsMind V2,
        // this site says jsMind V2 Docs, the tutorials say jsMind V2 Tutorials.
        // A reader in a tab or a search result can tell the three apart, and
        // the column the header used to mark with a link is now the title.
        siteTitle: 'jsMind V2 Docs',
        // The icon is `docs/public/favicon.svg`, published at this site's
        // root. VitePress resolves a `logo` through `withBase`, so the base-less
        // path is right here; the tutorials site gets the same file.
        logo: '/favicon.svg',
        // `logoLink` is not per-locale here: each locale's own `themeConfig`
        // sets it, because the title leads into that locale's column entry and
        // the two addresses differ.
        socialLinks: [
            { icon: 'github', link: 'https://github.com/hizzgdev/jsmind-v2' },
        ],
        search: {
            provider: 'local',
            options: {
                locales: {
                    zh: {
                        translations: {
                            button: {
                                buttonText: '搜索文档',
                                buttonAriaLabel: '搜索文档',
                            },
                            modal: {
                                noResultsText: '无法找到相关结果',
                                resetButtonTitle: '清除查询条件',
                                footer: {
                                    selectText: '选择',
                                    navigateText: '切换',
                                    closeText: '关闭',
                                },
                            },
                        },
                    },
                },
            },
        },
    },
});
