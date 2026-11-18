# Overview

jsMind V2 is the next generation of jsMind. It keeps the familiar idea of a mind map, but it is a rewrite: the API is more reasonable, and the architecture is better.

It is built for both people and agents. People can view, edit, and export maps — for example in the [Playground](https://hizzgdev.github.io/jsmind-v2/playground.html). Agents can create, read, and modify structured maps through the [CLI](/en/reference/cli) and the [skill](./skill) in this repository. The library is the shared kernel behind both.

## How it relates to v1

The 2.x line is a rewrite, published on npm under the `v2-preview` dist-tag. It is not a drop-in replacement for v1 yet.

- `npm i jsmind@2` installs this 2.x line.
- `npm i jsmind` still installs v1 (0.9.x).

See [Getting Started](./getting-started) for installation and a first map.

## What you can do today

The current 2.0.0 preview already includes:

- Creating, validating, editing, and exporting maps with the CLI
- A skill that helps an agent draw or edit a map with that CLI
- A Playground where you can try the library in the browser

The programming API and the on-disk data format will be documented in later pages.

## Next steps

- [Getting Started](./getting-started) — install jsMind V2 and create a first map
- [Skill](./skill) — point an agent at the repository skill
- [CLI](/en/reference/cli) — current commands and usage (preview)
