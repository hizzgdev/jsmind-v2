/**
 * Generates bilingual API reference markdown from `dist/jsmind.d.ts` via TypeDoc.
 *
 * English descriptions come from JSDoc preserved in the published typings.
 * Chinese descriptions come from `scripts/docs/api-translations-zh.json`.
 * Identifiers stay in English on both locales.
 *
 * Run through `npm run docs:api` (that script builds the library first).
 * Do not edit the generated markdown under docs/en/reference/api/ or docs/zh/reference/api/ by hand.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DTS_PATH = join(ROOT, 'dist/jsmind.d.ts');
const TRANSLATIONS_PATH = join(ROOT, 'scripts/docs/api-translations-zh.json');
const TMP_DIR = join(ROOT, 'tmp/api-docs');

/** Top-level typings symbols published in the API reference. */
const INCLUDE = new Set([
    'JsMind',
    'JmMind',
    'MindMetadata',
    'MindOptions',
    'JmNode',
    'JmNodeContent',
    'JmNodeContentType',
    'JmNodeSide',
    'NodeCreationOptions',
    'NodeDestinationOptions',
    'JmEdge',
    'JmEdgeType',
    'EdgeCreationOptions',
    'JsMindOptions',
    'ViewOptions',
    'ViewPadding',
    'ViewExpanderOptions',
    'ViewExpanderStyle',
    'LayoutOptions',
    'JmMindSerializerFactory',
    'JmMindSerializer',
    'JmExportImageOptions',
    'JmExportImageResult',
    'JmImageType',
    'JmNodeStyle',
    'JmLineStyle',
    'JmStyle',
    'JmThemeNode',
    'JmThemeLine',
    'JmThemeExpander',
    'JmThemeShadow',
    'JmThemeShadowLayer',
    'JmThemeShadowOverride',
    'JmThemeNodeOverride',
    'JmTonePalette',
    'JmTone',
    'JmFontWeight',
    'JmLinePattern',
    'JmLineCurve',
    'JmObserver',
    'JmObserverManager',
    'JmCommander',
    'JmViewport',
    'JmViewportAnchor',
]);

const PAGE_SYMBOLS: Record<string, string[]> = {
    'jsmind': ['JsMind'],
    'mind': ['JmMind', 'MindMetadata', 'MindOptions', 'JmObserver', 'JmObserverManager'],
    'node': [
        'JmNode', 'JmNodeContent', 'JmNodeContentType', 'JmNodeSide',
        'NodeCreationOptions', 'NodeDestinationOptions',
    ],
    'edge': ['JmEdge', 'JmEdgeType', 'EdgeCreationOptions'],
    'options': [
        'JsMindOptions', 'ViewOptions', 'ViewPadding',
        'ViewExpanderOptions', 'ViewExpanderStyle', 'LayoutOptions',
    ],
    'serialization': ['JmMindSerializerFactory', 'JmMindSerializer'],
    'export': ['JmExportImageOptions', 'JmExportImageResult', 'JmImageType'],
    'commands': ['JmCommander', 'JmViewport', 'JmViewportAnchor'],
    'style': [
        'JmNodeStyle', 'JmLineStyle', 'JmStyle', 'JmThemeNode', 'JmThemeLine',
        'JmThemeExpander', 'JmThemeShadow', 'JmThemeShadowLayer',
        'JmThemeShadowOverride', 'JmThemeNodeOverride', 'JmTonePalette',
        'JmTone', 'JmFontWeight', 'JmLinePattern', 'JmLineCurve',
    ],
};

const PAGE_TITLES = {
    en: {
        jsmind: 'JsMind',
        mind: 'JmMind',
        node: 'Nodes',
        edge: 'Edges',
        options: 'Options',
        serialization: 'Serialization',
        export: 'Image export',
        commands: 'Commands',
        style: 'Style and theme',
    },
    zh: {
        jsmind: 'JsMind',
        mind: 'JmMind',
        node: '节点',
        edge: '边',
        options: '选项',
        serialization: '序列化',
        export: '图片导出',
        commands: '命令',
        style: '样式与主题',
    },
} as const;

