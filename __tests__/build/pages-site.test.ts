/**
 * @fileoverview `npm run assemble-site` is what publishes the playground.
 *
 * The page in `example/` is a module script whose src is `../dist/jsmind.js`.
 * That relative path is what `npm run server` needs. The command copies the
 * page to the site root and the bundle beside it, and rewrites only the src.
 * `type` may sit on either side of `src`. The Pages workflow runs the command
 * and does not check the tag itself.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assembleSite, moduleScriptSrcs, rewritePlayground } from '../../scripts/assemble-site.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

describe('pages site assembly', () => {
    it('keeps the source playground on the local bundle path', () => {
        const html = readFileSync(join(ROOT, 'example/playground.html'), 'utf8');
        assert.deepStrictEqual(moduleScriptSrcs(html), ['../dist/jsmind.js']);

        const published = rewritePlayground(html);
        assert.deepStrictEqual(moduleScriptSrcs(published), ['jsmind.js']);
        assert.ok(!published.includes('../dist/jsmind.js'));
    });

    it('accepts type after src, and rejects a classic script', () => {
        const reversed = '<script src="../dist/jsmind.js" type="module"></script>';
        assert.strictEqual(
            rewritePlayground(reversed),
            '<script src="jsmind.js" type="module"></script>'
        );

        assert.throws(
            () => rewritePlayground('<script src="../dist/jsmind.js"></script>'),
            /does not load jsmind\.js as a module/
        );
        assert.throws(
            () => rewritePlayground('<script type="module" src="jsmind.js"></script>'),
            /has no script/
        );
    });

    it('writes the three site files and nothing the workflow has to check', () => {
        const dir = mkdtempSync(join(tmpdir(), 'jsmind-site-'));
        try {
            mkdirSync(join(dir, 'example'), { recursive: true });
            mkdirSync(join(dir, 'dist'), { recursive: true });
            writeFileSync(join(dir, 'index.html'), '<html>home</html>\n');
            writeFileSync(join(dir, 'dist', 'jsmind.js'), 'export {}\n');
            writeFileSync(
                join(dir, 'example', 'playground.html'),
                '<script src="../dist/jsmind.js" type="module"></script>\n'
            );

            assembleSite(dir);

            assert.strictEqual(readFileSync(join(dir, '_site', 'index.html'), 'utf8'), '<html>home</html>\n');
            assert.strictEqual(readFileSync(join(dir, '_site', 'jsmind.js'), 'utf8'), 'export {}\n');
            assert.strictEqual(
                readFileSync(join(dir, '_site', 'playground.html'), 'utf8'),
                '<script src="jsmind.js" type="module"></script>\n'
            );
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }

        const workflow = readFileSync(join(ROOT, '.github/workflows/static.yml'), 'utf8');
        assert.match(workflow, /npm run assemble-site/);
        assert.ok(!workflow.includes('grep'));
        assert.ok(!workflow.includes('sed '));
        assert.ok(!workflow.includes('assemble-pages'));
    });
});
