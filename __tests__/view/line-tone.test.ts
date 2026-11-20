/**
 * @fileoverview A node's tone and the tone its connecting line is drawn in must
 * be one decision.
 *
 * @remarks
 * The fill and the line are painted in two different modules, so the fallback
 * chain is written once (`resolveNodeTone`) and both call it. This file exists
 * because the failure mode when they drift is silent and specific: recoloured
 * nodes hanging from unchanged lines.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { JmView } from '../../src/view/index.ts';
import { resolveNodeTone } from '../../src/view/node.ts';
import { JmMind } from '../../src/model/mind.ts';
import { JmNodeContent } from '../../src/model/data/node-content.ts';
import {
    JSMIND_THEME_DEFAULT,
    JmTone,
    resolveJmStyle,
    type JmTheme,
} from '../../src/model/data/style.ts';
import type { JmNode } from '../../src/model/data/node.ts';
import type { JmResolvedLineStyle } from '../../src/view/edge.ts';

/**
 * A view that carries only a theme.
 *
 * @remarks
 * `_resolveLineStyle` reads the resolved theme and the node's style and nothing
 * else, so the container, arranger and shadow root a real view needs are noise
 * here. Building a full view would test jsdom's shadow DOM as much as this
 * rule.
 *
 * @param theme - The resolved theme to report line styles for.
 * @returns A view whose theme is set.
 */
function viewWith(theme: JmTheme): JmView {
    const view = Object.create(JmView.prototype) as JmView;
    (view as unknown as { theme: JmTheme }).theme = theme;
    return view;
}

/**
 * Resolves one node's line style through the view's own fallback.
 *
 * @param view - View carrying the theme.
 * @param node - Child node the line leads to.
 * @returns The style the edge would be drawn with.
 */
function lineStyleOf(view: JmView, node: JmNode): JmResolvedLineStyle {
    const private_ = view as unknown as { _resolveLineStyle(node: JmNode): JmResolvedLineStyle };
    return private_._resolveLineStyle(node);
}

test('view - a node tone beats the document defaultTone, which beats "default"', () => {
    const withDefault = resolveJmStyle({ defaultTone: JmTone.Accent });

    assert.strictEqual(
        resolveNodeTone({ tone: JmTone.Danger }, withDefault),
        JmTone.Danger,
        'the node states its own tone'
    );
    assert.strictEqual(
        resolveNodeTone(undefined, withDefault),
        JmTone.Accent,
        'an untoned node wears the document default'
    );
    assert.strictEqual(
        resolveNodeTone(undefined, resolveJmStyle()),
        JmTone.Default,
        'a document that declares nothing falls back to "default"'
    );
    assert.strictEqual(
        resolveNodeTone(undefined, null),
        JmTone.Default,
        'a view with no theme applied yet still has an answer'
    );
});

test('view - the line leading to an untoned node follows the document defaultTone', () => {
    // The half of the feature that is easy to forget: node fill changes, line
    // stays gray.
    const mind = new JmMind();
    const node = mind.addNode(JmNodeContent.createText('Child'), { parentId: mind.root.id });

    const style = lineStyleOf(viewWith(resolveJmStyle({ defaultTone: JmTone.Primary })), node);

    assert.strictEqual(
        style.color,
        JSMIND_THEME_DEFAULT.tones![JmTone.Primary]!.lineColor,
        'the line takes the default tone palette, not the default palette'
    );
});

test('view - a node tone still wins over the document defaultTone for the line', () => {
    const mind = new JmMind();
    const node = mind.addNode(JmNodeContent.createText('Child'), { parentId: mind.root.id });
    node.style = { tone: JmTone.Success };

    const style = lineStyleOf(viewWith(resolveJmStyle({ defaultTone: JmTone.Primary })), node);

    assert.strictEqual(style.color, JSMIND_THEME_DEFAULT.tones![JmTone.Success]!.lineColor);
});

test('view - an explicit incoming color still beats the tone', () => {
    const mind = new JmMind();
    const node = mind.addNode(JmNodeContent.createText('Child'), { parentId: mind.root.id });
    node.style = { incoming: { color: '#123456' } };

    const style = lineStyleOf(viewWith(resolveJmStyle({ defaultTone: JmTone.Primary })), node);

    assert.strictEqual(style.color, '#123456');
});

test('view - the line is unchanged when no defaultTone is declared', () => {
    const mind = new JmMind();
    const node = mind.addNode(JmNodeContent.createText('Child'), { parentId: mind.root.id });

    const style = lineStyleOf(viewWith(resolveJmStyle()), node);

    assert.strictEqual(style.color, JSMIND_THEME_DEFAULT.tones![JmTone.Default]!.lineColor);
});

test('view - a defaultTone keeps following a tones override on the same document', () => {
    // The reason defaultTone stores a name: the palette is looked up after the
    // override is merged, so restyling the tone restyles every node wearing it.
    const mind = new JmMind();
    const node = mind.addNode(JmNodeContent.createText('Child'), { parentId: mind.root.id });

    const theme = resolveJmStyle({
        defaultTone: JmTone.Info,
        tones: { [JmTone.Info]: { lineColor: '#0000ff' } },
    });

    assert.strictEqual(lineStyleOf(viewWith(theme), node).color, '#0000ff');
});
