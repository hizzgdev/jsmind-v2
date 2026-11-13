/**
 * @fileoverview What `npm publish` is allowed to ship, and that those
 * artifacts are actually usable: source maps carry TypeScript, `import`
 * loads the ESM build, `require` loads the CJS build, and a classic script
 * loads the UMD build.
 *
 * The CLI later inlines `jsmind.js` from the same directory as `cli.js`.
 * That sibling layout is a publish contract, not an accident of the build.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { before, describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** The only files the package is allowed to add on top of npm's defaults. */
const PUBLISHED_FILES = [
    'dist/cli.js',
    'dist/cli.js.map',
    'dist/jsmind.js',
    'dist/jsmind.js.map',
    'dist/jsmind.cjs',
    'dist/jsmind.cjs.map',
    'dist/jsmind.umd.js',
    'dist/jsmind.umd.js.map',
    'dist/jsmind.d.ts',
];

const V2_HOME = 'https://github.com/hizzgdev/jsmind-v2/';

interface PackageJson {
    files: string[];
    main: string;
    module: string;
    types: string;
    bin: { jsmind: string };
    homepage: string;
    repository: { url: string };
    bugs: { url: string };
    engines: { node: string };
    exports: {
        '.': {
            types: string;
            import: string;
            require: string;
        };
    };
    directories?: unknown;
}

interface SourceMap {
    sources: string[];
    sourcesContent: Array<string | null>;
}

interface JsMindLibrary {
    create: unknown;
    Mind: unknown;
}

interface JsMindEsm {
    default: JsMindLibrary;
}

function readPackage(): PackageJson {
    return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as PackageJson;
}

/** Rollup output paths, so a later config change cannot split the bundles. */
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

function assertLibrary(value: unknown, label: string): asserts value is JsMindLibrary {
    const library = value as Partial<JsMindLibrary>;
    assert.strictEqual(typeof library.create, 'function', `${label} has no create`);
    assert.strictEqual(typeof library.Mind, 'function', `${label} has no Mind`);
}

