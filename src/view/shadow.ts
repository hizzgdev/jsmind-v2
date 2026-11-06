/**
 * @license BSD
 * @copyright 2014-2025 hizzgdev@163.com
 *
 * Project Home:
 *   https://github.com/hizzgdev/jsmind/
 */

import type { JmTheme, JmThemeShadowLayer } from '../model/data/style.ts';

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

    .jsmind-node:hover {
        box-shadow: var(--jm-node-shadow-hover);
    }

    .jsmind-node-selected {
        box-shadow: var(--jm-node-shadow-selected);
    }

    .jsmind-node-root {
        font-size: var(--jm-node-root-font-size);
    }

    .jsmind-node-expander {
        position: absolute;
        display: block;
        overflow: hidden;
        text-align: center;
        cursor: pointer;
        box-sizing: border-box;

        width: var(--jm-expander-size);
        height: var(--jm-expander-size);
        border-radius: var(--jm-expander-radius);
        border-width: var(--jm-expander-border-width);
        border-style: solid;
        border-color: var(--jm-expander-border-color);
        background-color: var(--jm-node-fill);
        color: var(--jm-node-text);
        box-shadow: var(--jm-node-shadow-normal);
    }

    /* The glyph is sized to sit inside the circle above, not to match the
       node's text. A theme that enlarged node font sizes would otherwise push
       the +/- out of a 13px control. These are details of the control itself,
       so they stay here instead of becoming theme fields. */
    .jsmind-node-expander-expanded::after,
    .jsmind-node-expander-collapsed::after {
        display: block;
        font-family: Arial, sans-serif;
        font-size: 18px;
        line-height: 1;
        margin-top: -4.5px;
    }

    .jsmind-node-expander-expanded::after {
        content: '\\229D';
    }

    .jsmind-node-expander-collapsed::after {
        content: '\\2295';
    }

    .jsmind-node-expander-number {
        font-size: var(--jm-expander-font-size);
        line-height: var(--jm-expander-line-height);
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
        set('--jm-node-fill', fallback.fillColor);
        set('--jm-node-text', fallback.textColor);
        set('--jm-node-border-color', fallback.borderColor);
        set('--jm-expander-border-color', fallback.borderColor);
    }
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
