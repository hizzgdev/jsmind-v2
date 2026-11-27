/**
 * @fileoverview `jsmind export html` without a browser.
 *
 * Two things separate this kind from `image`: it starts no browser, and the
 * document it writes has to survive being embedded in a page. Both show up
 * here — the command runs to completion with no Chromium on the machine, and
 * every hazardous sequence the export has to escape is read back out of the
 * written file with `JSON.parse`, not eyeballed.
 *
 * The template is a stand-in on purpose. `dist/artifact.html` only exists after
 * a build, and a unit suite that needed one would fail on a fresh checkout;
 * `__tests__/build/artifact.test.ts` covers the real template, and
 * `__tests__/ui/export-html.test.ts` covers the built page end to end.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import {
    artifactTemplatePath,
    defaultHtmlOutput,
    documentTitle,
    escapeHtmlText,
    escapeInlineJson,
    fillRuntimeSlots,
    runExportHtml,
} from '../../src/cli/commands/export-html.ts';
import { CliError, CliExit } from '../../src/cli/exit.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '../../src/cli/index.ts');

/**
 * A template with the two slots the CLI fills and nothing else.
 *
 * The bundle script is a marker, not the library: what this suite asserts is
 * that the CLI fills the slots and leaves every other byte alone.
 */
const TEMPLATE = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<title>{{TITLE}}</title>',
    '</head>',
    '<body>',
    '<div id="jsmind"></div>',
    '<script type="application/json" id="jsmind-data">{{DATA}}</script>',
    '<script>/* inline bundle */</script>',
    '</body>',
    '</html>',
    '',
].join('\n');

/** One export's files, all inside a fresh temp directory. */
interface ExportPaths {
    /** Root of the temp directory. */
    dir: string;
    /** The mind map document handed to the command. */
    file: string;
    /** The page the command writes. */
    output: string;
    /** The template the command fills. */
    template: string;
}

/**
 * Runs the CLI from source as a real child process.
 *
 * @param args - Arguments after the program name.
 * @returns Exit code and what was written to both streams.
 */
