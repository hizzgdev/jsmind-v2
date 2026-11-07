# 导出图片

把渲染好的脑图存成 PNG（也支持 JPEG / WebP）。

两个入口，同一套实现：

| 入口 | 形态 |
|---|---|
| 浏览器 | `await jm.exportImage(options)` → `Blob` |
| 命令行 | `jsmind export <file> <out.png>` |

---

## 1. 尺寸语义

**图片尺寸就是内容的尺寸，不做裁剪、不补边。**

视图内部维护的尺寸是下面两者的较大值：

```
max(容器尺寸, 脑图内容尺寸 + 视图 padding)
```

所以会出现两种情况，都是想要的结果：

- **内容比容器小** → 图片按容器大小出，四周的空白**保留**。这是「这里本来就没东西」的诚实表达。
- **内容比容器大** → 视图自己会撑开，图片跟着撑开，**不会按容器边界裁掉**。

超过容器时不裁剪这一条容易做错。`.jsmind-inner` 的尺寸由 CSS 决定，`clientWidth` 读到的是**视口**而不是脑图：拿它当导出尺寸，大图就会被裁成窗口那么大，而且不报错。所以尺寸由视图单独维护并显式传给导出逻辑，不从元素上读。

---

## 2. 浏览器 API

```ts
const jm = await jsMind.create(container);
await jm.open(mind);

const { blob, width, height, cssWidth, cssHeight } = await jm.exportImage({
    scale: 2,             // 输出倍率，默认 2
    type: 'image/png',    // image/png | image/jpeg | image/webp
    quality: 0.9,         // 仅对 jpeg / webp 有效，png 会被忽略
});

// blob 可以直接 createObjectURL、写进 FormData、或交给剪贴板
const url = URL.createObjectURL(blob);
```

返回值里的四个尺寸：

| 字段 | 含义 |
|---|---|
| `width` / `height` | 输出图片的像素尺寸 |
| `cssWidth` / `cssHeight` | 布局尺寸，即 `width / scale` |

没有打开的脑图就调，抛 `JsMindError`。

---

## 3. 命令行

```bash
jsmind export <file> <out.png> [options]
```

| 选项 | 默认 | 说明 |
|---|---|---|
| `--width <px>` | 1200 | 布局用的视口宽度 |
| `--height <px>` | 800 | 布局用的视口高度 |
| `--scale <n>` | 2 | 输出倍率 |
| `--type <format>` | image/png | 输出格式 |
| `--json` | — | 机器可读输出 |

```bash
$ jsmind export example/v2-features.json preview.png
preview.png: 2400x1600 (174.9 KB)

$ jsmind export example/v2-features.json small.png --width 400 --height 300
small.png: 2095x1032 (145.0 KB)      # 视口装不下，图反而更大，没被裁
```

**需要 Chromium。** 找不到会直接报错，并提示设置 `CHROME_PATH`；不会退化成「导出了一张空白图」。CI 在导图之前单独跑一步 `google-chrome --version`，让缺浏览器的失败看起来像缺浏览器，而不是像渲染 bug。

退出码沿用 CLI 契约：`0` 成功、`1` 数据非法（不启动浏览器，先校验）、`2` 参数错误、`3` IO 或运行时失败。

---

## 4. 实现方式

### 为什么是 foreignObject

浏览器**没有**把 DOM 子树转成像素的 API。最接近的 Element Capture / Region Capture 是 Screen Capture API 的一部分，需要用户授权弹窗，脚本调不了。

业界通行做法（snapDOM 等库）是把标记交还给浏览器的渲染引擎：

```
克隆渲染结果 → 包进 SVG <foreignObject> → Image 解码 → drawImage → toBlob
```

**canvas 在这里只做转码，不重绘。** 这是和「用 canvas API 把节点和连线一个个画出来」的关键区别 —— 后者等于再写一套渲染器，文字换行、阴影、贝塞尔曲线都得重新实现，而且必然和 DOM 的结果有出入。

因为标签直接复用浏览器已经算好的结果，导出图与屏幕所见完全一致，包括文字换行位置。

### 五个静默失败的坑

都是实际踩到的，而且**全都不报错**，只表现为图不对：

1. **`blob:` URL 会污染 canvas。** SVG 带了 `foreignObject` 之后，Chrome 把它当跨源，`toBlob` 抛 `SecurityError`。必须用 `data:` URL。

2. **`<svg>` 元素的 `outerHTML` 没有 `xmlns`。** 元素本身已经在 SVG 命名空间里，序列化器就省掉了。但这段标记要被当作 XHTML 重新解析，没有命名空间它就只是个未知元素，**整层连线不画**。

3. **主题的 CSS 变量设在 host 上，克隆带不走。** 节点上的内联变量会跟着克隆，host 上的不会。漏掉的话每个节点都失去填充、边框、圆角和阴影，导出图只剩裸文字。

4. **`for...of` 遍历 `CSSStyleDeclaration` 拿到的是索引。** 得到 `"0"`、`"1"` 而不是属性名，于是筛 `--jm-` 前缀筛出零个，静默。要读元素的内联 `style` 属性。

5. **computed 的 `font-family` 带引号。** `"Times New Roman"` 里的引号会提前结束 XML 属性，SVG 解析失败，而 `Image.onerror` 只会说 "failed to load"。

另外两条不是坑但要知道：容器自己的 `overflow: auto` 会把滚动条画进图里（导出时置为 `visible`）；折叠分支的隐藏子节点仍占着 (0,0) 的盒子，凡是按节点并集算范围的地方都会被它们拉偏。

---

## 5. 相关文件

| 文件 | 职责 |
|---|---|
| `src/view/export.ts` | 克隆、拼 SVG、解码、编码 |
| `src/application/jsmind.ts` | `exportImage()` 公共入口 |
| `src/cli/browser.ts` | 无头浏览器 + DevTools 协议 |
| `src/cli/commands/export.ts` | `jsmind export` |

CI 的 PR 预览图走的就是 `jsmind export`，不再有独立的截图脚本 —— 预览图和用户拿到的图必须是同一条路径产出的。