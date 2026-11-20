# Skill fixtures

Two tasks with a right answer, for checking that this skill still works in a
harness that has never seen it. They exist because "the agent produced a map"
and "the agent produced the map it was asked for" are different claims, and the
second one is the only one worth reporting.

| Fixture | Prompt | Start |
| --- | --- | --- |
| `build.fixture.json` | build a map of the three cache tiers from nothing | none |
| `change.fixture.json` | add, rename and remove inside an existing map | `change-start.json` |

Each fixture is one JSON file: the prompt to hand an agent, and the tree that
answers it (`expect`). `assert.mjs` reads the result back through
`jsmind context --json` and says whether it matches.

## Running one

The point is to run the skill the way a stranger meets it: installed from the
repository, discovered by its description, and never forced.

```bash
npm run build                       # assert.mjs drives dist/cli.js

# 1. A clean install. Remove any previous copy first — a stale or broken
#    install passes a test the current files would fail.
rm -rf <harness-skills>/jsmind
cp -r skills/jsmind <harness-skills>/jsmind      # SKILL.md must sit one level below

# 2. A fresh process with nothing preloaded: no `-s <skill>`, no session that
#    already loaded it. Then ask for the map without naming the skill. If the
#    harness does not pick it from the description, stop — that is the result.
#
# 3. Check the map it produced, not the report it wrote.
node skills/jsmind/tests/assert.mjs build  <map.json> <out.png>
node skills/jsmind/tests/assert.mjs change <map.json> <out.png>
```

`--cli <path>` (or `JSMIND_CLI`) points the checker at a different CLI; the
default is this checkout's `dist/cli.js`.

For the `change` fixture, copy `change-start.json` into the working directory
first and hand the agent that file — the prompt names it.

## What a pass means

`assert.mjs` prints one `ok` / `not ok` line per check and exits non-zero on any
failure. It covers:

- `validate` exits 0.
- The root label, the first-level branches, and their children match the
  fixture, compared case- and whitespace-insensitively. Child order is not
  asserted: the tree is what matters, not the sequence.
- Sides, where the fixture names one. For `build` it only requires that both
  sides of the root carry a branch — that is the "one side overloaded" rule,
  stated as something a script can see.
- Labels that must be gone really are gone.
- The PNG exists, starts with the PNG signature and is not a stub.

It does not cover the four picture checks — crushed text, an overloaded side, a
fold the task needed open, crossing lines. Those need eyes on the image, which
is why `SKILL.md` asks for them and why a fixture run is finished when this
script passes **and** the picture has been looked at.

## Changing a fixture

Both sides move together: edit the prompt and `expect` in the same file, and
keep `expect` to what the prompt actually asks for. An assertion the prompt does
not imply turns this into a test of the agent's guesses.
