# 主题系统

jsMind v2 的外观全部由主题数据驱动。样式表里不再写任何具体值——所有颜色、几何、阴影都通过 CSS 自定义属性传入，一套样式表服务所有主题。

---

## 1. 架构

```
JmMind.style (JSON) → resolveJmStyle() → JmTheme (完整)
    → applyThemeToHost()   → 写 --jm-* 自定义属性到宿主元素（几何 + 阴影 + 默认颜色）
    → nodeView.setTheme()  → 存下 palette 引用（后续每节点调 _applyTone）
```

**几何属性写在宿主上，所有节点继承。** 颜色写在每个节点元素上，单节点覆盖只影响那一个。

---

## 2. tone：五个语义色 + accent

```ts
const JmTone = {
    Default: 'default',   // 没有表态，画布同色融入背景
    Primary: 'primary',   // 重点
    Success: 'success',   // 成立 / 通过
    Warning: 'warning',   // 注意
    Danger:  'danger',    // 有问题
    Info:    'info',      // 补充信息
    Accent:  'accent',    // 只是让它在视觉上跳出来，不含判断
};
```

**tone 只表达颜色，不表达几何。** 一个节点可以同时是「warning 色 + 粗边框 + 大字号」。配色用实心填充 + 白字（取自 v1），浅底深字在小尺寸下几乎看不出区别。

`accent` 来自 v1 的紫色主题（`theme-wisteria`），没有语义含义——它只说「让这个显眼」，不附带「重要」「有问题」之类的断言。

---

## 3. 覆盖链

三档回落，从具体到兜底：

```
颜色：  node.style.<显式>          ??  theme.tones[有效 tone].<对应色>
几何：  node.style.<显式>          ??  theme.node.<默认>
线色：  node.style.incoming.color  ??  theme.tones[子节点 tone].lineColor
线宽：  node.style.incoming.width  ??  theme.line.width
线型：  node.style.incoming.pattern ??  theme.line.pattern
形态：  node.style.incoming.curve   ??  theme.line.curve
```

**线的颜色取子节点 tone，不是父节点。** 一条线唯一对应一个子节点，`incoming` 挂在子节点上。让线继承父节点会导致父节点改色时整棵子树线全变。

**`curve` 不参与 tone 回落。** tone 是颜色，带几何信息会让「同 tone 不同形态」无法表达。

---

## 4. 主题合并

```ts
resolveJmStyle(style?) → JmTheme
```

从 `style.theme` 的名字找预设（默认 `"default"`），然后深度合并 `style` 的其余字段。**不是浅合并。** `tones: { primary: { fillColor: "#f00" } }` 如果浅合并会把整个 `primary` palette 替换掉，`textColor` / `borderColor` / `lineColor` 全丢，节点变黑底黑字。

---

## 5. 阴影

```ts
interface JmThemeShadow {
    normal:   { offsetX, offsetY, blur, color };   // 静止
    hover:    { offsetX, offsetY, blur, color };   // 悬停
    selected: { offsetX, offsetY, blur, color };   // 选中
}
```

**拆成四段而不是 CSS 字符串**（`"1px 1px 1px #666"`）——CSS 简写没法按字段合并，改一个模糊半径必须重写整串。拆开之后 `hover.blur` 单独设置是合法的，其余沿用预设。

**`mergeShadow` 做两级深合并。** `mergeObjects` 只有一层深：只改 `hover.blur` 如果不拆，会替换整个 shadow 块，`normal` 和 `selected` 全丢。

---

## 6. 内置默认主题

`JSMIND_THEME_DEFAULT` 是唯一的预设。数值取自 v1 的样式表：

```ts
node:     { radius:5, padding:10, fontSize:16, rootFontSize:24,
            fontFamily:'Verdana,Arial,Helvetica,sans-serif', lineHeight:1.125,
            borderWidth:0, maxWidth:400, shadow:{...} }
line:     { width:2, pattern:'solid', curve:'bezier' }
expander: { size:13, radius:6.5, fontSize:8, lineHeight:11, borderWidth:1 }
```

`borderWidth: 0` 是因为 v1 用阴影来表现深度，不是边框。`lineHeight: 1.125` 是倍率（跟随 `fontSize` 缩放），展开器的 `lineHeight: 11` 是像素（尺寸独立）。

---

## 7. 展开器样式

展开器（折叠/展开控件）的几何也由主题决定：`size` / `radius` / `fontSize` / `lineHeight` / `borderWidth`。但有两样是固定的：

- **± 符号的 18px 字号**——要装进 13px 的圆圈，故意比圆圈大，靠 `overflow: hidden` 裁剪左右。用 flex 居中而不是 `text-align + margin-top`，避开不同字体 ascent 差异导致的 1px 漂移。
- **边框颜色**——数字变体的边框硬编码 `#666`（不跟随节点 tone），因为展开器是控件，不是内容。字符变体没有边框。