describe('npm package contents', () => {
    it('publishes the dist artifacts and nothing else from the repo', () => {
        const pkg = readPackage();
        assert.deepStrictEqual(pkg.files, PUBLISHED_FILES);

        const bin = pkg.bin.jsmind.replace(/^\.\//, '');
        const main = pkg.main.replace(/^\.\//, '');
        const moduleEntry = pkg.module.replace(/^\.\//, '');
        const types = pkg.types.replace(/^\.\//, '');
        for (const entry of [main, moduleEntry, types, bin]) {
            assert.ok(pkg.files.includes(entry), `${entry} must be in files`);
        }
        assert.strictEqual(pkg.exports['.'].import, './dist/jsmind.js');
        assert.strictEqual(pkg.exports['.'].require, './dist/jsmind.cjs');
        assert.strictEqual(pkg.exports['.'].types, './dist/jsmind.d.ts');
        // doc/example pointed at folders this package does not publish.
        assert.strictEqual(pkg.directories, undefined);
    });

    it('keeps cli.js, jsmind.js, jsmind.cjs, and jsmind.umd.js as siblings', () => {
        const pkg = readPackage();
        const cli = pkg.files.find((file) => file.endsWith('/cli.js'));
        const esm = pkg.files.find((file) => file.endsWith('/jsmind.js'));
        const cjs = pkg.files.find((file) => file.endsWith('/jsmind.cjs'));
        const umd = pkg.files.find((file) => file.endsWith('/jsmind.umd.js'));
        assert.ok(cli);
        assert.ok(esm);
        assert.ok(cjs);
        assert.ok(umd);
        assert.strictEqual(dirname(cli), dirname(esm));
        assert.strictEqual(dirname(cli), dirname(cjs));
        assert.strictEqual(dirname(cli), dirname(umd));

        const outputs = rollupOutputFiles();
        const builtCli = outputs.find((file) => file.endsWith('/cli.js'));
        const builtEsm = outputs.find((file) => file.endsWith('/jsmind.js'));
        const builtCjs = outputs.find((file) => file.endsWith('/jsmind.cjs'));
        const builtUmd = outputs.find((file) => file.endsWith('/jsmind.umd.js'));
        assert.strictEqual(builtCli, cli);
        assert.strictEqual(builtEsm, esm);
        assert.strictEqual(builtCjs, cjs);
        assert.strictEqual(builtUmd, umd);
        assert.ok(builtCli);
        assert.strictEqual(dirname(builtCli), dirname(builtEsm ?? ''));
        assert.strictEqual(dirname(builtCli), dirname(builtCjs ?? ''));
        assert.strictEqual(dirname(builtCli), dirname(builtUmd ?? ''));
    });

    it('points repository metadata at the v2 repo', () => {
        const pkg = readPackage();
        assert.strictEqual(pkg.repository.url, 'git+https://github.com/hizzgdev/jsmind-v2.git');
        assert.strictEqual(pkg.bugs.url, 'https://github.com/hizzgdev/jsmind-v2/issues');
        assert.strictEqual(pkg.homepage, 'https://github.com/hizzgdev/jsmind-v2#readme');
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

    it('embeds TypeScript in the published source maps', () => {
        assertSourcesEmbedded('dist/jsmind.js.map');
        assertSourcesEmbedded('dist/jsmind.cjs.map');
        assertSourcesEmbedded('dist/jsmind.umd.js.map');
        assertSourcesEmbedded('dist/cli.js.map');
        const libraryMap = readFileSync(join(ROOT, 'dist/jsmind.js.map'), 'utf8');
        assert.ok(libraryMap.includes('class JsMind'));
    });

    it('exposes the library from both the ESM and the CJS entry', async () => {
        const esmSource = readFileSync(join(ROOT, 'dist/jsmind.js'), 'utf8');
        assert.match(esmSource, /\bexport\b/);
        assert.match(esmSource, /globalThis\.jsMind\s*=/);
        assert.doesNotMatch(esmSource, /module\.exports\s*=/);

        const cjsSource = readFileSync(join(ROOT, 'dist/jsmind.cjs'), 'utf8');
        assert.match(cjsSource, /module\.exports\s*=/);
        assert.doesNotMatch(cjsSource, /^\s*export\b/m);
        assert.match(cjsSource, /globalThis\.jsMind\s*=/);

        const cliSource = readFileSync(join(ROOT, 'dist/cli.js'), 'utf8');
        assert.doesNotMatch(cliSource, /module\.exports/);

        const imported = await import(pathToFileURL(join(ROOT, 'dist/jsmind.js')).href) as JsMindEsm;
        assertLibrary(imported.default, 'import()');

        const loadCjs = createRequire(import.meta.url);
        const required = loadCjs(join(ROOT, 'dist/jsmind.cjs')) as JsMindLibrary;
        assertLibrary(required, 'require()');

        const umdSource = readFileSync(join(ROOT, 'dist/jsmind.umd.js'), 'utf8');
        assert.doesNotMatch(umdSource, /^\s*export\b/m);
        assert.doesNotMatch(umdSource, /^\s*import\b/m);
        const sandbox: { jsMind?: JsMindLibrary } = {};
        vm.runInNewContext(umdSource, sandbox, { filename: 'jsmind.umd.js' });
        assertLibrary(sandbox.jsMind, 'classic script');

        for (const file of ['dist/jsmind.js', 'dist/jsmind.cjs', 'dist/jsmind.umd.js', 'dist/cli.js', 'dist/jsmind.d.ts']) {
            const text = readFileSync(join(ROOT, file), 'utf8');
            assert.ok(text.includes(V2_HOME), `${file} banner is not the v2 repo`);
            assert.ok(!text.includes('https://github.com/hizzgdev/jsmind/'), `${file} still names v1`);
        }
    });

    it('resolves import and require through the package exports', () => {
        const dir = mkdtempSync(join(tmpdir(), 'jsmind-entry-'));
        try {
            mkdirSync(join(dir, 'node_modules'));
            symlinkSync(ROOT, join(dir, 'node_modules', 'jsmind'));
            writeFileSync(join(dir, 'package.json'), '{"type":"module"}\n');

            const imported = execFileSync(
                process.execPath,
                ['--input-type=module', '-e', 'import jsmind from "jsmind"; if (typeof jsmind.create !== "function" || typeof jsmind.Mind !== "function") process.exit(1);'],
                { cwd: dir, encoding: 'utf8' }
            );
            assert.strictEqual(imported, '');

            // A CommonJS child, so the `require` export condition is selected.
            writeFileSync(join(dir, 'load.cjs'), 'const jsmind = require("jsmind"); if (typeof jsmind.create !== "function" || typeof jsmind.Mind !== "function") process.exit(1);\n');
            execFileSync(process.execPath, [join(dir, 'load.cjs')], { cwd: dir, encoding: 'utf8' });
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
