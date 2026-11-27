---
title: Color specific nodes to mark what matters
id: 162
date: "2026-11-28"
tags:
  - How-to
---

# Color specific nodes to mark what matters

> Applies to jsMind 2.x (currently a preview; details may change between releases).

<script setup>
import startMap from '../../assets/162-start.json?url';
import exampleMap from '../../assets/162-example.json?url';
</script>

In [Build your first mind map with the jsMind Skill](./161-first-mind-map-with-skill), the whole map was given one tone. This tutorial starts from that finished map and colours only the options that matter, so you can see them at a glance. If you have not followed 161, download the starting map below and continue from here — you do not need to redraw it.

You can download the starting map here: <a :href="startMap" download="weekend-outing.json">weekend-outing.json</a>. If you already have the file from 161, you can keep using that one.

![The first-level options "Walk in the park" and "Hike with friends" change colour; their children stay the document's primary blue](../../assets/162-color-nodes.gif)

## Ask the agent to mark what matters

Copy this prompt into a conversation where the jsMind Skill is already available, and attach or point to your starting map:

```
I already have a weekend outing mind map. Now I want to see it more clearly: walking in the park is something I prefer, hiking with friends depends on whether people are free — that's still uncertain — and the morning market and bookstore can just stay as notes for now. Please mark them with colors on the map so I can tell at a glance which ones I want more, and which ones are still uncertain.
```

The same prompt may come back with different colours; that is expected. This walkthrough uses green for something you prefer and orange for something still uncertain, so the pictures have a concrete meaning. If your agent picks other tones, you have not done it wrong.

You can also ask for a PNG export in the same message, or as a follow-up.

## Look at the result

![The weekend outing map after colouring two first-level options](../../assets/162-result.png)

The picture above and the animation at the top come from one real run. The first-level option "Walk in the park" is green (`success`), for something you prefer; "Hike with friends" is orange (`warning`), for something still uncertain. "Visit the new morning market" is left alone, so it stays the document's `primary` (blue). In the docs, `default` is white; `primary` is blue.

A tone applies only to the node that was changed. It does not flow down the branch, so the preparation items under "Walk in the park" and "Hike with friends" stay blue.

## What the agent does

You do not need to run the commands yourself. The agent should change the map through the jsMind CLI, and should not edit the JSON by hand. The pictures and downloads on this page come from one real run of a prompt like the one above. They illustrate the flow; they are not the required answer.

In [the first tutorial](./161-first-mind-map-with-skill), the whole map was recoloured with `mind set-style --default-tone`. Here the document default stays `primary`. To colour a single node, the agent uses `node set-style --tone`.

On this map, "Walk in the park" appears twice: once as a first-level option, and once as a child under it. The agent needs to identify the first-level option before colouring it. If you start from the file downloaded on this page, the ids will match this walkthrough. If you start from a map your agent generated in 161, the ids will differ; the agent should inspect that file again, and should not reuse the ids from this page.

These are the commands the agent used in this run, only to show what it did — not for you to type them yourself:

```
$ npx jsmind@2 node set-style weekend-outing.json --node-id jm-mwxkp0ey --tone success
set style of jm-mwxkp0ey: {"tone":"success"}

$ npx jsmind@2 node set-style weekend-outing.json --node-id jm-mwxkp0kt --tone warning
set style of jm-mwxkp0kt: {"tone":"warning"}
```

"Visit the new morning market" was left unchanged, so it stays the document-level `primary`.

The agent may write `weekend-outing.json` in the working directory and export a PNG, or it may choose different names and tell you where the files are. You can also download them here:

- Starting map (all `primary`): <a :href="startMap" download="weekend-outing.json">weekend-outing.json</a>
- After colouring the two options: <a :href="exampleMap" download="weekend-outing-colored.json">weekend-outing-colored.json</a>

## Next steps

- [Build your first mind map with the jsMind Skill](./161-first-mind-map-with-skill) — if you want to build the starting map from scratch
- [Skill](https://hizzgdev.github.io/jsmind-v2/docs/en/guide/skill) — more on installing and using the skill
- [CLI](https://hizzgdev.github.io/jsmind-v2/docs/en/guide/cli) — every command and flag
- [Playground](https://hizzgdev.github.io/jsmind-v2/playground.html) — open a map in the browser and edit it
