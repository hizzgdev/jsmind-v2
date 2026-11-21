# Skill

The jsmind skill lives in this repository at `skills/jsmind/`. It is a set of guardrails and a checklist for drawing or editing a mind map with the jsmind CLI.

It is **not** a CLI manual, and it does not replace `jsmind --help` or the [CLI](./cli) page. Use the skill when an agent should draw or edit a map; look up flags and subcommands in the CLI help or on the CLI page.

The directory ships with this site as well, so it can be read without cloning anything: [skills/jsmind/SKILL.md](https://hizzgdev.github.io/jsmind-v2/skills/jsmind/SKILL.md) is the same file the repository has, and the rest of `skills/jsmind/` sits beside it.

## Install

Pick one of the following. They are alternatives, not sequential steps.

### Automatic install

You can give the following prompt directly to your own agent.

```
Install the jsMind skill from https://hizzgdev.github.io/jsmind-v2/skills/jsmind/INSTALL.md — read that file and follow it.
```

### Manual install

Point your agent at the skill. For example:

- If you are working in a clone of this repository, tell the agent to work through the checkpoints in `skills/jsmind/SKILL.md` when it draws or edits a map.
- If you are working elsewhere, copy the whole `skills/jsmind/` directory into the place your agent loads skills from, keeping the `jsmind/` level.

### Which file is which

`INSTALL.md` is written for whoever installs the skill: it is the runbook above. `SKILL.md` is what an agent reads while it draws or edits a map. The two sit in the same directory, but `INSTALL.md` is not injected by any harness — loading the skill means the harness reading `SKILL.md` and stopping there. Editing `INSTALL.md`, or translating it, changes nothing at run time.

## Usage

The skill tells the agent what not to do, which steps not to skip, and how to check the resulting picture. It does not choose the map's structure for you.

There is one skill file, in English. It is read by the agent and not by you, and the map's language follows your prompt, so a translated second copy would only drift out of sync with this one.

You can give the following prompt directly to your own agent.

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

For the full checklist and examples, open the skill file linked below. For command flags, use `jsmind --help` or the [CLI](./cli) page.

## Where to find it

These are the files on `master`. Each one is given twice: GitHub first, the Gitee mirror of the same path after it.

| | GitHub | Gitee mirror |
|---|---|---|
| Directory | [skills/jsmind/](https://github.com/hizzgdev/jsmind-v2/tree/master/skills/jsmind) | [skills/jsmind/](https://gitee.com/hizzgdev/jsmind-v2/tree/master/skills/jsmind) |
| Skill file | [SKILL.md](https://raw.githubusercontent.com/hizzgdev/jsmind-v2/master/skills/jsmind/SKILL.md) | [SKILL.md](https://gitee.com/hizzgdev/jsmind-v2/raw/master/skills/jsmind/SKILL.md) |
| Install steps | [INSTALL.md](https://raw.githubusercontent.com/hizzgdev/jsmind-v2/master/skills/jsmind/INSTALL.md) | [INSTALL.md](https://gitee.com/hizzgdev/jsmind-v2/raw/master/skills/jsmind/INSTALL.md) |

The two directory links open a listing to read in a browser. The four file links are raw, which is the form to hand to an agent: a `tree` or `blob` page returns HTML, so copying from one leaves you with a web page where a skill file should be.

This site also serves the directory under its own root, so [skills/jsmind/SKILL.md](https://hizzgdev.github.io/jsmind-v2/skills/jsmind/SKILL.md) needs neither repository.

In a local clone, the same files are at `skills/jsmind/SKILL.md` and `skills/jsmind/INSTALL.md`.
