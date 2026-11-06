/**
 * @license BSD
 * @copyright 2014-2025 hizzgdev@163.com
 *
 * Project Home:
 *   https://github.com/hizzgdev/jsmind/
 */

/**
 * Structural styles: where things sit and how they stack, never how they look.
 *
 * @remarks
 * These rules used to be an external stylesheet the caller had to load before
 * anything rendered. They are not meant to be edited by whoever embeds the
 * library, and a `.css` file shipped next to the build output invites two
 * failure modes: someone restyles it and the layout breaks in ways the tests
 * only catch as wrong coordinates, or someone forgets to include it and every
 * node stacks at 0,0. Shipping them inside the shadow root means a working
 * render has no external prerequisite.
 *
 * Nothing here decides appearance. Colour, radius, padding, font and shadow
 * come from the theme and are applied per element.
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
    }

    .jsmind-node-expander {
        position: absolute;
        display: block;
        overflow: hidden;
        text-align: center;
        cursor: pointer;
        box-sizing: border-box;
    }

    .jsmind-node-expander-expanded::after {
        display: block;
        content: '\\229D';
    }

    .jsmind-node-expander-collapsed::after {
        display: block;
        content: '\\2295';
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
 * Appearance rules, carried over verbatim from the stylesheet that used to be
 * loaded from outside.
 *
 * @remarks
 * The shadow boundary does not let an external `<link>` reach inside, so while
 * appearance still comes from CSS rather than from the theme, the rules have to
 * live on this side of the boundary or the map renders unstyled.
 *
 * **This block is transitional.** Every rule in it duplicates something the
 * theme already describes — padding, radius, font, shadow, the expander's size
 * and border — and goes away once the view applies the theme to elements
 * directly. Anything added here should be treated as debt, not as a decision.
 *
 * @private
 */
export const JSMIND_TRANSITIONAL_THEME_STYLES = `
    .jsmind-node {
        padding: 10px;
        background-color: #fff;
        color: #333;
        border-radius: 5px;
        box-shadow: 1px 1px 1px #666;
        font: 16px/1.125 Verdana, Arial, Helvetica, sans-serif;
        max-width: 400px;
    }
    .jsmind-node:hover {
        box-shadow: 2px 2px 8px #000;
        background-color: #ebebeb;
        color: #333;
    }
    .jsmind-node-selected {
        background-color: #11f;
        color: #fff;
        box-shadow: 2px 2px 8px #000;
    }
    .jsmind-node-root {
        font-size: 24px;
    }

    .jsmind-node-expander {
        width: 13px;
        height: 13px;
        border-radius: 50%;
    }
    .jsmind-node-expander-expanded::after,
    .jsmind-node-expander-collapsed::after {
        font-family: 'Arial';
        font-size: 18px;
        margin-top: -4.5px;
    }
    .jsmind-node-expander-number {
        font-size: 8px;
        text-align: center;
        line-height: 11px;
        border: solid 1px #666;
    }
    .jsmind-node-expander:hover {
        box-shadow: 1px 1px 8px #000;
        background-color: #ebebeb;
        color: #333;
    }

    @media screen and (max-device-width: 1024px) {
        .jsmind-node {
            padding: 5px;
            border-radius: 3px;
            font-size: 14px;
        }
        .jsmind-node-root {
            font-size: 21px;
        }
    }
`;

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
    style.textContent = JSMIND_VIEW_STYLES + JSMIND_TRANSITIONAL_THEME_STYLES;

    return root;
}
