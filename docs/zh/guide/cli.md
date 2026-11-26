# CLI

::: warning 预览版本
当前 `jsmind` CLI 仍是预览版本，之后还会更新。请随时查阅本文档，以了解当前可用的命令和用法。
:::

CLI 是 jsMind V2 导图数据的命令行工具。你可以创建导图、查看树结构和 id、修改结构和节点属性、校验文件，以及导出图片。

## 安装

请先用 `npm i jsmind@2` 安装 2.x 版本，然后运行 `npx jsmind`。如果使用本仓库的克隆，请先构建，再运行 `npx jsmind` 或 `node dist/cli.js`。这两种方式任选其一，不是先后步骤。安装说明见 [快速上手](/zh/guide/getting-started)。

需要临时查看参数时，可以运行 `jsmind --help`。要确认预览版当前有哪些命令，请以本文档为准。

## 用法

```
jsmind <command> [options]
```

## 全局选项

这些选项对所有命令和子命令都合法。

| 选项 | 含义 | 版本 |
| --- | --- | --- |
| `--json` | 以机器可读格式输出 | — |
| `--strict` | 把未知选项当作用法错误 | `Since: 2.1.0` |
| `--version` | 打印版本号后退出 | `Since: 2.1.0` |
| `-h`, `--help` | 显示内置帮助 | — |

## 写入选项

这三个选项描述一次写入——写到哪里、是否真的发生——所以只有会写文件的命令接受它们：`create`，以及会写文件的 `mind` 和 `node` 子命令。`validate`、`context` 和 `export` 会把它们当作未知选项报告出来，只读的 `mind find` 和 `mind list-edges` 同样如此。

| 选项 | 含义 | 版本 |
| --- | --- | --- |
| `--dry-run` | 只显示将要发生的改动，不写入文件 | — |
| `--output <path>` | 写入到输入文件以外的路径 | — |
| `--backup` | 覆盖前保留一份 `.bak` 备份 | — |

`--output` 只属于会写文件的 `mind` 和 `node` 子命令：`create` 和 `export` 的输出路径是位置参数，因此 `create x.json --output y.json` 会被报告为未知选项，而不是默默忽略。