const PAGE_INTROS = {
    en: {
        jsmind: 'The default export of the `jsmind` package. In the UMD build it is also available as the global `jsMind`.',
        mind: 'The mind map model. Construct a map with `new jsMind.Mind()`, then pass it to `JsMind.open`.',
        node: 'Nodes, their content, and the side values used when placing a child to the left or right of the root.',
        edge: 'Additional relationships between nodes. Parent-child structure is not represented as an edge.',
        options: 'Configuration passed to `jsMind.create`. Omitted fields use the library defaults.',
        serialization: 'Read and write a mind map through `jsMind.Serializer.create(format)`. `JsMind.serialize()` is a JSON convenience on an open map.',
        export: 'Types used by `JsMind.exportImage`.',
        commands: 'Display commands reached through `JsMind.commands`: pan, zoom, fit and image export. None of them changes the map.',
        style: 'Visual overrides on a map, a node, or an edge. Unset fields fall back to the theme.',
    },
    zh: {
        jsmind: '`jsmind` 包的默认导出。在 UMD 构建中也可以通过全局变量 `jsMind` 使用。',
        mind: '思维导图的数据模型。用 `new jsMind.Mind()` 创建，再交给 `JsMind.open`。',
        node: '节点、节点内容，以及把子节点放在根节点左侧或右侧时使用的方向值。',
        edge: '节点之间的额外关系。父子结构不用边表示。',
        options: '传给 `jsMind.create` 的配置。省略的字段使用库的默认值。',
        serialization: '通过 `jsMind.Serializer.create(format)` 读写导图。`JsMind.serialize()` 是对已打开导图的 JSON 便捷方法。',
        export: '`JsMind.exportImage` 使用的类型。',
        commands: '通过 `JsMind.commands` 调用的显示命令：平移、缩放、整图适配和图片导出，都不改变导图内容。',
        style: '导图、节点或边上的视觉覆盖。未设置的字段回退到主题。',
    },
} as const;

const UI = {
    en: {
        kindClass: 'Class',
        kindInterface: 'Interface',
        kindAlias: 'Type',
        kindEnum: 'Enumeration',
        constructor: 'Constructor',
        properties: 'Properties',
        methods: 'Methods',
        members: 'Members',
        parameters: 'Parameters',
        returns: 'Returns',
        throws: 'Throws',
        remarks: 'Remarks',
        optional: 'optional',
        name: 'Name',
        type: 'Type',
        value: 'Value',
        description: 'Description',
        generated: 'This page is generated from the published typings `dist/jsmind.d.ts` with TypeDoc.',
        previewTitle: 'Preview version',
        previewBody: 'The jsMind V2 programming API is currently a preview. The API will change in later updates. Please check this documentation anytime for the interface that is current.',
    },
    zh: {
        kindClass: '类',
        kindInterface: '接口',
        kindAlias: '类型',
        kindEnum: '枚举',
        constructor: '构造函数',
        properties: '属性',
        methods: '方法',
        members: '成员',
        parameters: '参数',
        returns: '返回值',
        throws: '异常',
        remarks: '说明',
        optional: '可选',
        name: '名称',
        type: '类型',
        value: '值',
        description: '说明',
        generated: '本页由 TypeDoc 根据已发布的类型声明 `dist/jsmind.d.ts` 生成。',
        previewTitle: '预览版本',
        previewBody: 'jsMind V2 的编程 API 目前是预览版本，之后还会更新。请随时查阅本文档，以了解当前的接口。',
    },
} as const;

type Locale = 'en' | 'zh';

type CommentParts = Array<{
    kind: string;
    text?: string;
    tag?: string;
    target?: unknown;
}>;

