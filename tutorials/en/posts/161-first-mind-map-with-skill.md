---
title: Build your first mind map with the jsMind Skill
id: 161
date: "2026-11-26"
tags:
  - How-to
---

# Build your first mind map with the jsMind Skill

> Applies to jsMind 2.x (currently a preview; details may change between releases).

In this tutorial you will ask an AI agent to install the jsMind Skill, build a small Saturday outing plan as a mind map, and export it as a PNG. You can follow along with the same prompts.

<script setup>
import exampleMap from '../../assets/161-example.jm?url';
</script>


![The finished Saturday outing mind map](../../assets/161-result.png)

## What you will make

A compact map with a root, three first-level branches, and a few children:

- **Saturday outing** (the root)
  - **Morning** (left): Farmers' market, Coffee by the river
  - **Afternoon** (right): Park walk, Bookstore
  - **Things to bring** (left): Water bottle, Light jacket, Reusable bag, and — after a small edit — Picnic blanket

After that, you give the whole map a blue (`primary`) tone, so the finished picture is no longer the plain white default.

The finished map is here to download: <a :href="exampleMap" download="saturday-outing.jm">161-example.jm</a>.

## What you need

- Node.js 22.12.0 or later
- An AI agent that can install skills
- jsMind 2.x
- A Chromium-based browser on the same machine (the CLI uses it to render the PNG)

Install the 2.x package explicitly:

```bash
npm i jsmind@2
```

Then run the CLI as `npx jsmind@2`. The skill itself writes commands as `jsmind ...`. If `jsmind` is already on your PATH, that form works too. Prefer `npx jsmind@2` unless you know 2.x is the one being resolved: an unscoped `npx jsmind` may not invoke 2.x.

## Install the skill

Give this prompt to your agent:

```
Install the jsMind skill from https://hizzgdev.github.io/jsmind-v2/skills/jsmind/INSTALL.md — read that file and follow it.
```

The install notes will place the skill where your agent loads skills, and will check that the 2.x CLI is available. You do not need to pick a path yourself.

