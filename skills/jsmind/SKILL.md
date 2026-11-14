---
name: jsmind
description: >-
  Guardrails and a checklist for drawing or editing a jsMind mind map with the
  jsmind CLI. Use when the task is to draw or edit a mind map, including when
  the user only says "draw me a picture of X" and gives no path and does not
  say BUILD or CHANGE. Not a CLI manual — do not use it to look up flags that
  --help already covers.
---

# jsmind — bans and a checklist

Not a CLI manual. Does not replace `jsmind --help`. Does not decide structure — you do that before you call. It only sets three things: what you must not do, which steps you must not skip, and what to look for in the picture.

The bans and the checkpoints below are the body. The command list at the end is not a tutorial and not optional background. It is the few lines you are most likely to forget. Do not skip it because you already know the CLI.

Chinese copy of the same rules: [SKILL.zh.md](SKILL.zh.md). Follow this file.

## Inputs (missing either one: fill it in before you start)

- **Path**: one `.json`, and the corresponding `.png` for export.
- **Intent**: `BUILD` (new structure on an empty map) or `CHANGE` (edit an existing map). If the user does not name either, pick the one that fits: no existing map, or they asked you to draw a new picture → `BUILD`; they asked you to change a map that already exists → `CHANGE`.

The user gave a path: use it. The user gave no path: request temporary files from the current system — one JSON and a corresponding PNG — and generate usable paths in the system temporary directory, for example with `mktemp` or the platform temporary directory.

File does not exist, and the intent is `BUILD`: `create` that path. Do not write the JSON yourself. File already exists: do not `create --force`. That overwrites. It is not an edit.

When all work is done, if the files are still in the temporary directory, ask the user whether to move those two files somewhere else. They give a new location: move them. They do not: leave them as temporary files.

## Structure (short)

- Keep node text short. Avoid long sentences.
- Do not give the root too many direct children. Suggest no more than 7.

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

- The id is at the start of the line. The text on that same line is that id's label. The status block at the end of the line contains `side` only for the root and the root's direct children, and `folded` when the node is folded. This only locates a node. It does not replace looking at the picture.
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
mind add-child <file> --parent-id <id> --text <label>
node set-style <file> --node-id <id> --tone <name>
node set-folded <file> --node-id <id> --folded true|false
validate <file>
export <file> <out.png>
create <file> --title <title>
node set-side <file> --node-id <id> --side left|right
node set-style <file> --node-id <id> --font-size <n>
node set-text <file> --node-id <id> --text <label>
mind remove-node <file> --node-id <id>
mind move <file> --node-id <id> --parent-id <id>
```

`side` is only meaningful for the root's direct children. A new child of the root defaults to the right side. To change side, add the node first, then use `node set-side`. Do not pass `--side` to `add-child`. After you change side, check `side=` at the end of the `context` line (root and root children only).

## Example session

The ids and file sizes in the examples below come from one real run. When you execute, you must use the ids from the current `context` output. Do not copy example ids.

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
added jm-mwgox1ig under root

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id root --text "View"
added jm-mwgox1js under root

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id root --text "CLI"
added jm-mwgox1l1 under root

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id jm-mwgox1ig --text "Nodes and edges"
added jm-mwgox1o9 under jm-mwgox1ig

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id jm-mwgox1ig --text "Validation"
added jm-mwgox1pe under jm-mwgox1ig

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id jm-mwgox1js --text "Layout"
added jm-mwgox1qr under jm-mwgox1js

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id jm-mwgox1js --text "Rendering"
added jm-mwgox1rv under jm-mwgox1js

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id jm-mwgox1l1 --text "context"
added jm-mwgox1t3 under jm-mwgox1l1

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id jm-mwgox1l1 --text "edit commands"
added jm-mwgox1uc under jm-mwgox1l1

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id jm-mwgox1l1 --text "validate"
added jm-mwgox1vh under jm-mwgox1l1

$ jsmind mind add-child tmp/jsmind-arch.json --parent-id jm-mwgox1l1 --text "export"
added jm-mwgox1wl under jm-mwgox1l1
```

### 4. Checkpoint 2: `validate`, then `context` to check indent

```
$ jsmind validate tmp/jsmind-arch.json
tmp/jsmind-arch.json: valid

$ jsmind context tmp/jsmind-arch.json --depth 2
root          jsMind v2 architecture {side=center}
jm-mwgox1ig     Model {side=right}
jm-mwgox1o9       Nodes and edges
jm-mwgox1pe       Validation
jm-mwgox1js     View {side=right}
jm-mwgox1qr       Layout
jm-mwgox1rv       Rendering
jm-mwgox1l1     CLI {side=right}
jm-mwgox1t3       context
jm-mwgox1uc       edit commands
jm-mwgox1vh       validate
jm-mwgox1wl       export
```

Children are indented under the correct parents, so the structure is right. Every top-level branch is still `side=right`.

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

$ jsmind node set-side tmp/jsmind-arch.json --node-id jm-mwgox1ig --side left
set side of jm-mwgox1ig to left

