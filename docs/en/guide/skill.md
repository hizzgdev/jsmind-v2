# Skill

The jsmind skill lives in this repository at `skills/jsmind/`. It is a set of guardrails and a checklist for drawing or editing a mind map with the jsmind CLI.

It is **not** a CLI manual, and it does not replace `jsmind --help` or the [CLI reference](/en/reference/cli). Use the skill when an agent should draw or edit a map; look up flags and subcommands in the CLI help or on the CLI page.

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

## What it covers

This is a short summary, not a substitute for the skill file:

- **Inputs.** A JSON path and a corresponding PNG path, plus an intent: `BUILD` for a new map, or `CHANGE` for an existing one.
- **Bans.** Do not write the JSON file by hand. Do not bypass the `jsmind` CLI. Do not continue or export while `validate` is failing.
- **Checkpoints, in order.** Run `context` and read the ids before editing. After a round of edits, run `validate` and inspect the tree again. Once the structure is done, `export` a picture and look at it.

For the full checklist and examples, open the skill files linked above. For command flags, use `jsmind --help` or the [CLI](/en/reference/cli) page.
