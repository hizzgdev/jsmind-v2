/**
 * Small string helpers the SVG wrapper needs.
 *
 * Pulled out of `export.ts` so they can be tested - hence the name. Everything left in that file
 * talks to the browser - cloning nodes, decoding images, encoding canvases -
 * and none of it runs under the unit suite. These do, and they are the parts
 * that failed silently when they were wrong:
 *
 * - an unescaped quote in an attribute ends it early, and the SVG fails to
 *   parse with an error that names no line
 * - reading custom properties by iterating `CSSStyleDeclaration` yields
 *   indices rather than property names, so the filter matched nothing and every
 *   node lost its fill
 *
 * Both were bugs that produced a plausible-looking but wrong image.
 *
 * @packageDocumentation
 */

/**
 * Escapes a value for use inside a double-quoted XML attribute.
 *
 * Computed values arrive unescaped: `font-family` on a document with a quoted
 * family yields the quotes themselves.
 *
 * @param value - Raw attribute value.
 * @returns The value with `&`, `<`, `>` and `"` replaced by entities.
 */
export function escapeAttribute(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Escapes text content for XML.
 *
 * Quotes are left alone: they are only special inside an attribute value.
 *
 * @param value - Raw text.
 * @returns The text with `&`, `<` and `>` replaced by entities.
 */
export function escapeText(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Extracts the theme's custom properties from an inline style declaration.
 *
 * The theme reaches the DOM as `--jm-*` properties set inline on the host
 * element. A clone of the inner content keeps the ones set on nodes themselves,
 * but not these, so without copying them every node loses its fill, border,
 * radius and shadow and the export comes out as bare text.
 *
 * Takes the attribute string rather than the element on purpose: parsing it is
 * the part that has been wrong before, and it does not need a DOM to get right.
 *
 * @param styleAttribute - The host's inline `style` attribute, or `null`.
 * @returns The `--jm-*` declarations, joined with semicolons; empty when none.
 */
export function collectHostVariables(styleAttribute: string | null): string {
    if (styleAttribute === null) {
        return '';
    }
    return styleAttribute
        .split(';')
        .map(part => part.trim())
        .filter(part => part.startsWith('--jm-'))
        .join(';');
}
