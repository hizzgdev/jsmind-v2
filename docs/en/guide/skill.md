# Skill

The jsmind skill lives in this repository at `skills/jsmind/`. It is a set of guardrails and a checklist for drawing or editing a mind map with the jsmind CLI.

It is **not** a CLI manual, and it does not replace `jsmind --help` or the [CLI](./cli) page. Use the skill when an agent should draw or edit a map; look up flags and subcommands in the CLI help or on the CLI page.

## Where to find it

These are the copies on `master`:

- Directory: [skills/jsmind/](https://github.com/hizzgdev/jsmind-v2/tree/master/skills/jsmind)
- English: [skills/jsmind/SKILL.md](https://github.com/hizzgdev/jsmind-v2/blob/master/skills/jsmind/SKILL.md)
- Chinese: [skills/jsmind/SKILL.zh.md](https://github.com/hizzgdev/jsmind-v2/blob/master/skills/jsmind/SKILL.zh.md)

In a local clone, the same files are at `skills/jsmind/SKILL.md` and `skills/jsmind/SKILL.zh.md`.

## How to use it

Point your agent at those files. For example:

- If you are working in a clone of this repository, tell the agent to work through the checkpoints in `skills/jsmind/SKILL.md` (or the Chinese copy) when it draws or edits a map.
- If you are working elsewhere, copy the whole `skills/jsmind/` directory into the place your agent loads skills from, keeping the `jsmind/` level.

The skill tells the agent what not to do, which steps not to skip, and how to check the resulting picture. It does not choose the map's structure for you.

## Copy-paste prompts

You can give the following prompts directly to your own agent.

### Install the skill

```
Please install the jsMind skill from the jsmind-v2 repository (https://github.com/hizzgdev/jsmind-v2) and put the jsmind CLI where you can call it directly.

The skill is documentation only — it ships no commands. Building or editing a map goes through the jsmind CLI, which is a separate npm package and has to be installed on its own. The skill lives at `skills/jsmind/` in the repository; take the whole directory, not just the two markdown files:
- Directory: https://github.com/hizzgdev/jsmind-v2/tree/master/skills/jsmind
- English: https://github.com/hizzgdev/jsmind-v2/blob/master/skills/jsmind/SKILL.md
- Chinese: https://github.com/hizzgdev/jsmind-v2/blob/master/skills/jsmind/SKILL.zh.md

Install the CLI first. The 2.x line is still on a preview channel (the npm tag is `v2-preview`), and `latest` is still 0.9.1 (v1, no CLI): use `npm i -g jsmind@2`, or skip the global install and call `npx jsmind@2`. Do not run `npm i jsmind` or a bare `npx jsmind`: that resolves to 0.9.1, there is no `jsmind` command, and the error looks like a broken skill when the wrong version is what is installed.

Environment: Node.js >= 22.12. `export` needs a Chromium binary on the machine; without one jsmind fails with `No Chromium found. Image export needs a browser`. That is a missing browser, not a missing skill file.

Then place the skill, in three steps:
1. Confirm where your harness loads skills from.
2. Copy `skills/jsmind/` to `<skills>/jsmind/`, keeping the `jsmind/` level; do not drop the markdown files straight into `skills/`.
3. Report back whether the skill loads. If it does not, stop there and say so; do not keep going.

If you are already in a clone of that repository, load `skills/jsmind/` in place; do not copy anything.

Minimum acceptance — all three:
- `jsmind --help` prints the usage text (0.9.1 has no such command, so usage means you are on 2.x);
- a file from `jsmind create` passes `jsmind validate`;
- `jsmind export` writes a PNG you can open.

Once it is installed, an agent builds and edits maps through the CLI: `context`
first to get node ids, `validate` after the edit, `export` at the end. Those
checks only exist on the CLI path — JSON can be written by hand, but nothing
catches a wrong id, a node on the wrong side, or a broken style.

Keeping the rules in the skill directory is enough. Do not copy them into long-term memory (MEMORY.md or similar): the skill is versioned, memory is not, and the two drift apart.
```

### Example: generate a map and export a PNG

```
Please use the jsMind skill to build a mind map about the solar system and export it as a PNG.

- If the jsMind skill is already loaded in this session, do not load it again; just use it.
- Write to the current working directory, with names taken from the topic (solar-system.json / solar-system.png). Do not use the system temporary directory, and do not ask whether to move the files afterwards.
- If a file with that name already exists, pick another name; do not overwrite it.
- Scale: the Sun is the root, each of the eight planets is a first-level branch, and every planet gets at least two second-level branches.
- Work through the skill's checkpoints in order: `jsmind context` for the ids, `jsmind validate` after the edits, `jsmind context` again to check the parent-child indent, then `jsmind export`.
- Open the PNG afterwards: levels should be clear, and the two sides should not be lopsided.
- When you are done, give the absolute path of both files.
```

## What it covers

This is a short summary, not a substitute for the skill file:

- **Inputs.** A JSON path and a corresponding PNG path, plus an intent: `BUILD` for a new map, or `CHANGE` for an existing one.
- **Bans.** Do not write the JSON file by hand. Do not bypass the `jsmind` CLI. If `validate` fails you must stop — no further edits and no export.
- **Checkpoints, in order.** Run `context` and read the ids before editing. After a round of edits, run `validate` and inspect the tree again. Once the structure is done, `export` a picture and look at it.

For the full checklist and examples, open the skill files linked above. For command flags, use `jsmind --help` or the [CLI](./cli) page.
