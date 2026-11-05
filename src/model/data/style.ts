/**
 * Style and theme data structures for JsMind mind maps.
 *
 * @remarks
 * This module only defines data. Nothing here draws anything — the rendering
 * layer consumes these values but never appears in this file.
 *
 * @packageDocumentation
 */

import { mergeObjects } from '../../common/object.ts';

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
export const JmLinePattern = {
    /** Continuous line. */
    Solid: 'solid',
    /** Dashed line. */
    Dashed: 'dashed',
    /** Dotted line. */
    Dotted: 'dotted',
} as const;

export type JmLinePattern = typeof JmLinePattern[keyof typeof JmLinePattern];

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
    /**
     * Line pattern.
     *
     * @remarks
     * Named `pattern` rather than `style` because this type is itself reached
     * through `node.style.incoming`, and `.style.style` reads badly. `pattern`
     * also covers `solid` honestly — `solid` is not a dash.
     */
    pattern?: JmLinePattern;
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
    borderStyle?: JmLinePattern;
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
    /**
     * Node background color.
     *
     * @remarks
     * Every field here carries a `Color` suffix. The palette sits alongside
     * `JmNodeStyle`, which already uses `borderColor`, so `borderColor` means
     * the same thing in both places and an agent reading the JSON never has to
     * guess whether `fill` or `border` is a color or a length.
     */
    fillColor: string;
    /** Node text color. */
    textColor: string;
    /** Node border color. */
    borderColor: string;
    /** Connecting line color. */
    lineColor: string;
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
    /** Default line pattern. Named `pattern` to match `JmLineStyle.pattern`. */
    pattern: JmLinePattern;
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
    /** Canvas background color. */
    background?: string;
    /** Per-tone color palettes. */
    tones?: Partial<Record<JmTone, Partial<JmTonePalette>>>;
    /** Node geometry. */
    node?: Partial<JmThemeNode>;
    /** Line geometry. */
    line?: Partial<JmThemeLine>;
    /** Expander geometry. */
    expander?: Partial<JmThemeExpander>;
}

/**
 * Style declaration for a mind map, as stored in the data file.
 *
 * @remarks
 * Read this as: "this mind map looks like this — it inherits from `theme`, then
 * overrides the fields listed below."
 *
 * Splitting inheritance from overrides into one flat declaration avoids the
 * ambiguity of a nested `{ name, ...overrides }` form, where `name` could be
 * read either as "what this theme is called" or as "which theme to inherit".
 * Here `theme` can only mean the latter.
 *
 * - `theme` names a built-in preset to inherit from. Omitted means `"default"`,
 *   so a file that only overrides a few colors does not have to name it.
 * - Every other field is an override applied on top of that preset, merged
 *   deeply.
 *
 * @public
 */
export interface JmStyles {
    /** Name of the built-in theme to inherit from. Defaults to `"default"`. */
    theme?: string;
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
 * The only theme built into this version.
 *
 * @remarks
 * Dark mode is a separate theme, not a light/dark variant pair of the same
 * theme, because a dark palette is not a mechanical inversion of a light one.
 *
 * @public
 */
export const JSMIND_THEME_DEFAULT: JmTheme = {
    background: '#ffffff',
    tones: {
        default: { fillColor: '#ffffff', textColor: '#333333', borderColor: '#cccccc', lineColor: '#b0b0b0' },
        primary: { fillColor: '#e8f3ff', textColor: '#1a5fb4', borderColor: '#7ab0f0', lineColor: '#5a9ae8' },
        success: { fillColor: '#e9f7ef', textColor: '#1e7b4d', borderColor: '#6cc79a', lineColor: '#4fb681' },
        warning: { fillColor: '#fff8e6', textColor: '#8a6100', borderColor: '#e8c46a', lineColor: '#d4a944' },
        danger:  { fillColor: '#fdecec', textColor: '#b3261e', borderColor: '#e88a84', lineColor: '#d97069' },
        info:    { fillColor: '#eef4fb', textColor: '#2a6296', borderColor: '#8bb8dd', lineColor: '#6fa5d2' },
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
        pattern: JmLinePattern.Solid,
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
export const JSMIND_THEME_PRESETS: Record<string, JmTheme> = {
    default: JSMIND_THEME_DEFAULT,
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
export function mergeJmTheme(base: JmTheme, override: JmStyles): JmTheme {
    const result: JmTheme = { ...base };

    // `theme` names the preset to inherit from and is consumed by
    // resolveJmStyles before this runs, so there is nothing to carry over here.
    if (override.background !== undefined) {
        result.background = override.background;
    }

    // node/line/expander each hold scalars, so they merge one level deep with
    // the same flat merge the options layer uses. Spread the base first:
    // mergeObjects replaces a missing default wholesale, which would drop
    // every field the override did not mention.
    if (override.node) {
        result.node = mergeObjects({ ...base.node }, override.node);
    }
    if (override.line) {
        result.line = mergeObjects({ ...base.line }, override.line);
    }
    if (override.expander) {
        result.expander = mergeObjects({ ...base.expander }, override.expander);
    }

    // `tones` is the one section nested two levels deep: tone -> palette. Each
    // palette must be merged field by field, or an override that names only
    // `fillColor` would drop textColor/borderColor/lineColor and the node
    // would render black on black.
    if (override.tones) {
        result.tones = mergeTonePalettes(base.tones, override.tones);
    }

    return result;
}

/**
 * Merges tone palette overrides into a set of palettes.
 *
 * @remarks
 * Per tone, the palette is merged field by field. Tones the override does not
 * mention are passed through untouched.
 *
 * @param base - The palettes to merge onto, possibly absent.
 * @param override - The per-tone overrides to apply.
 * @returns New palettes; neither input is mutated.
 *
 * @private
 */
function mergeTonePalettes(
    base: Partial<Record<JmTone, Partial<JmTonePalette>>> | undefined,
    override: Partial<Record<JmTone, Partial<JmTonePalette>>>
): Partial<Record<JmTone, Partial<JmTonePalette>>> {
    const tones: Partial<Record<JmTone, Partial<JmTonePalette>>> = { ...base };

    for (const key of Object.keys(override) as JmTone[]) {
        const overridePalette = override[key];
        if (!overridePalette) {
            continue;
        }
        tones[key] = mergeObjects(tones[key], overridePalette);
    }

    return tones;
}

/**
 * Resolves a style declaration into a complete theme.
 *
 * @remarks
 * `styles.theme` picks the preset to inherit from (default `"default"`), then
 * every other field in `styles` is merged on top of it, deeply.
 *
 * @param styles - The style declaration, if the data carried one.
 * @returns A fully populated theme; never partial.
 * @throws {@link Error} If the named preset does not exist.
 *
 * @public
 */
export function resolveJmStyles(styles?: JmStyles): JmTheme {
    if (styles === undefined || styles === null) {
        return { ...JSMIND_THEME_DEFAULT };
    }

    if (!isPlainObject(styles)) {
        throw new Error('invalid styles declaration');
    }

    const themeName = styles.theme ?? 'default';
    if (typeof themeName !== 'string') {
        throw new Error('invalid theme name');
    }

    const preset = JSMIND_THEME_PRESETS[themeName];
    if (!preset) {
        throw new Error(`unknown theme: ${themeName}`);
    }

    return mergeJmTheme(preset, styles);
}
