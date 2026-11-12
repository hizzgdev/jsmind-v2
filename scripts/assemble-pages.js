/**
 * Assembles the GitHub Pages site into `_site/`.
 *
 * The playground lives in `example/` and loads the ESM bundle:
 * `<script type="module" src="../dist/jsmind.js">`. Neither path survives
 * publication. The page moves to the site root and the bundle is copied
 * beside it, so the src has to be rewritten to `jsmind.js`.
 *
 * `type="module"` has to survive that rewrite. `dist/jsmind.js` is an ES
 * module; a classic script throws on `export` and the playground renders
 * nothing. A sed that only understood the old `type="text/javascript"` tag
 * left the page pointing at `../dist/`, and the site check then reported
 * `_site/playground.html` missing from a publishable site.
 */

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DIST_SRC = '../dist/jsmind.js';
const SITE_SRC = 'jsmind.js';

/**
 * Rewrites the playground so Pages serves it from the site root.
 *
 * @param {string} html - Contents of `example/playground.html`.
 * @returns {string} HTML that loads `./jsmind.js` as a module.
 */
export function rewritePlayground(html) {
    const tagPattern = /<script\b([^>]*)><\/script>/g;
    let foundModule = false;
    const rewritten = html.replace(tagPattern, (full, attrs) => {
        const src = attrs.match(/\bsrc\s*=\s*"([^"]*)"/);
        if (!src || src[1] !== DIST_SRC) {
            return full;
        }
        const isModule = /\btype\s*=\s*"module"/.test(attrs);
        if (!isModule) {
            throw new Error(
                'playground.html loads ../dist/jsmind.js without type="module". ' +
                'That file is an ES module; a classic script throws on export and the page stays blank.'
            );
        }
        foundModule = true;
        return full.replaceAll(DIST_SRC, SITE_SRC);
    });

    if (!foundModule) {
        throw new Error(
            'playground.html has no <script type="module" src="../dist/jsmind.js">. ' +
            'The Pages bundle is ESM and will not run from a classic script tag.'
        );
    }
    if (rewritten.includes(DIST_SRC)) {
        throw new Error('playground.html still points at ../dist/jsmind.js');
    }
    if (!rewritten.includes('type="module"') || !rewritten.includes(`src="${SITE_SRC}"`)) {
        throw new Error('playground.html does not load the bundle as a module');
    }
    return rewritten;
}

/**
 * Copies the three site files into `root/_site`.
 *
 * @param {string} [root] - Repository root. Defaults to this repo.
 * @returns {string} The `_site` directory.
 */
export function assembleSite(root = ROOT) {
    const site = join(root, '_site');
    mkdirSync(site, { recursive: true });
    copyFileSync(join(root, 'index.html'), join(site, 'index.html'));
    copyFileSync(join(root, 'dist', 'jsmind.js'), join(site, 'jsmind.js'));
    const playground = rewritePlayground(
        readFileSync(join(root, 'example', 'playground.html'), 'utf8')
    );
    writeFileSync(join(site, 'playground.html'), playground);

    for (const file of ['index.html', 'playground.html', 'jsmind.js']) {
        readFileSync(join(site, file));
    }
    return site;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const site = assembleSite();
    console.log(`assembled ${site}`);
}
