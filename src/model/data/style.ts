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
    /**
     * Accent tone for an element that stands out without carrying a judgement.
     *
     * @remarks
     * `primary` already means "this is the important one", which is a claim
     * about the content. `accent` is the option for "make this one visually
     * distinct" with no claim attached — the purple that v1 exposed as
     * `theme-wisteria` and that none of the semantic tones could absorb.
     */
    Accent: 'accent',
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
 * One drop shadow, in CSS terms.
 *
 * @remarks
 * Spelled out as four numbers and a color rather than kept as a CSS string
 * like `"1px 1px 1px #666"` so it can be merged field by field — an override
 * that changes only the blur should not have to restate the offsets — and so
 * an agent writing the JSON never has to get CSS shorthand syntax right.
 *
 * @public
 */
export interface JmThemeShadowLayer {
    /** Horizontal offset in pixels. */
    offsetX: number;
    /** Vertical offset in pixels. */
    offsetY: number;
    /** Blur radius in pixels. */
    blur: number;
    /** Shadow color, e.g. `#666666`. */
    color: string;
}

/**
 * Drop shadows for the three visual states a node can be in.
 *
 * @remarks
 * States live in the theme rather than in CSS because they change the node's
 * appearance, and "how does this node look" belongs with the rest of the
 * appearance. `normal` is the resting state; `hover` and `selected` are what
 * the pointer and the selection do to it.
 *
 * @public
 */
export interface JmThemeShadow {
    /** Shadow when the node is idle. */
    normal: JmThemeShadowLayer;
    /** Shadow while the pointer is over the node. */
    hover: JmThemeShadowLayer;
    /** Shadow when the node is selected. */
    selected: JmThemeShadowLayer;
}

/**
 * A partial replacement for {@link JmThemeShadow}.
 *
 * @remarks
 * Every level is optional so a style can restyle one state, or one field of one
 * state (`hover.blur`), without restating the rest. The merged result is always
 * complete.
 *
 * @public
 */
export interface JmThemeShadowOverride {
    /** Override for the idle shadow. */
    normal?: Partial<JmThemeShadowLayer>;
    /** Override for the hover shadow. */
    hover?: Partial<JmThemeShadowLayer>;
    /** Override for the selected shadow. */
    selected?: Partial<JmThemeShadowLayer>;
}

/**
 * Partial overrides for {@link JmThemeNode}.
 *
 * @remarks
 * Identical to `Partial<JmThemeNode>` except for `shadow`, which allows
 * overriding a single state rather than all three.
 *
 * @public
 */
export type JmThemeNodeOverride = Omit<Partial<JmThemeNode>, 'shadow'> & {
    /** Override for the node shadows. */
    shadow?: JmThemeShadowOverride;
};

