import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

const banner = `/**
 * @license BSD-3-Clause
 * @copyright 2014-2025 hizzgdev@163.com
 *
 * Project Home:
 *   https://github.com/hizzgdev/jsmind-v2/
 */`;

/**
 * Maps must carry the TypeScript itself. `src/` is not published, so a map
 * that only points at `../src/...` is useless once the package is installed.
 */
const typescriptPlugin = () => typescript({
    tsconfig: './tsconfig.json',
    declaration: false,
    declarationMap: false,
    sourceMap: true,
    inlineSources: true,
});

export default [
    // ESM entry. package.json is "type": "module", so this `.js` file is what
    // `import` and `<script type="module">` load. A UMD wrapper cannot be this
    // file: Node would parse it as ESM and the `module.exports` branch would
    // never run.
    {
        input: 'src/application/jsmind.ts',
        output: {
            file: 'dist/jsmind.js',
            format: 'es',
            banner: banner,
            sourcemap: true,
        },
        plugins: [typescriptPlugin()],
    },
    // CJS entry. `.cjs` stays CommonJS even when the package is `"type":
    // "module"`, so `require('jsmind')` receives the library on every supported
    // Node, not only where require() of an ES module happens to be enabled.
    // `exports: 'default'` makes that value the class itself, not `{ default }`.
    {
        input: 'src/application/jsmind.ts',
        output: {
            file: 'dist/jsmind.cjs',
            format: 'cjs',
            exports: 'default',
            esModule: false,
            banner: banner,
            sourcemap: true,
        },
        plugins: [typescriptPlugin()],
    },
    // CLI bundle for Node — must not pull in the renderer, which needs a DOM.
    // Stays ESM, beside the library bundles, so it can read `jsmind.js` via
    // `__dirname` / `import.meta.url`.
    {
        input: 'src/cli/index.ts',
        output: {
            file: 'dist/cli.js',
            format: 'es',
            banner: banner,
            sourcemap: true,
        },
        external: [/^node:/],
        plugins: [typescriptPlugin()],
    },
    // TypeScript declaration files
    {
        input: 'src/application/jsmind.ts',
        output: {
            file: 'dist/jsmind.d.ts',
            format: 'es',
            banner: banner,
        },
        plugins: [dts()],
    },
];
