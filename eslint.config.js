import globals from 'globals';
import js from '@eslint/js';
import json from '@eslint/json';
import stylistic from '@stylistic/eslint-plugin';

export default [
    {
        ignores: ['node_modules/*', 'coverage/*'],
    },
    {
        plugins: {
            '@stylistic': stylistic,
            json,
        },
    },
    {
        files: ['**/*.js'],
        ...stylistic.configs.recommended,
        ...js.configs.recommended,
        languageOptions: {
            ecmaVersion: 2018,
            sourceType: 'module',
            globals: globals.browser,
        },
        rules: {
            'camelcase': 'error',
            'no-console': 'off',
            'no-var': 'error',
            'no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
            'prefer-const': 'error',
            '@stylistic/comma-spacing': 'error',
            '@stylistic/eol-last': ['error', 'always'],
            '@stylistic/indent': ['error', 4],
            '@stylistic/lines-between-class-members': 'error',
            '@stylistic/newline-per-chained-call': ['error', {'ignoreChainWithDepth': 2}],
            '@stylistic/no-multiple-empty-lines': ['error', {'max': 2, 'maxEOF': 1}],
            '@stylistic/no-multi-spaces': 'error',
            '@stylistic/no-trailing-spaces': 'error',
            '@stylistic/quotes': ['error', 'single'],
            '@stylistic/quote-props': ['error', 'consistent'],
            '@stylistic/semi': 'error',
            '@stylistic/semi-spacing': 'error',
            '@stylistic/space-before-blocks': 'error',
            '@stylistic/space-in-parens': 'error',
        },
    },
    {
        files: ['**/*.css'],
        ...stylistic.configs.recommended
    },
    {
        files: ['**/*.json'],
        ignores: ['package-lock.json'],
        language: 'json/json',
        ...json.configs.recommended,
    },
];
