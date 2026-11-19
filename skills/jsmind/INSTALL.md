# Installing the jsMind skill

You have been asked to install the jsMind skill into the harness you are running in. Two separate things have to be in place, and the skill does not install the other one for you:

- **The skill** is `SKILL.md`, in the same directory as this file: https://github.com/hizzgdev/jsmind-v2/blob/master/skills/jsmind/SKILL.md. It is documentation only: guardrails, checkpoints, and what to look for in the exported picture. It ships no commands.
- **The CLI** is the `jsmind` package on npm. Every map you build or edit goes through it.

## The CLI

The 2.x line is on a preview channel: `latest` on npm is still 0.9.1 (v1), which has no `bin` field and no `jsmind` command at all.

- Install it with `npm i jsmind@2`, then call it as `npx jsmind <command>`.
- Install it in the directory you will work in, or in a parent of it. `npx` resolves `jsmind` from the tree it runs in and otherwise falls back to the registry `latest`, so installing in one directory and working in another lands back on 0.9.1.
- Do not run plain `npm i jsmind`: that installs 0.9.1, which ships no executable, and `npx jsmind` then fails with `could not determine executable to run`. Running `npx jsmind` outside the tree where 2.x was installed produces the same message for the same reason: the version being resolved is wrong, not the skill.
- The skill writes its commands as `jsmind <command>`; on this install route you actually type `npx jsmind <command>`.
- Node.js >= 22.12.

`export` renders the PNG in a browser, so the machine needs a Chromium binary. Without one jsmind fails with `No Chromium found. Image export needs a browser`. That is a missing browser, not a missing skill file.

## Placing the skill

The directory name is the skill name, so `SKILL.md` has to sit one level below the skills root.

- **In a clone of this repository**: load `skills/jsmind/` in place and copy nothing. The clone's own CLI is `npx jsmind` as well, once `npm install && npm run build` has run.
- **Anywhere else**: copy the whole `skills/jsmind/` directory from https://github.com/hizzgdev/jsmind-v2/tree/master/skills/jsmind to `<skills>/jsmind/`, where `<skills>` is the directory your harness loads skills from. `INSTALL.md` is this file; `SKILL.md` is the one the harness needs. Keep the `jsmind/` level: `SKILL.md` dropped straight into `<skills>/` has no name to load under and collides with other skills.

## Done means

All four:

1. `npx jsmind --help` prints the usage text. 0.9.1 ships no executable, so usage means you are on 2.x.
2. A map created with `npx jsmind create` passes `npx jsmind validate`.
3. `npx jsmind export` writes a PNG you can open.
4. Your harness lists the skill as available. If it does not, stop and report that instead of working around it.

Keep the rules in the skill directory. Do not copy them into long-term memory (MEMORY.md or similar): the skill is versioned and memory is not, so the two drift apart.
