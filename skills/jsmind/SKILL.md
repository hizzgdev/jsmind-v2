---
name: jsmind
display_name: jsMind mind maps
description: >-
  A work order for drawing or editing a jsmind mind map with the jsmind CLI.
  Use whenever the task produces or changes a map: a new map (BUILD), a change
  to an existing one (CHANGE), a restyle, an export, or a question about a map.
  Each job is a short transcript with its real output. Flags are in
  `jsmind --help`, not here.
version: 3.0.0
metadata:
  jsmind:
    cli: ">=2.1.0 <3"
---

# jsmind — one section per job

Six jobs cover what this CLI is for: locate, build, change, style, render, report. Repair is what you
do when one of them fails. Every section below is a transcript: the commands, their real output, and
the two or three things that go wrong. Read the section for the job you are doing. The ids and file
sizes come from real runs; yours will differ.

**Do not write the map file yourself** — no editor, redirect, script, or read-modify-write. That
bypasses `write → validate → rollback`, which is the only thing between you and a corrupted map.

`jsmind` below is the CLI on your PATH. Installed as a project dependency instead, run every command
as `npx jsmind@2`. Never bare `npx jsmind`: it resolves to 1.x, which ships no `bin`, so the failure
is a missing executable and says nothing about the version. Installation is in
[INSTALL.md](INSTALL.md).

## Locate: a label the user said → the id a command needs

Every edit takes `--node-id` or `--parent-id`, and users name nodes, they do not give ids. Ask the
file:

```
$ jsmind context map.json --highlight "数据准备"
highlighted:
  "数据准备" -> "root"/"jm-a1"

fullmap:
root    AI 工程实践 {side=center}
jm-a1     数据准备 {side=right}
jm-b1       清洗规则 {folded}
```

- The id to use is **the last one on that line**. Everything before it is the path, not the answer.
- Whole label, case-insensitive. `"数据"` does not match `数据准备`: use the label as the tree
  spells it, and read the tree in the same output when you are unsure.
- `(no match)` means the file has no such label. Do not retry with a shorter guess; look at
  `fullmap:` and take a label that is actually printed there.
- `(+N more)` means several nodes share the label, and the id given is the first in document order.
  Use a longer label that only one node has.
- Repeatable: `--highlight "Hot" --highlight "Cold"` answers both, one line each.
- `--ids-only` and `--highlight` cannot be combined in text mode (exit 2). Add `--json` when you
  want the ids without the labels.
- Labels longer than 40 characters are cut with an ellipsis; add `--full-text` when the label you are
  about to change is the long one.
- An id belongs to the file as it is now. After any change, locate again — never reuse an id from an
  earlier round, and never take one from a tree you remember.

`--depth <n>` changes how much of the tree prints. It does not change what `--highlight` searches.

## BUILD: draw a new map

```
$ jsmind create map.json --title "Storage tiers"
created map.json
$ jsmind context map.json
root   Storage tiers {side=center}
$ jsmind mind add-child map.json --parent-id root --text "Hot" --side left
added jm-mwpaz4zu under root (side=left)
$ jsmind validate map.json
map.json: valid
$ jsmind export map.json map.png
map.png: 2400x1600 (81.2 KB)
```

- Path: the one the user gave. Without one, write `topic.json` and `topic.png` in the working
  directory — the topic, hyphenated; not a temp directory and not a new subdirectory.
- `create` does not create parent directories. Make the directory first, or you get `ENOENT` and
  exit 3.
- Never `create --force` an existing file. That is a new map, not an edit.
- Short labels, one idea each. No more than about 7 root children — unless the user asked for a count
  or a depth, in which case build what they asked for.
- Build the root first, then branch by branch: every `--parent-id` needs an id you already have.
- `--side left|right` means something only when the parent is the root; a first-level branch and
  everything under it inherit the side. A new root child defaults to the right.

## CHANGE: edit an existing map

Locate first, then one of these:

| the user says | the command |
|---|---|
| add a child under X | `jsmind mind add-child map.json --parent-id <id> --text "..."` |
| rename X | `jsmind node set-text map.json --node-id <id> --text "..."` |
| delete X, with its subtree and its edges | `jsmind mind remove-node map.json --node-id <id>` |
| move X under Y | `jsmind mind move map.json --node-id <id> --parent-id <id> [--position <n>]` |
| put a first-level branch on the other side | `jsmind node set-side map.json --node-id <id> --side left\|right` |
| collapse or expand a branch | `jsmind node set-folded map.json --node-id <id> --folded true\|false` |
| draw a relation between two nodes | `jsmind mind add-edge map.json --source-id <id> --target-id <id> [--type link] [--label "..."]` |
| remove a relation | `jsmind mind remove-edge map.json --edge-id <id>` |

