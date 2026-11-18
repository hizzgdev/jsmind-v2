import { defineConfig, type DefaultTheme } from 'vitepress';

const enNav: DefaultTheme.NavItem[] = [
    { text: 'Guide', link: '/en/guide/', activeMatch: '/en/guide/' },
    { text: 'Design', link: '/en/design/', activeMatch: '/en/design/' },
    { text: 'Reference', link: '/en/reference/', activeMatch: '/en/reference/' },
    { text: 'Community', link: '/en/community/', activeMatch: '/en/community/' },
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

export default defineConfig({
    base: '/jsmind-v2/docs/',
    srcExclude: [
        'README.md',
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