$ jsmind node set-side tmp/jsmind-arch.json --node-id jm-mwgox1js --side left
set side of jm-mwgox1js to left

$ jsmind node set-style tmp/jsmind-arch.json --node-id jm-mwgox1l1 --tone primary
set style of jm-mwgox1l1: {"tone":"primary"}
```

CLI stays on the right and is marked as the emphasis.

```
$ jsmind validate tmp/jsmind-arch.json
tmp/jsmind-arch.json: valid

$ jsmind context tmp/jsmind-arch.json --depth 2
root          jsMind v2 architecture {side=center}
jm-mwgox1ig     Model {side=left}
jm-mwgox1o9       Nodes and edges
jm-mwgox1pe       Validation
jm-mwgox1js     View {side=left}
jm-mwgox1qr       Layout
jm-mwgox1rv       Rendering
jm-mwgox1l1     CLI {side=right tone=primary}
jm-mwgox1t3       context
jm-mwgox1uc       edit commands
jm-mwgox1vh       validate
jm-mwgox1wl       export
```

### 7. Export again

```
$ jsmind export tmp/jsmind-arch.json tmp/jsmind-arch.png
tmp/jsmind-arch.png: 2400x1600 (154.2 KB)
```

All four checks pass: text is not crushed, both sides have content, nothing that should be open is folded, and lines do not cross. The final artifacts are `tmp/jsmind-arch.json` and `tmp/jsmind-arch.png`.

## Example session (CHANGE)

The ids and file sizes here also come from one real run. Use the ids from the current `context` output. Do not copy example ids. After a node is removed, do not use its old id again.

**Request:** Under Model, add "Events"; rename "Rendering" to "Drawing"; remove "Validation"; then export again.  
**Intent:** `CHANGE`  
**File:** `tmp/jsmind-arch.json` (the completed BUILD example: Model and View on the left, CLI on the right with `tone=primary`)  
**Image:** `tmp/jsmind-arch.png`

Target tree:

```
jsMind v2 architecture
├── Model
│   ├── Nodes and edges
│   └── Events
├── View
│   ├── Layout
│   └── Drawing
└── CLI          ← emphasis, tone=primary
    ├── context
    ├── edit commands
    ├── validate
    └── export
```

### 1. Do not `create --force` on the existing file

Checkpoint 1: run `context` first, then copy the ids.

```
$ jsmind context tmp/jsmind-arch.json --depth 2
root          jsMind v2 architecture {side=center}
jm-mwgox1ig     Model {side=left}
jm-mwgox1o9       Nodes and edges
jm-mwgox1pe       Validation
jm-mwgox1js     View {side=left}
jm-mwgox1qr       Layout
jm-mwgox1rv       Rendering
jm-mwgox1l1     CLI {side=right tone=primary}
jm-mwgox1t3       context
jm-mwgox1uc       edit commands
jm-mwgox1vh       validate
jm-mwgox1wl       export
```

### 2. This round of edits

```
$ jsmind mind add-child tmp/jsmind-arch.json --parent-id jm-mwgox1ig --text "Events"
added jm-mwgox3gs under jm-mwgox1ig

$ jsmind node set-text tmp/jsmind-arch.json --node-id jm-mwgox1rv --text "Drawing"
set text of jm-mwgox1rv

$ jsmind mind remove-node tmp/jsmind-arch.json --node-id jm-mwgox1pe
removed jm-mwgox1pe
```

### 3. Checkpoint 2: `validate`, then `context` to check indent

```
$ jsmind validate tmp/jsmind-arch.json
tmp/jsmind-arch.json: valid

$ jsmind context tmp/jsmind-arch.json --depth 2
root          jsMind v2 architecture {side=center}
jm-mwgox1ig     Model {side=left}
jm-mwgox1o9       Nodes and edges
jm-mwgox3gs       Events
jm-mwgox1js     View {side=left}
jm-mwgox1qr       Layout
jm-mwgox1rv       Drawing
jm-mwgox1l1     CLI {side=right tone=primary}
jm-mwgox1t3       context
jm-mwgox1uc       edit commands
jm-mwgox1vh       validate
jm-mwgox1wl       export
```

Children are indented under the correct parents. The tree is Model (Nodes and edges, Events), View (Layout, Drawing), CLI (context, edit commands, validate, export). The removed node id is not used again.

### 4. Checkpoint 3: export and look

```
$ jsmind export tmp/jsmind-arch.json tmp/jsmind-arch.png
tmp/jsmind-arch.png: 2400x1600 (152.6 KB)
```

Open the png. Each of the four checks gets a pass or a fail:

1. Crushed text: pass
2. One side overloaded: pass. Model and View stay on the left, CLI on the right
3. Folded when this task needs it open: pass
4. Lines cross: pass

All four checks pass: text is not crushed, both sides have content, nothing that should be open is folded, and lines do not cross. The final artifacts are `tmp/jsmind-arch.json` and `tmp/jsmind-arch.png`.
