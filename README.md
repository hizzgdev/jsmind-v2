# jsMind V2

A mind-map kernel for people and agents — people can view, edit, and export maps; agents can reliably create, read, and modify structured maps.

[Documentation](https://hizzgdev.github.io/jsmind-v2/docs/) ([Quick start](https://hizzgdev.github.io/jsmind-v2/docs/en/guide/getting-started) / [Skill](https://hizzgdev.github.io/jsmind-v2/docs/en/guide/skill) / [CLI](https://hizzgdev.github.io/jsmind-v2/docs/en/guide/cli)) · [Tutorials](https://hizzgdev.github.io/jsmind-v2/tutorials/) · [Playground](https://hizzgdev.github.io/jsmind-v2/playground.html)

[![npm v2-preview](https://img.shields.io/npm/v/jsmind/v2-preview)](https://www.npmjs.com/package/jsmind?activeTab=versions)

中文说明见 [README.zh.md](README.zh.md)。

<!-- The documentation, tutorial and playground links are absolute, because all
     three leave the repository when this README is read on GitHub. The
     documentation and tutorial links are the published site entries, which
     restore the last language choice (or English by default). A
     language-prefixed URL is not used here. The playground only exists on the
     published site - it is copied there from example/ with its script path
     rewritten during deployment - so a relative link would 404 when this
     README is read on GitHub. -->

## Install

```bash
npm i jsmind@2
```

This is the 2.x version (npm tag `v2-preview`), a rewrite. It is not a drop-in replacement for v1 yet. `npm i jsmind` still installs v1 (0.9.x).

To build and run the CLI from this repository you need Node.js >= 22.12.0:

```bash
git clone https://github.com/hizzgdev/jsmind-v2.git
cd jsmind-v2
npm install
npm run build
```

From the repository root, run the local CLI with `npx jsmind` or `node dist/cli.js`. The commands below use `npx jsmind`; `node dist/cli.js` is equivalent.

## Quick start

Create a map, add a child, validate, and export a PNG. `create` prints the root node id it made, and `context` shows the tree:

```
$ npx jsmind create tmp/hello.json --title "Hello"
created tmp/hello.json (root node id root)

$ npx jsmind context tmp/hello.json
root   Hello {side=center}

$ npx jsmind mind add-child tmp/hello.json --parent-id root --text "World"
added node (id jm-mwh96wk6) under root

$ npx jsmind validate tmp/hello.json
tmp/hello.json: valid

$ npx jsmind export image tmp/hello.json tmp/hello.png
tmp/hello.png: 2400x1600 (85.0 KB)
```

The root id in this example is `root`, which is the default `create` picks. Take the id from the reply instead of assuming it: the root's id is data, and a document written or edited elsewhere can name it anything. Child ids are generated; when you run these commands, use the ids from your current output, and do not copy example ids.

## Documentation

The public documentation site is at [https://hizzgdev.github.io/jsmind-v2/docs/](https://hizzgdev.github.io/jsmind-v2/docs/). English and Chinese are both available; the entry URL remembers the last language you chose, or defaults to English.

## Tutorials

The tutorial column is at [https://hizzgdev.github.io/jsmind-v2/tutorials/](https://hizzgdev.github.io/jsmind-v2/tutorials/). It is being built: the first tutorials are being written and will be listed there. The language rule is the same as the documentation.

## Playground

Try the library in the [Playground](https://hizzgdev.github.io/jsmind-v2/playground.html).

## Skill

The jsmind skill for drawing or editing a map with the CLI: [`skills/jsmind/SKILL.md`](skills/jsmind/SKILL.md). How to install it, and the CLI it calls: [`skills/jsmind/INSTALL.md`](skills/jsmind/INSTALL.md).

## Development

How to work in this repository — environment, layout, branch and PR conventions, and commands — is in [`AGENTS.md`](AGENTS.md).

## License

This project is open source under the [BSD 3-Clause License](LICENSE).