type TypedaType = {
    type: string;
    name?: string;
    value?: unknown;
    types?: TypedaType[];
    typeArguments?: TypedaType[];
    elementType?: TypedaType;
    element?: TypedaType;
    elements?: TypedaType[];
    queryType?: TypedaType;
    objectType?: TypedaType;
    indexType?: TypedaType;
    target?: TypedaType | unknown;
    operator?: string;
    declaration?: TypedaReflection;
    checkType?: TypedaType;
    extendsType?: TypedaType;
    trueType?: TypedaType;
    falseType?: TypedaType;
    targetType?: TypedaType;
    asserts?: boolean;
    package?: string;
};

type TypedaReflection = {
    id?: number;
    name: string;
    kind: number;
    flags?: Record<string, boolean>;
    comment?: {
        summary?: CommentParts;
        blockTags?: Array<{
            tag: string;
            name?: string;
            paramName?: string;
            content?: CommentParts;
        }>;
    };
    type?: TypedaType;
    children?: TypedaReflection[];
    signatures?: TypedaReflection[];
    getSignature?: TypedaReflection | TypedaReflection[];
    setSignature?: TypedaReflection | TypedaReflection[];
    parameters?: TypedaReflection[];
};

type Translation = {
    summary?: string;
    remarks?: string;
    returns?: string;
    throws?: string | string[];
    params?: Record<string, string>;
};

const KIND_CLASS = 128;
const KIND_INTERFACE = 256;
const KIND_CONSTRUCTOR = 512;
const KIND_PROPERTY = 1024;
const KIND_METHOD = 2048;
const KIND_ACCESSOR = 262144;
const KIND_ALIAS = 2097152;
const KIND_VARIABLE = 32;

function exportAllDeclarations(dts: string): string {
    return dts
        .split('\n')
        .map((line) => {
            if (line.startsWith('declare ') || line.startsWith('interface ') || line.startsWith('type ')) {
                return `export ${line}`;
            }
            return line;
        })
        .join('\n');
}

function runTypeDoc(entry: string, tsconfig: string, jsonPath: string): TypedaReflection {
    const bin = join(ROOT, 'node_modules/typedoc/bin/typedoc');
    if (!existsSync(bin)) {
        throw new Error(`TypeDoc is not installed at ${bin}`);
    }
    const result = spawnSync(
        process.execPath,
        [
            bin,
            entry,
            '--json', jsonPath,
            '--pretty',
            '--excludePrivate',
            '--excludeInternal',
            '--tsconfig', tsconfig,
            '--skipErrorChecking',
        ],
        { cwd: ROOT, encoding: 'utf8' }
    );
    if (result.status !== 0) {
        throw new Error(`TypeDoc failed:\n${result.stdout}\n${result.stderr}`);
    }
    return JSON.parse(readFileSync(jsonPath, 'utf8')) as TypedaReflection;
}

function preferDeclaration(
    current: TypedaReflection | undefined,
    next: TypedaReflection
): TypedaReflection {
    if (!current) {
        return next;
    }
    // Prefer the const object (kind 32) or class/interface over a companion type alias.
    if (current.kind === KIND_ALIAS && next.kind !== KIND_ALIAS) {
        return next;
    }
    return current;
}

function indexSymbols(project: TypedaReflection): Map<string, TypedaReflection> {
    const map = new Map<string, TypedaReflection>();
    for (const child of project.children ?? []) {
        if (!INCLUDE.has(child.name)) {
            continue;
        }
        map.set(child.name, preferDeclaration(map.get(child.name), child));
    }
    const missing = [...INCLUDE].filter((name) => !map.has(name));
    if (missing.length > 0) {
        throw new Error(`TypeDoc output is missing expected symbols: ${missing.join(', ')}`);
    }
    return map;
}

function buildTypePages(): Map<string, string> {
    const map = new Map<string, string>();
    for (const [page, symbols] of Object.entries(PAGE_SYMBOLS)) {
        for (const symbol of symbols) {
            map.set(symbol, page);
        }
    }
    return map;
}

