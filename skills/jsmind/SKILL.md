---
name: jsmind
display_name: jsMind mind maps
description: >-
  Guardrails and a checklist for drawing or editing a jsMind mind map with the
  jsmind CLI. Use whenever the task produces or changes a mind map: a new map
  (BUILD), a change to an existing one (CHANGE), and a bare "draw me a picture
  of X" that names no path and does not say BUILD or CHANGE. Not a CLI manual —
  do not use it to look up flags that --help already covers. `jsmind --help`
  prints every subcommand in one place, so when you need one, read that
  subcommand's section of it.
version: 2.0.3
metadata:
  jsmind:
    cli: ">=2.0.1 <3"
---

# jsmind — bans and a checklist

Not a CLI manual. Does not replace `jsmind --help`. Does not decide structure — you do that before you call. It only sets three things: what you must not do, which steps you must not skip, and what to look for in the picture.

The bans and the checkpoints below are the body. The command list at the end is not a tutorial and not optional background. It is the few lines you are most likely to forget. Do not skip it because you already know the CLI.

Installing this skill, and the CLI it calls, is in [INSTALL.md](INSTALL.md).

## Inputs (missing either one: fill it in before you start)

- **Path**: one `.json`, and the corresponding `.png` for export.
- **Intent**: `BUILD` (new structure on an empty map) or `CHANGE` (edit an existing map). If the user does not name either, pick the one that fits: no existing map, or they asked you to draw a new picture → `BUILD`; they asked you to change a map that already exists → `CHANGE`.

The user gave a path: use it. A path given in the task description counts as the user's path — use it as given, and do not redirect it.

The user gave no path: write both files in the current working directory, named after the topic. "Draw me a map of the three storage tiers" becomes `storage-tiers.json` and `storage-tiers.png` — lower-case words joined by hyphens, one topic, one name. Do not reach for the system temporary directory, and do not invent a subdirectory for them.

File does not exist, and the intent is `BUILD`: `create` that path. `create` does not make the parent directory, so a path whose directory is missing fails with `ENOENT` and exit code 3 — create the directory first. Do not write the JSON yourself. File already exists: do not `create --force`. That overwrites. It is not an edit.

## Structure (short)

- Keep node text short. Avoid long sentences.
- Do not give the root too many direct children. Suggest no more than 7.
- A count or a depth the user asked for ("three branches", "two levels") wins over that 7: build what they asked for, not what you would have chosen.

## Bans

- **Do not write the JSON file directly.** No editor, redirect, script, or read-modify-write. That bypasses `write → validate → rollback`.
- **Do not bypass `jsmind`.** Add or remove nodes, change text, change side, fold, change style: all through `jsmind` subcommands.
- **Do not continue while `validate` is failing.** Exit code is not 0: stop. Do not `export`. Do not start the next round of edits. Get `validate` to pass first.
- **Read the exit code before you decide what is broken.** Non-zero does not always mean the data is bad, and guessing wrong sends you to edit a file that was never the problem. `1` is invalid data: the report names the nodes, fix those. `2` is a usage error — missing argument, an unknown option under `--strict`, value out of range — so the command is wrong, fix the command and leave the file alone. `3` is an IO or runtime failure, such as a file that does not exist or a missing parent directory: fix the environment, not the mind map.

## Hard checkpoints (in order, do not skip)

One sequence. Nothing later in this file repeats it in short form.

### 1. `context` before any edit

Get the ids, and see what the file contains now. The tree you remember and the tree in the file are often not the same one.

`BUILD`: `context` immediately after `create`. Use the root id it prints. Do not guess an id. `CHANGE`: `context` before you edit. Label does not match: add `--focus`. Deeper than the default: add `--depth`.

**Do not skip:** without the ids from this `context`, later commands edit the wrong node, or a node that is already gone.

Do not copy an id yet. The next heading is still this checkpoint.

#### Read that `context` before you copy an id

How to read the CLI output. Not a new step. Skip this and checkpoint 1 is not done.

