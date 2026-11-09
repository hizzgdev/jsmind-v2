/**
 * @license BSD
 * @copyright 2014-2025 hizzgdev@163.com
 *
 * Project Home:
 *   https://github.com/hizzgdev/jsmind/
 */

import type { JmTheme, JmThemeShadowLayer, JmTonePalette } from '../model/data/style.ts';

/**
 * Styles installed into the shadow root.
 *
 * @remarks
 * Two kinds of rule live here.
 *
 * Positioning (`absolute`, `z-index`, `overflow`) is decided here and nowhere
 * else. It is how the renderer finds room for a node at a coordinate it
 * computed, not a matter of taste, so it is not a theme field.
 *
 * Everything that decides how a node *looks* reads a custom property rather
 * than naming a value. Those values come from the theme, written onto the host
 * element by {@link applyThemeToHost}. The indirection is what lets one
 * stylesheet serve every theme while a single node still carries its own tone
 * color: custom properties inherit, so a value set on one node wins for that
 * node alone.
 *
 * These rules used to be an external stylesheet the caller had to remember to
 * load. Forgetting it stacked every node at 0,0 and reported no error.
 *
 * @private
 */
export const JSMIND_VIEW_STYLES = `
    :host {
        display: block;
        position: relative;
        width: 100%;
        height: 100%;
        outline: none;
        -webkit-user-select: none;
        user-select: none;
        background-color: var(--jm-background);
    }

    .jsmind-inner {
        position: relative;
        overflow: auto;
        width: 100%;
        height: 100%;
        outline: none;
        -webkit-user-select: none;
        user-select: none;
    }

    /* Transparent, not omitted: a node is appended here to be measured, and
       the box needs its own background layer or the measured width collapses. */
    .jsmind-nodes {
        position: absolute;
        z-index: 2;
        background-color: rgba(0, 0, 0, 0);
    }

    .jsmind-edges {
        position: absolute;
        z-index: 1;
    }

    .jsmind-node {
        position: absolute;
        cursor: default;

        padding: var(--jm-node-padding);
        border-radius: var(--jm-node-radius);
        border: var(--jm-node-border-width) solid var(--jm-node-border-color);
        max-width: var(--jm-node-max-width);
        font-family: var(--jm-node-font-family);
        font-size: var(--jm-node-font-size);
        line-height: var(--jm-node-line-height);
        background-color: var(--jm-node-fill);
        color: var(--jm-node-text);
        box-shadow: var(--jm-node-shadow-normal);
    }

    /* Hover and selection change colour as well as shadow. Those two colours
       are interaction state, not theme: the theme describes what a node looks
       like at rest, and its tones say what a node means. Folding state colours
       into that would make --jm-node-fill mean two things at once. */
    .jsmind-node:hover {
        box-shadow: var(--jm-node-shadow-hover);
        background-color: #ebebeb;
        color: #333333;
    }

    .jsmind-node-selected {
        box-shadow: var(--jm-node-shadow-selected);
        background-color: #11f;
        color: #ffffff;
    }

    .jsmind-node-root {
        font-size: var(--jm-node-root-font-size);
    }

    /* The expander is a control, not content. Size and radius are theme fields
       because they belong to the layout budget; everything else here — the
       transparent fill, the clipping, the 18px glyph below — is how the control
       itself is drawn and is fixed.
     *
     * No border on this variant. A border here would sit inside border-box and
       shrink the content area to 11px, so a 13px-wide glyph would be clipped
       unevenly and read as off-centre. The number variant is the one with a
       border, and it is declared there. */
    .jsmind-node-expander {
        position: absolute;
        overflow: hidden;
        cursor: pointer;

        /* Flex centring rather than text-align plus a negative margin-top.
           The glyph is 18px inside a 13px box, so it overflows on both axes and
           the clipping has to be even. text-align centres the line box, but
           where the ink sits inside that line box comes from the font's ascent
           and side bearings — which differ between Arial, DejaVu, Liberation
           and whatever a given machine substitutes. A hand-tuned margin
           compensates for exactly one font and reads as a 1px drift on every
           other. Flex centres the painted glyph itself. */
        display: flex;
        align-items: center;
        justify-content: center;

        width: var(--jm-expander-size);
        height: var(--jm-expander-size);
        border-radius: var(--jm-expander-radius);
        box-sizing: border-box;
    }

    /* 18px glyph inside a 13px circle: deliberately larger than the box, with
       the overhang clipped on both sides. Sizing it to match node text instead
       would let a theme's font size push the +/- out of the control. */
    .jsmind-node-expander-expanded::after {
        font-family: Arial, sans-serif;
        font-size: 18px;
        line-height: 1;
        content: '\\229D';
    }

    .jsmind-node-expander-collapsed::after {
        font-family: Arial, sans-serif;
        font-size: 18px;
        line-height: 1;
        content: '\\2295';
    }

    /* The only variant that draws a border, and it keeps the neutral #666 the
       v1 stylesheet used. Not var(--jm-node-border-color): that would follow the
       node's tone, and the default tone's border is #cccccc — a barely visible
       ring on a white background. The control is an affordance drawn beside the
       node, not part of what the node means. */
    .jsmind-node-expander-number {
        font-size: var(--jm-expander-font-size);
        text-align: center;
        line-height: var(--jm-expander-line-height);
        border: solid var(--jm-expander-border-width) #666666;
    }

    /* Lighter than a node's hover shadow on purpose — the expander is small and
       a full-strength shadow would swamp it. */
    .jsmind-node-expander:hover {
        box-shadow: 1px 1px 8px #000000;
        background-color: #ebebeb;
        color: #333333;
    }



    .jmnode-overflow-wrap .jsmind-nodes {
        min-width: 420px;
    }

    .jmnode-overflow-hidden .jsmind-node {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
`;

