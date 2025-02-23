import globals from 'globals';
import js from '@eslint/js';
import json from '@eslint/json';
import stylistic from '@stylistic/eslint-plugin';

export default [
    {
        ignores: ["node_modules/*", 'coverage/*'],
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
            'prefer-const': 'error',
            '@stylistic/lines-between-class-members': 'error',
            '@stylistic/indent': ['error', 4],
            '@stylistic/semi': 'error',
            '@stylistic/semi-spacing': 'error',
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
    {
        files: ['__tests__/**/*'],
        languageOptions: {
            globals: globals.jest,
        },
    },
];
