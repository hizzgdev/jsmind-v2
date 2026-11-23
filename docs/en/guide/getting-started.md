# Getting Started

This page shows how to install jsMind V2 and create a first map with the CLI.

## Install

Pick one of the following. They are alternatives, not sequential steps.

### npm install

Install the 2.x version with:

```bash
npm i jsmind@2
```

::: warning
`npm i jsmind` still installs v1 (0.9.x). Use `npm i jsmind@2` for the 2.x version.
:::

2.x is a rewrite, published under the npm dist-tag `v2-preview`. It is not a drop-in replacement for v1 yet.

After installing the package, you can run the CLI with `npx jsmind`.

### Build from the repository

To build and run the CLI from this repository you need Node.js >= 22.12.0:

```bash
git clone https://github.com/hizzgdev/jsmind-v2.git
cd jsmind-v2
npm install
npm run build
```

From the repository root, run the local CLI with `npx jsmind` or `node dist/cli.js`. The commands below use `npx jsmind`; `node dist/cli.js` is equivalent.

## Create a first map

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

$ npx jsmind export tmp/hello.json tmp/hello.png
tmp/hello.png: 2400x1600 (85.0 KB)
```

The root id in this example is `root`, which is the default `create` picks. Take the id from the reply instead of assuming it: the root's id is data, and a document written or edited elsewhere can name it anything. Child ids are generated; when you run these commands, use the ids from your current output, and do not copy example ids.

`export` needs a Chromium browser. If it is not in a standard location, set `CHROME_PATH`. See the [CLI](/en/guide/cli) page for options and the rest of the commands.

## Try the Playground

You can also open the [Playground](https://hizzgdev.github.io/jsmind-v2/playground.html) to view, edit, and export a map in the browser — no install required.

If you want an agent to draw or edit a map with the CLI, see the [Skill](./skill) page.
