import { defineConfig, type DefaultTheme } from 'vitepress';

const FOOTER: DefaultTheme.Config['footer'] = {
    message: '本文档由 AI 协助生成 / This documentation was prepared with AI assistance',
};

const enNav: DefaultTheme.NavItem[] = [
    { text: 'Guide', link: '/en/guide/', activeMatch: '/en/guide/' },
    { text: 'Reference', link: '/en/reference/', activeMatch: '/en/reference/' },
    { text: 'Design', link: '/en/design/', activeMatch: '/en/design/' },
    { text: 'Community', link: '/en/community/', activeMatch: '/en/community/' },
];

const enSidebar: DefaultTheme.Sidebar = [
    {
        text: 'Guide',
        items: [
            { text: 'Overview', link: '/en/guide/' },
            { text: 'Getting Started', link: '/en/guide/getting-started' },
            { text: 'Skill', link: '/en/guide/skill' },
        ],
    },
    {
        text: 'Reference',
        items: [
            { text: 'Overview', link: '/en/reference/' },
            { text: 'API', link: '/en/reference/api' },
            { text: 'JsMind', link: '/en/reference/api/jsmind' },
            { text: 'JmMind', link: '/en/reference/api/mind' },
            { text: 'Nodes', link: '/en/reference/api/node' },
            { text: 'Edges', link: '/en/reference/api/edge' },
            { text: 'Options', link: '/en/reference/api/options' },
            { text: 'Serialization', link: '/en/reference/api/serialization' },
            { text: 'Image export', link: '/en/reference/api/export' },
            { text: 'Style and theme', link: '/en/reference/api/style' },
            { text: 'CLI', link: '/en/reference/cli' },
            { text: 'Data Format', link: '/en/reference/data-format' },
        ],
    },
    {
        text: 'Design',
        items: [
            { text: 'Overview', link: '/en/design/' },
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
    { text: '参考', link: '/zh/reference/', activeMatch: '/zh/reference/' },
    { text: '设计', link: '/zh/design/', activeMatch: '/zh/design/' },
    { text: '社区', link: '/zh/community/', activeMatch: '/zh/community/' },
];

const zhSidebar: DefaultTheme.Sidebar = [
    {
        text: '指南',
        items: [
            { text: '概述', link: '/zh/guide/' },
            { text: '快速上手', link: '/zh/guide/getting-started' },
            { text: 'Skill', link: '/zh/guide/skill' },
        ],
    },
    {
        text: '参考',
        items: [
            { text: '概述', link: '/zh/reference/' },
            { text: 'API', link: '/zh/reference/api' },
            { text: 'JsMind', link: '/zh/reference/api/jsmind' },
            { text: 'JmMind', link: '/zh/reference/api/mind' },
            { text: '节点', link: '/zh/reference/api/node' },
            { text: '边', link: '/zh/reference/api/edge' },
            { text: '选项', link: '/zh/reference/api/options' },
            { text: '序列化', link: '/zh/reference/api/serialization' },
            { text: '图片导出', link: '/zh/reference/api/export' },
            { text: '样式与主题', link: '/zh/reference/api/style' },
            { text: 'CLI', link: '/zh/reference/cli' },
            { text: '数据格式', link: '/zh/reference/data-format' },
        ],
    },
    {
        text: '设计',
        items: [
            { text: '概述', link: '/zh/design/' },
        ],
    },
    {
        text: '社区',
        items: [
            { text: '概述', link: '/zh/community/' },
        ],
    },
];

export default defineConfig({
    base: '/jsmind-v2/docs/',
    srcExclude: [
        'README.md',
        'architecture/**',
        'features/**',
        'requirements/**',
        'images/**',
    ],
    title: 'jsMind V2',
    lastUpdated: false,
    locales: {
        en: {
            label: 'English',
            lang: 'en',
            description: 'The next generation of jsMind: a mind-map kernel for people and agents.',
            themeConfig: {
                nav: enNav,
                sidebar: enSidebar,
                footer: FOOTER,
                outline: { label: 'On this page' },
            },
        },
        zh: {
            label: '简体中文',
            lang: 'zh-CN',
            description: 'jsMind 的下一代：面向人与 agent 的思维导图内核。',
            themeConfig: {
                nav: zhNav,
                sidebar: zhSidebar,
                footer: FOOTER,
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
        siteTitle: 'jsMind V2',
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
