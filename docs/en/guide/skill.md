# Skill

The jsmind skill lives in this repository at `skills/jsmind/`. It is a set of guardrails and a checklist for drawing or editing a mind map with the jsmind CLI.

It is **not** a CLI manual, and it does not replace `jsmind --help` or the [CLI](./cli) page. Use the skill when an agent should draw or edit a map; look up flags and subcommands in the CLI help or on the CLI page.

## Where to find it

These are the copies on `master`:

- English: [skills/jsmind/SKILL.md](https://github.com/hizzgdev/jsmind-v2/blob/master/skills/jsmind/SKILL.md)
- Chinese: [skills/jsmind/SKILL.zh.md](https://github.com/hizzgdev/jsmind-v2/blob/master/skills/jsmind/SKILL.zh.md)

In a local clone, the same files are at `skills/jsmind/SKILL.md` and `skills/jsmind/SKILL.zh.md`.

## How to use it

Point your agent at those files. For example:

- If you are working in a clone of this repository, tell the agent to follow `skills/jsmind/SKILL.md` (or the Chinese copy) when it draws or edits a map.
- If you are working elsewhere, give the agent the GitHub links above, or copy the files into the place your agent already loads skills from.

The skill tells the agent what not to do, which steps not to skip, and how to check the resulting picture. It does not choose the map's structure for you.

## Copy-paste prompts

You can give the following prompts directly to your own agent.

### Install the skill

```
Please install or load the jsMind skill from the jsmind-v2 repository (https://github.com/hizzgdev/jsmind-v2).

The skill lives at `skills/jsmind/` in the repository:
- English: https://github.com/hizzgdev/jsmind-v2/blob/master/skills/jsmind/SKILL.md
- Chinese: https://github.com/hizzgdev/jsmind-v2/blob/master/skills/jsmind/SKILL.zh.md

If you are already in a clone of that repository, load the files from `skills/jsmind/`. Otherwise, fetch or copy those skill files into the place you already load skills from.

After the skill is installed, whenever you draw or edit a mind map you must follow it: do not hand-write the JSON; you must use the jsmind CLI.
```

### Example: generate a map and export a PNG

```
Please use the jsMind skill and the jsmind CLI to create a mind map about [topic] and export it as a PNG.

Requirements:
- If jsMind is not installed, first install the 2.x version (`npm i jsmind@2` or `npx jsmind`).
- Strictly follow the jsMind skill (repository path `skills/jsmind/`, or the GitHub copies of SKILL.md / SKILL.zh.md). Do not hand-write JSON; use the jsmind CLI.
- Create the map, add branches, and run `jsmind validate`. Validation must pass before you export.
- When you are done, give me the JSON and PNG file paths.
```

## What it covers

This is a short summary, not a substitute for the skill file:

- **Inputs.** A JSON path and a corresponding PNG path, plus an intent: `BUILD` for a new map, or `CHANGE` for an existing one.
- **Bans.** Do not write the JSON file by hand. Do not bypass the `jsmind` CLI. Do not continue or export while `validate` is failing.
- **Checkpoints, in order.** Run `context` and read the ids before editing. After a round of edits, run `validate` and inspect the tree again. Once the structure is done, `export` a picture and look at it.

For the full checklist and examples, open the skill files linked above. For command flags, use `jsmind --help` or the [CLI](./cli) page.
