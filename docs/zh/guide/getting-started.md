# 快速上手

本页说明如何安装 jsMind V2，并用 CLI 创建第一张思维导图。

## 安装

以下两种方式任选其一，不是先后步骤。

### npm 安装

安装 2.x 版本请使用：

```bash
npm i jsmind@2
```

::: warning
`npm i jsmind` 仍然会安装 v1（0.9.x）。要使用 2.x 版本，请执行 `npm i jsmind@2`。
:::

2.x 是一次重写，通过 npm 的 `v2-preview` dist-tag 发布，目前还不是 v1 的替代品。

安装软件包之后，可以用 `npx jsmind` 运行 CLI。

### 从仓库构建

从本仓库构建并运行 CLI 需要 Node.js >= 22.12.0：

```bash
git clone https://github.com/hizzgdev/jsmind-v2.git
cd jsmind-v2
npm install
npm run build
```

在仓库根目录，用 `npx jsmind` 或 `node dist/cli.js` 运行本地 CLI。下面的命令使用 `npx jsmind`；`node dist/cli.js` 效果相同。

## 创建第一张图

创建一张图，用 `context` 拿到根节点 id，添加子节点，校验，再导出 PNG：

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

这个示例里的根节点 id 是 `root`。子节点 id 是生成的；执行时请使用当前 `context` 输出的 id，不要照抄示例 id。

`export` 需要 Chromium 浏览器。如果它不在常见安装位置，请设置 `CHROME_PATH`。更多选项和其他命令见 [CLI](/zh/guide/cli) 页面。

## 试用 Playground

也可以打开 [Playground](https://hizzgdev.github.io/jsmind-v2/playground.html)，在浏览器里查看、编辑和导出导图，无需安装。

如果希望 agent 用 CLI 画图或改图，请看 [Skill](./skill) 页面。