/**
 * Formats a theme shadow layer as a CSS `box-shadow` value.
 *
 * @param layer - The layer to format.
 * @returns A value like `1px 1px 1px #666666`.
 *
 * @private
 */
function formatShadow(layer: JmThemeShadowLayer): string {
    return `${layer.offsetX}px ${layer.offsetY}px ${layer.blur}px ${layer.color}`;
}

/**
 * Writes a theme's values onto the host element as custom properties.
 *
 * @remarks
 * Done on the host rather than on the shadow root because custom properties
 * inherit: set here, every rule inside sees them, and a value set on a single
 * node overrides it for that node alone. That is what makes per-node tone
 * colors possible without generating a stylesheet per mind map.
 *
 * Values are written complete, with units (`10px`, not `10`), because the
 * stylesheet interpolates them directly into positions where a bare number is
 * not a valid length.
 *
 * The `default` tone is applied here too, as the fallback for nodes that name
 * no tone of their own.
 *
 * @param root - The shadow root whose host should carry the values.
 * @param theme - The fully resolved theme.
 *
 * @private
 */
export function applyThemeToHost(root: ShadowRoot, theme: JmTheme): void {
    const host = root.host as HTMLElement;

    /** Sets a custom property only when the theme actually carries a value. */
    const set = (name: string, value: string | number | undefined, unit = ''): void => {
        if (value !== undefined) {
            host.style.setProperty(name, `${value}${unit}`);
        }
    };

    set('--jm-background', theme.background);

    const node = theme.node;
    if (node) {
        set('--jm-node-padding', node.padding, 'px');
        set('--jm-node-radius', node.radius, 'px');
        set('--jm-node-border-width', node.borderWidth, 'px');
        set('--jm-node-max-width', node.maxWidth, 'px');
        set('--jm-node-font-family', node.fontFamily);
        set('--jm-node-font-size', node.fontSize, 'px');
        set('--jm-node-root-font-size', node.rootFontSize, 'px');
        // Unitless on purpose: it is a multiplier of the font size, and CSS
        // would read a pixel value as an absolute line box instead.
        set('--jm-node-line-height', node.lineHeight);

        const shadow = node.shadow;
        if (shadow) {
            set('--jm-node-shadow-normal', formatShadow(shadow.normal));
            set('--jm-node-shadow-hover', formatShadow(shadow.hover));
            set('--jm-node-shadow-selected', formatShadow(shadow.selected));
        }
    }

    const expander = theme.expander;
    if (expander) {
        set('--jm-expander-size', expander.size, 'px');
        set('--jm-expander-radius', expander.radius, 'px');
        set('--jm-expander-border-width', expander.borderWidth, 'px');
        set('--jm-expander-font-size', expander.fontSize, 'px');
        set('--jm-expander-line-height', expander.lineHeight, 'px');
    }

    // The default tone is the fallback for nodes that name no tone of their
    // own; a node with a tone overrides all four on its own element.
    const fallback = theme.tones?.default;
    if (fallback) {
        // ShadowRoot.host is typed as Element; at runtime it is the host element
        // the view was opened on, so style is there.
        applyTonePalette(root.host as HTMLElement, fallback);
    }
}

