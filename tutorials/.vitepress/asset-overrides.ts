/**
 * @fileoverview Resolves per-locale tutorial assets at build and dev time.
 *
 * Shared files live in `tutorials/assets/`. When a language needs a different
 * picture or map — node labels in that language, for example — the different
 * file is placed in `tutorials/<locale>/assets_override/` under the same
 * name. Markdown in every language still points at `../../assets/<file>`.
 *
 * This plugin rewrites that path, for a page under `zh/` or `en/`, to the
 * override when one exists. The shared file in `tutorials/assets/` is never
 * overwritten. An empty `assets_override/` directory is not created here
 * and should not be checked in.
 */

import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const TUTORIALS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHARED_ASSETS = join(TUTORIALS_ROOT, 'assets');

/**
 * A Vite plugin that prefers `assets_override/` over the shared asset of the
 * same name, based on the locale of the importing page.
 *
 * @returns The plugin, to be registered in the tutorials VitePress config.
 */
export function tutorialAssetOverrides(): Plugin {
    return {
        name: 'tutorial-asset-overrides',
        enforce: 'pre',
        resolveId(source, importer) {
            if (importer === undefined || source.includes('\0')) {
                return null;
            }

            // `?url` / `?raw` must be stripped before the path is resolved,
            // then put back on the override so Vite keeps the original intent.
            const queryOffset = source.indexOf('?');
            const pathOnly = queryOffset === -1 ? source : source.slice(0, queryOffset);
            const query = queryOffset === -1 ? '' : source.slice(queryOffset);
            const resolved = resolve(dirname(importer), pathOnly);
            if (!isInside(SHARED_ASSETS, resolved)) {
                return null;
            }

            const locale = localeOf(importer);
            if (locale === null) {
                return null;
            }

            const override = join(
                TUTORIALS_ROOT,
                locale,
                'assets_override',
                relative(SHARED_ASSETS, resolved)
            );
            return existsSync(override) ? override + query : null;
        },
    };
}

function localeOf(importer: string): 'en' | 'zh' | null {
    const rel = relative(TUTORIALS_ROOT, importer);
    if (rel.startsWith(`zh${sep}`) || rel.startsWith('zh/')) {
        return 'zh';
    }
    if (rel.startsWith(`en${sep}`) || rel.startsWith('en/')) {
        return 'en';
    }
    return null;
}

function isInside(directory: string, file: string): boolean {
    const rel = relative(directory, file);
    return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !rel.startsWith('../');
}
