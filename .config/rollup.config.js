import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

const banner = `/**
 * @license BSD-3-Clause
 * @copyright 2014-2025 hizzgdev@163.com
 *
 * Project Home:
 *   https://github.com/hizzgdev/jsmind/
 */`;

export default [
    // JavaScript bundle for browser use
    {
        input: 'src/application/jsmind.ts',
        output: {
            name: 'jsMind',
            file: 'dist/jsmind.js',
            format: 'umd',
            banner: banner,
            sourcemap: true,
        },
        plugins: [
            typescript({
                tsconfig: './tsconfig.json',
                declaration: false,
                declarationMap: false,
                sourceMap: true,
                // noForceEmit: true,
            }),
        ],
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
