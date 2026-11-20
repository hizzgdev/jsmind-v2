# Installing the jsMind skill

You have been asked to install the jsMind skill into the harness you are running in. Two separate things have to be in place, and the skill does not install the other one for you:

- **The skill** is `SKILL.md`, in the same directory as this file: https://github.com/hizzgdev/jsmind-v2/blob/master/skills/jsmind/SKILL.md. It is documentation only: guardrails, checkpoints, and what to look for in the exported picture. It ships no commands.
- **The CLI** is the `jsmind` package on npm. Every map you build or edit goes through it.

## The CLI

The 2.x line is on a preview channel: `latest` on npm is still 0.9.1 (v1), which has no `bin` field and no `jsmind` command at all.

- Install it with `npm i jsmind@2`, then call it as `npx jsmind@2 <command>`.
- `npx jsmind@2` resolves the 2.x line wherever you are: it uses a local 2.x install when there is one and fetches the range when there is not, so it does not matter which directory you installed from.
- **Never run bare `npx jsmind`.** With no version it resolves `latest`, which is still 0.9.1, and 0.9.1 ships no `bin` field at all. The message is `could not determine executable to run`, which reads like a broken install, a broken skill or a broken npx — it is none of those: the version being resolved is wrong.
- Do not run plain `npm i jsmind` either. That installs 0.9.1 and puts you back in the same place.
- The skill writes its commands as `jsmind <command>`; on this install route you actually type `npx jsmind@2 <command>`.
- Node.js >= 22.12.

`export` renders the PNG in a browser, so the machine needs a Chromium binary. Without one jsmind fails with `No Chromium found. Image export needs a browser`. That is a missing browser, not a missing skill file.

## Placing the skill

The directory name is the skill name, so `SKILL.md` has to sit one level below the skills root.

- **In a clone of this repository**: load `skills/jsmind/` in place and copy nothing. The clone's own CLI is `npx jsmind@2` as well, once `npm install && npm run build` has run.
- **Anywhere else**: copy the whole `skills/jsmind/` directory from https://github.com/hizzgdev/jsmind-v2/tree/master/skills/jsmind to `<skills>/jsmind/`, where `<skills>` is the directory your harness loads skills from. `INSTALL.md` is this file; `SKILL.md` is the one the harness needs. Keep the `jsmind/` level: `SKILL.md` dropped straight into `<skills>/` has no name to load under and collides with other skills.

## Done means

All four:

1. `npx jsmind@2 --help` prints the usage text. 0.9.1 ships no executable, so usage means you are on 2.x.
2. A map created with `npx jsmind@2 create` passes `npx jsmind@2 validate`.
3. All four picture checks in `SKILL.md` ("How to read the picture") pass on the exported PNG: no crushed text, no side overloaded, nothing folded that this task needs open, no crossing lines. "The PNG opens" is not this check — each of the four is a fail until you have looked at the picture and passed it.
4. The skill is reachable by its description, tested the way a new session meets it. Start a fresh process with nothing preloaded — no `-s <skill>`, no earlier session that already loaded it — and ask for a mind map without naming the skill. If the harness picks it from the description alone, it is reachable. A harness that lists the skill in its settings, or loads it because you forced it, has not shown this. If it does not come up, stop and report that instead of working around it.

Keep the rules in the skill directory. Do not copy them into long-term memory (MEMORY.md or similar): the skill is versioned and memory is not, so the two drift apart.
