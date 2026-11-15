# jsMind V2

A mind-map kernel designed for AI agents — agents can reliably create, read, and modify structured maps; people can view, edit, and export them.

[Documentation](https://github.com/hizzgdev/jsmind-v2/blob/master/docs/README.md) · [Playground](https://hizzgdev.github.io/jsmind-v2/playground.html) · [Skill](skills/jsmind/SKILL.md)

中文说明见 [README.zh.md](README.zh.md)。

<!-- Both the documentation and playground links are absolute, and both leave
     the repository.
     Docs stay on GitHub rather than being published as a site: they can be
     searched, blamed and edited there, and rendering them to HTML would mean
     maintaining a markdown build step for a project whose site is one page.
     The documentation link points at docs/README.md, the public docs index,
     not the whole historical docs/ tree.
     The playground only exists on the published site - it is copied there from
     example/ with its script path rewritten during deployment - so a relative
     link would 404 when this README is read on GitHub. -->

## Install

jsMind v2 has not been published to npm yet. The `jsmind` package on npm is still v1 0.9.1; do not run `npm install jsmind`.

To use the CLI from this repository you need Node.js >= 22.12.0:

```bash
git clone https://github.com/hizzgdev/jsmind-v2.git
cd jsmind-v2
npm install
npm run build
```

From the repository root, run the local CLI with `npx jsmind` or `node dist/cli.js`. The commands below use `npx jsmind`; `node dist/cli.js` is equivalent.

## Quick start

Create a map, read the root id from `context`, add a child, validate, and export a PNG:

```
$ npx jsmind create tmp/hello.json --title "Hello"
created tmp/hello.json

$ npx jsmind context tmp/hello.json
root   Hello {side=center}

$ npx jsmind mind add-child tmp/hello.json --parent-id root --text "World"
added jm-mwh96wk6 under root

$ npx jsmind validate tmp/hello.json
tmp/hello.json: valid

$ npx jsmind export tmp/hello.json tmp/hello.png
tmp/hello.png: 2400x1600 (85.0 KB)
```

The root id in this example is `root`. Child ids are generated; when you run these commands, use the ids from your current `context` output, and do not copy example ids.

## Documentation

Public product docs are in [`docs/`](https://github.com/hizzgdev/jsmind-v2/blob/master/docs/README.md):

- Features — [serialization](docs/features/serialization.md), [image export](docs/features/image-export.md), [node content](docs/features/node-content.md), and [node move](docs/features/node-move.md)
- [Architecture](docs/architecture/architecture-overview.md) — design notes on why the system is built this way, **not** a getting-started handbook
- [Data format](docs/requirements/v2-data-format.md) — on-disk schema, validation rules, and error codes
- [CLI](docs/requirements/v2-cli.md) — command structure and exit-code contract

## Playground

Try the library in the [Playground](https://hizzgdev.github.io/jsmind-v2/playground.html).

## Skill

The jsmind skill for drawing or editing a map with the CLI: [`skills/jsmind/SKILL.md`](skills/jsmind/SKILL.md). A Chinese copy is in [`SKILL.zh.md`](skills/jsmind/SKILL.zh.md).

## Development

How to work in this repository — environment, layout, branch and PR conventions, and commands — is in [`AGENTS.md`](AGENTS.md).
