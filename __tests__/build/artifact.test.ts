/**
 * @fileoverview The build-time half of `jsmind export html`.
 *
 * `scripts/assemble-artifact.ts` turns `artifact/` plus the UMD bundle into
 * `dist/artifact.html`, leaving two slots for the CLI. What this suite pins is
 * the guard: a template that names a slot nobody fills, forgets one, writes one
 * twice, or carries text that would close its own `<script>` must fail the
 * build rather than ship a page with `{{NAME}}` printed on it.
 *
 * The bundle here is a stub. The real one is checked where it exists —
 * `__tests__/build/package-contents.test.ts` builds the package and reads
 * `dist/artifact.html`, and the UI suite opens the page a real export writes.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import {
    ARTIFACT_CSS,
    ARTIFACT_PAGE,
    ARTIFACT_SHELL,
    BUILD_SLOTS,
    RUNTIME_SLOTS,
    assembleArtifactHtml,
    loadArtifactSources,
    readArtifactSource,
    type ArtifactSources,
} from '../../scripts/assemble-artifact.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** A bundle that assigns the global the shell calls, and nothing else. */
const STUB_BUNDLE = 'window.jsMind = { create: function () { return {}; } };\n';

/**
 * A template with every slot, for the cases that need one to break on purpose.
 *
 * @returns The template, one slot per line.
 */
function template(): string {
    return [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head>',
        '<title>{{TITLE}}</title>',
        '<style>',
        '{{SHELL_CSS}}',
        '</style>',
        '</head>',
        '<body>',
        '<div id="jsmind"></div>',
        '<script type="application/json" id="jsmind-data">{{DATA}}</script>',
        '<script>',
        '{{BUNDLE}}',
        '</script>',
        '<script>',
        '{{SHELL_JS}}',
        '</script>',
        '</body>',
        '</html>',
        '',
    ].join('\n');
}

/**
 * The real page and shell, with the stub bundle in place of the library.
 *
 * @returns Sources for {@link assembleArtifactHtml}.
 */
function realSources(): ArtifactSources {
    return {
        page: readArtifactSource(ROOT, ARTIFACT_PAGE),
        css: readArtifactSource(ROOT, ARTIFACT_CSS),
        shellJs: readArtifactSource(ROOT, ARTIFACT_SHELL),
        bundle: STUB_BUNDLE,
    };
}

/**
 * Assembles a template and returns the page it produced.
 *
 * @param page - Template to use.
 * @param overrides - Source fields to replace.
 * @returns The assembled page.
 */
function assemble(page: string, overrides: Partial<ArtifactSources> = {}): string {
    return assembleArtifactHtml({
        page,
        css: '/* shell */\n',
        shellJs: '/* shell */\n',
        bundle: STUB_BUNDLE,
        ...overrides,
    });
}

