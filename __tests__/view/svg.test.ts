/**
 * @fileoverview Tests for the SVG string helpers.
 *
 * These exist because both of them have been wrong in a way that produced a
 * plausible image: an unescaped quote ended an attribute early and the SVG
 * failed to parse, and reading custom properties off a `CSSStyleDeclaration`
 * yielded indices instead of names so the theme silently vanished.
 */

import { test } from 'node:test';
import assert from 'node:assert';

import {
    escapeAttribute,
    escapeText,
    collectHostVariables,
} from '../../src/view/svg.ts';

test('svg - escapeAttribute escapes the four characters that break XML', () => {
    assert.strictEqual(escapeAttribute('a&b<c>d"e'), 'a&amp;b&lt;c&gt;d&quot;e');
});

test('svg - escapeAttribute leaves ordinary text alone', () => {
    assert.strictEqual(escapeAttribute('Node 1'), 'Node 1');
    assert.strictEqual(escapeAttribute(''), '');
});

test('svg - escapeAttribute handles the quoted font-family that broke the export', () => {
    // A computed font-family arrives as `"Times New Roman", serif`. Written into
    // style="..." unchanged, the first quote ends the attribute and the SVG no
    // longer parses - with an error that names no line.
    const family = '"Times New Roman", serif';
    const escaped = escapeAttribute(family);

    assert.ok(!escaped.includes('"'), 'no bare quotes survive');
    assert.ok(escaped.startsWith('&quot;Times New Roman&quot;'));
});

test('svg - escapeAttribute escapes ampersands before the entities it creates', () => {
    // If `&` were replaced last, `a<b` would become `a&amp;lt;b` - the text a&lt;b
    // instead of a<b. The order of the replacements is the whole point.
    assert.strictEqual(escapeAttribute('a<b'), 'a&lt;b');
    assert.strictEqual(escapeAttribute('&lt;'), '&amp;lt;');
});

test('svg - escapeText escapes markup characters', () => {
    assert.strictEqual(escapeText('a & b < c > d'), 'a &amp; b &lt; c &gt; d');
});

test('svg - escapeText leaves quotes alone', () => {
    // Quotes are only special inside an attribute value. Escaping them in text
    // content would be harmless but wrong: the output would read `&quot;`.
    assert.strictEqual(escapeText('say "hi"'), 'say "hi"');
});

test('svg - collectHostVariables keeps only the theme custom properties', () => {
    const inline = 'color: red; --jm-node-fill: #fff; width: 10px; --jm-node-radius: 4px';

    assert.strictEqual(
        collectHostVariables(inline),
        '--jm-node-fill: #fff;--jm-node-radius: 4px'
    );
});

test('svg - collectHostVariables returns empty for a missing attribute', () => {
    // The host may legitimately have no style attribute at all.
    assert.strictEqual(collectHostVariables(null), '');
    assert.strictEqual(collectHostVariables(''), '');
});

test('svg - collectHostVariables returns empty when nothing is a custom property', () => {
    assert.strictEqual(collectHostVariables('color: red; width: 10px'), '');
});

test('svg - collectHostVariables tolerates the spacing a browser emits', () => {
    // setAttribute('style', ...) round-trips through the parser, which adds
    // spaces after the colons. Trimming per declaration is what makes both
    // forms work.
    assert.strictEqual(
        collectHostVariables('  --jm-a:  1px ;  ; --jm-b:2px  '),
        '--jm-a:  1px;--jm-b:2px'
    );
});
