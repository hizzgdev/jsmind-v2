/**
 * @fileoverview Pages rewrites the playground script src and nothing else.
 *
 * The page is already `<script type="module" src="../dist/jsmind.js">`.
 * That relative path is what `npm run server` needs. Publication copies the
 * page to the site root and the bundle beside it, so the workflow sed
 * changes the src to `jsmind.js` and leaves `type="module"` as written.
 * A second rewriter is not part of the deploy.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

const SOURCE_TAG = '<script type="module" src="../dist/jsmind.js"></script>';
const PUBLISHED_TAG = '<script type="module" src="jsmind.js"></script>';

describe('pages site assembly', () => {
    it('rewrites only the playground src and keeps the module script', () => {
        const html = readFileSync(join(ROOT, 'example/playground.html'), 'utf8');
        assert.ok(html.includes(SOURCE_TAG));

        const workflow = readFileSync(join(ROOT, '.github/workflows/static.yml'), 'utf8');
        assert.match(workflow, /sed 's\|src="\\\.\\\.\/dist\/jsmind\\\.js"\|src="jsmind\.js"\|'/);
        assert.match(workflow, /<script type="module" src="jsmind\.js">/);
        assert.ok(!workflow.includes('assemble-pages'));

        const published = html.replaceAll('src="../dist/jsmind.js"', 'src="jsmind.js"');
        assert.ok(published.includes(PUBLISHED_TAG));
        assert.ok(!published.includes('../dist/jsmind.js'));
        assert.ok(published.includes('type="module"'));
    });
});
