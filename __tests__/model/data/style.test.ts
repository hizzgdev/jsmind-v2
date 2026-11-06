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
    resolveJmStyle,
    type JmStyle,
} from '../../../src/model/data/style.ts';

test('style - JmTone has the six semantic tones plus accent', () => {
    // Five semantic roles read as a statement about the content: this one
    // succeeded, this one is in danger. `default` is the absence of a statement.
    // `accent` is deliberately not semantic — it means "make this stand out"
    // without claiming anything — so it is listed apart rather than folded into
    // the same group.
    const semantic = ['danger', 'default', 'info', 'primary', 'success', 'warning'];
    const all = [...semantic, 'accent'];
    assert.deepStrictEqual(
        Object.values(JmTone).sort(),
        [...all].sort(),
        'tones should be the six semantic colors plus accent'
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

    const override: JmStyle = { tones: { [JmTone.Primary]: { fillColor: '#123456' } } };
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
    // resolveJmStyle. It must not leak into the resolved theme.
    const merged = mergeJmTheme(JSMIND_THEME_DEFAULT, { theme: 'default', background: '#222' });

    assert.strictEqual(merged.background, '#222', 'background applies');
    assert.strictEqual(
        Object.prototype.hasOwnProperty.call(merged, 'theme'),
        false,
        'theme must not appear in the resolved result'
    );
});

test('style - resolveJmStyle with no argument returns the default theme', () => {
    assert.deepStrictEqual(resolveJmStyle(), JSMIND_THEME_DEFAULT);
});

test('style - resolveJmStyle inherits default when theme is not named', () => {
    // The point of the flat declaration: inheriting is the default, so a file
    // that only overrides a colour does not have to name the preset.
    const resolved = resolveJmStyle({ background: '#101010' });

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

test('style - resolveJmStyle honours an explicit theme name', () => {
    const resolved = resolveJmStyle({ theme: 'default', background: '#333333' });

    assert.strictEqual(resolved.background, '#333333');
    assert.deepStrictEqual(resolved.tones, JSMIND_THEME_DEFAULT.tones);
});

test('style - resolveJmStyle deep merges overrides onto the inherited preset', () => {
    const resolved = resolveJmStyle({
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

test('style - resolveJmStyle throws on an unknown theme name', () => {
    assert.throws(() => resolveJmStyle({ theme: 'nope' }), /unknown theme: nope/);
});

test('style - resolveJmStyle throws on a non-string theme name', () => {
    assert.throws(
        () => resolveJmStyle({ theme: 42 } as unknown as JmStyle),
        /invalid theme name/
    );
});

test('style - resolveJmStyle throws on a non-object declaration', () => {
    assert.throws(
        () => resolveJmStyle('default' as unknown as JmStyle),
        /invalid style declaration/
    );
});

test('style - JmLinePattern exposes the three line patterns', () => {
    assert.deepStrictEqual(
        Object.values(JmLinePattern).sort(),
        ['dashed', 'dotted', 'solid']
    );
});

test('style - default theme carries the v1 geometry values', () => {
    // These are the numbers the stylesheet used, ported rather than retuned.
    // Changing one is a visual change to every map, so the test pins them.
    const node = JSMIND_THEME_DEFAULT.node;
    assert.ok(node);
    assert.strictEqual(node.padding, 10);
    assert.strictEqual(node.radius, 5);
    assert.strictEqual(node.fontSize, 16);
    assert.strictEqual(node.rootFontSize, 24);
    assert.strictEqual(node.lineHeight, 1.125);
    assert.strictEqual(node.maxWidth, 400);
    assert.match(node.fontFamily, /Verdana/);
    // Zero: v1 drew no node border and got its depth from the shadow.
    assert.strictEqual(node.borderWidth, 0);
});

test('style - default theme defines a shadow for every state', () => {
    const shadow = JSMIND_THEME_DEFAULT.node?.shadow;
    assert.ok(shadow, 'default theme must define node shadows');

    for (const state of ['normal', 'hover', 'selected'] as const) {
        const layer = shadow[state];
        assert.ok(layer, `${state} shadow must exist`);
        for (const key of ['offsetX', 'offsetY', 'blur'] as const) {
            assert.strictEqual(typeof layer[key], 'number', `${state}.${key} must be a number`);
        }
        assert.strictEqual(typeof layer.color, 'string', `${state}.color must be a string`);
    }
});

test('style - expander carries the v1 geometry', () => {
    const expander = JSMIND_THEME_DEFAULT.expander;
    assert.ok(expander);
    assert.strictEqual(expander.size, 13);
    assert.strictEqual(expander.radius, 6.5, 'half of size, i.e. the circle the stylesheet drew');
    assert.strictEqual(expander.fontSize, 8);
    assert.strictEqual(expander.lineHeight, 11);
    assert.strictEqual(expander.borderWidth, 1);
});

test('style - mergeJmTheme deep merges one shadow state without losing the others', () => {
    const merged = mergeJmTheme(JSMIND_THEME_DEFAULT, {
        node: { shadow: { hover: { blur: 16 } } },
    });
    const shadow = merged.node?.shadow;
    assert.ok(shadow);

    assert.strictEqual(shadow.hover.blur, 16, 'the overridden field');
    assert.strictEqual(shadow.hover.offsetX, 2, 'siblings inside the same layer survive');
    assert.strictEqual(shadow.normal.blur, 1, 'states the override did not mention survive');
    assert.strictEqual(shadow.selected.blur, 8);
});

test('style - mergeJmTheme leaves the shadow untouched when the override omits it', () => {
    const merged = mergeJmTheme(JSMIND_THEME_DEFAULT, { node: { padding: 20 } });
    assert.strictEqual(merged.node?.padding, 20);
    assert.deepStrictEqual(merged.node?.shadow, JSMIND_THEME_DEFAULT.node?.shadow);
});

test('style - mergeJmTheme composes shadow over an inherited preset', () => {
    const merged = resolveJmStyle({ node: { shadow: { normal: { color: '#ff0000' } } } });
    assert.strictEqual(merged.node?.shadow.normal.color, '#ff0000');
    assert.strictEqual(merged.node?.shadow.normal.offsetX, 1, 'rest of the layer kept');
    assert.strictEqual(merged.node?.shadow.hover.blur, 8, 'other states kept');
});
