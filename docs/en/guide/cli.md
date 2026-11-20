# CLI

::: warning Preview version
The `jsmind` CLI is currently a preview. Commands and options will change in later updates. Please check this page for the commands that are current.
:::

The CLI is the command-line interface for jsMind V2 map data. You can create a map, inspect its tree and ids, change structure and node attributes, validate a file, and export an image.

## Install

Install the 2.x version with `npm i jsmind@2`, then run `npx jsmind`. From a clone of this repository, build first and run `npx jsmind` or `node dist/cli.js`. These are alternatives: pick one, not both. See [Getting Started](/en/guide/getting-started) for install details.

For a one-shot reminder of the flags, `jsmind --help` prints the built-in help. This page is the documentation to consult for the commands that are current in the preview.

## Usage

```
jsmind <command> [options]
```

## Global options

These options are accepted by every command and subcommand.

| Option | Meaning |
| --- | --- |
| `--json` | Machine-readable output |
| `--dry-run` | Show what would change, write nothing |
| `--output <path>` | Write somewhere other than the input file |
| `--backup` | Keep a `.bak` copy before overwriting |
| `--strict` | Treat an unknown option as a usage error |
| `--version` | Print the version and exit |
| `-h`, `--help` | Show the built-in help |

`--dry-run`, `--output`, and `--backup` apply to the mutating `mind` and `node` subcommands. `create` supports `--dry-run` and `--backup`, but the output path is the positional file argument, so `--output` is not used there.

