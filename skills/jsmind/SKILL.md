---
name: jsmind
description: >-
  Guardrails and a checklist for drawing or editing a jsMind mind map with the
  jsmind CLI. Use when the task gives a .json path and an intent of BUILD
  (new structure on an empty map) or CHANGE (edit an existing map). Not a CLI
  manual — do not use it to look up flags that --help already covers.
---

# jsmind — bans and a checklist

Not a CLI manual. Does not replace `jsmind --help`. Does not decide structure — you do that before you call. It only sets three things: what you must not do, which steps you must not skip, and what to look for in the picture.

The bans and the checkpoints below are the body. The command list at the end is not a tutorial and not optional background. It is the few lines you are most likely to forget. Do not skip it because you already know the CLI.

Chinese copy of the same rules: [SKILL.zh.md](SKILL.zh.md). Follow this file.

## Inputs (missing either one: fill it in before you start)

- **Path**: one `.json`.
- **Intent**: `BUILD` (new structure on an empty map) or `CHANGE` (edit an existing map).

File does not exist, and the intent is `BUILD`: `create` that path. Do not write the JSON yourself. File already exists: do not `create --force`. That overwrites. It is not an edit.

## Bans

- **Do not write the JSON file directly.** No editor, redirect, script, or read-modify-write. That bypasses `write → validate → rollback`.
- **Do not bypass `jsmind`.** Add or remove nodes, change text, change side, fold, change style: all through `jsmind` subcommands.
- **Do not continue while `validate` is failing.** Exit code is not 0: stop. Do not `export`. Do not start the next round of edits. Get `validate` to pass first.

## Hard checkpoints (in order, do not skip)

One sequence. Nothing later in this file repeats it in short form.

### 1. `context` before any edit

Get the ids, and see what the file contains now. The tree you remember and the tree in the file are often not the same one.

`BUILD`: `context` immediately after `create`. Use the root id it prints. Do not guess an id. `CHANGE`: `context` before you edit. Label does not match: add `--focus`. Deeper than the default: add `--depth`.

**Do not skip:** without the ids from this `context`, later commands edit the wrong node, or a node that is already gone.

Do not copy an id yet. The next heading is still this checkpoint.

### Read that `context` before you copy an id

How to read the CLI output. Not a new step. Skip this and checkpoint 1 is not done.

- The id is at the start of the line. The text on that same line is that id's label. The status block at the end of the line contains `side`, and `folded` when the node is folded. This only locates a node. It does not replace looking at the picture.
- `--focus` prints the match together with its ancestors. Take the id from **the line whose label matches**. Do not take the first line (that is usually an ancestor, or the root).
- The label is cut to an ellipsis, and you are about to change that text: run `context` again with `--full-text`. Still checkpoint 1.
- After `validate` passes (checkpoint 2), run `context` again. A child must be indented under its parent. Wrong indent means the pair is not the one you wanted. Back to checkpoint 1. Do not `export`.

### This round of `mind` / `node` edits

After checkpoint 1, before checkpoint 2. A round may be several commands. The round is over when you are about to look at the picture, or about to start a different kind of edit. Then checkpoint 2.

### 2. `validate` after the round

**Do not skip:** a broken file does not show in the command echo. Exit code is not 0: stop. See the bans.

Passing only means the file is legal. It does not mean the parent and child are the pair you wanted. Immediately `context` again and check the indent (previous heading, last bullet). Wrong indent: back to checkpoint 1. Do not `export`.

### 3. `export` and look, once this round's structure is done

This round changed structure (add or remove a node, reparent, change side, fold) and `validate` has passed: `export` a png and open it.

**Do not skip:** a passing `validate` only means the data is legal. It does not mean the picture looks right.

Style only, structure untouched: still `export` once, and confirm the color or font size is actually on the picture.

### 4. A failed look → back to checkpoint 1

Any item below fails: `context` again, edit, `validate`, `export`. Do not keep using ids you remember from the previous round.

## How to read the picture

Open the png. Each of the four gets a pass or a fail. "Looks fine" and "overall ok" do not count.

1. **Crushed text** — Fail: glyphs overlap, or text draws outside the node box. Fix: `node set-style` with a smaller `--font-size` on that node, or split the long label into shorter nodes (change text, remove, add — all through the CLI).
2. **One side overloaded** — Fail: one side is crowded and deep, the other is almost empty. Fix: `node set-side` moves some nodes to the lighter side (`left` or `right`).
3. **Folded when this task needs it open** — Fail: a branch this task has to show is collapsed (only the parent is on the picture, or the `context` line ends with `folded`). Fix: `node set-folded --folded false`.
4. **Lines cross** — Fail: lines pass through each other or knot, instead of leaving the parent toward the children. Fix: change those nodes' side, or `mind move` until the crossings are gone. Do not edit coordinates.

All four pass, or this look is not done.

## Commands you are most likely to forget

Not `jsmind --help`. Not a tutorial. One list, most-used first. Read every line. The lines after `export` are what you need when the picture fails — do not stop at `export`.

```
context <file> [--focus <text>] [--depth <n>] [--full-text]
mind find <file> --node-id <id>
mind add-child <file> --parent-id <id> [--text <label>] [--side left|right]
node set-style <file> --node-id <id> --tone <name>
node set-folded <file> --node-id <id> --folded true|false
validate <file>
export <file> <out.png>
create <file> --title <title>
node set-side <file> --node-id <id> --side left|right
node set-style <file> --node-id <id> --font-size <n>
node set-text <file> --node-id <id> --text <label>
mind move <file> --node-id <id> --parent-id <id>
```

