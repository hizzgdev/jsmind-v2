/**
 * @fileoverview Tests for style and theme data structures
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
    JmTone,
    JmLineStyleType,
    JM_THEME_DEFAULT,
    JM_THEME_PRESETS,
    mergeJmTheme,
    resolveJmTheme,
    type JmTheme,
} from '../../../src/model/data/style.ts';

test('style - JmTone has exactly six semantic tones', () => {
    assert.deepStrictEqual(
        Object.values(JmTone).sort(),
        ['danger', 'default', 'info', 'primary', 'success', 'warning'],
        'tones should be the six agreed semantic colors'
    );
});

test('style - default theme defines a complete palette for every tone', () => {
    const tones = JM_THEME_DEFAULT.tones;
    assert.ok(tones, 'default theme must define tones');

    for (const tone of Object.values(JmTone)) {
        const palette = tones[tone];
        assert.ok(palette, `tone ${tone} must have a palette`);
        for (const key of ['fill', 'text', 'border', 'line'] as const) {
            assert.strictEqual(
                typeof palette[key],
                'string',
                `tone ${tone} must define ${key}`
            );
            assert.ok(palette[key], `tone ${tone}.${key} must not be empty`);
        }
    }
});

test('style - default theme has geometry for node, line and expander', () => {
    assert.ok(JM_THEME_DEFAULT.node);
    assert.ok(JM_THEME_DEFAULT.line);
    assert.ok(JM_THEME_DEFAULT.expander);

    assert.strictEqual(typeof JM_THEME_DEFAULT.node.radius, 'number');
    assert.strictEqual(typeof JM_THEME_DEFAULT.node.padding, 'number');
    assert.strictEqual(typeof JM_THEME_DEFAULT.node.fontSize, 'number');
    assert.strictEqual(typeof JM_THEME_DEFAULT.node.fontFamily, 'string');
    assert.strictEqual(typeof JM_THEME_DEFAULT.line.width, 'number');
    assert.strictEqual(typeof JM_THEME_DEFAULT.expander.size, 'number');
});

test('style - only the default preset is built in', () => {
    assert.deepStrictEqual(
        Object.keys(JM_THEME_PRESETS),
        ['default'],
        'first version ships exactly one preset'
    );
});

test('style - mergeJmTheme deep merges tone palettes', () => {
    // This is the regression guard for the shallow-merge trap: overriding only
    // `fill` must keep text/border/line. A shallow merge would drop them and
    // the node would render black-on-black.
    const base = resolveJmTheme('default');
    const basePrimary = base.tones![JmTone.Primary]!;

    const merged = mergeJmTheme(base, {
        tones: { [JmTone.Primary]: { fill: '#ff0000' } },
    });

    const mergedPrimary = merged.tones![JmTone.Primary]!;
    assert.strictEqual(mergedPrimary.fill, '#ff0000', 'fill should be overridden');
    assert.strictEqual(mergedPrimary.text, basePrimary.text, 'text must survive');
    assert.strictEqual(mergedPrimary.border, basePrimary.border, 'border must survive');
    assert.strictEqual(mergedPrimary.line, basePrimary.line, 'line must survive');
});

test('style - mergeJmTheme does not mutate its inputs', () => {
    const base = resolveJmTheme('default');
    const baseSnapshot = JSON.parse(JSON.stringify(base));

    const override = { tones: { [JmTone.Primary]: { fill: '#123456' } } };
    const overrideSnapshot = JSON.parse(JSON.stringify(override));

    mergeJmTheme(base, override);

    assert.deepStrictEqual(base, baseSnapshot, 'base must be untouched');
    assert.deepStrictEqual(override, overrideSnapshot, 'override must be untouched');
});

test('style - mergeJmTheme merges geometry sections shallowly', () => {
    // node/line/expander hold scalars only, so a plain spread is correct there.
    const base = resolveJmTheme('default');
    const merged = mergeJmTheme(base, { node: { radius: 20 } });

    assert.strictEqual(merged.node!.radius, 20, 'radius should be overridden');
    assert.strictEqual(merged.node!.padding, base.node!.padding, 'padding must survive');
    assert.strictEqual(merged.node!.fontSize, base.node!.fontSize, 'fontSize must survive');
});

test('style - resolveJmTheme with no argument returns the default theme', () => {
    const resolved = resolveJmTheme();
    assert.strictEqual(resolved.name, 'default');
    assert.strictEqual(resolved.background, JM_THEME_DEFAULT.background);
});

test('style - resolveJmTheme resolves a preset name', () => {
    const resolved = resolveJmTheme('default');
    assert.strictEqual(resolved.name, 'default');
    assert.deepStrictEqual(resolved.tones, JM_THEME_DEFAULT.tones);
});

test('style - resolveJmTheme merges preset plus overrides when name is present', () => {
    const resolved = resolveJmTheme({
        name: 'default',
        tones: { [JmTone.Danger]: { fill: '#000000' } },
    });

    assert.strictEqual(resolved.tones![JmTone.Danger]!.fill, '#000000', 'override applied');
    assert.strictEqual(
        resolved.tones![JmTone.Danger]!.text,
        JM_THEME_DEFAULT.tones![JmTone.Danger]!.text,
        'unmentioned palette fields come from the preset'
    );
    assert.strictEqual(
        resolved.tones![JmTone.Primary]!.fill,
        JM_THEME_DEFAULT.tones![JmTone.Primary]!.fill,
        'other tones are untouched'
    );
});

test('style - resolveJmTheme uses an inline theme as-is when it has no name', () => {
    const custom: JmTheme = { background: '#101010' };
    const resolved = resolveJmTheme(custom);

    assert.strictEqual(resolved.background, '#101010');
    assert.strictEqual(resolved.name, undefined, 'a nameless theme does not inherit a preset');
});

test('style - resolveJmTheme throws on an unknown preset name', () => {
    assert.throws(() => resolveJmTheme('nope'), /unknown theme preset: nope/);
});

test('style - resolveJmTheme throws on an unknown preset name inside an inline theme', () => {
    assert.throws(
        () => resolveJmTheme({ name: 'nope' }),
        /unknown theme preset: nope/
    );
});

test('style - JmLineStyleType exposes the three dash styles', () => {
    assert.deepStrictEqual(
        Object.values(JmLineStyleType).sort(),
        ['dashed', 'dotted', 'solid']
    );
});