An id, `folded` or a style override taken out of the text tree is a field parsed from a format built for eyes, and every bullet below is a way that parse goes wrong. When you need the data rather than the picture, run `context --json`: it returns `{ nodes, style? }`. Under `nodes` every node has `id`, `level` and `text`, plus `side` for the root and its direct children, `folded` when the node is folded, and `style` when the node overrides the theme. The document-level `style` block (when the file declares one) carries `theme`, `defaultTone` and `overrides` — a file that names a `defaultTone` is coloured by it, so an untoned node is not necessarily `default`. The text form below is for seeing the tree.

- The id is at the start of the line. The text on that same line is that id's label. The status block at the end of the line contains `side` only for the root and the root's direct children, and `folded` when the node is folded. This only locates a node. It does not replace looking at the picture.
- `--focus` prints the match together with its ancestors. Take the id from **the line whose label matches**. Do not take the first line (that is usually an ancestor, or the root).
- The label is cut to an ellipsis, and you are about to change that text: run `context` again with `--full-text`. Still checkpoint 1.
- After `validate` passes (checkpoint 2), run `context` again. A child must be indented under its parent. Wrong indent means the pair is not the one you wanted. Back to checkpoint 1. Do not `export`.

#### This round of `mind` / `node` edits

After checkpoint 1, before checkpoint 2. A round may be several commands. The round is over when you are about to look at the picture, or about to start a different kind of edit. Then checkpoint 2.

### 2. `validate` after the round

**Do not skip:** a broken file does not show in the command echo. Exit code is not 0: stop. See the bans.

Passing only means the file is legal. It does not mean the parent and child are the pair you wanted. Immediately `context` again and check the indent (previous heading, last bullet). Wrong indent: back to checkpoint 1. Do not `export`.

A failure prints one block per problem — the error code, the path inside the document, and one sentence saying what is wrong there. `validate` reports every problem it finds, not just the first, so the count in the first line is the number of blocks you have to work through:

```
$ jsmind validate bad.json
bad.json: 4 problem(s)

  E_FORMAT  format
    Expected format "jsmind_v2", got "jsmind".
  E_META  meta
    Missing "meta" object.
  E_NODES_MISSING  nodes
    Missing "nodes" object.
  E_EDGES_MISSING  edges
    Missing "edges" object.
```

Fix along the path each block names, then run `validate` on the whole file again. The second run is what counts: a fix can clear one problem and leave the rest.

### 3. `export` and look, once this round's structure is done

This round changed structure (add or remove a node, reparent, change side, fold) and `validate` has passed: `export` a png and open it.

**Do not skip:** a passing `validate` only means the data is legal. It does not mean the picture looks right.

Style only, structure untouched: still `export` once, and confirm the color or font size is actually on the picture.

### 4. A failed look → back to checkpoint 1

Any item below fails: `context` again, edit, `validate`, `export`. Do not keep using ids you remember from the previous round.

## How to read the picture

Open the png. Each of the four gets a pass or a fail. "Looks fine" and "overall ok" do not count.

1. **Crushed text** — Fail: glyphs overlap, or text draws outside the node box. Fix: `node set-style` with a smaller `--font-size` on that node, or split the long label into shorter nodes (change text, remove, add — all through the CLI).
2. **One side overloaded** — Fail: one side is crowded and deep, the other is almost empty. Fix: `node set-side` moves one of the root's direct children to the lighter side (`left` or `right`), and that whole branch follows; `mind add-child --side left` places the next child there.
3. **Folded when this task needs it open** — Fail: a branch this task has to show is collapsed (only the parent is on the picture, or the `context` line ends with `folded`). Fix: `node set-folded --folded false`.
4. **Lines cross** — Fail: lines pass through each other or knot, instead of leaving the parent toward the children. Fix: only the root's direct children have a side that moves anything, so find the root-level child the crossing branch hangs off and move that one with `node set-side`. Under any other parent `--side` is a usage error (exit 2) naming the first-level branch, so a deeper node cannot take a side that quietly does nothing. Not enough: `mind move` changes the parent and child instead. Do not edit coordinates.

All four pass, or this look is not done.

## Commands you are most likely to forget

`jsmind` here is the CLI on your PATH. Installed as a project dependency instead: run every command on this page as `npx jsmind@2`. Never bare `npx jsmind` — it resolves to 1.x, and 1.x ships no `bin`, so the failure is about a missing executable and says nothing about the version.

