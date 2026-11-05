/**
 * @fileoverview Tests for style and theme data structures
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
    JmTone,
    JmLinePattern,
    JSMIND_THEME_DEFAULT,
    JSMIND_THEME_PRESETS,
    mergeJmTheme,
    resolveJmStyles,
    type JmStyles,
} from '../../../src/model/data/style.ts';

test('style - JmTone has exactly six semantic tones', () => {
    assert.deepStrictEqual(
        Object.values(JmTone).sort(),
        ['danger', 'default', 'info', 'primary', 'success', 'warning'],
        'tones should be the six agreed semantic colors'
    );
});

test('style - default theme defines a complete palette for every tone', () => {
    const tones = JSMIND_THEME_DEFAULT.tones;
    assert.ok(tones, 'default theme must define tones');

    for (const tone of Object.values(JmTone)) {
        const palette = tones[tone];
        assert.ok(palette, `tone ${tone} must have a palette`);
        for (const key of ['fillColor', 'textColor', 'borderColor', 'lineColor'] as const) {
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
    assert.ok(JSMIND_THEME_DEFAULT.node);
    assert.ok(JSMIND_THEME_DEFAULT.line);
    assert.ok(JSMIND_THEME_DEFAULT.expander);

    assert.strictEqual(typeof JSMIND_THEME_DEFAULT.node.radius, 'number');
    assert.strictEqual(typeof JSMIND_THEME_DEFAULT.node.padding, 'number');
    assert.strictEqual(typeof JSMIND_THEME_DEFAULT.node.fontSize, 'number');
    assert.strictEqual(typeof JSMIND_THEME_DEFAULT.node.fontFamily, 'string');
    assert.strictEqual(typeof JSMIND_THEME_DEFAULT.line.width, 'number');
    assert.strictEqual(typeof JSMIND_THEME_DEFAULT.expander.size, 'number');
});

test('style - default theme carries no theme name of its own', () => {
    // JmTheme is the resolved result, not a declaration. A `name` here is what
    // made `{ name, ...overrides }` ambiguous to begin with.
    assert.strictEqual(
        Object.prototype.hasOwnProperty.call(JSMIND_THEME_DEFAULT, 'name'),
        false,
        'a resolved theme has no name field'
    );
});

test('style - only the default preset is built in', () => {
    assert.deepStrictEqual(
        Object.keys(JSMIND_THEME_PRESETS),
        ['default'],
        'first version ships exactly one preset'
    );
});

test('style - mergeJmTheme deep merges tone palettes', () => {
    // Regression guard for the shallow-merge trap: overriding only fillColor
    // must keep textColor/borderColor/lineColor. A shallow merge would drop
    // them and the node would render black-on-black.
    const basePrimary = JSMIND_THEME_DEFAULT.tones![JmTone.Primary]!;

    const merged = mergeJmTheme(JSMIND_THEME_DEFAULT, {
        tones: { [JmTone.Primary]: { fillColor: '#ff0000' } },
    });

    const mergedPrimary = merged.tones![JmTone.Primary]!;
    assert.strictEqual(mergedPrimary.fillColor, '#ff0000', 'fillColor should be overridden');
    assert.strictEqual(mergedPrimary.textColor, basePrimary.textColor, 'textColor must survive');
    assert.strictEqual(mergedPrimary.borderColor, basePrimary.borderColor, 'borderColor must survive');
    assert.strictEqual(mergedPrimary.lineColor, basePrimary.lineColor, 'lineColor must survive');
});

test('style - mergeJmTheme does not mutate its inputs', () => {
    const baseSnapshot = JSON.parse(JSON.stringify(JSMIND_THEME_DEFAULT));

    const override: JmStyles = { tones: { [JmTone.Primary]: { fillColor: '#123456' } } };
    const overrideSnapshot = JSON.parse(JSON.stringify(override));

    mergeJmTheme(JSMIND_THEME_DEFAULT, override);

    assert.deepStrictEqual(JSMIND_THEME_DEFAULT, baseSnapshot, 'base must be untouched');
    assert.deepStrictEqual(override, overrideSnapshot, 'override must be untouched');
});

test('style - mergeJmTheme merges geometry sections one level deep', () => {
    const merged = mergeJmTheme(JSMIND_THEME_DEFAULT, { node: { radius: 20 } });

    assert.strictEqual(merged.node!.radius, 20, 'radius should be overridden');
    assert.strictEqual(
        merged.node!.padding,
        JSMIND_THEME_DEFAULT.node!.padding,
        'padding must survive'
    );
    assert.strictEqual(
        merged.node!.fontSize,
        JSMIND_THEME_DEFAULT.node!.fontSize,
        'fontSize must survive'
    );
});

test('style - mergeJmTheme ignores the theme field', () => {
    // `theme` names the preset to inherit from and is consumed by
    // resolveJmStyles. It must not leak into the resolved theme.
    const merged = mergeJmTheme(JSMIND_THEME_DEFAULT, { theme: 'default', background: '#222' });

    assert.strictEqual(merged.background, '#222', 'background applies');
    assert.strictEqual(
        Object.prototype.hasOwnProperty.call(merged, 'theme'),
        false,
        'theme must not appear in the resolved result'
    );
});

test('style - resolveJmStyles with no argument returns the default theme', () => {
    assert.deepStrictEqual(resolveJmStyles(), JSMIND_THEME_DEFAULT);
});

test('style - resolveJmStyles inherits default when theme is not named', () => {
    // The point of the flat declaration: inheriting is the default, so a file
    // that only overrides a colour does not have to name the preset.
    const resolved = resolveJmStyles({ background: '#101010' });

    assert.strictEqual(resolved.background, '#101010', 'override applies');
    assert.deepStrictEqual(
        resolved.tones,
        JSMIND_THEME_DEFAULT.tones,
        'tones inherited from default'
    );
    assert.deepStrictEqual(
        resolved.node,
        JSMIND_THEME_DEFAULT.node,
        'geometry inherited from default'
    );
});

test('style - resolveJmStyles honours an explicit theme name', () => {
    const resolved = resolveJmStyles({ theme: 'default', background: '#333333' });

    assert.strictEqual(resolved.background, '#333333');
    assert.deepStrictEqual(resolved.tones, JSMIND_THEME_DEFAULT.tones);
});

test('style - resolveJmStyles deep merges overrides onto the inherited preset', () => {
    const resolved = resolveJmStyles({
        theme: 'default',
        tones: { [JmTone.Danger]: { fillColor: '#000000' } },
    });

    assert.strictEqual(resolved.tones![JmTone.Danger]!.fillColor, '#000000', 'override applied');
    assert.strictEqual(
        resolved.tones![JmTone.Danger]!.textColor,
        JSMIND_THEME_DEFAULT.tones![JmTone.Danger]!.textColor,
        'unmentioned palette fields come from the preset'
    );
    assert.strictEqual(
        resolved.tones![JmTone.Primary]!.fillColor,
        JSMIND_THEME_DEFAULT.tones![JmTone.Primary]!.fillColor,
        'other tones are untouched'
    );
});

test('style - resolveJmStyles throws on an unknown theme name', () => {
    assert.throws(() => resolveJmStyles({ theme: 'nope' }), /unknown theme: nope/);
});

test('style - resolveJmStyles throws on a non-string theme name', () => {
    assert.throws(
        () => resolveJmStyles({ theme: 42 } as unknown as JmStyles),
        /invalid theme name/
    );
});

test('style - resolveJmStyles throws on a non-object declaration', () => {
    assert.throws(
        () => resolveJmStyles('default' as unknown as JmStyles),
        /invalid styles declaration/
    );
});

test('style - JmLinePattern exposes the three line patterns', () => {
    assert.deepStrictEqual(
        Object.values(JmLinePattern).sort(),
        ['dashed', 'dotted', 'solid']
    );
});