/** Anything that can carry a custom property — a node element or the host. */
interface CustomPropertyTarget {
    style: { setProperty(name: string, value: string): void };
}

/**
 * Writes a tone palette's three colours onto an element as custom properties.
 *
 * @remarks
 * One function rather than two copies of the same three lines. `applyThemeToHost`
 * calls it for the default tone, which becomes the fallback for every node that
 * names no tone of its own; `JmNodeView` calls it per node, where the value wins
 * for that node and nothing else. Keeping the mapping here means a tone that
 * gains a field gains it in both places at once.
 *
 * The expander is deliberately not a consumer: it sits outside the node box,
 * and colouring its outline from the node's tone would make a white-toned node
 * grow a white outline. It keeps the neutral #666 its stylesheet specifies.
 *
 * @param target - Anything with a `style` object. Typed structurally because the
 * two callers pass different things — `JmElement` for a node, a plain `Element`
 * for the host — and `style.setProperty` is all this needs from either.
 * @param palette - Tone to apply. Undefined leaves the target untouched.
 * @returns Nothing.
 */
export function applyTonePalette(
    target: CustomPropertyTarget,
    palette: Partial<JmTonePalette> | null | undefined
): void {
    if (!palette) {
        return;
    }
    const set = (name: string, value: string | undefined): void => {
        if (value !== undefined) {
            target.style.setProperty(name, value);
        }
    };
    set('--jm-node-fill', palette.fillColor);
    set('--jm-node-text', palette.textColor);
    set('--jm-node-border-color', palette.borderColor);
}

/**
 * Attaches a shadow root to the host element and installs the styles in it.
 *
 * @remarks
 * `open` rather than `closed` so the rendered DOM stays inspectable — for
 * debugging, for the tests, and for anyone who needs to reach a node element
 * from outside. The isolation is about styles, not secrecy.
 *
 * A host that already has a shadow root keeps it. Calling `attachShadow` twice
 * throws, and constructing the view again on the same host (which happens when
 * a mind map is reloaded) must not.
 *
 * @param container - The host element supplied by the caller.
 * @returns The shadow root that rendered content belongs in.
 *
 * @private
 */
export function attachViewShadowRoot(container: HTMLElement): ShadowRoot {
    const existing = container.shadowRoot;
    const root = existing ?? container.attachShadow({ mode: 'open' });

    // Reuse the style element this function created earlier, so repeated view
    // construction on the same host does not stack copies of the rules.
    const marker = 'data-jsmind-view-styles';
    let style = root.querySelector(`style[${marker}]`) as HTMLStyleElement | null;
    if (!style) {
        style = document.createElement('style');
        style.setAttribute(marker, '');
        root.appendChild(style);
    }
    style.textContent = JSMIND_VIEW_STYLES;

    return root;
}
