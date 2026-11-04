/**
 * Style and theme data structures for JsMind mind maps.
 *
 * @remarks
 * This module only defines data. Nothing here draws anything — the rendering
 * layer consumes these values but never appears in this file.
 *
 * @packageDocumentation
 */

/**
 * Semantic tone. Expresses color only, never geometry.
 *
 * @remarks
 * Semantic roles are about color; geometry is orthogonal (a node can be
 * warning-colored, thick-bordered and large-font at once). Keeping them apart
 * gives the agent fewer side effects per change, which makes generated output
 * more controllable.
 *
 * @public
 */
export const JmTone = {
    /** Default tone, resolved from the theme's neutral palette. */
    Default: 'default',
    /** Primary or emphasis tone. */
    Primary: 'primary',
    /** Success or positive tone. */
    Success: 'success',
    /** Warning or caution tone. */
    Warning: 'warning',
    /** Danger or negative tone. */
    Danger: 'danger',
    /** Informational or neutral-accent tone. */
    Info: 'info',
} as const;

export type JmTone = typeof JmTone[keyof typeof JmTone];

/**
 * Line dash style.
 *
 * @public
 */
export const JmLineStyleType = {
    /** Continuous line. */
    Solid: 'solid',
    /** Dashed line. */
    Dashed: 'dashed',
    /** Dotted line. */
    Dotted: 'dotted',
} as const;

export type JmLineStyleType = typeof JmLineStyleType[keyof typeof JmLineStyleType];

/**
 * Visual style of a single line.
 *
 * @remarks
 * Shared by two places: `JmNodeStyle.incoming` (the line connecting a node to
 * its parent) and `JmEdge.style` (lines for additional, non-hierarchical
 * relationships). One shape avoids two vocabularies for the same thing.
 *
 * @public
 */
export interface JmLineStyle {
    /** Line color, e.g. `#4a9eff`. */
    color?: string;
    /** Line width in pixels. */
    width?: number;
    /** Dash style. */
    style?: JmLineStyleType;
}

/**
 * Visual overrides for a single node.
 *
 * @remarks
 * Every field is optional and unset fields fall back to the theme. The node
 * carries only what differs from the theme, so a theme change still reaches
 * every node that did not explicitly override anything.
 *
 * `incoming` lives on the child node: a line connects exactly one child, which
 * makes the child the natural owner. The name mirrors the layout layer
 * (`calculateNodeIncomingPoint` / `calculateNodeOutgoingPoint`).
 *
 * @public
 */
export interface JmNodeStyle {
    /** Semantic tone for this node. Overrides background/border/color from the theme. */
    tone?: JmTone;
    /** Background color, e.g. `#ffffff`. */
    background?: string;
    /** Text color. */
    color?: string;
    /** Border color. */
    borderColor?: string;
    /** Border width in pixels. */
    borderWidth?: number;
    /** Border dash style. */
    borderStyle?: JmLineStyleType;
    /** Font size in pixels. */
    fontSize?: number;
    /** Font weight. */
    fontWeight?: 'normal' | 'bold';
    /** Style of the line connecting this node to its parent. */
    incoming?: JmLineStyle;
}

/**
 * Colors a tone resolves to.
 *
 * @remarks
 * `line` is the color of the connecting line, which usually differs from
 * `border` so that a subtree reads as one visual grouping.
 *
 * @public
 */
export interface JmTonePalette {
    /** Node background color. */
    fill: string;
    /** Node text color. */
    text: string;
    /** Node border color. */
    border: string;
    /** Connecting line color. */
    line: string;
}

/**
 * Geometry shared by every node of a mind map.
 *
 * @public
 */
export interface JmThemeNode {
    /** Corner radius in pixels. */
    radius: number;
    /** Inner padding in pixels. */
    padding: number;
    /** Base font size in pixels. */
    fontSize: number;
    /** Font family. */
    fontFamily: string;
    /** Default border width in pixels. */
    borderWidth: number;
}

/**
 * Geometry shared by every line of a mind map.
 *
 * @public
 */
export interface JmThemeLine {
    /** Default line width in pixels. */
    width: number;
    /** Default dash style. */
    style: JmLineStyleType;
}

/**
 * Geometry of the collapse/expand control.
 *
 * @public
 */
export interface JmThemeExpander {
    /** Expander size in pixels. */
    size: number;
}

/**
 * Complete visual theme.
 *
 * @remarks
 * Every section except `name` is optional and merged deeply over the built-in
 * preset it names, so a theme can override one tone color without restating
 * every other color.
 *
 * @public
 */
export interface JmTheme {
    /** Name of the built-in preset to merge onto. Omit for a self-contained theme. */
    name?: string;
    /** Canvas background color. */
    background?: string;
    /** Per-tone color overrides. */
    tones?: Partial<Record<JmTone, Partial<JmTonePalette>>>;
    /** Node geometry overrides. */
    node?: Partial<JmThemeNode>;
    /** Line geometry overrides. */
    line?: Partial<JmThemeLine>;
    /** Expander geometry overrides. */
    expander?: Partial<JmThemeExpander>;
}