/**
 * Geometry and typography shared by every node.
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
    /**
     * Root node font size in pixels.
     *
     * @remarks
     * Separate from `fontSize` because the root is the one node that reads as a
     * title: v1 rendered it at 24px against a 16px body. Folding it into
     * `fontSize` would have forced every theme to pick one and lose the
     * hierarchy.
     */
    rootFontSize: number;
    /** Font family. */
    fontFamily: string;
    /**
     * Line height as a multiple of the font size.
     *
     * @remarks
     * Unitless multiplier, matching the CSS `line-height: 1.125` form, so it
     * scales with `fontSize` instead of needing a matching pixel value per size.
     */
    lineHeight: number;
    /** Default border width in pixels. */
    borderWidth: number;
    /**
     * Maximum node width in pixels before text wraps.
     *
     * @remarks
     * Wrapping is a layout input, not a detail: it decides how tall a node is,
     * which decides where its children go.
     */
    maxWidth: number;
    /** Drop shadows for the idle, hover and selected states. */
    shadow: JmThemeShadow;
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
    /** Expander width and height in pixels. */
    size: number;
    /**
     * Corner radius in pixels.
     *
     * @remarks
     * `size / 2` gives a circle, which is what the stylesheet did with
     * `border-radius: 50%`. A number keeps it in the same units as every other
     * length here; percentage radii only make sense when the box can grow.
     */
    radius: number;
    /** Font size of the character or count drawn inside, in pixels. */
    fontSize: number;
    /** Line height of that content, in pixels. */
    lineHeight: number;
    /** Border width in pixels. */
    borderWidth: number;
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
 * Style declaration for a whole mind map, as stored in the data file.
 *
 * @remarks
 * Named in the singular, like the per-node and per-edge style fields: one
 * `style` concept, with the scope decided by where it sits. `mind.style` covers
 * the whole map; `node.style` covers one node; `edge.style` covers one edge.
 * Carrying both `styles` and `style` in one document only differed by an `s`,
 * which is a trap for an agent generating the JSON.
 *
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
export interface JmStyle {
    /** Name of the built-in theme to inherit from. Defaults to `"default"`. */
    theme?: string;
    /** Canvas background color. */
    background?: string;
    /** Per-tone color overrides. */
    tones?: Partial<Record<JmTone, Partial<JmTonePalette>>>;
    /** Node geometry overrides. */
    node?: JmThemeNodeOverride;
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
    // Filled solids with white text, taken from v1 — a node carrying a tone
    // that only tints its background barely reads as "this one is different"
    // from across the canvas. The v1 palette names that map onto these tones
    // (belizehole, nephrite, pumpkin, pomegranate) are the same hue a few
    // degrees away, so they fold in rather than getting their own entry.
    tones: {
        default: { fillColor: '#ffffff', textColor: '#333333', borderColor: '#cccccc', lineColor: '#b0b0b0' },
        primary: { fillColor: '#428bca', textColor: '#ffffff', borderColor: '#357ebd', lineColor: '#689ece' },
        success: { fillColor: '#5cb85c', textColor: '#ffffff', borderColor: '#4cae4c', lineColor: '#79c279' },
        warning: { fillColor: '#f0ad4e', textColor: '#ffffff', borderColor: '#eea236', lineColor: '#f2b968' },
        danger:  { fillColor: '#d9534f', textColor: '#ffffff', borderColor: '#d43f3a', lineColor: '#df6f6b' },
        info:    { fillColor: '#5dc0de', textColor: '#ffffff', borderColor: '#46b8da', lineColor: '#74cae3' },
        accent:  { fillColor: '#9b59b6', textColor: '#ffffff', borderColor: '#8e44ad', lineColor: '#aa73c2' },
    },
    node: {
        radius: 5,
        padding: 10,
        fontSize: 16,
        rootFontSize: 24,
        fontFamily: 'Verdana, Arial, Helvetica, sans-serif',
        lineHeight: 1.125,
        // Zero, because the stylesheet drew no border: the depth came from the
        // shadow below. Tone palettes still carry a borderColor for themes that
        // do want one.
        borderWidth: 0,
        maxWidth: 400,
        shadow: {
            normal:   { offsetX: 1, offsetY: 1, blur: 1, color: '#666666' },
            hover:    { offsetX: 2, offsetY: 2, blur: 8, color: '#000000' },
            selected: { offsetX: 2, offsetY: 2, blur: 8, color: '#000000' },
        },
    },
    line: {
        width: 2,
        pattern: JmLinePattern.Solid,
    },
    expander: {
        size: 13,
        radius: 6.5,
        fontSize: 8,
        lineHeight: 11,
        borderWidth: 1,
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
export function mergeJmTheme(base: JmTheme, override: JmStyle): JmTheme {
    const result: JmTheme = { ...base };

    // `theme` names the preset to inherit from and is consumed by
    // resolveJmStyle before this runs, so there is nothing to carry over here.
    if (override.background !== undefined) {
        result.background = override.background;
    }

    // node/line/expander each hold scalars, so they merge one level deep with
    // the same flat merge the options layer uses. Spread the base first:
    // mergeObjects replaces a missing default wholesale, which would drop
    // every field the override did not mention.
    if (override.node) {
        // `shadow` is decomposed first: it nests further than the rest
        // (state -> layer), and `mergeObjects` cannot express that in one call.
        const { shadow: shadowOverride, ...nodeRest } = override.node;
        const merged = mergeObjects(
            { ...base.node } as Partial<JmThemeNode>,
            nodeRest as Partial<JmThemeNode>
        );
        // A shallow merge would let an override that only restyles `hover`
        // replace the whole shadow block, dropping `normal` and `selected` and
        // leaving the node with no resting shadow at all.
        const baseShadow = base.node?.shadow;
        if (baseShadow && shadowOverride) {
            merged.shadow = mergeShadow(baseShadow, shadowOverride);
        }
        result.node = merged;
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
 * Merges shadow overrides into a complete shadow.
 *
 * @remarks
 * Two levels deep: state, then layer. Each state the override does not mention
 * is passed through, and each layer is merged field by field so `hover.blur`
 * alone is a legal override.
 *
 * @param base - The complete shadow to merge onto.
 * @param override - The partial shadow to apply.
 * @returns A new complete shadow; neither input is mutated.
 *
 * @private
 */
function mergeShadow(base: JmThemeShadow, override: JmThemeShadowOverride): JmThemeShadow {
    const result: JmThemeShadow = { ...base };

    for (const state of ['normal', 'hover', 'selected'] as const) {
        const layer = override[state];
        if (layer) {
            result[state] = mergeObjects({ ...base[state] }, layer);
        }
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
 * `style.theme` picks the preset to inherit from (default `"default"`), then
 * every other field in `style` is merged on top of it, deeply.
 *
 * @param style - The style declaration, if the data carried one.
 * @returns A fully populated theme; never partial.
 * @throws {@link Error} If the named preset does not exist.
 *
 * @public
 */
export function resolveJmStyle(style?: JmStyle): JmTheme {
    if (style === undefined || style === null) {
        return { ...JSMIND_THEME_DEFAULT };
    }

    if (!isPlainObject(style)) {
        throw new Error('invalid style declaration');
    }

    const themeName = style.theme ?? 'default';
    if (typeof themeName !== 'string') {
        throw new Error('invalid theme name');
    }

    const preset = JSMIND_THEME_PRESETS[themeName];
    if (!preset) {
        throw new Error(`unknown theme: ${themeName}`);
    }

    return mergeJmTheme(preset, style);
}
