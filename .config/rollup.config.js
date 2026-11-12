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
    // Library bundle. ESM, not UMD: package.json is "type": "module", and a
    // UMD wrapper loaded as an ES module has an empty export namespace.
    // `globalThis.jsMind` is assigned from the module for pages and the CLI.
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
    // CLI bundle for Node — must not pull in the renderer, which needs a DOM.
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
