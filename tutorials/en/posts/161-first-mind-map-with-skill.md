---
title: Build your first mind map with the jsMind Skill
id: 161
date: "2026-11-26"
tags:
  - How-to
---

# Build your first mind map with the jsMind Skill

> Applies to jsMind 2.x (currently a preview; details may change between releases).

In this tutorial you will ask an AI agent to install the jsMind Skill, plan a Saturday outing as a mind map, and export it as a PNG. You can follow along with the same kind of prompts. The map itself is up to the agent: yours does not have to match the one on this page.

<script setup>
import exampleMap from '../../assets/161-example.jm?url';
</script>

![The finished Saturday outing mind map](../../assets/161-result.png)

## What you will make

A weekend outing plan, as a mind map: how to spend the morning and afternoon, and what to bring. The picture above is one real run, after a small edit and a colour change. If you use the same prompt, the agent may invent a different day — that is expected. You are learning the flow (install, ask, let the CLI build the map, then edit, recolour, and export), not copying a fixed outline.

You can download this run's finished map here: <a :href="exampleMap" download="saturday-outing.jm">161-example.jm</a>.

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
Please use the jsMind skill to make a mind map for a Saturday outing and export it as a PNG. We're planning a weekend trip: how should we spend the morning and afternoon, and what should we bring? Write the files in the current working directory. If the skill is already loaded, just use it. If a file with that name already exists, pick another name. When you're done, both files should exist, the PNG should be easy to read, and you should give me their absolute paths.
```

The agent should use the jsMind CLI to create and edit the file. It should not write the map by hand. It will invent the branches and labels itself, so the tree on your machine may not look like the one below.

## What the agent does

Here is one real session that produced the English map on this page. It is an illustration, not the required answer. After every write, take ids from the command that just ran, or run `context` again. Do not copy the ids below into your own commands.

The skill writes `jsmind`. The session below uses `npx jsmind@2`, which is the safe form when the CLI is not already on your PATH. In this run the agent chose the names `saturday-outing.jm` and `saturday-outing.png`; yours may differ.

First it creates the map. `create` prints the root id — here it is `root`, which is the default, but you should still read it from the reply. The root id is data, and a file written elsewhere can name it anything.

```
$ npx jsmind@2 create saturday-outing.jm --title "Saturday outing"
created saturday-outing.jm (root node id root)
```

Then it adds first-level branches with `mind add-child`. `--side left` or `--side right` is only allowed when the parent is the root. A new root child defaults to the right if you omit `--side`. Deeper nodes inherit their branch's side; passing `--side` there is an error.

```
$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id root --text "Morning" --side left
added node (id jm-mwxh4gjn) under root (side=left)
```

The reply carries the new id. Use it as `--parent-id` for the next children, instead of searching again:

```
$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id jm-mwxh4gjn --text "Sleep in a little"
added node (id jm-mwxh4glo) under jm-mwxh4gjn

$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id jm-mwxh4gjn --text "Brunch at the neighborhood cafe"
added node (id jm-mwxh4gmv) under jm-mwxh4gjn

$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id jm-mwxh4gjn --text "Stroll through the botanical garden"
added node (id jm-mwxh4goa) under jm-mwxh4gjn
```

The same pattern builds the other two branches this agent chose — an afternoon plan, and a packing list:

```
$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id root --text "Afternoon" --side right
added node (id jm-mwxh4gpm) under root (side=right)

$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id jm-mwxh4gpm --text "Sit by the lake"
added node (id jm-mwxh4gqs) under jm-mwxh4gpm

$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id jm-mwxh4gpm --text "Drop by a secondhand bookshop"
added node (id jm-mwxh4grr) under jm-mwxh4gpm

$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id root --text "Things to bring" --side right
added node (id jm-mwxh4gso) under root (side=right)

$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id jm-mwxh4gso --text "Sunscreen"
added node (id jm-mwxh4gtx) under jm-mwxh4gso

$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id jm-mwxh4gso --text "A water bottle"
added node (id jm-mwxh4gv0) under jm-mwxh4gso

$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id jm-mwxh4gso --text "A book"
added node (id jm-mwxh4gw0) under jm-mwxh4gso
```

One node per command: there is no batch form of `add-child`.

Then the agent validates the file and looks at the tree. `context` shows two levels by default, so this session passes `--depth 3` to include the grandchildren:

```
$ npx jsmind@2 validate saturday-outing.jm
saturday-outing.jm: valid

