# BUILD session: an architecture map, and a picture that fails

A full run, moved out of `SKILL.md` so that page stays short. Read it when the short example is not enough — this is the one where a check fails and the round repeats.

The ids and file sizes come from one real run. When you execute, you must use the ids from the current `context` output. Do not copy example ids.

**Request:** Draw an architecture mind map of jsMind v2.  
**Intent:** `BUILD`  
**File:** `jsmind-arch.json`  
**Image:** `jsmind-arch.png`

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

## 1. Create the file; do not write JSON by hand

```
$ jsmind create jsmind-arch.json --title "jsMind v2 architecture"
created jsmind-arch.json (root node id root)
```

That reply carries the root's id. In this run it is the default word `root`, but the id is data, not a constant — an existing document can name its root anything. Take the id from the reply; do not assume `root` and do not guess an id.

## 2. Checkpoint 1: run `context` to see the tree

```
$ jsmind context jsmind-arch.json
root   jsMind v2 architecture {side=center}
```

## 3. First round of edits: build the structure

```
$ jsmind mind add-child jsmind-arch.json --parent-id root --text "Model"
added node (id jm-mwgox1ig) under root

$ jsmind mind add-child jsmind-arch.json --parent-id root --text "View"
added node (id jm-mwgox1js) under root

$ jsmind mind add-child jsmind-arch.json --parent-id root --text "CLI"
added node (id jm-mwgox1l1) under root

$ jsmind mind add-child jsmind-arch.json --parent-id jm-mwgox1ig --text "Nodes and edges"
added node (id jm-mwgox1o9) under jm-mwgox1ig

$ jsmind mind add-child jsmind-arch.json --parent-id jm-mwgox1ig --text "Validation"
added node (id jm-mwgox1pe) under jm-mwgox1ig

$ jsmind mind add-child jsmind-arch.json --parent-id jm-mwgox1js --text "Layout"
added node (id jm-mwgox1qr) under jm-mwgox1js

$ jsmind mind add-child jsmind-arch.json --parent-id jm-mwgox1js --text "Rendering"
added node (id jm-mwgox1rv) under jm-mwgox1js

$ jsmind mind add-child jsmind-arch.json --parent-id jm-mwgox1l1 --text "context"
added node (id jm-mwgox1t3) under jm-mwgox1l1

$ jsmind mind add-child jsmind-arch.json --parent-id jm-mwgox1l1 --text "edit commands"
added node (id jm-mwgox1uc) under jm-mwgox1l1

$ jsmind mind add-child jsmind-arch.json --parent-id jm-mwgox1l1 --text "validate"
added node (id jm-mwgox1vh) under jm-mwgox1l1

$ jsmind mind add-child jsmind-arch.json --parent-id jm-mwgox1l1 --text "export"
added node (id jm-mwgox1wl) under jm-mwgox1l1
```

## 4. Checkpoint 2: `validate`, then `context` to check indent

```
$ jsmind validate jsmind-arch.json
jsmind-arch.json: valid

$ jsmind context jsmind-arch.json --depth 2
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

## 5. Checkpoint 3: export and look

```
$ jsmind export image jsmind-arch.json jsmind-arch.png
jsmind-arch.png: 2400x1600 (166.9 KB)
```

Open the png. Each of the four checks gets a pass or a fail:

1. Crushed text: pass
2. One side overloaded: fail. All three top-level branches sit on the right; the left is almost empty
3. Folded when this task needs it open: pass
4. Lines cross: pass

One check failed. Go back to checkpoint 1. Do not keep using conclusions remembered from the previous round.

## 6. Second round: balance the sides and mark what matters

```
$ jsmind context jsmind-arch.json --depth 2
(same tree as above; confirm the ids)

$ jsmind node set-side jsmind-arch.json --node-id jm-mwgox1ig --side left
set side of jm-mwgox1ig to left

$ jsmind node set-side jsmind-arch.json --node-id jm-mwgox1js --side left
set side of jm-mwgox1js to left

$ jsmind node set-style jsmind-arch.json --node-id jm-mwgox1l1 --tone primary
set style of jm-mwgox1l1: {"tone":"primary"}
```

CLI stays on the right and is marked as the emphasis.

```
$ jsmind validate jsmind-arch.json
jsmind-arch.json: valid

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

## 7. Export again

```
$ jsmind export image jsmind-arch.json jsmind-arch.png
jsmind-arch.png: 2400x1600 (154.2 KB)
```

All four checks pass: text is not crushed, both sides have content, nothing that should be open is folded, and lines do not cross. The final artifacts are `jsmind-arch.json` and `jsmind-arch.png`. Next: [change-session.md](change-session.md) edits this same map.