function skipMember(node: TypedaReflection): boolean {
    const flags = node.flags ?? {};
    const name = node.name ?? '';
    if (flags.isPrivate || flags.isInternal) {
        return true;
    }
    if (name.startsWith('_') || name === 'nodeManager') {
        return true;
    }
    return false;
}

function getSignatures(node: TypedaReflection): TypedaReflection[] {
    const sigs = [...(node.signatures ?? [])];
    const getter = node.getSignature;
    if (getter) {
        sigs.push(Array.isArray(getter) ? getter[0] : getter);
    }
    return sigs;
}

function firstSignature(node: TypedaReflection): TypedaReflection | undefined {
    return getSignatures(node)[0];
}

function kindLabel(node: TypedaReflection, locale: Locale): string {
    const ui = UI[locale];
    if (node.kind === KIND_CLASS) {
        return ui.kindClass;
    }
    if (node.kind === KIND_INTERFACE) {
        return ui.kindInterface;
    }
    if (node.kind === KIND_VARIABLE) {
        return ui.kindEnum;
    }
    return ui.kindAlias;
}

function linkType(name: string, locale: Locale, typePages: Map<string, string>): string {
    const owner = name.split('.')[0];
    const page = typePages.get(owner);
    if (page) {
        const anchor = name.includes('.') ? name : owner;
        return `[${name}](/${locale}/reference/api/${page}#${anchor})`;
    }
    return `\`${name}\``;
}

function escapeTableCell(text: string): string {
    return text.replace(/\|/g, '\\|').replace(/\n+/g, ' ')
        .trim();
}

function renderType(type: TypedaType | undefined, locale: Locale, typePages: Map<string, string>, link: boolean): string {
    if (!type) {
        return 'unknown';
    }
    const inner = (t: TypedaType | undefined) => renderType(t, locale, typePages, link);
    const wrap = (name: string) => (link ? linkType(name, locale, typePages) : name);

    switch (type.type) {
        case 'intrinsic':
            return type.name ?? 'unknown';
        case 'literal':
            return typeof type.value === 'string' ? JSON.stringify(type.value) : String(type.value);
        case 'reference': {
            const name = type.name ?? 'unknown';
            const args = (type.typeArguments ?? []).map((arg) => inner(arg));
            return args.length > 0 ? `${wrap(name)}<${args.join(', ')}>` : wrap(name);
        }
        case 'union':
            return (type.types ?? []).map((item) => inner(item)).join(' | ');
        case 'intersection':
            return (type.types ?? []).map((item) => inner(item)).join(' & ');
        case 'array':
            return `${inner(type.elementType)}[]`;
        case 'query':
            return `typeof ${inner(type.queryType)}`;
        case 'indexedAccess':
            return `${inner(type.objectType)}[${inner(type.indexType)}]`;
        case 'typeOperator':
            return `${type.operator ?? 'keyof'} ${inner(type.target as TypedaType)}`;
        case 'optional':
            return `${inner(type.elementType)}?`;
        case 'rest':
            return `...${inner(type.elementType)}`;
        case 'tuple':
            return `[${(type.elements ?? []).map((item) => inner(item)).join(', ')}]`;
        case 'namedTupleMember':
            return `${type.name}: ${inner(type.element)}`;
        case 'predicate':
            return type.asserts
                ? `asserts ${type.name}`
                : `${type.name} is ${inner(type.targetType)}`;
        case 'conditional':
            return `${inner(type.checkType)} extends ${inner(type.extendsType)} ? ${inner(type.trueType)} : ${inner(type.falseType)}`;
        case 'reflection':
            return renderReflectionType(type.declaration, locale, typePages, link);
        default:
            return type.name ?? type.type;
    }
}

function renderReflectionType(
    declaration: TypedaReflection | undefined,
    locale: Locale,
    typePages: Map<string, string>,
    link: boolean
): string {
    if (!declaration) {
        return 'object';
    }
    const children = declaration.children ?? [];
    if (children.length === 0) {
        return '{}';
    }
    const fields = children.map((child) => {
        const optional = child.flags?.isOptional ? '?' : '';
        return `${child.name}${optional}: ${renderType(child.type, locale, typePages, link)}`;
    });
    return `{ ${fields.join('; ')} }`;
}