test('build - the real template assembles into one page with three scripts', () => {
    const sources = realSources();
    const html = assembleArtifactHtml(sources);

    assert.ok(html.includes(sources.css), 'the stylesheet is inlined');
    assert.ok(html.includes(sources.shellJs), 'the shell is inlined');
    assert.ok(html.includes(STUB_BUNDLE.trim()), 'the bundle is inlined');
    for (const slot of BUILD_SLOTS) {
        assert.ok(!html.includes(`{{${slot}}}`), `${slot} should be filled`);
    }
    for (const slot of RUNTIME_SLOTS) {
        assert.ok(html.includes(`{{${slot}}}`), `${slot} is left for the CLI`);
    }

    const dom = new JSDOM(html);
    const document = dom.window.document;
    const scripts = [...document.querySelectorAll('script')];
    assert.strictEqual(scripts.length, 3, 'the data block, the bundle and the shell');
    assert.strictEqual(scripts[0]?.getAttribute('type'), 'application/json');
    assert.strictEqual(scripts[0]?.id, 'jsmind-data');
    assert.strictEqual(scripts[0]?.textContent, '{{DATA}}');
    assert.ok(scripts[1]?.textContent?.includes('window.jsMind'));
    assert.ok(scripts[2]?.textContent?.includes('function readInlineData'), 'the data source is a seam');
    assert.strictEqual(document.title, '{{TITLE}}');

    // Zero external references: nothing here can be fetched, so the page is the
    // whole artifact. Namespace URIs inside the bundle are string literals, not
    // references, and the attribute query is what tells the two apart.
    assert.deepStrictEqual(
        [...document.querySelectorAll('[src], [href], [srcset]')].map(node => node.outerHTML),
        []
    );
    assert.strictEqual(document.querySelectorAll('link').length, 0);
    assert.doesNotMatch(html, /\s(?:src|href)\s*=\s*["']/, 'no attribute points anywhere');
});

test('build - an unknown slot fails the build instead of shipping braces', () => {
    assert.throws(
        () => assemble(template().replace('<div id="jsmind"></div>', '<div>{{NOPE}}</div>'), {}),
        /unknown slot: \{\{NOPE\}\}/
    );
});

test('build - a build slot the template forgot fails the build', () => {
    for (const slot of BUILD_SLOTS) {
        assert.throws(
            () => assemble(template().replaceAll(`{{${slot}}}`, '')),
            new RegExp(`has no \\{\\{${slot}\\}\\} slot`),
            `${slot} missing from the template should be reported by name`
        );
    }
});

test('build - a build slot written twice fails the build', () => {
    assert.throws(
        () => assemble(template().replace('<div id="jsmind"></div>', '<div>{{BUNDLE}}</div>')),
        /more than one \{\{BUNDLE\}\} slot/
    );
});

test('build - the runtime slots must stay for the CLI, exactly once each', () => {
    for (const slot of RUNTIME_SLOTS) {
        assert.throws(
            () => assemble(template().replaceAll(`{{${slot}}}`, 'gone')),
            new RegExp(`must keep exactly one \\{\\{${slot}\\}\\} slot for the CLI, found 0`)
        );
        assert.throws(
            () => assemble(template().replace('<div id="jsmind"></div>', `<div>{{${slot}}}</div>`)),
            new RegExp('found 2')
        );
    }
});

test('build - an unbalanced slot fails the build', () => {
    assert.throws(
        () => assemble(template().replace('{{TITLE}}', '{{TITLE')),
        /unbalanced slot/
    );
});

test('build - a closing tag inside the bundle is escaped, not handed to the tokenizer', () => {
    // A minifier is free to put `</script>` inside a string literal; the HTML
    // tokenizer would end the element there no matter what JavaScript thinks.
    const html = assemble(template(), {
        bundle: 'var closing = "</script>";\nvar upper = "</SCRIPT>";\n',
    });

    assert.ok(html.includes('var closing = "<\\/script>";'));
    assert.ok(html.includes('var upper = "<\\/SCRIPT>";'));
    assert.strictEqual(html.split('</script>').length - 1, 3, 'one closer per script element');
});

test('build - the shell or stylesheet closing its own element is a mistake, not an escape', () => {
    // Both are our own files: escaping them would hide a typo that has no
    // reason to exist, so the build refuses instead.
    assert.throws(() => assemble(template(), { shellJs: 'var a = "</script>";\n' }), /shell\.js contains <\/script/);
    assert.throws(() => assemble(template(), { css: '/* </style> */\n' }), /shell\.css contains <\/style/);
});

test('build - a missing source file names the path it looked for', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jsmind-artifact-'));
    try {
        mkdirSync(join(dir, 'artifact'));
        writeFileSync(join(dir, 'artifact', ARTIFACT_PAGE), template(), 'utf8');

        assert.throws(
            () => readArtifactSource(dir, ARTIFACT_CSS),
            /missing artifact source: artifact\/shell\.css/
        );

        // The bundle is the other half of the input, and its absence means the
        // assembly ran before rollup did.
        assert.throws(() => loadArtifactSources(dir), /dist\/jsmind\.umd\.js is missing/);

        mkdirSync(join(dir, 'dist'));
        writeFileSync(join(dir, 'dist', 'jsmind.umd.js'), STUB_BUNDLE, 'utf8');
        writeFileSync(join(dir, 'artifact', ARTIFACT_CSS), '/* shell */\n', 'utf8');
        writeFileSync(join(dir, 'artifact', ARTIFACT_SHELL), '/* shell */\n', 'utf8');

        const sources = loadArtifactSources(dir);
        assert.strictEqual(sources.bundle, STUB_BUNDLE);
        assert.strictEqual(sources.page, template());
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