- `--side` on anything but a root child is exit 2, naming the branch the node would land in. Use
  `mind move` when the parent is the thing that is wrong.
- `--position` is an index among the parent's children; past the end appends.
- `--backup` keeps `map.json.bak` before writing. `--dry-run` prints the document it would write and
  writes nothing. In a round of several commands, `--backup` once at the start; `--dry-run` the one
  command you are unsure about.
- A round ends with `validate`, then `context` to check the shape, then `export` if the task wants a
  picture.

## STYLE

```
$ jsmind mind set-style map.json --default-tone primary
set style of map.json: default-tone=primary
$ jsmind node set-style map.json --node-id jm-a1 --tone danger --font-size 12
set style of jm-a1: {"tone":"danger","fontSize":12}
$ jsmind node set-style map.json --node-id jm-a1 --clear tone
set style of jm-a1: {"fontSize":12}
$ jsmind node set-style map.json --node-id jm-a1 --reset
cleared style of jm-a1
```

- Tones: `default primary success warning danger info accent`. Colours take any CSS colour.
- Precedence is node `tone` > document `defaultTone` > `default`. "Make the whole map warm" is
  `mind set-style`, not an override on every node.
- A style block stores only what differs from the theme, so `--clear <flag names, comma-separated>`
  is how one comes back, and `--reset` drops all of them.

## RENDER: a picture

```
$ jsmind export map.json map.png
map.png: 2400x1600 (81.2 KB)
```

- Needs Chromium. An environment that sandboxes child processes may ask for permission on the first
  run — that is the browser starting, not a failure. `CHROME_PATH` points at a binary that is not in
  a standard location.
- The image goes to the second positional and is **overwritten in place**; `--output` does not
  redirect it. Two runs at the same path leave one picture, so use a second path when both are
  wanted.
- `--width`, `--height`, `--scale`, `--type`, `--transparent` when the defaults do not fit.

## REPORT: answer a question about a map, change nothing

```
$ jsmind context map.json --json
{"nodes":[{"id":"root","parentId":null,"level":0,"text":"...","side":"center"}],"style":{...}}
```

- `parentId` is the tree; do not infer parentage from the order of `level`.
- `style.defaultTone`, when the file declares one, is why an untoned node is not necessarily
  `default`.
- `mind find --node-id <id>` is the one-node version, and it prints JSON.
- A question is not a change. Do not run a command that writes.

## REPAIR: a command failed

| exit | it means | do |
|---|---|---|
| 0 | done | read the output before trusting it |
| 1 | invalid data, or a referenced id that is not in the file | fix the data the report names |
| 2 | the command line is wrong: a flag, a value, `--side` on a non-root child | fix the command, leave the file alone |
| 3 | IO or environment: missing file, missing directory, no browser | fix the environment |

`validate` prints one block per problem — code, path, one sentence — and lists every problem, so the
count on the first line is how many you have to work through. Fix them, then validate the whole file
again: a fix can clear one and leave the rest.

## The four picture checks

Export, open the png, and score each one pass or fail. "Looks fine" is not a pass.

1. **Crushed text** — glyphs overlap or draw outside the box: smaller `--font-size` on that node, or
   split the label.
2. **One side overloaded** — `node set-side` moves a first-level branch and everything under it.
3. **A branch this task needs open is folded** — `node set-folded --folded false`.
4. **Lines cross** — move the first-level branch the crossing hangs off; `mind move` when the parent
   is really the wrong one.

## Commands you are most likely to forget

One list, most-used first. Every line names a command this CLI has; do not retype one from memory if
it is not here.

```
context <file> [--highlight <text>]... [--depth <n>] [--full-text] [--json]
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
mind add-edge <file> --source-id <id> --target-id <id> [--type link] [--label <label>]
mind remove-edge <file> --edge-id <id>
```

`--backup` and `--dry-run` apply to the commands that write the map — `create`, `mind`, `node` — and
not to `export`, which writes only the image.

## Not on this page

Run `jsmind <command> --help`. It prints that command's own block, not the whole manual, so it is
cheap. Do not guess a flag: an option the command does not take is reported on stderr and
**ignored** — the command still runs and exits 0, so a misspelt flag still produces a map, just not
the one you asked for. Add `--strict` to turn that into a usage error (exit 2).

Two worked sessions — a build that fails a picture check and repeats the round, and a change that
adds, renames, removes and re-exports — are in
[references/build-session.md](references/build-session.md) and
[references/change-session.md](references/change-session.md). This page is self-contained; they are
there for the shape of a whole round.
