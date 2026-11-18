# 概述

jsMind V2 是 jsMind 的下一代。它仍然是大家熟悉的思维导图，但做了一次重写：API 更合理，架构也更好。

它同时面向人和 agent。人可以查看、编辑和导出导图，例如在 [Playground](https://hizzgdev.github.io/jsmind-v2/playground.html) 里试用。Agent 可以通过 [CLI](/zh/reference/cli) 和仓库里的 [skill](./skill) 来创建、读取和修改结构化导图。库本身是两者共用的内核。

## 与 v1 的关系

2.x 是一次重写，通过 npm 的 `v2-preview` dist-tag 发布。它目前还不是 v1 的替代品。

- `npm i jsmind@2` 会安装这条 2.x 线。
- `npm i jsmind` 仍然会安装 v1（0.9.x）。

安装方法和第一张图见 [快速上手](./getting-started)。

## 现在已经可以做什么

当前的 2.0.0 预览版已经包括：

- 用 CLI 创建、校验、编辑和导出导图
- 一份帮助 agent 用该 CLI 画图或改图的 skill
- 一个可以在浏览器里试用库的 Playground

[API](/zh/reference/api) 已按预览版写好。磁盘上的数据格式会在后续页面中说明；序列化与校验见[序列化](./serialization)。

## 接下来

- [快速上手](./getting-started) — 安装 jsMind V2，并创建第一张导图
- [Skill](./skill) — 让 agent 使用仓库里的 skill
- [节点内容](./node-content) — 已发布的 `text` 内容类型
- [节点移动](./node-move) — 换父节点、兄弟位置和方向
- [导出图片](./image-export) — 用 API 或 CLI 导出 PNG、JPEG 或 WebP
- [序列化](./serialization) — 读写导图、校验和 autofix
- [CLI](/zh/reference/cli) — 当前命令和用法（预览版）
- [API](/zh/reference/api) — 如何调用已发布的 2.0.0 编程接口（预览版）
- [设计](/zh/design/) — 库为什么采用现在的结构
