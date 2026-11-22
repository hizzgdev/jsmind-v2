---
name: jsmind
display_name: jsMind mind maps
description: "A work order for drawing or editing a jsmind mind map with the jsmind CLI. Every user-level action is one small recipe: find the node, run one write, validate. Use whenever the task produces or changes a map — building, editing, restyling, exporting, or answering a question about one. Flags are in `jsmind --help`."
version: 2.1.0
metadata:
  jsmind:
    cli: ">=2.1.0 <3"
---

# jsmind — one recipe per action

Everything this CLI does is three steps: **find the node, write, validate**. The actions below differ only in the middle step, so finding is described once and then referred to as *find*.

**Do not write the map file yourself** — no editor, redirect, script, or read-modify-write. That bypasses `write → validate → rollback`, the only thing between you and a corrupted map.

`jsmind` below is the CLI on your PATH. Installed as a project dependency instead, run every command as `npx jsmind@2`; bare `npx jsmind` resolves to 1.x, which ships no `bin`. Installation is in [INSTALL.md](INSTALL.md).

Which command owns what: `mind` owns structure — add a child, move, remove — plus the document style; `node` owns one node's own fields — text, side, folded, style; `create`, `validate`, `export` and `context` sit at the top level. If you are looking for a command and it is not in the table below, that split is usually why.

## Find: a label the user said → the id a command needs

```
$ jsmind context map.json --highlight "Earth"
highlighted:
  "Earth" -> "root"/"jm-mws4xqjr"

fullmap:
root            Solar system {side=center}
jm-mws4xqjr       Earth {side=left}
jm-mws4xr1g         Moon
jm-mws4xrqq       Mars {side=left}
```

- The id is **the last one on the line**. Everything before it is the path, not the answer.
- Whole label, case-insensitive: `hot` finds `Hot`, `H` finds nothing. Use the label as the tree spells it — `fullmap:` prints the tree in the same output.
- Searches the whole document regardless of `--depth`, so a deep node is findable without raising it.
- `(no match)`: the file has no such label. Do not retry a shorter guess; take a label from `fullmap:`.
- `(+N more)`: several nodes share the label, and the id given is the first in document order. Use a longer label that only one node has.
- Repeatable: `--highlight "Earth" --highlight "Mars"` answers both, one line each.
- `--ids-only` cannot be combined with `--highlight` in text mode (exit 2); add `--json` for ids without labels.
- Labels over 40 characters print with an ellipsis; `--full-text` when the long label is the target.
- `context` prints two levels and stops. `--depth <n>` raises the limit — `--highlight` ignores it — and nothing warns you when the tree was cut, so a missing grandchild looks like missing data rather than like a display limit.

**An id belongs to this version of the file.** After any write, find again; never reuse an id from an earlier round, and never take one from a tree you remember.

## The actions

| the user wants | the command, after *find* |
|---|---|
| a new map | `jsmind create map.json --title "..."` |
| a child under X | `mind add-child map.json --parent-id <id> --text "..." [--side left\|right]` |
| rename X | `node set-text map.json --node-id <id> --text "..."` |
| move X under Y | `mind move map.json --node-id <id> --parent-id <id> [--position <n>]` |
| a first-level branch on the other side | `node set-side map.json --node-id <id> --side left\|right` |
| collapse or expand X | `node set-folded map.json --node-id <id> --folded true\|false` |
| delete X | `mind remove-node map.json --node-id <id>` |
| colour one node | `node set-style map.json --node-id <id> --tone <tone>` |
| restyle the whole map | `mind set-style map.json --default-tone <tone>` |
| a picture | `validate map.json`, then `export map.json out.png` |
| an answer about the map | `context map.json --json [--depth <n>]`, or `mind find map.json --node-id <id>` |

Five of those need more than the table says:

- **New map**: build the root first, then branch by branch — every `--parent-id` needs an id you already have. Around 7 root children at most, unless the user asked for a count or a depth. Choose the side as you add: `--side` is one word now, one `node set-side` per branch later, and a new root child defaults to the right. `create` does not make parent directories, and `--force` over an existing file is not an edit.
- **add-child**: the reply `added jm-xxxx under <parent>` carries the new id — use it for the next command instead of finding that node again.
- **move**: *find* twice, once for the node and once for the parent. `--position` is an index among the parent's children; past the end it appends. `--side` writes a side on anything that is not a root child and changes the file without changing the picture — `mind move` is the command there.
- **delete**: takes the subtree with it — children and grandchildren go too, and nothing asks twice.
- **answer**: `--json` obeys the same `--depth` limit as the printed tree, so a node count taken without it loses the deepest level; pass `--depth <n>` when the answer needs the whole tree. Reading is not a change: no write in a question.

## Colour: tone first, raw colours are the exception

- A tone is the theme's named pair — a box fill plus the text colour drawn on it. Seven of them: `default primary success warning danger info accent`. "Make Earth blue" is `--tone primary`: the box turns blue and the label stays legible.
- `--background` fills the box, `--color` paints the text, `--border-color` draws the box outline. Each overrides one part and leaves the rest to the tone, so `--color blue` on a `primary` box is blue text on blue. Reach for them when the user names a colour no tone has, or when two nodes must differ inside one tone.
- Precedence is node `tone` > document `defaultTone` > `default`, so a node's tone is visible only when it differs from the document's. "Make the whole map warm" is `mind set-style`, not an override on every node.
- A style block stores only what differs from the theme: `--clear <flag names, comma-separated>` is how one override comes back, `--reset` drops all of them.

## Rules that outlive one action

- Every write validates and rolls back on failure. `validate` before `export` is still worth running: it names what is wrong, one block per problem, and lists all of them.
- Exit codes: `0` done, `1` invalid data or an id not in the file, `2` the command line is wrong, `3` IO or environment. Read the code before deciding what broke.
- `--backup` keeps `map.json.bak` before writing; `--dry-run` prints what it would write and writes nothing. Both apply to `create`, `mind` and `node`, not to `export`.
- An option the command does not take is reported on stderr and **ignored**, and the command still exits 0 — a misspelt flag still produces a map. `--strict` turns that into exit 2.
- `export` takes its output path as the second positional and overwrites it in place; `--output` does not redirect it. Use a second path when both pictures are wanted. It needs Chromium (`CHROME_PATH` for a binary outside the standard locations); a permission prompt on the first run is the browser starting, not a failure.

## After an export: four checks

Open the png and score each pass or fail. "Looks fine" is not a pass.

1. **Crushed text** — glyphs overlap or draw outside the box: smaller `--font-size` on that node, or split the label.
2. **One side overloaded** — `node set-side` moves a first-level branch and everything under it.
3. **A branch this task needs open is folded** — `node set-folded --folded false`.
4. **Lines cross** — move the first-level branch the crossing hangs off; `mind move` when the parent is really the wrong one.

## Commands you are most likely to forget

One list, most-used first. Every line names a command this CLI has; do not retype one from memory if it is not here.

```
context <file> [--highlight <text>]... [--depth <n>] [--full-text] [--json]
mind find <file> --node-id <id>
mind add-child <file> --parent-id <id> --text <label> [--side left|right] [--position <n>] [--folded true|false]
mind set-style <file> --default-tone <tone>
node set-style <file> --node-id <id> --tone <name>
node set-style <file> --node-id <id> --background <css-colour>
node set-folded <file> --node-id <id> --folded true|false
validate <file>
export <file> <out.png>
create <file> --title <title>
node set-side <file> --node-id <id> --side left|right
node set-style <file> --node-id <id> --font-size <n>
node set-text <file> --node-id <id> --text <label>
mind remove-node <file> --node-id <id>
mind move <file> --node-id <id> --parent-id <id> [--position <n>]
```

## Not on this page

Run `jsmind <command> --help`. It prints that command's own block, not the whole manual, so it is cheap. Do not guess a flag — see the `--strict` note above for why a wrong one is silent.

Two worked sessions are in [references/build-session.md](references/build-session.md) and [references/change-session.md](references/change-session.md). This page is self-contained; they show the shape of a whole round.
