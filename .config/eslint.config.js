import globals from 'globals';
import json from '@eslint/json';
import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';

export default [
    {
        ignores: ['node_modules/*', 'coverage/*', 'dist/*'],
    },
    {
        plugins: {
            '@stylistic': stylistic,
            json,
        },
    },
    ...tseslint.configs.recommended,
    {
        files: ['**/*.ts', '.config/*.js'],
        ...stylistic.configs.recommended,
        languageOptions: {
            sourceType: 'module',
            globals: globals.browser,
        },
        rules: {
            'camelcase': 'error',
            'no-console': 'off',
            'no-var': 'error',
            '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-this-alias': 'error',
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
            '@stylistic/space-infix-ops': 'error'
        },
    },
    {
        files: ['**/*.css'],
        ...stylistic.configs.recommended
    },
    {
        files: ['*.json', '**/*.json'],
        ignores: ['package-lock.json'],
        language: 'json/json',
        ...json.configs.recommended,
    },
];