function partsToMarkdown(parts: CommentParts | undefined): string {
    if (!parts || parts.length === 0) {
        return '';
    }
    let out = '';
    for (const part of parts) {
        if (part.kind === 'text' || part.kind === 'code') {
            out += part.text ?? '';
        }
        else if (part.kind === 'inline-tag' && part.tag === '@link') {
            const name = (part.text ?? '').trim().split(/\s+/)[0];
            out += `{@link ${name}}`;
        }
        else if (part.kind === 'inline-tag') {
            out += part.text ?? '';
        }
    }
    return out.trim();
}

function englishFields(node: TypedaReflection): Translation {
    const comments: NonNullable<TypedaReflection['comment']>[] = [];
    if (node.comment) {
        comments.push(node.comment);
    }
    for (const signature of getSignatures(node)) {
        if (signature.comment) {
            comments.push(signature.comment);
        }
    }

    const result: Translation = {};
    const params: Record<string, string> = {};
    const throws: string[] = [];

    for (const comment of comments) {
        const summary = partsToMarkdown(comment.summary);
        if (summary) {
            result.summary = summary;
        }
        const remarks = partsToMarkdown(comment.blockTags?.find((tag) => tag.tag === '@remarks')?.content);
        if (remarks) {
            result.remarks = remarks;
        }
        const returns = partsToMarkdown(
            comment.blockTags?.find((tag) => tag.tag === '@returns')?.content,
            'en',
            new Map()
        );
        if (returns) {
            result.returns = returns;
        }
        for (const tag of comment.blockTags ?? []) {
            if (tag.tag === '@param') {
                const name = tag.paramName ?? tag.name ?? '';
                const text = partsToMarkdown(tag.content);
                if (name && text) {
                    params[name] = text;
                }
            }
            if (tag.tag === '@throws') {
                const text = partsToMarkdown(tag.content);
                if (text) {
                    throws.push(text);
                }
            }
        }
    }

    for (const signature of getSignatures(node)) {
        for (const parameter of signature.parameters ?? []) {
            const text = partsToMarkdown(parameter.comment?.summary);
            if (text) {
                params[parameter.name] = text;
            }
        }
    }

    if (Object.keys(params).length > 0) {
        result.params = params;
    }
    if (throws.length > 0) {
        result.throws = throws;
    }
    return result;
}

function missingTranslationKeys(key: string, en: Translation, zh: Translation | undefined): string[] {
    const missing: string[] = [];
    if (!en.summary && !en.remarks && !en.returns && !en.throws && !en.params) {
        return missing;
    }
    if (!zh) {
        return [`${key}`];
    }
    if (en.summary && !zh.summary) {
        missing.push(`${key}.summary`);
    }
    if (en.remarks && !zh.remarks) {
        missing.push(`${key}.remarks`);
    }
    if (en.returns && !zh.returns) {
        missing.push(`${key}.returns`);
    }
    if (en.throws && !zh.throws) {
        missing.push(`${key}.throws`);
    }
    if (en.params) {
        for (const name of Object.keys(en.params)) {
            if (!zh.params?.[name]) {
                missing.push(`${key}.params.${name}`);
            }
        }
    }
    return missing;
}

function localizedFields(
    key: string,
    node: TypedaReflection,
    locale: Locale,
    translations: Record<string, Translation>
): Translation {
    const en = englishFields(node);
    if (locale === 'en') {
        return en;
    }
    return translations[key] ?? {};
}

function previewWarning(locale: Locale): string {
    const ui = UI[locale];
    return `::: warning ${ui.previewTitle}\n${ui.previewBody}\n:::\n`;
}

