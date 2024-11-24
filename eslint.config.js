import globals from "globals";
import js from "@eslint/js";
import json from "@eslint/json";

export default [
    {
        plugins: {
            json
        }
    },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 6,
            sourceType: "module",
            globals: globals.browser,
        },
        rules: {
            camelcase: "error",
            "lines-between-class-members": "error",
            "indent": ["error", 4],
            "no-console": "off",
            "no-var": "error",
            "prefer-const": "error",
            semi: "error",
            "semi-spacing": "error",
        } 
    },
    {
        files: ["__tests__/**/*"],
        languageOptions: {
            globals: globals.jest
        }
    },
    {
        // files: ['**/*.json'],
        // language: 'json/json',
        // rules: {
        //     'json/no-duplicate-keys': 'error',
        //     'no-irregular-whitespace': 'off'
        // },
    }
];