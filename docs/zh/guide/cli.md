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

这些选项可以写在命令行上，但并非每个命令都会用到全部选项。

| 选项 | 含义 |
| --- | --- |
| `--json` | 以机器可读格式输出 |
| `--dry-run` | 只显示将要发生的改动，不写入文件 |
| `--output <path>` | 写入到输入文件以外的路径 |
| `--backup` | 覆盖前保留一份 `.bak` 备份 |
| `-h`, `--help` | 显示内置帮助 |

`--dry-run`、`--output` 和 `--backup` 适用于会改写文件的 `mind` 和 `node` 子命令。`create` 支持 `--dry-run` 和 `--backup`，但输出路径就是位置参数里的文件，因此不使用 `--output`。

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
| `--focus <text>` | 按节点文字模糊匹配，并连同祖先一起显示 |
| `--depth <n>` | 从根节点往下显示的层数（默认 `2`） |
| `--max-text <n>` | 将标签截断到 `n` 个字符（默认 `40`） |
| `--full-text` | 不截断 |
| `--ids-only` | 只打印 id |
| `--json` | 以机器可读格式输出 |

id 会打印在左对齐的一列中，便于复制到下一条命令。多行标签会被展平，截断处以省略号结束。行尾可能带有 `{…}` 块。`side` 只出现在根节点及其直接子节点上；节点折叠时会出现 `folded`；若节点样式与主题不同，也会显示相应覆盖项。

文件如果声明了文档级样式，树的上方会多一行摘要，这样在任何节点被读到之前就能发现主题：

```
style: theme=default defaultTone=primary overrides=defaultTone,tones,node
```

`--json` 返回一个带 `nodes` 数组的对象；文件带样式时，会额外给出同一个摘要作为 `style` 块（`theme`、`defaultTone`、`overrides`）。文件没有文档级样式时两者都不出现，文本那一行在 `--ids-only` 下会被省略。

当 `--focus` 没有匹配到任何节点时，会改为列出最接近的候选项。

## `export`

```
jsmind export <file> <out.png> [options]
```

将思维导图渲染为图片。输出尺寸以导图自身大小为准：视口内的空白会保留，超出视口的部分也不会被裁切。

`export` 需要 Chromium 浏览器。如果它不在常见安装位置，请设置 `CHROME_PATH`。

| 选项 | 含义 |
| --- | --- |
| `--width <px>` | 布局时使用的视口宽度（默认 `1200`） |
| `--height <px>` | 视口高度（默认 `800`） |
| `--scale <n>` | 输出像素比（默认 `2`） |
| `--type <format>` | `image/png`、`image/jpeg` 或 `image/webp`（默认 `image/png`） |
| `--json` | 以机器可读格式输出 |

按默认的宽度、高度和缩放，常见导出尺寸是 2400×1600 像素。

## `mind`

```
jsmind mind <subcommand> <file> [options]
```

用于修改结构和关系边。定位一律使用 id。请使用当前这次 `context` 输出中的 id，不要沿用示例里的 id。

| 子命令 | 选项 | 含义 |
| --- | --- | --- |
| `find` | `--node-id <id>` | 显示一个节点 |
| `list-edges` | `--node-id <id>` | 列出与该节点相连的边 |
| `add-child` | `--parent-id <id> --text <text>` | 添加一个叶子节点 |
| `add-node` | `--parent-id <id> --text <text> [--position <n>] [--side left\|center\|right]` | 按指定位置添加节点 |
| `move` | `--node-id <id> --parent-id <id> [--position <n>]` | 将节点移到新的父节点下 |
| `remove-node` | `--node-id <id>` | 删除该节点、它的整棵子树，以及触及其中任一节点的所有边 |
| `add-edge` | `--source-id <id> --target-id <id> [--type link] [--label <text>]` | 添加一条关系边 |
| `remove-edge` | `--edge-id <id>` | 删除一条关系边 |

`add-child` 不接受 `--side`。根的直接子节点默认在右侧（`addChildNode` 未指定 side 时默认 `SideA`）。要用 `jsmind node set-side` 再改。

所有会改写数据的子命令都会在完成后校验结果，失败则回滚。这些写入可以使用 `--dry-run`、`--output` 和 `--backup`。

### `mind style`

```
jsmind mind style set <file> [style fields]
```

文档级样式：写一次，所有没有单独覆盖的节点都继承。它写的是 `mind.style` 而不是某个节点的样式，所以「整张图换个配色」仍然是一次写入，语义色也就留给真正需要突出的节点。

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
| `set-side` | `--node-id <id> --side left\|center\|right` | 设置节点所在侧 |
| `set-style` | `--node-id <id> [style fields]` | 为单个节点覆盖主题样式 |

`set-style` 的字段可以在一次写入中组合使用。点号表示层级，因此 `--incoming.color` 对应 `style.incoming.color`。

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
| `--clear <fields>` | 逗号分隔的字段名，拼写与对应参数相同 |
| `--reset` | 清除该节点上的全部样式覆盖 |

样式块只记录与主题不同的项，因此去掉某个键就会恢复主题中的值。没有 `unset` 这样的哨兵值——键不存在就表示没有覆盖。`--reset` 不能与具体字段或 `--clear` 同时使用。

颜色只检查是否为字符串，主题接受任意 CSS 颜色。语气、线型和字重会在这里校验，这样错误值会指向你输入的参数，而不是某个 JSON 路径。

节点的 id、父节点和子节点只能通过 `jsmind mind` 修改。每条 `node` 子命令都会在完成后校验结果，失败则回滚。这些写入可以使用 `--dry-run`、`--output` 和 `--backup`。

## 另见

- [快速上手](/zh/guide/getting-started) — 安装并创建第一张图
- [Skill](/zh/guide/skill) — 供 agent 用本 CLI 画图或改图时遵循的禁令与清单
