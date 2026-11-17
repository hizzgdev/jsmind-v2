# jsMind V2

为 AI agent 设计的思维导图内核 —— agent 能可靠地生成、读取、修改结构化的脑图数据，人能查看、编辑、导出。

[文档](https://github.com/hizzgdev/jsmind-v2/blob/master/docs/README.md) · [Playground](https://hizzgdev.github.io/jsmind-v2/playground.html) · [Skill](skills/jsmind/SKILL.zh.md)

English version: [README.md](README.md).

<!-- 文档和 Playground 都使用绝对链接，都会离开本仓库。
     文档留在 GitHub 上，不单独做成站点：方便在仓库里搜索、blame 和编辑；
     为只有一页的项目维护一套 markdown 构建流程并不值得。
     文档链接指向 docs/README.md（对外文档索引），而不是历史上整棵混杂的 docs/ 目录。
     Playground 只存在于发布后的站点 —— 部署时从 example/ 复制并改写脚本路径 ——
     所以本 README 在 GitHub 上阅读时，相对链接会 404。 -->

## 安装

```bash
npm i jsmind@2
```

这是 2.x 预览线（npm tag 为 `v2-preview`），是一次重写，目前还不是 v1 的替代品。`npm i jsmind` 仍然会安装 v1（0.9.x）。

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

对外产品文档在 [`docs/`](https://github.com/hizzgdev/jsmind-v2/blob/master/docs/README.md)：

- 功能说明 — [序列化](docs/features/serialization.md)、[图片导出](docs/features/image-export.md)、[节点内容](docs/features/node-content.md)、[节点移动](docs/features/node-move.md)
- [设计说明](docs/architecture/architecture-overview.md) — 解释系统为什么是现在这样，**不是**上手手册
- [数据格式](docs/requirements/v2-data-format.md) — 磁盘格式、校验规则与错误码
- [CLI](docs/requirements/v2-cli.md) — 命令结构与退出码契约

## Playground

在 [Playground](https://hizzgdev.github.io/jsmind-v2/playground.html) 里试用。

## Skill

用 CLI 画图或改图时使用的 jsmind skill：[`skills/jsmind/SKILL.zh.md`](skills/jsmind/SKILL.zh.md)。英文版见 [`SKILL.md`](skills/jsmind/SKILL.md)。

## 开发

如何改这个仓库（环境、目录、分支与 PR 约定、常用命令）见 [`AGENTS.md`](AGENTS.md)。

## 开源协议

本项目以 [BSD 3-Clause License](LICENSE) 开源。