其余选项归属具体的子命令，见下面各节。某个命令不接受的选项会被报告出来，而不是默默忽略——见 [未知选项](#未知选项)。

`--version` 打印 `package.json` 里的 version 字符串，单独一行，不带其他文字，也不需要子命令。版本号只有一处定义，所以不会和发布版本脱节。

## 未知选项

每个子命令都只接受固定的选项集合：上面这些全局选项，加上它自己的。集合之外的选项——拼错的 flag，或者属于另一个子命令的 flag——会打到 stderr，命令照常执行。

```
$ jsmind mind find map.json --node-id root --sdie
jsmind: warning: unknown option for "mind find": --sdie (--strict makes this an error)
{
  "id": "root",
  ...
}
```

警告不会写进 stdout，所以 `--json` 的输出仍然可以直接解析。代价是另一面：**只看 stdout 和退出码的调用方看不到这条警告**。这是「只警告不报错」的固有成本，不是以后要修的 bug。不能接受这一点时，加上 `--strict`，同样的调用就变成用法错误，退出码 `2`：

```
$ jsmind mind find map.json --node-id root --sdie --strict
Unknown option for "mind find": --sdie
$ echo $?
2
```

脚本和 agent 流程里建议打开 `--strict`：选项被默默忽略，比命令失败更糟。

不做拼写建议。判断 `--sdie`「像是」`--side` 只能靠猜意图，猜错的代价是把调用方引去改一个它根本没打过的 flag。

## 退出码

| 退出码 | 含义 |
| --- | --- |
| `0` | 成功 |
| `1` | 数据无效 |
| `2` | 用法错误 |
| `3` | IO 或运行时错误 |

## `create`

```
jsmind create <file> --title <title> [options]
```

创建一张只包含根节点的新导图。

| 选项 | 含义 |
| --- | --- |
| `--title <title>` | 根节点文字；同时用作 `meta.name`（必填） |
| `--name <name>` | 当 `meta.name` 需要和标题不同时，用它覆盖 |
| `--author <author>` | 写入 `meta` 的作者 |
| `--force` | 若文件已存在则覆盖 |
| `--backup` | 覆盖前保留一份 `.bak` 备份 |
| `--dry-run` | 打印文档内容，不写入文件 |
| `--json` | 打印 `{file, rootNodeId}`，替代确认行（`Since: 2.2.0`） |

没有 `--force` 时，`create` 不会覆盖已有文件。其他命令都假定文件已经存在；新文件由这条命令创建。

## `validate`

```
jsmind validate <file> [--json]
```

按格式规范检查一份 v2 导图文件，并报告发现的全部问题。它不会修改文件。

| 退出码 | 含义 |
| --- | --- |
| `0` | 有效 |
| `1` | 数据无效 |
| `3` | 无法读取文件 |

## `context`

```
jsmind context <file> [options]
```

这是查看步骤：打印整棵树，方便你（或 agent）找到后续命令所需的 id。

| 选项 | 含义 |
| --- | --- |
| `--highlight <text>` | 按节点文字匹配（忽略大小写），打印它的 id 路径；可重复传参（`Since: 2.2.0`） |
| `--depth <n>` | 从根节点往下显示的层数（默认 `2`） |
| `--max-text <n>` | 将标签截断到 `n` 个字符（默认 `40`） |
| `--full-text` | 不截断 |
| `--ids-only` | 只打印 id |
| `--json` | 以机器可读格式输出 |

id 会打印在左对齐的一列中，便于复制到下一条命令。多行标签会被展平，截断处以省略号结束。行尾可能带有 `{…}` 块。`side` 只出现在根节点及其直接子节点上；节点折叠时会出现 `folded`；若节点样式与主题不同，也会显示相应覆盖项。

`--highlight` 用来回填“我已经知道标签、只差 id”这一步：整条标签按打印出来的样子比较，**忽略大小写**（不比截断后的、也不做模糊），匹配范围是整份文档而不只是 `--depth` 显示的层数。命中的标签在输出最前面列成 `"文本" -> "root"/"id"`，没命中就写 `(no match)`，不猜也不给候选。一个标签被多个节点共用时给文档顺序里的第一个，并标注 `(+N more)`。文本模式下 `--highlight` 也不接受 `--ids-only`：后者一行一个裸 id，前者每个标签一行 id 路径，那个块塞不进这个形状；要只拿 id，加 `--json`。

文件如果声明了文档级样式，树的上方会多一行摘要，这样在任何节点被读到之前就能发现主题（`Since: 2.1.0`）：

```
style: theme=default defaultTone=primary overrides=defaultTone,tones,node
```

`--json` 返回一个带 `nodes` 数组的对象，其中每个节点都带 `parentId`（根节点为 `null`），因此不必靠 `level` 的顺序推断父子关系（`Since: 2.2.0`）；给了 `--highlight` 时，最前面还会多一个 `highlighted` 块，命中的值与 `nodes` 里是同一形状的节点对象，没命中的标签保留键并置 `null`。同一形状不等于同一条记录：比 `--depth` 更深处的命中不会出现在 `nodes` 里，共享标签还会多一个 `matches` 计数。文件带样式时，会额外给出同一个摘要作为顶层的 `style` 块（`theme`、`defaultTone`、`overrides`）。文件没有文档级样式时两者都不出现，文本那一行在 `--ids-only` 下会被省略。

## `export`

```
jsmind export image <file> <out.png> [options]
```

将思维导图渲染为图片。输出尺寸以导图自身大小为准：视口内的空白会保留，超出视口的部分也不会被裁切。

`export` 是一个组，紧跟其后的那个词说明要产出什么。目前 `image` 是唯一一种；`jsmind export --help` 会列出全部。这个种类词不能省略——裸写 `jsmind export <file> <out.png>` 是参数错误（`2`），不会替你猜成 `image`。

`export image` 需要 Chromium 浏览器。如果它不在常见安装位置，请设置 `CHROME_PATH`；浏览器启动比默认的 60 秒还慢，就设置 `JSMIND_BROWSER_START_MS`（`Since: 2.1.0`）。

渲染发生在浏览器进程里，所以执行环境若对子进程做沙箱限制，运行 `export image` 可能弹出一次权限确认或“脱离沙箱”的提示。那是启动 Chromium 引起的，不是报错；频繁弹窗时把输出目录加进环境的白名单。

输出文件是**原地覆盖**：同名图片已存在时直接重写，不另存副本、也不先删除旧图。要保留旧图，就给第二个位置参数换一个路径，或先把旧图改名 —— 注意 `--output` 只对改动导图文件的命令有效，`export image` 的输出路径只认第二个位置参数。

| 选项 | 含义 | 版本 |
| --- | --- | --- |
| `--width <px>` | 布局时使用的视口宽度（默认 `1200`） | — |
| `--height <px>` | 视口高度（默认 `800`） | — |
| `--scale <n>` | 输出像素比（默认 `2`） | — |
| `--type <format>` | `png`、`jpeg` 或 `webp`（默认 `png`）；`jpg` 也接受，等同于 `jpeg` | — |
| `--transparent` | 透明背景（PNG 和 WebP；需显式打开，默认保持当前的不透明背景）。用于 JPEG 时会忽略该选项并给出警告。 | `Since: 2.1.0` |
| `--json` | 以机器可读格式输出 | — |

`--type` 决定的是编码，不是文件名：写出的字节就是它指定的格式，输出路径则原样使用。两者不一致时（`out.png --type jpeg`）导出照常完成——stderr 打一行警告、退出码仍是 `0`——因为产物有时是按消费它的工具命名的，两边都不该被覆盖。比对只看扩展名（`.png`、`.jpg` / `.jpeg`、`.webp`）；认不出图片格式的扩展名不参与比对。

按默认的宽度、高度和缩放，常见导出尺寸是 2400×1600 像素。

## `mind`

```
jsmind mind <subcommand> <file> [options]
```

用于修改结构和关系边，以及文档自身的样式。定位一律使用 id。请使用当前这次 `context` 输出中的 id，不要沿用示例里的 id。

| 子命令 | 选项 | 含义 | 版本 |
| --- | --- | --- | --- |
| `find` | `--node-id <id>` | 显示一个节点 | — |
| `list-edges` | `--node-id <id>` | 列出与该节点相连的边 | — |
| `add-child` | `--parent-id <id> --text <text> [--side left\|right] [--position <n>] [--folded true\|false]` | 添加一个子节点 | — |
| `move` | `--node-id <id> --parent-id <id> [--position <n>]` | 将节点移到新的父节点下 | — |
| `remove-node` | `--node-id <id>` | 删除该节点、它的整棵子树，以及触及其中任一节点的所有边 | — |
| `add-edge` | `--source-id <id> --target-id <id> [--type link] [--label <text>]` | 添加一条关系边 | — |
| `remove-edge` | `--edge-id <id>` | 删除一条关系边 | — |
| `set-style` | `--default-tone <tone>` | 文档级样式（`mind.style`）：没有自己 tone 的节点所用的语气 | `Since: 2.1.0` |

所有会改写数据的子命令都会在完成后校验结果，失败则回滚。这些写入可以使用 `--dry-run`、`--output` 和 `--backup`。

### `mind find`

```
jsmind mind find <file> --node-id <id>
```

显示一个节点：它的 id、标签、父节点、子节点 id 列表，以及所在侧向。只读——它不经过写入管线，上面那三个写入选项在这里不适用。

`--node-id` 必填。加不加 `--json`，输出都是 JSON：根节点的 `parent` 为 `null`；节点折叠时才出现 `folded: true`；节点有主题覆盖时才出现 `style` 块。id 不在文件里算数据无效（退出码 `1`），不是用例错误。

### `mind list-edges`

```
jsmind mind list-edges <file> --node-id <id>
```

列出与该节点相连的所有边，它作为起点或终点都算。和 `find` 一样是只读的：不走写入管线，上面那三个写入选项在这里不适用。

`--node-id` 必填。输出是 `{id, source, target, type, label}` 组成的 JSON 数组，加不加 `--json` 都是这个形状：边没有标签时 `label` 为 `null`，节点没有边时打印 `[]`。这些 id 就是 `remove-edge` 要用的 id。节点 id 不在文件里算数据无效（退出码 `1`）。

### `mind add-child`

```
jsmind mind add-child <file> --parent-id <id> --text <text> [--side left|right] [--position <n>] [--folded true|false]
```

在已有节点下添加一个子节点。`--parent-id` 和 `--text` 必填，`--text` 传空字符串等同于没传（用例错误）。

`--side` 只在父节点是根节点时合法。侧向是根的直接子节点的位置，它下面整棵子树都继承这个侧向，所以在更深的地方写 side 只会改文件、不改画面 —— 这种情况是用例错误（退出码 2），报错会点名该节点所属的一级分支，不会静默通过。只有根节点是 center，所以 `--side` 只接受 `left` 或 `right`。

`--position` 是父节点 children 数组的非负下标。越过末尾会追加，省略同样是追加。根节点的子节点跨两侧计数：下标对应的是这一个数组，不是某一侧的列表。

`--folded true` 表示新建节点时就折叠；不传这个参数则建成展开状态。确认行会在传了这些参数时回显侧向和折叠状态。

### `mind move`

```
jsmind mind move <file> --node-id <id> --parent-id <id> [--position <n>]
```

把节点移到新的父节点下；`--parent-id` 就是它当前的父节点时，等同于在同级里调整顺序。`--node-id` 和 `--parent-id` 必填；`--position` 的下标含义与 `add-child` 相同。

把节点移进自己的子树会被拒绝，算数据无效（退出码 1）：把自己指定为父节点，或父节点是自己的后代，报错都会给出这两个 id。根节点不能移动 —— 其他所有节点都是它的后代。

### `mind remove-node`

```
jsmind mind remove-node <file> --node-id <id>
```

删除该节点及其整棵子树，外加触及其中任一节点的所有边。`--node-id` 必填。

根节点会被拒绝：删除根节点算数据无效（退出码 1），报错点名该节点和文件，不会写入任何内容。

### `mind add-edge`

```
jsmind mind add-edge <file> --source-id <id> --target-id <id> [--type link] [--label <text>]
```

在两个已有节点之间添加一条关系边，与父子树无关。`--source-id` 和 `--target-id` 必填，两端节点都必须在文件里 —— 缺哪一端，报错就点名哪一端，退出码 `1`。

`--type` 目前只有 `link`：这是格式里唯一定义的取值，也是默认值。写别的词不会在参数层面被拦下 —— 写入完成后的校验会拒绝它（`Unknown edge type`，退出码 `1`）并回滚文件，所以这条边不会留在文件里。

`--label` 可选，不传则这条边没有标签。命令会打印新边的 id，`list-edges` 报出的也是同一个 id。

### `mind remove-edge`

```
jsmind mind remove-edge <file> --edge-id <id>
```

按 id 删除一条关系边；两端的节点保留。`--edge-id` 必填，取值来自 `list-edges` 的输出 —— 边有自己的 id，不是 `context` 打印的节点 id。

id 不在文件里算数据无效（退出码 1）。命令会报告它删掉的那条边的 id。

### `mind set-style`

```
jsmind mind set-style <file> [style fields]
```

文档级样式（`mind.style`）：写一次，所有没有单独覆盖的节点都继承。它写的是 `mind.style` 而不是某个节点的样式 —— 给单个节点覆盖主题是 `node set-style` —— 所以「整张图换个配色」仍然是一次写入，语义色也就留给真正需要突出的节点。

| 字段 | 可选值 |
| --- | --- |
| `--default-tone <tone>` | `default` \| `primary` \| `success` \| `warning` \| `danger` \| `info` \| `accent` |

`defaultTone` 是没有自己 tone 的节点所用的语气。优先级为 `node.style.tone` > `mind.style.defaultTone` > `"default"`，连线颜色走同一个回落。这个字段存的是语气**名字**而不是调色板，所以 `tones` 覆盖仍然作用在它上面。

`--dry-run`、`--output`、`--backup` 与其他改写命令一致。

## `node`

```
jsmind node <subcommand> <file> --node-id <id> [options]
```

用于修改节点属性。结构上的改动请使用 `jsmind mind`。

| 子命令 | 选项 | 含义 |
| --- | --- | --- |
| `set-text` | `--node-id <id> --text <text>` | 修改标签 |
| `set-folded` | `--node-id <id> --folded true\|false` | 折叠或展开 |
| `set-side` | `--node-id <id> --side left\|right` | 设置节点所在侧 |
| `set-style` | `--node-id <id> [style fields]` | 为单个节点覆盖主题样式 |

节点的 id、父节点和子节点只能通过 `jsmind mind` 修改。每条 `node` 子命令都会在完成后校验结果，失败则回滚。这些写入可以使用 `--dry-run`、`--output` 和 `--backup`。

### `node set-text`

```
jsmind node set-text <file> --node-id <id> --text <text>
```

修改一个节点的标签。`--node-id` 和 `--text` 都必填，`--text` 传空字符串等同于没传（用例错误）。节点 id 不在文件里算数据无效（退出码 `1`）。

### `node set-folded`

```
jsmind node set-folded <file> --node-id <id> --folded true|false
```

折叠或展开一个节点。`--folded` 必填，只接受 `true` 和 `false` 两个词 —— 没有 `--no-folded`，写别的词是用例错误（退出码 2），报错会点名该参数。`--node-id` 必填。

### `node set-side`

```
jsmind node set-side <file> --node-id <id> --side left|right
```

把根的一个直接子节点放到另一侧。`--node-id` 和 `--side` 必填，`--side` 只接受 `left` 或 `right`：`center` 是根节点自身的状态，会作为用例错误被拒绝。

它只对根的直接子节点合法，理由和 `add-child --side` 一样 —— 只有这些节点的侧向会改变排版，更深的节点一律继承。根节点本身是用例错误（退出码 2），因为它永远是 center；更深的节点同样是用例错误：报错会点名它所属的一级分支，并指出真正承载这个侧向的节点。

### `node set-style`

```
jsmind node set-style <file> --node-id <id> [style fields]
```

为单个节点覆盖主题样式（`node.style`）；它们回落的文档级默认值由 `mind set-style` 写。字段可以在一次写入中组合使用。点号表示层级，因此 `--incoming.color` 对应 `style.incoming.color`。

| 字段 | 可接受的值 |
| --- | --- |
| `--tone <value>` | `default` \| `primary` \| `success` \| `warning` \| `danger` \| `info` \| `accent` |
| `--background <color>` | CSS 颜色字符串 |
| `--color <color>` | CSS 颜色字符串 |
| `--border-color <color>` | CSS 颜色字符串 |
| `--border-width <number>` | 正数 |
| `--border-style <value>` | `solid` \| `dashed` \| `dotted` |
| `--font-size <number>` | 正数 |
| `--font-weight <value>` | `normal` \| `bold` |
| `--incoming.color <color>` | CSS 颜色字符串 |
| `--incoming.width <number>` | 正数 |
| `--incoming.pattern <value>` | `solid` \| `dashed` \| `dotted` |
| `--incoming.curve <value>` | `straight` \| `bezier` |

若要恢复为主题中的值：

| 选项 | 含义 |
| --- | --- |
| `--clear <fields>` | 逗号分隔的字段名，用参数拼写或文件里的驼峰写法（`font-size` 或 `fontSize`） |
| `--reset` | 清除该节点上的全部样式覆盖 |

样式块只记录与主题不同的项，因此去掉某个键就会恢复主题中的值。没有 `unset` 这样的哨兵值——键不存在就表示没有覆盖。`--reset` 不能与具体字段或 `--clear` 同时使用。

至少要给一个字段、`--clear` 或 `--reset`；三者都不给是用例错误（退出码 2），报错会列出可用字段。`--clear` 认不出的名字同样是用例错误，报错会列出它认识的字段。

颜色只检查是否为字符串，主题接受任意 CSS 颜色。语气、线型和字重会在这里校验，这样错误值会指向你输入的参数，而不是某个 JSON 路径。

## 另见

- [快速上手](/zh/guide/getting-started) — 安装并创建第一张图
- [Skill](/zh/guide/skill) — 供 agent 用本 CLI 画图或改图时遵循的禁令与清单