function runCli(args: string[]): { code: number; stdout: string; stderr: string } {
    const result = spawnSync(
        process.execPath,
        ['--experimental-strip-types', '--no-warnings', CLI, ...args],
        { encoding: 'utf8' }
    );
    return { code: result.status ?? 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/**
 * Builds a five-node document.
 *
 * @param text - Text of the second node, so one case can carry the sequences
 *               that break an inline script.
 * @param name - Value of `meta.name`.
 * @returns The document.
 */
function mindDocument(text = 'plain child', name = 'Export html test'): unknown {
    const node = (id: string, label: string, parent: string | null, children: string[]) => ({
        id,
        content: { type: 'text', value: label },
        parent,
        children,
        folded: false,
        side: parent === null ? 0 : 1,
        data: {},
    });
    return {
        format: 'jsmind_v2',
        meta: { name, author: 'tests', version: '1.0' },
        root: 'root',
        nodes: {
            root: node('root', 'Root', null, ['a', 'b', 'c']),
            a: node('a', text, 'root', []),
            b: node('b', 'Second', 'root', []),
            c: node('c', 'Third', 'root', ['c1']),
            c1: node('c1', 'Fourth', 'c', []),
        },
        edges: {},
    };
}

/**
 * Runs one export against a temp directory.
 *
 * The input and the output sit in different subdirectories, so the listing of
 * the output directory answers "did the command write anything else?" without
 * the fixture getting in the way.
 *
 * @param body - What to do with the paths.
 * @param options - Fixture document and template text.
 */
function withExport(
    body: (paths: ExportPaths) => void,
    options: { data?: unknown; template?: string } = {}
): void {
    const dir = mkdtempSync(join(tmpdir(), 'jsmind-export-html-'));
    const input = join(dir, 'in');
    const output = join(dir, 'out');
    mkdirSync(input);
    mkdirSync(output);

    const file = join(input, 'map.json');
    const template = join(input, 'template.html');
    writeFileSync(file, JSON.stringify(options.data ?? mindDocument()), 'utf8');
    writeFileSync(template, options.template ?? TEMPLATE, 'utf8');

    try {
        body({ dir, file, output: join(output, 'page.html'), template });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * Captures everything written to a stream while `body` runs.
 *
 * @param stream - Stream to intercept.
 * @param body - Work to run.
 * @returns What was written.
 */
function capture(stream: 'stdout' | 'stderr', body: () => void): string {
    const writes: string[] = [];
    const original = process[stream].write;
    process[stream].write = function (chunk: string | Uint8Array, ...args: unknown[]): boolean {
        writes.push(String(chunk));
        return original.apply(this, [chunk, ...args] as Parameters<typeof original>);
    };
    try {
        body();
    } finally {
        process[stream].write = original;
    }
    return writes.join('');
}

/**
 * The text inside the page's data block.
 *
 * @param html - A written page.
 * @returns The raw block content, before `JSON.parse`.
 */
function dataBlock(html: string): string {
    const dom = new JSDOM(html);
    const script = dom.window.document.querySelector('script[type="application/json"]');
    assert.ok(script, 'the page should carry a JSON block');
    return script.textContent ?? '';
}

test('cli - escapeInlineJson round-trips every sequence that can break the block', () => {
    // `</script>` ends the element early whatever it is inside, `<!--` starts a
    // comment for the same reason, and U+2028 / U+2029 are line terminators to
    // a JavaScript parser. None of them may survive as raw text, and all of
    // them must come back exactly as they went in.
    const hazards = [
        '</script>',
        '</SCRIPT>',
        '</ScRiPt >',
        '<!-- hidden -->',
        'line\u2028separator',
        'paragraph\u2029separator',
        'a & b < c > d',
    ];

    for (const text of hazards) {
        const original = { text, meta: { name: text } };
        const escaped = escapeInlineJson(JSON.stringify(original));

        assert.ok(!escaped.includes('<'), `"<" should not survive: ${text}`);
        assert.ok(!escaped.includes('\u2028'), 'U+2028 should not survive raw');
        assert.ok(!escaped.includes('\u2029'), 'U+2029 should not survive raw');
        assert.deepStrictEqual(JSON.parse(escaped), original, `round trip failed for ${JSON.stringify(text)}`);
    }
});

test('cli - escapeHtmlText escapes the three characters that end a title early', () => {
    assert.strictEqual(escapeHtmlText('a & b < c > d'), 'a &amp; b &lt; c &gt; d');
    assert.strictEqual(escapeHtmlText('</script>'), '&lt;/script&gt;');
    // `&` first: escaping it afterwards would turn `&lt;` into `&amp;lt;` and
    // print the entity instead of the character it stands for.
    assert.strictEqual(escapeHtmlText('&lt;'), '&amp;lt;');
    assert.strictEqual(escapeHtmlText('plain'), 'plain');
});

test('cli - documentTitle prefers meta.name and falls back to the file name', () => {
    assert.strictEqual(documentTitle(mindDocument('x', 'The map'), 'tmp/map.json'), 'The map');
    assert.strictEqual(documentTitle(mindDocument('x', '   '), 'tmp/map.json'), 'map');
    assert.strictEqual(documentTitle({ meta: { name: 42 } }, 'tmp/map.json'), 'map');
    assert.strictEqual(documentTitle({}, 'tmp/plan.2026.json'), 'plan.2026');
    assert.strictEqual(documentTitle(null, 'tmp/plan.json'), 'plan');
});

test('cli - the default output path keeps the input name and replaces one extension', () => {
    assert.strictEqual(defaultHtmlOutput('tmp/map.json'), join('tmp', 'map.html'));
    assert.strictEqual(defaultHtmlOutput('map.json'), 'map.html');
    // Only the last extension goes: a dated file keeps its date.
    assert.strictEqual(defaultHtmlOutput('plan.2026.json'), join('plan.2026.html'));
    assert.strictEqual(defaultHtmlOutput('no-extension'), join('no-extension.html'));
});

test('cli - the template path is the page beside the CLI bundle', () => {
    assert.strictEqual(basename(artifactTemplatePath()), 'artifact.html');
});

test('cli - fillRuntimeSlots requires each slot exactly once and inserts one pass', () => {
    const filled = fillRuntimeSlots(TEMPLATE, { title: 'T', data: '{"a":1}' });

    assert.ok(filled.includes('<title>T</title>'));
    assert.ok(filled.includes('{"a":1}'));
    assert.ok(!filled.includes('{{'));

    // A value that happens to spell a slot is content: the single pass means
    // the inserted text is never read as a slot of its own.
    const tricky = fillRuntimeSlots(TEMPLATE, { title: '{{DATA}}', data: '{"a":"{{TITLE}}"}' });
    assert.ok(tricky.includes('<title>{{DATA}}</title>'));
    assert.ok(tricky.includes('{"a":"{{TITLE}}"}'));

    assert.throws(
        () =>
            fillRuntimeSlots(TEMPLATE.replace('<div id="jsmind"></div>', '{{DATA}}'), {
                title: 'T',
                data: '{}',
            }),
        (error: unknown) => {
            assert.ok(error instanceof CliError);
            assert.match(error.message, /2 \{\{DATA\}\} slots/);
            return true;
        }
    );
    assert.throws(
        () => fillRuntimeSlots(TEMPLATE.replace('{{TITLE}}', 'no slot here'), { title: 'T', data: '{}' }),
        /0 \{\{TITLE\}\} slots/
    );
});

test('cli - export html writes one file, with the data readable back out of it', () => {
    withExport(({ file, output, template }) => {
        const writes = capture('stdout', () => {
            const code = runExportHtml({ file, output, asJson: true, template });
            assert.strictEqual(code, CliExit.Ok);
        });

        assert.deepStrictEqual(JSON.parse(writes), { file, output });
        assert.deepStrictEqual(readdirSync(dirname(output)), ['page.html'], 'no companion files');

        const html = readFileSync(output, 'utf8');
        assert.ok(html.includes('<title>Export html test</title>'));
        // Two script elements, so two closers: a third would be the document
        // closing the block early.
        assert.strictEqual(html.split('</script>').length - 1, 2);
        assert.deepStrictEqual(JSON.parse(dataBlock(html)), mindDocument());
    });
});

test('cli - a document carrying </script>, <!-- and U+2028 still parses back', () => {
    const hazardous = '</script><!-- <SCRIPT> \u2028 \u2029 & < >';
    const document = mindDocument(hazardous, `Title ${hazardous}`);

    withExport(({ file, output, template }) => {
        capture('stdout', () => {
            assert.strictEqual(runExportHtml({ file, output, asJson: false, template }), CliExit.Ok);
        });

        const html = readFileSync(output, 'utf8');
        assert.strictEqual(html.split('</script>').length - 1, 2, 'the document must not close the block');
        assert.deepStrictEqual(JSON.parse(dataBlock(html)), document);

        const title = html.match(/<title>([^<]*)<\/title>/);
        assert.ok(title, 'the page should have a title element');
        assert.ok(!title[1]!.includes('<'), 'the title must not leak markup');
        const dom = new JSDOM(html);
        assert.strictEqual(dom.window.document.title, `Title ${hazardous}`, 'and it reads back as text');
    }, { data: document });
});

test('cli - --title overrides meta.name and is escaped on the way in', () => {
    withExport(({ file, output, template }) => {
        capture('stdout', () => {
            runExportHtml({ file, output, asJson: false, template, title: '</script> & co' });
        });

        const dom = new JSDOM(readFileSync(output, 'utf8'));
        assert.strictEqual(dom.window.document.title, '</script> & co');
    });
});

test('cli - invalid data is refused before anything is written', () => {
    withExport(({ file, output, template }) => {
        let code = -1;
        const stderr = capture('stderr', () => {
            code = runExportHtml({ file, output, asJson: false, template });
        });

        assert.strictEqual(code, CliExit.InvalidData);
        assert.match(stderr, /problem\(s\)/);
        assert.deepStrictEqual(readdirSync(dirname(output)), [], 'nothing is written');
    }, { data: { format: 'jsmind_v2' } });
});

test('cli - a missing input file is an IO error, and no browser is involved', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jsmind-export-html-missing-'));
    try {
        assert.throws(
            () => runExportHtml({ file: join(dir, 'absent.json'), output: join(dir, 'x.html'), asJson: false }),
            (error: unknown) => {
                assert.ok(error instanceof CliError);
                assert.strictEqual(error.exit, CliExit.IoError);
                assert.match(error.message, /File not found/);
                assert.doesNotMatch(error.message, /Chromium|browser/i);
                return true;
            }
        );
        assert.deepStrictEqual(readdirSync(dir), []);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('cli - a missing template names the build command', () => {
    withExport(({ dir, file, output }) => {
        assert.throws(
            () => runExportHtml({ file, output, asJson: false, template: join(dir, 'absent.html') }),
            (error: unknown) => {
                assert.ok(error instanceof CliError);
                assert.strictEqual(error.exit, CliExit.IoError);
                assert.match(error.message, /absent\.html/);
                assert.match(error.message, /npm run build/);
                return true;
            }
        );
    });
});

test('cli - a template without its slots is refused rather than shipped verbose', () => {
    const broken = '<html><head><title>{{TITLE}}</title></head><body></body></html>\n';

    withExport(({ file, output, template }) => {
        assert.throws(
            () => runExportHtml({ file, output, asJson: false, template }),
            /0 \{\{DATA\}\} slots/
        );
        assert.deepStrictEqual(readdirSync(dirname(output)), [], 'nothing is written');
    }, { template: broken });
});

test('cli - a template that cannot be read is an IO error, not a crash', () => {
    // A missing file and an unreadable one are different answers: the first
    // means "build it", the second means "look at what is there". A directory
    // passed where a file belongs is the cheapest way to reach the second.
    withExport(({ dir, file, output }) => {
        assert.throws(
            () => runExportHtml({ file, output, asJson: false, template: dir }),
            (error: unknown) => {
                assert.ok(error instanceof CliError);
                assert.strictEqual(error.exit, CliExit.IoError);
                assert.match(error.message, /Cannot read /);
                assert.doesNotMatch(error.message, /npm run build/);
                return true;
            }
        );
    });
});

test('cli - the group help lists html and the flag only it takes', () => {
    const run = runCli(['export', '--help']);

    assert.strictEqual(run.code, 0);
    assert.match(run.stdout, /html\s+<file> \[out\.html\]/, 'the kind row says the output is optional');
    assert.match(run.stdout, /--title <text>/);
    assert.match(run.stdout, /image\s+<file> <out\.png>/, 'the image kind is still listed');
    assert.ok(
        run.stdout.indexOf('image options') < run.stdout.indexOf('html options'),
        'each kind keeps its own option table'
    );
});

test('cli - export html needs a file, and refuses a surplus argument', () => {
    for (const args of [['export', 'html'], ['export', 'html', 'map.json', 'out.html', 'surplus']]) {
        const run = runCli(args);

        assert.strictEqual(run.code, CliExit.Usage, `jsmind ${args.join(' ')} should be exit 2`);
        assert.strictEqual(run.stdout, '', 'a usage error prints no result');
    }
});

test('cli - only html accepts --title', () => {
    // The allow-list is per kind, so the same flag is legitimate on one kind and
    // an unknown option on the other. Both directions are pinned: a table that
    // stopped warning would let `image --title` look accepted and do nothing.
    const image = runCli(['export', 'image', 'missing.json', 'out.png', '--title', 'x']);
    assert.strictEqual(image.code, CliExit.IoError, image.stderr);
    assert.match(image.stderr, /unknown option for "export image": --title/);

    const html = runCli(['export', 'html', 'missing.json', 'out.html', '--title', 'x']);
    assert.strictEqual(html.code, CliExit.IoError, html.stderr);
    assert.doesNotMatch(html.stderr, /unknown option/);
    assert.match(html.stderr, /File not found: missing\.json/);
});

test('cli - --strict turns --title on image into a usage error', () => {
    const run = runCli(['export', 'image', 'missing.json', 'out.png', '--title', 'x', '--strict']);

    assert.strictEqual(run.code, CliExit.Usage);
    assert.strictEqual(run.stderr, 'Unknown option for "export image": --title\n');
});