/**
 * Reference to a theme: either a preset name or an inline theme definition.
 *
 * @remarks
 * `"default"` refers to a built-in preset. `{ name: "default", ... }` refers to
 * a preset plus overrides, merged deeply. `{ ... }` without `name` is a
 * self-contained theme used as-is.
 *
 * @public
 */
export type JmThemeRef = string | JmTheme;

/**
 * The only theme built into this version.
 *
 * @remarks
 * Dark mode is a separate theme, not a light/dark variant pair of the same
 * theme, because a dark palette is not a mechanical inversion of a light one.
 *
 * @public
 */
export const JM_THEME_DEFAULT: JmTheme = {
    name: 'default',
    background: '#ffffff',
    tones: {
        default: { fill: '#ffffff', text: '#333333', border: '#cccccc', line: '#b0b0b0' },
        primary: { fill: '#e8f3ff', text: '#1a5fb4', border: '#7ab0f0', line: '#5a9ae8' },
        success: { fill: '#e9f7ef', text: '#1e7b4d', border: '#6cc79a', line: '#4fb681' },
        warning: { fill: '#fff8e6', text: '#8a6100', border: '#e8c46a', line: '#d4a944' },
        danger:  { fill: '#fdecec', text: '#b3261e', border: '#e88a84', line: '#d97069' },
        info:    { fill: '#eef4fb', text: '#2a6296', border: '#8bb8dd', line: '#6fa5d2' },
    },
    node: {
        radius: 4,
        padding: 8,
        fontSize: 14,
        fontFamily: 'sans-serif',
        borderWidth: 1,
    },
    line: {
        width: 2,
        style: JmLineStyleType.Solid,
    },
    expander: {
        size: 12,
    },
};

/**
 * Built-in theme presets, keyed by name.
 *
 * @public
 */
export const JM_THEME_PRESETS: Record<string, JmTheme> = {
    default: JM_THEME_DEFAULT,
};

/**
 * Checks whether a value is a plain object that can be merged.
 *
 * @param value - The value to check.
 * @returns True for plain objects, false for arrays, null and primitives.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deeply merges theme overrides onto a base theme.
 *
 * @remarks
 * A shallow merge is not enough. `tones: { primary: { fill: "#f00" } }` merged
 * shallowly would replace the whole `primary` entry, dropping `text`, `border`
 * and `line`, and the node would render black-on-black. Deep merge keeps the
 * fields the override did not mention.
 *
 * @param base - The theme to merge onto.
 * @param override - The partial theme to apply.
 * @returns A new merged theme; neither input is mutated.
 *
 * @public
 */
export function mergeJmTheme(base: JmTheme, override: Partial<JmTheme>): JmTheme {
    const result: JmTheme = { ...base };

    if (override.name !== undefined) {
        result.name = override.name;
    }
    if (override.background !== undefined) {
        result.background = override.background;
    }

    if (override.tones) {
        const tones: Partial<Record<JmTone, Partial<JmTonePalette>>> = { ...base.tones };
        for (const key of Object.keys(override.tones) as JmTone[]) {
            const basePalette = tones[key];
            const overridePalette = override.tones[key];
            if (!overridePalette) {
                continue;
            }
            tones[key] = basePalette ? { ...basePalette, ...overridePalette } : { ...overridePalette };
        }
        result.tones = tones;
    }

    if (override.node) {
        result.node = { ...base.node, ...override.node };
    }
    if (override.line) {
        result.line = { ...base.line, ...override.line };
    }
    if (override.expander) {
        result.expander = { ...base.expander, ...override.expander };
    }

    return result;
}

/**
 * Resolves a theme reference against the built-in presets.
 *
 * @param ref - A preset name, an inline theme, or nothing.
 * @returns The resolved theme, always fully populated.
 * @throws {@link Error} If a preset name is not built in.
 *
 * @public
 */
export function resolveJmTheme(ref?: JmThemeRef): JmTheme {
    if (ref === undefined || ref === null) {
        return { ...JM_THEME_DEFAULT };
    }

    if (typeof ref === 'string') {
        const preset = JM_THEME_PRESETS[ref];
        if (!preset) {
            throw new Error(`unknown theme preset: ${ref}`);
        }
        return { ...preset };
    }

    if (!isPlainObject(ref)) {
        throw new Error('invalid theme definition');
    }

    // Narrow once here: `isPlainObject` leaves every field as `unknown`, while
    // an inline theme is exactly a JmTheme.
    const inlineTheme = ref as JmTheme;

    if (inlineTheme.name !== undefined) {
        const name = inlineTheme.name;
        if (typeof name !== 'string') {
            throw new Error('invalid theme name');
        }
        const preset = JM_THEME_PRESETS[name];
        if (!preset) {
            throw new Error(`unknown theme preset: ${name}`);
        }
        return mergeJmTheme(preset, inlineTheme);
    }

    return { ...inlineTheme };
}
