/**
 * @fileoverview What `npm publish` is allowed to ship, and that those
 * artifacts are actually usable: source maps carry TypeScript, and both
 * `import` and `require` see the library.
 *
 * The CLI later inlines `jsmind.js` from the same directory as `cli.js`.
 * That sibling layout is a publish contract, not an accident of the build.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { before, describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** The only files the package is allowed to add on top of npm's defaults. */
const PUBLISHED_FILES = [
    'dist/cli.js',
    'dist/cli.js.map',
    'dist/jsmind.js',
    'dist/jsmind.js.map',
    'dist/jsmind.d.ts',
];

const V2_HOME = 'https://github.com/hizzgdev/jsmind-v2/';

interface PackageJson {
    files: string[];
    main: string;
    types: string;
    bin: { jsmind: string };
    homepage: string;
    repository: { url: string };
    bugs: { url: string };
    engines: { node: string };
    directories?: unknown;
}

interface SourceMap {
    sources: string[];
    sourcesContent: Array<string | null>;
}

interface JsMindModule {
    default: {
        create: unknown;
        Mind: unknown;
    };
}

function readPackage(): PackageJson {
    return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as PackageJson;
}

/** Rollup output paths, so a later config change cannot split the two bundles. */
function rollupOutputFiles(): string[] {
    const source = readFileSync(join(ROOT, '.config/rollup.config.js'), 'utf8');
    return [...source.matchAll(/file:\s*'([^']+)'/g)].map((match) => match[1]);
}

/**
 * Every published TypeScript source in the map must include its text.
 * A `null` entry means DevTools has a path and nothing to show.
 */
function assertSourcesEmbedded(mapPath: string): void {
    const map = JSON.parse(readFileSync(join(ROOT, mapPath), 'utf8')) as SourceMap;
    assert.ok(Array.isArray(map.sourcesContent), `${mapPath} has no sourcesContent`);
    const typescriptSources = map.sources
        .map((source, index) => ({ source, content: map.sourcesContent[index] }))
        .filter((entry) => entry.source.endsWith('.ts'));
    assert.ok(typescriptSources.length > 0, `${mapPath} lists no TypeScript sources`);
    for (const entry of typescriptSources) {
        assert.strictEqual(
            typeof entry.content,
            'string',
            `${mapPath} source ${entry.source} has no embedded text`
        );
        assert.ok(entry.content && entry.content.length > 0);
    }
}

describe('npm package contents', () => {
    it('publishes only the five dist artifacts', () => {
        const pkg = readPackage();
        assert.deepStrictEqual(pkg.files, PUBLISHED_FILES);

        const bin = pkg.bin.jsmind.replace(/^\.\//, '');
        for (const entry of [pkg.main, pkg.types, bin]) {
            assert.ok(pkg.files.includes(entry), `${entry} must be in files`);
        }
        // doc/example pointed at folders this package does not publish.
        assert.strictEqual(pkg.directories, undefined);
    });

    it('keeps cli.js and jsmind.js as siblings in the package and the build', () => {
        const pkg = readPackage();
        const cli = pkg.files.find((file) => file.endsWith('/cli.js'));
        const lib = pkg.files.find((file) => file.endsWith('/jsmind.js'));
        assert.ok(cli);
        assert.ok(lib);
        assert.strictEqual(dirname(cli), dirname(lib));

        const outputs = rollupOutputFiles();
        const builtCli = outputs.find((file) => file.endsWith('/cli.js'));
        const builtLib = outputs.find((file) => file.endsWith('/jsmind.js'));
        assert.ok(builtCli);
        assert.ok(builtLib);
        assert.strictEqual(dirname(builtCli), dirname(builtLib));
        assert.strictEqual(builtCli, cli);
        assert.strictEqual(builtLib, lib);
    });

    it('points repository metadata at the v2 repo', () => {
        const pkg = readPackage();
        assert.strictEqual(pkg.repository.url, 'git+https://github.com/hizzgdev/jsmind-v2.git');
        assert.strictEqual(pkg.bugs.url, 'https://github.com/hizzgdev/jsmind-v2/issues');
        assert.strictEqual(pkg.homepage, 'https://github.com/hizzgdev/jsmind-v2#readme');
        // require() of the ESM entry is unflagged starting here. Earlier 22.x
        // throws ERR_REQUIRE_ESM, which is the bug this package must not ship.
        assert.strictEqual(pkg.engines.node, '>=22.12.0');

        const rollup = readFileSync(join(ROOT, '.config/rollup.config.js'), 'utf8');
        assert.ok(rollup.includes(V2_HOME));
        assert.ok(!rollup.includes('https://github.com/hizzgdev/jsmind/'));
    });
});

describe('built package entry', () => {
    before(() => {
        execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });
    });

    it('embeds TypeScript in both source maps', () => {
        assertSourcesEmbedded('dist/jsmind.js.map');
        assertSourcesEmbedded('dist/cli.js.map');
        const libraryMap = readFileSync(join(ROOT, 'dist/jsmind.js.map'), 'utf8');
        assert.ok(libraryMap.includes('class JsMind'));
    });

    it('ships an ES module whose default export is the library', async () => {
        const source = readFileSync(join(ROOT, 'dist/jsmind.js'), 'utf8');
        assert.match(source, /\bexport\b/);
        assert.match(source, /globalThis\.jsMind\s*=/);
        assert.doesNotMatch(source, /typeof exports === ['"]object['"]/);

        const imported = await import(pathToFileURL(join(ROOT, 'dist/jsmind.js')).href) as JsMindModule;
        assert.strictEqual(typeof imported.default.create, 'function');
        assert.strictEqual(typeof imported.default.Mind, 'function');

        const loadCjs = createRequire(import.meta.url);
        const required = loadCjs(join(ROOT, 'dist/jsmind.js')) as JsMindModule;
        assert.strictEqual(required.default, imported.default);

        for (const file of ['dist/jsmind.js', 'dist/cli.js', 'dist/jsmind.d.ts']) {
            const text = readFileSync(join(ROOT, file), 'utf8');
            assert.ok(text.includes(V2_HOME), `${file} banner is not the v2 repo`);
            assert.ok(!text.includes('https://github.com/hizzgdev/jsmind/'), `${file} still names v1`);
        }
    });
});
