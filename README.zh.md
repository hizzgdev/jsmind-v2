# jsMind V2

面向人与 agent 的思维导图内核 —— 人能查看、编辑、导出导图，agent 能可靠地生成、读取、修改结构化的脑图数据。

[文档](https://hizzgdev.github.io/jsmind-v2/docs/) · [Playground](https://hizzgdev.github.io/jsmind-v2/playground.html) · [Skill](skills/jsmind/SKILL.zh.md)

English version: [README.md](README.md).

<!-- 文档和 Playground 都使用绝对链接，因为在 GitHub 上阅读本 README 时两者都会离开本仓库。
     文档链接指向已发布的文档站入口，它会恢复上次选择的语言（若无记录则默认英文）。
     这里不直接链接到带语言前缀的文档地址。Playground 只存在于发布后的站点 ——
     部署时从 example/ 复制并改写脚本路径 —— 所以本 README 在 GitHub 上阅读时，相对链接会 404。 -->

## 安装

```bash
npm i jsmind@2
```

这是 2.x 版本（npm tag 为 `v2-preview`），是一次重写，目前还不是 v1 的替代品。`npm i jsmind` 仍然会安装 v1（0.9.x）。

从本仓库构建并运行 CLI 需要 Node.js >= 22.12.0：

```bash
git clone https://github.com/hizzgdev/jsmind-v2.git
cd jsmind-v2
npm install
npm run build
```

在仓库根目录，用 `npx jsmind` 或 `node dist/cli.js` 运行本地 CLI。下面的命令使用 `npx jsmind`；`node dist/cli.js` 效果相同。

## 快速上手

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

## 文档

对外文档站入口：[https://hizzgdev.github.io/jsmind-v2/docs/](https://hizzgdev.github.io/jsmind-v2/docs/)。站点提供中英文，入口地址会记住上次选择的语言；若无记录则默认进入英文。

## Playground

在 [Playground](https://hizzgdev.github.io/jsmind-v2/playground.html) 里试用。

## Skill

用 CLI 画图或改图时使用的 jsmind skill：[`skills/jsmind/SKILL.zh.md`](skills/jsmind/SKILL.zh.md)。英文版见 [`SKILL.md`](skills/jsmind/SKILL.md)。

## 开发

如何改这个仓库（环境、目录、分支与 PR 约定、常用命令）见 [`AGENTS.md`](AGENTS.md)。

## 开源协议

本项目以 [BSD 3-Clause License](LICENSE) 开源。