For other install options, see the [Skill](https://hizzgdev.github.io/jsmind-v2/docs/en/guide/skill) page in the documentation.

## Ask the agent to build the map

Once the skill is installed, paste this prompt:

```
Please use the jsMind skill to build a mind map for a Saturday outing and export it as a PNG.

- If the jsMind skill is already loaded in this session, do not load it again; just use it.
- Write to the current working directory, with the names saturday-outing.jm and saturday-outing.png. Do not use the system temporary directory, and do not ask whether to move the files afterwards.
- If a file with that name already exists, pick another name; do not overwrite it.
- Content: "Saturday outing" is the root. Give it three first-level branches: "Morning" on the left, "Afternoon" on the right, and "Things to bring" on the left.
  - Under Morning: "Farmers' market", "Coffee by the river"
  - Under Afternoon: "Park walk", "Bookstore"
  - Under Things to bring: "Water bottle", "Light jacket", "Reusable bag"
- Done means: both files exist; in the PNG the levels are easy to tell apart and the two sides are not lopsided; and you give me the absolute path of both files.
```

The agent should use the jsMind CLI to create and edit the file. It should not write the map by hand.

## What the agent does

Here is a real session that built the English map on this page. Your node ids will be different. After every write, take ids from the command that just ran, or run `context` again. Do not copy the ids below into your own commands.

The skill writes `jsmind`. The session below uses `npx jsmind@2`, which is the safe form when the CLI is not already on your PATH.

First it creates the map. `create` prints the root id — here it is `root`, which is the default, but you should still read it from the reply. The root id is data, and a file written elsewhere can name it anything.

```
$ npx jsmind@2 create saturday-outing.jm --title "Saturday outing"
created saturday-outing.jm (root node id root)
```

Then it adds first-level branches with `mind add-child`. `--side left` or `--side right` is only allowed when the parent is the root. A new root child defaults to the right if you omit `--side`. Deeper nodes inherit their branch's side; passing `--side` there is an error.

```
$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id root --text "Morning" --side left
added node (id jm-mwxb9as9) under root (side=left)
```

The reply carries the new id. Use it as `--parent-id` for the next children, instead of searching again:

```
$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id jm-mwxb9as9 --text "Farmers' market"
added node (id jm-mwxb9ath) under jm-mwxb9as9

$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id jm-mwxb9as9 --text "Coffee by the river"
added node (id jm-mwxb9aux) under jm-mwxb9as9
```

The same pattern builds the other two branches:

```
$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id root --text "Afternoon" --side right
added node (id jm-mwxb9aw3) under root (side=right)

$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id jm-mwxb9aw3 --text "Park walk"
added node (id jm-mwxb9axh) under jm-mwxb9aw3

$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id jm-mwxb9aw3 --text "Bookstore"
added node (id jm-mwxb9ayo) under jm-mwxb9aw3

$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id root --text "Things to bring" --side left
added node (id jm-mwxb9azw) under root (side=left)

$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id jm-mwxb9azw --text "Water bottle"
added node (id jm-mwxb9b15) under jm-mwxb9azw

$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id jm-mwxb9azw --text "Light jacket"
added node (id jm-mwxb9b27) under jm-mwxb9azw

$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id jm-mwxb9azw --text "Reusable bag"
added node (id jm-mwxb9b3e) under jm-mwxb9azw
```

One node per command: there is no batch form of `add-child`.

Then the agent validates the file and looks at the tree. `context` shows two levels by default, so this session passes `--depth 3` to include the grandchildren:

```
$ npx jsmind@2 validate saturday-outing.jm
saturday-outing.jm: valid

$ npx jsmind@2 context saturday-outing.jm --depth 3
root          Saturday outing {side=center}
jm-mwxb9as9     Morning {side=left}
jm-mwxb9ath       Farmers' market
jm-mwxb9aux       Coffee by the river
jm-mwxb9aw3     Afternoon {side=right}
jm-mwxb9axh       Park walk
jm-mwxb9ayo       Bookstore
jm-mwxb9azw     Things to bring {side=left}
jm-mwxb9b15       Water bottle
jm-mwxb9b27       Light jacket
jm-mwxb9b3e       Reusable bag
```

`export` writes a PNG next to the map. The default size is 2400×1600 pixels. If Chromium is not in a standard location, set `CHROME_PATH`.

```
$ npx jsmind@2 export saturday-outing.jm saturday-outing.png
saturday-outing.png: 2400x1600 (153.4 KB)
```

The picture at this point is the first export, before the picnic blanket:

![The first export, before adding the picnic blanket](../../assets/161-first-export.png)

## A small edit, then export again

The first picture looks complete, but the outing still needs a picnic blanket. Ask the agent to add that node and export again:

```
Using the jsMind skill, open saturday-outing.jm and add "Picnic blanket" under "Things to bring". Validate the map and export it again as saturday-outing.png.
```

`export` overwrites the PNG in place. If you want to keep the earlier picture, give the second export a different filename, or rename the first file first.

The agent should find the parent again rather than reuse an id it remembers from earlier. `context --highlight` maps the label to the current id:

```
$ npx jsmind@2 context saturday-outing.jm --highlight "Things to bring"
highlighted:
  "Things to bring" -> "root"/"jm-mwxb9azw"
```

```
$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id jm-mwxb9azw --text "Picnic blanket"
added node (id jm-mwxb9bvh) under jm-mwxb9azw

$ npx jsmind@2 validate saturday-outing.jm
saturday-outing.jm: valid

$ npx jsmind@2 export saturday-outing.jm saturday-outing.png
saturday-outing.png: 2400x1600 (164.9 KB)
```

## Give the whole map a colour

The default tone is white, which is what the first export used. One command can change the colour of every node that does not have its own tone. That command is `mind set-style`; you do not colour each node with `node set-style`.

The stock tones include `default` (white), `primary` (blue), `success` (green), `warning` (orange), `danger` (red), `info` (light blue), and `accent` (purple). This walkthrough uses `primary`. If a node already had its own tone, that tone would still win.

Ask the agent:

```
Using the jsMind skill, open saturday-outing.jm, set the document default tone to primary, and export it again as saturday-outing.png.
```

```
$ npx jsmind@2 mind set-style saturday-outing.jm --default-tone primary
set style of saturday-outing.jm: default-tone=primary

$ npx jsmind@2 export saturday-outing.jm saturday-outing.png
saturday-outing.png: 2400x1600 (174.5 KB)
```

![The finished Saturday outing mind map](../../assets/161-result.png)

## Where the files are

Both files land in the working directory you asked for — the directory you were in when you sent the prompt, unless the agent told you otherwise.

- `saturday-outing.jm` is the map itself. It is a JSON document; the `.jm` extension is fine, and the CLI accepts it.
- `saturday-outing.png` is the picture. Open it in any image viewer or browser.

The agent should also print the absolute paths of both files. You can download the finished example from this page: <a :href="exampleMap" download="saturday-outing.jm">161-example.jm</a>.

## Next steps

- [Getting Started](https://hizzgdev.github.io/jsmind-v2/docs/en/guide/getting-started) — install jsMind 2.x and create a first map yourself
- [Skill](https://hizzgdev.github.io/jsmind-v2/docs/en/guide/skill) — more on installing and using the skill
- [CLI](https://hizzgdev.github.io/jsmind-v2/docs/en/guide/cli) — every command and flag
- [Playground](https://hizzgdev.github.io/jsmind-v2/playground.html) — open a map in the browser and edit it