Not `jsmind --help`. Not a tutorial. One list, most-used first. Read every line. The lines after `export` are what you need when the picture fails — do not stop at `export`.

```
context <file> [--focus <text>] [--depth <n>] [--full-text] [--json]
mind find <file> --node-id <id>
mind add-child <file> --parent-id <id> --text <label> [--side left|right] [--position <n>] [--folded true|false]
mind set-style <file> --default-tone <tone>
node set-style <file> --node-id <id> --tone <name>
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

`add-child` places the node in the same command. `--side left|right` works only when the parent is the root — a side is the placement of a first-level node and everything under it inherits — and on any other parent it is a usage error naming the branch the new node would land in. `--position <n>` is an index among the parent's children, appended when omitted. `--folded true|false` creates the node collapsed. All three change the picture, and none of them is visible in the tree you sketched before you started.

`context --json` reads the document-level style too: `{ nodes, style? }`, where `style` carries `theme`, the resolved `defaultTone`, and the sections the file overrides. A file with a `defaultTone` wears it on every node that has no tone of its own, so an untoned node is not necessarily `default`. `mind set-style <file> --default-tone <tone>` is the command that writes it.

`side` is only meaningful for the root's direct children. A new child of the root defaults to the right side. The check is `side=` at the end of that node's `context` line, which the text output prints for the root and its direct children only — the command echo says nothing about it.

`--backup` keeps a `.bak` copy of the file before overwriting it, and `--dry-run` prints the document it would write and writes nothing. Both apply to the commands that write the mind map — `create`, `mind`, `node` — and not to `export`, which writes only the image. In a `CHANGE` task they are the cheap way to see a round's result before trusting it: `--dry-run` for the next command, `--backup` before the round.

A misspelt option is a warning, not a failure: an option the command does not take is reported on stderr and the command still runs, with exit code 0. `--json` on stdout stays clean, so a caller that reads only stdout and the exit code never learns the flag did nothing — the map is built, in the shape you did not ask for. Pass `--strict` to make an unknown option a usage error (exit 2) instead, and read that exit code as the signal.

## Example

A short build, end to end. The ids and the file size come from one real run: yours will differ, so take them from your own `context`. The transcript calls `jsmind` directly; if you installed it as a project dependency, read each line as `npx jsmind@2` followed by the same arguments — nothing else changes.

**Request:** "draw me a map of the three storage tiers." **Intent:** `BUILD`. No path given, so the files are `storage-tiers.json` and `storage-tiers.png` in the working directory.

```
$ jsmind create storage-tiers.json --title "Storage tiers"
created storage-tiers.json

# checkpoint 1: context first, then copy the id
$ jsmind context storage-tiers.json
root   Storage tiers {side=center}

$ jsmind mind add-child storage-tiers.json --parent-id root --text "Hot" --side left
added jm-mwpaz4zu under root (side=left)
$ jsmind mind add-child storage-tiers.json --parent-id root --text "Warm"
added jm-mwpaz51x under root
$ jsmind mind add-child storage-tiers.json --parent-id root --text "Cold" --side left
added jm-mwpaz53v under root (side=left)
$ jsmind mind add-child storage-tiers.json --parent-id jm-mwpaz4zu --text "In-memory"
added jm-mwpaz6c8 under jm-mwpaz4zu

# checkpoint 2: validate, then context again for the indent
$ jsmind validate storage-tiers.json
storage-tiers.json: valid

$ jsmind context storage-tiers.json
root          Storage tiers {side=center}
jm-mwpaz4zu     Hot {side=left}
jm-mwpaz6c8       In-memory
jm-mwpaz51x     Warm {side=right}
jm-mwpaz53v     Cold {side=left}

# checkpoint 3: export and open the png
$ jsmind export storage-tiers.json storage-tiers.png
storage-tiers.png: 2400x1600 (92.7 KB)
```

Score the four checks above. All four pass, or back to checkpoint 1.

Two full sessions — a build that fails a picture check and repeats the round, and a change that adds, renames and removes — are in [references/build-session.md](references/build-session.md) and [references/change-session.md](references/change-session.md). This short one is here because some harnesses inject `SKILL.md` and cannot open another file.
