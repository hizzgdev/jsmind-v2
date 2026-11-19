# Skill

The jsmind skill lives in this repository at `skills/jsmind/`. It is a set of guardrails and a checklist for drawing or editing a mind map with the jsmind CLI.

It is **not** a CLI manual, and it does not replace `jsmind --help` or the [CLI](./cli) page. Use the skill when an agent should draw or edit a map; look up flags and subcommands in the CLI help or on the CLI page.

## Where to find it

These are the files on `master`:

- Directory: [skills/jsmind/](https://github.com/hizzgdev/jsmind-v2/tree/master/skills/jsmind)
- Skill: [skills/jsmind/SKILL.md](https://github.com/hizzgdev/jsmind-v2/blob/master/skills/jsmind/SKILL.md)
- Install steps: [skills/jsmind/INSTALL.md](https://github.com/hizzgdev/jsmind-v2/blob/master/skills/jsmind/INSTALL.md)

In a local clone, the same files are at `skills/jsmind/SKILL.md` and `skills/jsmind/INSTALL.md`.

## How to use it

Point your agent at the skill. For example:

- If you are working in a clone of this repository, tell the agent to work through the checkpoints in `skills/jsmind/SKILL.md` when it draws or edits a map.
- If you are working elsewhere, copy the whole `skills/jsmind/` directory into the place your agent loads skills from, keeping the `jsmind/` level.

The skill tells the agent what not to do, which steps not to skip, and how to check the resulting picture. It does not choose the map's structure for you.

There is one skill file, in English. It is read by the agent and not by you, and the map's language follows your prompt, so a translated second copy would only drift out of sync with this one.

## Copy-paste prompts

You can give the following prompts directly to your own agent.

### Install the skill

```
Install the jsMind skill from https://github.com/hizzgdev/jsmind-v2/blob/master/skills/jsmind/INSTALL.md — read that file and follow it. It covers the skill directory and the jsmind CLI, which is a separate npm package.

When you are done, go through its "Done means" list item by item and tell me the result of each one. If the skill does not load in your harness, stop and say so.
```

### Example: generate a map and export a PNG

```
Please use the jsMind skill to build a mind map about the solar system and export it as a PNG.

- If the jsMind skill is already loaded in this session, do not load it again; just use it.
- Write to the current working directory, with names taken from the topic (solar-system.json / solar-system.png). Do not use the system temporary directory, and do not ask whether to move the files afterwards.
- If a file with that name already exists, pick another name; do not overwrite it.
- Content: the Sun is the root, each of the eight planets is a first-level branch, and every planet gets at least two second-level branches.
- Done means: both files exist; in the PNG the levels are easy to tell apart and the two sides are not lopsided; and you give me the absolute path of both files.
```

## What it covers

This is a short summary, not a substitute for the skill file:

- **Inputs.** A JSON path and a corresponding PNG path, plus an intent: `BUILD` for a new map, or `CHANGE` for an existing one.
- **Bans.** Do not write the JSON file by hand. Do not bypass the `jsmind` CLI. If `validate` fails you must stop — no further edits and no export.
- **Checkpoints, in order.** Run `context` and read the ids before editing. After a round of edits, run `validate` and inspect the tree again. Once the structure is done, `export` a picture and look at it.

For the full checklist and examples, open the skill file linked above. For command flags, use `jsmind --help` or the [CLI](./cli) page.
