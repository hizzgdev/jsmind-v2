# CHANGE session: add, rename, remove

A full run on an existing map, moved out of `SKILL.md` so that page stays short. It starts from the finished map of the BUILD session, so read that one first if you want the starting tree.

The ids and file sizes here also come from one real run. Use the ids from the current `context` output. Do not copy example ids. After a node is removed, do not use its old id again.

**Request:** Under Model, add "Events"; rename "Rendering" to "Drawing"; remove "Validation"; then export again.  
**Intent:** `CHANGE`  
**File:** `jsmind-arch.json` (the completed BUILD example: Model and View on the left, CLI on the right with `tone=primary`)  
**Image:** `jsmind-arch.png`

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

## 1. Do not `create --force` on the existing file

Checkpoint 1: run `context` first, then copy the ids.

```
$ jsmind context jsmind-arch.json --depth 2
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

## 2. This round of edits

```
$ jsmind mind add-child jsmind-arch.json --parent-id jm-mwgox1ig --text "Events"
added node (id jm-mwgox3gs) under jm-mwgox1ig

$ jsmind node set-text jsmind-arch.json --node-id jm-mwgox1rv --text "Drawing"
set text of jm-mwgox1rv

$ jsmind mind remove-node jsmind-arch.json --node-id jm-mwgox1pe
removed jm-mwgox1pe
```

## 3. Checkpoint 2: `validate`, then `context` to check indent

```
$ jsmind validate jsmind-arch.json
jsmind-arch.json: valid

$ jsmind context jsmind-arch.json --depth 2
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

## 4. Checkpoint 3: export and look

```
$ jsmind export image jsmind-arch.json jsmind-arch.png
jsmind-arch.png: 2400x1600 (152.6 KB)
```

Open the png. Each of the four checks gets a pass or a fail:

1. Crushed text: pass
2. One side overloaded: pass. Model and View stay on the left, CLI on the right
3. Folded when this task needs it open: pass
4. Lines cross: pass

All four checks pass: text is not crushed, both sides have content, nothing that should be open is folded, and lines do not cross. The final artifacts are `jsmind-arch.json` and `jsmind-arch.png`.