function signatureText(node: TypedaReflection, typePages: Map<string, string>): string {
    const flags = node.flags ?? {};
    const prefix = [
        flags.isStatic ? 'static' : '',
        flags.isReadonly ? 'readonly' : '',
    ].filter(Boolean).join(' ');
    const sig = firstSignature(node);
    if (node.kind === KIND_CONSTRUCTOR) {
        const parameters = (sig?.parameters ?? []).map((parameter) => {
            const optional = parameter.flags?.isOptional ? '?' : '';
            return `${parameter.name}${optional}: ${renderType(parameter.type, 'en', typePages, false)}`;
        });
        return `constructor(${parameters.join(', ')})`;
    }
    if (sig) {
        const isGetter = node.kind === KIND_ACCESSOR || sig.kind === 524288;
        const parameters = isGetter
            ? '()'
            : `(${(sig.parameters ?? []).map((parameter) => {
                const optional = parameter.flags?.isOptional ? '?' : '';
                return `${parameter.name}${optional}: ${renderType(parameter.type, 'en', typePages, false)}`;
            }).join(', ')})`;
        const returns = renderType(sig.type, 'en', typePages, false);
        const keyword = isGetter ? 'get ' : '';
        return `${prefix ? `${prefix} ` : ''}${keyword}${node.name}${parameters}: ${returns}`;
    }
    const optional = flags.isOptional ? '?' : '';
    return `${prefix ? `${prefix} ` : ''}${node.name}${optional}: ${renderType(node.type, 'en', typePages, false)}`;
}

function renderCommentBlocks(
    fields: Translation,
    locale: Locale,
    typePages: Map<string, string>
): string[] {
    const lines: string[] = [];
    if (fields.summary) {
        lines.push(rewriteLinks(fields.summary, locale, typePages), '');
    }
    if (fields.remarks) {
        lines.push(`**${UI[locale].remarks}**`, '', rewriteLinks(fields.remarks, locale, typePages), '');
    }
    if (fields.returns) {
        lines.push(`**${UI[locale].returns}:** ${rewriteLinks(fields.returns, locale, typePages)}`, '');
    }
    if (fields.throws) {
        const items = Array.isArray(fields.throws) ? fields.throws : [fields.throws];
        lines.push(`**${UI[locale].throws}**`, '');
        for (const item of items) {
            lines.push(`- ${rewriteLinks(item, locale, typePages)}`);
        }
        lines.push('');
    }
    return lines;
}

function rewriteLinks(text: string, locale: Locale, typePages: Map<string, string>): string {
    return text.replace(/\{@link\s+([^}]+)\}/g, (_match, raw: string) => {
        const name = raw.trim().split(/\s+/)[0];
        return linkType(name, locale, typePages);
    }).replace(/\n[ \t]+/g, '\n');
}

function renderParameterTable(
    node: TypedaReflection,
    fields: Translation,
    locale: Locale,
    typePages: Map<string, string>
): string[] {
    const sig = firstSignature(node);
    const parameters = sig?.parameters ?? [];
    if (parameters.length === 0) {
        return [];
    }
    const ui = UI[locale];
    const lines = [
        `**${ui.parameters}**`,
        '',
        `| ${ui.name} | ${ui.type} | ${ui.description} |`,
        '| --- | --- | --- |',
    ];
    for (const parameter of parameters) {
        const optional = parameter.flags?.isOptional ? ` (${ui.optional})` : '';
        const typ = escapeTableCell(renderType(parameter.type, locale, typePages, true));
        const desc = escapeTableCell(rewriteLinks(fields.params?.[parameter.name] ?? '', locale, typePages));
        lines.push(`| \`${parameter.name}\`${optional} | ${typ} | ${desc} |`);
    }
    lines.push('');
    return lines;
}

