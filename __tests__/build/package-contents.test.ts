/**
 * @fileoverview What `npm publish` is allowed to ship.
 *
 * The CLI later inlines `jsmind.js` from the same directory as `cli.js`.
 * That sibling layout is a publish contract, not an accident of the build.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** The only files the package is allowed to add on top of npm's defaults. */
const PUBLISHED_FILES = [
    'dist/cli.js',
    'dist/cli.js.map',
    'dist/jsmind.js',
    'dist/jsmind.js.map',
    'dist/jsmind.d.ts',
];

interface PackageJson {
    files: string[];
    main: string;
    types: string;
    bin: { jsmind: string };
    directories?: unknown;
}

function readPackage(): PackageJson {
    return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as PackageJson;
}

/** Rollup output paths, so a later config change cannot split the two bundles. */
function rollupOutputFiles(): string[] {
    const source = readFileSync(join(ROOT, '.config/rollup.config.js'), 'utf8');
    return [...source.matchAll(/file:\s*'([^']+)'/g)].map((match) => match[1]);
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
});