A side change is `node set-side`. `--side` on `add-child` is not a side change you already made. After you change side, check `side=` at the end of the `context` line.

## Example session

**Request:** Draw an architecture mind map of jsMind v2.  
**Intent:** `BUILD`  
**File:** `tmp/jsmind-arch.json`  
**Image:** `tmp/jsmind-arch.png`

Target tree:

```
jsMind v2 architecture
├── Model
│   ├── Nodes and edges
│   └── Validation
├── View
│   ├── Layout
│   └── Rendering
└── CLI          ← emphasis, tone=primary
    ├── context
    ├── edit commands
    ├── validate
    └── export
```

### 1. Create the file; do not write JSON by hand

```
$ jsmind create tmp/jsmind-arch.json --title "jsMind v2 architecture"
created tmp/jsmind-arch.json
```

### 2. Checkpoint 1: run `context` first, then copy the id

```
$ jsmind context tmp/jsmind-arch.json
root   jsMind v2 architecture {side=center}
```

The root id is `root`. Do not guess an id.

### 3. First round of edits: build the structure

```
$ jsmind mind add-child tmp/jsmind-arch.json --parent-id root --text "Model"
added jm-mwgmfqzp under root

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id root --text "View"
added jm-mwgmfr18 under root

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id root --text "CLI"
added jm-mwgmfr2p under root

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id jm-mwgmfqzp --text "Nodes and edges"
added jm-mwgmfr41 under jm-mwgmfqzp

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id jm-mwgmfqzp --text "Validation"
added jm-mwgmfr5d under jm-mwgmfqzp

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id jm-mwgmfr18 --text "Layout"
added jm-mwgmfr6p under jm-mwgmfr18

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id jm-mwgmfr18 --text "Rendering"
added jm-mwgmfr7z under jm-mwgmfr18

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id jm-mwgmfr2p --text "context"
added jm-mwgmfr9g under jm-mwgmfr2p

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id jm-mwgmfr2p --text "edit commands"
added jm-mwgmfraq under jm-mwgmfr2p

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id jm-mwgmfr2p --text "validate"
added jm-mwgmfrc3 under jm-mwgmfr2p

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id jm-mwgmfr2p --text "export"
added jm-mwgmfrdg under jm-mwgmfr2p
```

### 4. Checkpoint 2: `validate`, then `context` to check indent

```
$ jsmind validate tmp/jsmind-arch.json
tmp/jsmind-arch.json: valid

$ jsmind context tmp/jsmind-arch.json --depth 2
root          jsMind v2 architecture {side=center}
jm-mwgmfqzp     Model {side=right}
jm-mwgmfr41       Nodes and edges {side=right}
jm-mwgmfr5d       Validation {side=right}
jm-mwgmfr18     View {side=right}
jm-mwgmfr6p       Layout {side=right}
jm-mwgmfr7z       Rendering {side=right}
jm-mwgmfr2p     CLI {side=right}
jm-mwgmfr9g       context {side=right}
jm-mwgmfraq       edit commands {side=right}
jm-mwgmfrc3       validate {side=right}
jm-mwgmfrdg       export {side=right}
```

Children are indented under the correct parents, so the structure is right. Every branch is still `side=right`.

### 5. Checkpoint 3: export and look

```
$ jsmind export tmp/jsmind-arch.json tmp/jsmind-arch.png
tmp/jsmind-arch.png: 2400x1600 (166.9 KB)
```

Open the png. Each of the four checks gets a pass or a fail:

1. Crushed text: pass
2. One side overloaded: fail. All three top-level branches sit on the right; the left is almost empty
3. Folded when this task needs it open: pass
4. Lines cross: pass

One check failed. Go back to checkpoint 1. Do not keep using conclusions remembered from the previous round.

### 6. Second round: balance the sides and mark what matters

```
$ jsmind context tmp/jsmind-arch.json --depth 2
(same tree as above; confirm the ids)

$ jsmind node set-side tmp/jsmind-arch.json --node-id jm-mwgmfqzp --side left
set side of jm-mwgmfqzp to left

$ jsmind node set-side tmp/jsmind-arch.json --node-id jm-mwgmfr18 --side left
set side of jm-mwgmfr18 to left

$ jsmind node set-style tmp/jsmind-arch.json --node-id jm-mwgmfr2p --tone primary
set style of jm-mwgmfr2p: {"tone":"primary"}
```

CLI stays on the right and is marked as the emphasis.

```
$ jsmind validate tmp/jsmind-arch.json
tmp/jsmind-arch.json: valid

$ jsmind context tmp/jsmind-arch.json --depth 2
root          jsMind v2 architecture {side=center}
jm-mwgmfqzp     Model {side=left}
jm-mwgmfr41       Nodes and edges {side=right}
jm-mwgmfr5d       Validation {side=right}
jm-mwgmfr18     View {side=left}
jm-mwgmfr6p       Layout {side=right}
jm-mwgmfr7z       Rendering {side=right}
jm-mwgmfr2p     CLI {side=right tone=primary}
jm-mwgmfr9g       context {side=right}
jm-mwgmfraq       edit commands {side=right}
jm-mwgmfrc3       validate {side=right}
jm-mwgmfrdg       export {side=right}
```

### 7. Export again

```
$ jsmind export tmp/jsmind-arch.json tmp/jsmind-arch.png
tmp/jsmind-arch.png: 2400x1600 (154.2 KB)
```

All four checks pass: text is not crushed, both sides have content, nothing that should be open is folded, and lines do not cross. The final artifacts are `tmp/jsmind-arch.json` and `tmp/jsmind-arch.png`.