$ npx jsmind@2 context saturday-outing.jm --depth 3
root          Saturday outing {side=center}
jm-mwxh4gjn     Morning {side=left}
jm-mwxh4glo       Sleep in a little
jm-mwxh4gmv       Brunch at the neighborhood cafe
jm-mwxh4goa       Stroll through the botanical garden
jm-mwxh4gpm     Afternoon {side=right}
jm-mwxh4gqs       Sit by the lake
jm-mwxh4grr       Drop by a secondhand bookshop
jm-mwxh4gso     Things to bring {side=right}
jm-mwxh4gtx       Sunscreen
jm-mwxh4gv0       A water bottle
jm-mwxh4gw0       A book
```

`export` writes a PNG next to the map. The default viewport is 1200×800 at scale 2, so a typical export is 2400×1600 pixels; if the map is wider, the image grows with it. This run came out at 2494×1600, because some labels were a little long. If Chromium is not in a standard location, set `CHROME_PATH`.

```
$ npx jsmind@2 export saturday-outing.jm saturday-outing.png
saturday-outing.png: 2494x1600 (171.4 KB)
```

The picture at this point is the first draft from this run, still in the default white tone, and before the picnic blanket:

![The first export, before adding the picnic blanket](../../assets/161-first-export.png)

## A small edit, then export again

The first picture already looks like a plan, but this outing sits by the lake and forgot a picnic blanket. A follow-up like this is enough — you do not have to name commands for the agent:

```
We forgot a picnic blanket for sitting by the lake. Could you add that under the things to bring, and export the PNG again?
```

`export` overwrites the PNG in place. If you want to keep the earlier picture, give the second export a different filename, or rename the first file first.

The agent should find the parent again rather than reuse an id it remembers from earlier. `context --highlight` maps the label to the current id:

```
$ npx jsmind@2 context saturday-outing.jm --highlight "Things to bring"
highlighted:
  "Things to bring" -> "root"/"jm-mwxh4gso"
```

```
$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id jm-mwxh4gso --text "Picnic blanket"
added node (id jm-mwxh4hyu) under jm-mwxh4gso

$ npx jsmind@2 validate saturday-outing.jm
saturday-outing.jm: valid

$ npx jsmind@2 export saturday-outing.jm saturday-outing.png
saturday-outing.png: 2494x1600 (183.0 KB)
```

## Give the whole map a colour

The default tone is white, which is what the first export used. One command can change the colour of every node that does not have its own tone. That command is `mind set-style`; you do not colour each node with `node set-style`.

The stock tones include `default` (white), `primary` (blue), `success` (green), `warning` (orange), `danger` (red), `info` (light blue), and `accent` (purple). This walkthrough uses `primary`. If a node already had its own tone, that tone would still win.

Ask the agent in plain language:

```
The default white looks a bit plain. Could you make the whole map blue (the primary tone) and export it again?
```

```
$ npx jsmind@2 mind set-style saturday-outing.jm --default-tone primary
set style of saturday-outing.jm: default-tone=primary

$ npx jsmind@2 export saturday-outing.jm saturday-outing.png
saturday-outing.png: 2494x1600 (195.2 KB)
```

![The finished Saturday outing mind map](../../assets/161-result.png)

## Where the files are

Both files land in the working directory you asked for — the directory you were in when you sent the prompt, unless the agent told you otherwise. In this run they were called `saturday-outing.jm` and `saturday-outing.png`; your agent may pick different names.

- The `.jm` file is the map itself. It is a JSON document; the `.jm` extension is fine, and the CLI accepts it.
- The `.png` file is the picture. Open it in any image viewer or browser.

The agent should also print the absolute paths of both files. You can download this run's finished example from this page: <a :href="exampleMap" download="saturday-outing.jm">161-example.jm</a>.

## Next steps

- [Getting Started](https://hizzgdev.github.io/jsmind-v2/docs/en/guide/getting-started) — install jsMind 2.x and create a first map yourself
- [Skill](https://hizzgdev.github.io/jsmind-v2/docs/en/guide/skill) — more on installing and using the skill
- [CLI](https://hizzgdev.github.io/jsmind-v2/docs/en/guide/cli) — every command and flag
- [Playground](https://hizzgdev.github.io/jsmind-v2/playground.html) — open a map in the browser and edit it
