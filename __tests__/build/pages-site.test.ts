/**
 * @fileoverview The Pages assembler must keep the playground's module script.
 *
 * `dist/jsmind.js` is ESM. Publishing a classic `<script src="jsmind.js">`
 * throws on `export`, and a rewrite that misses the module tag leaves the
 * page pointing at `../dist/jsmind.js`, which does not exist on the site.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { rewritePlayground } from '../../scripts/assemble-pages.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

describe('pages site assembly', () => {
    it('rewrites the real playground to a module script beside the bundle', () => {
        const html = readFileSync(join(ROOT, 'example/playground.html'), 'utf8');
        const rewritten = rewritePlayground(html);

        assert.match(rewritten, /<script type="module" src="jsmind\.js"><\/script>/);
        assert.ok(!rewritten.includes('../dist/jsmind.js'));
        assert.ok(rewritten.includes('type="module"'));
    });

    it('refuses a classic script tag, which cannot run the ESM bundle', () => {
        const html = '<script type="text/javascript" src="../dist/jsmind.js"></script>';
        assert.throws(() => rewritePlayground(html), /type="module"/);
    });

    it('refuses a page that does not load the bundle', () => {
        assert.throws(() => rewritePlayground('<html></html>'), /type="module"/);
    });

    it('the workflow assembles the site with that script', () => {
        const workflow = readFileSync(join(ROOT, '.github/workflows/static.yml'), 'utf8');
        assert.match(workflow, /node scripts\/assemble-pages\.js/);
        assert.ok(!workflow.includes('sed '));
    });
});