Every other option belongs to a specific subcommand; the sections below list them. An option a command does not take is reported instead of being ignored — see [Unknown options](#unknown-options).

`--version` prints the version string from `package.json`, on its own line and with nothing else, and needs no command. The version is defined in one place only, so it cannot fall behind a release.

## Unknown options

Each subcommand accepts a fixed set of options: the global ones above plus its own. An option outside that set — a misspelt flag, or one that belongs to a different subcommand — is reported on stderr, and the command still runs.

```
$ jsmind mind find map.json --node-id root --sdie
jsmind: warning: unknown option for "mind find": --sdie (--strict makes this an error)
{
  "id": "root",
  ...
}
```

The warning never goes to stdout, so `--json` output stays parseable. The other side of that choice: **a consumer that reads only stdout and the exit code does not see the warning**. That is the cost of warning instead of failing, not a defect to be fixed later. When that blind spot matters, add `--strict`, which turns the same call into a usage error with exit code `2`:

```
$ jsmind mind find map.json --node-id root --sdie --strict
Unknown option for "mind find": --sdie
$ echo $?
2
```

Pass `--strict` in scripts and agent workflows, where a silently ignored flag is worse than a failed run.

There is no spelling suggestion. Deciding that `--sdie` "looks like" `--side` means guessing at intent, and a wrong guess sends you to fix a flag you never typed.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | Invalid data |
| `2` | Usage error |
| `3` | IO or runtime error |

## `create`

```
jsmind create <file> --title <title> [options]
```

Start a new mind map containing a single root node.

| Option | Meaning |
| --- | --- |
| `--title <title>` | Root node label; also becomes `meta.name` (required) |
| `--name <name>` | Override `meta.name` when it should differ from the title |
| `--author <author>` | Author recorded in `meta` |
| `--force` | Overwrite the file if it already exists |
| `--backup` | Keep a `.bak` copy of the file being overwritten |
| `--dry-run` | Print the document instead of writing it |

`create` refuses to overwrite an existing file without `--force`. Every other command assumes a file already exists; this is where one comes from.

## `validate`

```
jsmind validate <file> [--json]
```

Checks a v2 mind map file against the format specification and reports every problem found. It does not modify the file.

| Exit code | Meaning |
| --- | --- |
| `0` | Valid |
| `1` | Invalid data |
| `3` | The file cannot be read |

## `context`

```
jsmind context <file> [options]
```

Discovery step: shows the tree so you (or an agent) can find the ids needed for later commands.

| Option | Meaning |
| --- | --- |
| `--focus <text>` | Fuzzy-match node text; shows matches with their ancestors |
| `--depth <n>` | Levels below the root to show (default `2`) |
| `--max-text <n>` | Truncate labels at `n` characters (default `40`) |
| `--full-text` | Do not truncate |
| `--ids-only` | Print ids only |
| `--json` | Machine-readable output |

Ids are printed in a left-aligned column so they can be copied into the next command. Multi-line labels are flattened, and truncation ends in an ellipsis. Each line may end with a `{…}` block. `side` is shown only for the root and the root's direct children. `folded` appears when the node is collapsed, and style overrides appear when the node differs from the theme.

A file that declares its own document style is announced above the tree, so the theme is discoverable before any node is read:

```
style: theme=default defaultTone=primary overrides=defaultTone,tones,node
```

`--json` returns an object with a `nodes` array, and adds the same summary as a `style` block (`theme`, `defaultTone`, `overrides`) when the file carries one. Neither appears for a file with no document style, and the text line is suppressed under `--ids-only`.

When `--focus` matches nothing, the closest candidates are listed instead.

## `export`

```
jsmind export <file> <out.png> [options]
```

Renders a mind map to an image. The size is the map's own size: whitespace inside the viewport is kept, and a map larger than the viewport is not cropped.

`export` requires a Chromium browser. Set `CHROME_PATH` if it is not in a standard location, and `JSMIND_BROWSER_START_MS` if the browser needs longer than the default 60 seconds to start.

| Option | Meaning |
| --- | --- |
| `--width <px>` | Viewport width to lay the map out in (default `1200`) |
| `--height <px>` | Viewport height (default `800`) |
| `--scale <n>` | Output pixel ratio (default `2`) |
| `--type <format>` | `image/png`, `image/jpeg`, or `image/webp` (default `image/png`) |
| `--transparent` | Transparent background (PNG and WebP; opt-in, default keeps the current opaque background). For JPEG, the option is ignored and a warning is printed. |
| `--json` | Machine-readable output |

With the default width, height, and scale, a typical export is 2400×1600 pixels.

## `mind`

```
jsmind mind <subcommand> <file> [options]
```

Structure, edges, and the document's style. Locators are ids only. Use ids from a current `context` output; do not reuse ids copied from examples.

| Subcommand | Options | Meaning |
| --- | --- | --- |
| `find` | `--node-id <id>` | Show one node |
| `list-edges` | `--node-id <id>` | Edges touching a node |
| `add-child` | `--parent-id <id> --text <text> [--side left\|right] [--position <n>] [--folded true\|false]` | Add a child node |
| `move` | `--node-id <id> --parent-id <id> [--position <n>]` | Reparent a node |
| `remove-node` | `--node-id <id>` | Remove the node, its whole subtree, and every edge touching any of them |
| `add-edge` | `--source-id <id> --target-id <id> [--type link] [--label <text>]` | Add a relation |
| `remove-edge` | `--edge-id <id>` | Remove a relation |
| `set-style` | `--default-tone <tone>` | The document's style (`mind.style`): the tone untoned nodes wear |

`--side` applies only when the parent is the root node. A side is the placement of a root child, and every node below one inherits it, so a side written deeper would change the file and not the picture — that is a usage error naming the first-level branch, not a silent no-op. Only the root is center, so `--side` takes `left` or `right`.

`--position` is an index into the parent's children array. A value at or past the end appends, and omitting it appends too. The root's children are counted across both sides: the index addresses that one array, not one side's list.

`--folded true` creates the node collapsed.

Every mutating subcommand validates the result and rolls back on failure. `--dry-run`, `--output`, and `--backup` are available on these writes.

### `mind set-style`

```
jsmind mind set-style <file> [style fields]
```

The document's style (`mind.style`): one declaration every node without an override inherits. It writes `mind.style`, not a node's style — overriding the theme for one node is `node set-style` — so a whole-map recolour stays one write, and leaves the semantic tones free for the nodes that need to stand out.

| Field | Accepted values |
| --- | --- |
| `--default-tone <tone>` | `default` \| `primary` \| `success` \| `warning` \| `danger` \| `info` \| `accent` |

`defaultTone` is the tone an untoned node wears. Precedence is `node.style.tone` over `mind.style.defaultTone` over `"default"`, and lines follow the same fallback. The field stores a tone **name**, not a palette, so a `tones` override keeps applying to it.

`--dry-run`, `--output`, and `--backup` work as on every other mutating command.

## `node`

```
jsmind node <subcommand> <file> --node-id <id> [options]
```

Node attributes. Structure changes go through `jsmind mind`.

| Subcommand | Options | Meaning |
| --- | --- | --- |
| `set-text` | `--node-id <id> --text <text>` | Change the label |
| `set-folded` | `--node-id <id> --folded true\|false` | Collapse or expand |
| `set-side` | `--node-id <id> --side left\|right` | Set the node's side |
| `set-style` | `--node-id <id> [style fields]` | Override the theme for one node |

`set-side` applies only to a direct child of the root, for the same reason as `add-child --side`: those are the only nodes whose side moves anything. The root itself is always center, so `--side` takes `left` or `right`; on any deeper node it is a usage error naming the first-level branch, not a write the picture ignores.

`set-style` fields can be combined in one write. A dot marks a level, so `--incoming.color` addresses `style.incoming.color`.

| Field | Accepted values |
| --- | --- |
| `--tone <value>` | `default` \| `primary` \| `success` \| `warning` \| `danger` \| `info` \| `accent` |
| `--background <color>` | A CSS color string |
| `--color <color>` | A CSS color string |
| `--border-color <color>` | A CSS color string |
| `--border-width <number>` | A positive number |
| `--border-style <value>` | `solid` \| `dashed` \| `dotted` |
| `--font-size <number>` | A positive number |
| `--font-weight <value>` | `normal` \| `bold` |
| `--incoming.color <color>` | A CSS color string |
| `--incoming.width <number>` | A positive number |
| `--incoming.pattern <value>` | `solid` \| `dashed` \| `dotted` |
| `--incoming.curve <value>` | `straight` \| `bezier` |

To restore the theme's value:

| Option | Meaning |
| --- | --- |
| `--clear <fields>` | Comma-separated field names in the same spelling as the flags |
| `--reset` | Drop every override on this node |

A style block records only what differs from the theme, so removing a key restores the theme's value. There is no `unset` sentinel — an absent key means an absent override. `--reset` cannot be combined with fields or `--clear`.

Colors are not checked beyond being strings; the theme accepts any CSS color. Tones, patterns, and weights are checked so a bad value names the flag you typed rather than a JSON path.

Node id, parent, and children are changed only through `jsmind mind`. Every `node` subcommand validates the result and rolls back on failure. `--dry-run`, `--output`, and `--backup` are available on these writes.

## See also

- [Getting Started](/en/guide/getting-started) — install and create a first map
- [Skill](/en/guide/skill) — guardrails for an agent that draws or edits a map with this CLI