function renderMember(
    owner: string,
    node: TypedaReflection,
    locale: Locale,
    translations: Record<string, Translation>,
    typePages: Map<string, string>
): string {
    const key = `${owner}.${node.name}`;
    const fields = localizedFields(key, node, locale, translations);
    const heading = node.kind === KIND_CONSTRUCTOR ? UI[locale].constructor : node.name;
    const anchor = `${owner}.${node.name}`;
    const lines = [
        `### ${heading} {#${anchor}}`,
        '',
        '```ts',
        signatureText(node, typePages),
        '```',
        '',
        ...renderCommentBlocks(fields, locale, typePages),
        ...renderParameterTable(node, fields, locale, typePages),
    ];
    return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

function constMembers(node: TypedaReflection): TypedaReflection[] {
    const declaration = node.type?.type === 'reflection' ? node.type.declaration : undefined;
    return (declaration?.children ?? []).filter((child) => !skipMember(child));
}

function renderConstTable(
    node: TypedaReflection,
    locale: Locale,
    translations: Record<string, Translation>,
    typePages: Map<string, string>
): string[] {
    const members = constMembers(node);
    if (members.length === 0) {
        return [];
    }
    const ui = UI[locale];
    const lines = [
        `**${ui.members}**`,
        '',
        `| ${ui.name} | ${ui.value} | ${ui.description} |`,
        '| --- | --- | --- |',
    ];
    for (const member of members) {
        const value = escapeTableCell(renderType(member.type, locale, typePages, false));
        const fields = localizedFields(`${node.name}.${member.name}`, member, locale, translations);
        const desc = escapeTableCell(rewriteLinks(fields.summary ?? '', locale, typePages));
        lines.push(`| \`${member.name}\` | \`${value}\` | ${desc} |`);
    }
    lines.push('');
    return lines;
}

function isCallable(node: TypedaReflection): boolean {
    return node.kind === KIND_METHOD || node.kind === KIND_ACCESSOR || node.kind === KIND_CONSTRUCTOR;
}

function renderSymbol(
    node: TypedaReflection,
    locale: Locale,
    translations: Record<string, Translation>,
    typePages: Map<string, string>
): string {
    const fields = localizedFields(node.name, node, locale, translations);
    const lines = [
        `## ${node.name} {#${node.name}}`,
        '',
        `*${kindLabel(node, locale)}*`,
        '',
        ...renderCommentBlocks(fields, locale, typePages),
    ];

    if (node.kind === KIND_VARIABLE) {
        lines.push(...renderConstTable(node, locale, translations, typePages));
        return lines.join('\n').replace(/\n{3,}/g, '\n\n');
    }

    if (node.kind === KIND_INTERFACE || node.kind === KIND_ALIAS) {
        const children = (node.children ?? []).filter((child) => !skipMember(child));
        if (children.length > 0) {
            const ui = UI[locale];
            lines.push(
                `**${ui.properties}**`,
                '',
                `| ${ui.name} | ${ui.type} | ${ui.description} |`,
                '| --- | --- | --- |'
            );
            for (const child of children) {
                const optional = child.flags?.isOptional ? ` (${ui.optional})` : '';
                const typ = escapeTableCell(renderType(child.type, locale, typePages, true));
                const childFields = localizedFields(`${node.name}.${child.name}`, child, locale, translations);
                const desc = escapeTableCell(rewriteLinks(childFields.summary ?? '', locale, typePages));
                lines.push(`| \`${child.name}\`${optional} | ${typ} | ${desc} |`);
            }
            lines.push('');
        }
        return lines.join('\n').replace(/\n{3,}/g, '\n\n');
    }

    const members = (node.children ?? []).filter((child) => !skipMember(child));
    const constructors = members.filter((child) => child.kind === KIND_CONSTRUCTOR);
    const properties = members.filter((child) => child.kind === KIND_PROPERTY);
    const methods = members.filter((child) => isCallable(child) && child.kind !== KIND_CONSTRUCTOR);

    for (const member of [...constructors, ...properties, ...methods]) {
        lines.push(renderMember(node.name, member, locale, translations, typePages), '');
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

function validateAll(
    symbols: Map<string, TypedaReflection>,
    translations: Record<string, Translation>
): void {
    const missing: string[] = [];

    const visit = (key: string, node: TypedaReflection) => {
        missing.push(...missingTranslationKeys(key, englishFields(node), translations[key]));
        if (node.type?.type === 'reflection') {
            for (const child of node.type.declaration?.children ?? []) {
                if (!skipMember(child)) {
                    visit(`${key}.${child.name}`, child);
                }
            }
        }
        for (const child of node.children ?? []) {
            if (!skipMember(child)) {
                visit(`${key}.${child.name}`, child);
            }
        }
    };

    for (const [name, symbol] of symbols) {
        visit(name, symbol);
    }

    const unique = [...new Set(missing)];
    if (unique.length > 0) {
        throw new Error(
            `Missing Chinese translations for ${unique.length} field(s):\\n${unique.map((item) => `  - ${item}`).join('\n')}`
        );
    }
}

function writePage(
    page: string,
    symbols: TypedaReflection[],
    locale: Locale,
    translations: Record<string, Translation>,
    typePages: Map<string, string>
): string {
    const title = PAGE_TITLES[locale][page as keyof typeof PAGE_TITLES.en];
    const intro = PAGE_INTROS[locale][page as keyof typeof PAGE_INTROS.en];
    const parts = [
        '---',
        'outline: deep',
        '---',
        '<!-- Generated by scripts/docs/generate-api-docs.ts. Do not edit by hand. -->',
        `# ${title}`,
        '',
        previewWarning(locale),
        intro,
        '',
        UI[locale].generated,
        '',
    ];
    for (const symbol of symbols) {
        parts.push(renderSymbol(symbol, locale, translations, typePages), '');
    }
    return `${parts.join('\n').replace(/\n{3,}/g, '\n\n')
        .trim()}\n`;
}

function main(): void {
    if (!existsSync(DTS_PATH)) {
        throw new Error(`Missing ${DTS_PATH}. Run npm run build first (or use npm run docs:api).`);
    }
    if (!existsSync(TRANSLATIONS_PATH)) {
        throw new Error(`Missing Chinese translations at ${TRANSLATIONS_PATH}`);
    }

    mkdirSync(TMP_DIR, { recursive: true });
    const exportedDts = join(TMP_DIR, 'jsmind-exported.d.ts');
    const tsconfig = join(TMP_DIR, 'tsconfig.json');
    const jsonPath = join(TMP_DIR, 'typedoc.json');
    writeFileSync(exportedDts, exportAllDeclarations(readFileSync(DTS_PATH, 'utf8')));
    writeFileSync(tsconfig, `${JSON.stringify({
        compilerOptions: {
            target: 'ESNext',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            lib: ['ES2020', 'DOM'],
        },
        include: ['./jsmind-exported.d.ts'],
    }, null, 2)}\n`);

    const project = runTypeDoc(exportedDts, tsconfig, jsonPath);
    const symbols = indexSymbols(project);
    const translations = JSON.parse(readFileSync(TRANSLATIONS_PATH, 'utf8')) as Record<string, Translation>;
    validateAll(symbols, translations);
    const typePages = buildTypePages();

    for (const locale of ['en', 'zh'] as const) {
        const outDir = join(ROOT, 'docs', locale, 'reference', 'api');
        rmSync(outDir, { recursive: true, force: true });
        mkdirSync(outDir, { recursive: true });
        for (const [page, names] of Object.entries(PAGE_SYMBOLS)) {
            const pageSymbols = names.map((name) => {
                const symbol = symbols.get(name);
                if (!symbol) {
                    throw new Error(`Missing symbol ${name}`);
                }
                return symbol;
            });
            writeFileSync(join(outDir, `${page}.md`), writePage(page, pageSymbols, locale, translations, typePages));
        }
    }

    const pages = Object.keys(PAGE_SYMBOLS).length;
    console.log(`Generated ${pages} API reference pages for en and zh from dist/jsmind.d.ts.`);
}

try {
    main();
}
catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
}
