# Theme system

The appearance of jsMind v2 is entirely data-driven by the theme. The stylesheet no longer writes any concrete values — every color, geometric property, and shadow is passed in through CSS custom properties, and one stylesheet serves every theme.

## 1. Architecture

```
JmMind.style (JSON) → resolveJmStyle() → JmTheme (complete)
    → applyThemeToHost()   → write --jm-* custom properties onto the host element (geometry + shadows + default colors)
    → nodeView.setTheme()  → store a palette reference (later each node calls _applyTone)
```

**Geometric properties are written on the host, and every node inherits them.** Colors are written on each node element, so a per-node override only affects that one node.

## 2. tone: five semantic colors + accent

```ts
const JmTone = {
    Default: 'default',   // no stance; same color as the canvas, blends into the background
    Primary: 'primary',   // emphasis
    Success: 'success',   // holds / passes
    Warning: 'warning',   // attention
    Danger:  'danger',    // something is wrong
    Info:    'info',      // supplementary information
    Accent:  'accent',    // only makes it stand out visually, with no judgment
};
```

**tone expresses color only, not geometry.** A node can be “warning color + a thick border + a large font size” at the same time. The palette uses a solid fill plus white text (taken from v1); a light background with dark text is almost indistinguishable at small sizes.

`accent` comes from v1's purple theme (`theme-wisteria`) and has no semantic meaning — it only says “make this conspicuous”, without attaching claims such as “important” or “something is wrong”.

## 3. Override chain

Three fallbacks, from the most specific to the default:

```
Color:       node.style.<explicit>           ??  theme.tones[effective tone].<corresponding color>
Geometry:    node.style.<explicit>           ??  theme.node.<default>
Line color:  node.style.incoming.color       ??  theme.tones[child tone].lineColor
Line width:  node.style.incoming.width       ??  theme.line.width
Line style:  node.style.incoming.pattern     ??  theme.line.pattern
Shape:       node.style.incoming.curve       ??  theme.line.curve
```

**A line's color is taken from the child node's tone, not the parent's.** A line corresponds to exactly one child, and `incoming` hangs on the child. If the line inherited from the parent, changing the parent's color would recolor every line in the subtree.

**`curve` does not participate in tone fallback.** tone is color; attaching geometric information would make “the same tone, a different shape” inexpressible.

## 4. Theme merging

```ts
resolveJmStyle(style?) → JmTheme
```

The preset is looked up by the name in `style.theme` (default `"default"`), then the remaining fields of `style` are deep-merged. **This is not a shallow merge.** If `tones: { primary: { fillColor: "#f00" } }` were shallow-merged, the entire `primary` palette would be replaced, `textColor` / `borderColor` / `lineColor` would all be lost, and nodes would become black text on a black background.

## 5. Shadows

```ts
interface JmThemeShadow {
    normal:   { offsetX, offsetY, blur, color };   // at rest
    hover:    { offsetX, offsetY, blur, color };   // hover
    selected: { offsetX, offsetY, blur, color };   // selected
}
```

**They are split into four fields rather than a CSS string** (`"1px 1px 1px #666"`) — a CSS shorthand cannot be merged field by field, so changing one blur radius would mean rewriting the whole string. Once they are split, setting `hover.blur` alone is valid, and the rest of the preset is kept.

**`mergeShadow` does a two-level deep merge.** `mergeObjects` is only one level deep: if you change only `hover.blur` without splitting, the entire shadow block would be replaced, and `normal` and `selected` would be lost.

## 6. Built-in default theme

`JSMIND_THEME_DEFAULT` is the only preset. The values are taken from the v1 stylesheet:

```ts
node:     { radius:5, padding:10, fontSize:16, rootFontSize:24,
            fontFamily:'Verdana,Arial,Helvetica,sans-serif', lineHeight:1.125,
            borderWidth:0, maxWidth:400, shadow:{...} }
line:     { width:2, pattern:'solid', curve:'bezier' }
expander: { size:13, radius:6.5, fontSize:8, lineHeight:11, borderWidth:1 }
```

`borderWidth: 0` is because v1 used shadows to express depth, not borders. `lineHeight: 1.125` is a multiplier (it scales with `fontSize`); the expander's `lineHeight: 11` is in pixels (size is independent).

## 7. Expander style

The geometry of the expander (the fold / unfold control) is also determined by the theme: `size` / `radius` / `fontSize` / `lineHeight` / `borderWidth`. Two things are fixed, though:

- **The 18px font size of the ± sign** — it has to fit into a 13px circle, and is deliberately larger than the circle, with the left and right clipped by `overflow: hidden`. Flex centering is used instead of `text-align + margin-top`, to avoid a 1px drift caused by different font ascents.
- **Border color** — the numeric variant's border is hardcoded to `#666` (it does not follow the node tone), because the expander is a control, not content. The character variant has no border.
