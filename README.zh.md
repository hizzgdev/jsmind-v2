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
