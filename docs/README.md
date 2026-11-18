# jsMind V2 文档

本目录只收录**对外发布的产品文档**。对内的开发材料（里程碑、路线图、内部需求、归档等）不在此索引。

公开文档站入口：[https://hizzgdev.github.io/jsmind-v2/docs/](https://hizzgdev.github.io/jsmind-v2/docs/)。站点提供中英文；入口地址会恢复上次选择的语言（若无记录则默认英文）。下面的指南、参考和设计说明都指向已发布的文档站页面。

`docs/requirements/` 是仓库里的对外规范源文件，尚未迁入文档站，因此仍用仓库内路径列出。`team/` 和仓库根目录的 `AGENTS.md` 不上文档站。

```
docs/
├── README.md                       # 本文件：对外文档索引
├── en/                             # 英文文档站源文件
│   ├── guide/                      # 指南（入门与日常用法，含 CLI）
│   ├── design/                     # 设计说明（为什么这样设计）
│   ├── reference/                  # API、功能说明与数据格式
│   └── community/                  # 社区、贡献与支持
├── zh/                             # 中文文档站源文件（与 en/ 成对）
├── requirements/                   # 对外规范（尚未迁入文档站）
│   ├── v2-data-format.md           # 磁盘格式（schema、校验规则、错误码）
│   └── v2-cli.md                   # CLI 命令结构、退出码契约
└── images/
    └── layout/                     # 布局相关的示意图（ProcessOn 源文件）
        ├── README.md
        ├── box-model.png
        ├── box-model-node.png
        ├── box-model-compose.png
        ├── coordinates.png
        └── coordinates-node.png
```

## 指南

- [概述（英文）](https://hizzgdev.github.io/jsmind-v2/docs/en/guide/) · [中文](https://hizzgdev.github.io/jsmind-v2/docs/zh/guide/) — 产品定位、与 v1 的关系，以及当前能做的事
- [快速上手（英文）](https://hizzgdev.github.io/jsmind-v2/docs/en/guide/getting-started) · [中文](https://hizzgdev.github.io/jsmind-v2/docs/zh/guide/getting-started) — 安装 2.x 版本并用 CLI 创建第一张导图
- [Skill（英文）](https://hizzgdev.github.io/jsmind-v2/docs/en/guide/skill) · [中文](https://hizzgdev.github.io/jsmind-v2/docs/zh/guide/skill) — 仓库中的 jsMind skill，以及可复制给 agent 的 prompt
- [CLI（英文）](https://hizzgdev.github.io/jsmind-v2/docs/en/guide/cli) · [中文](https://hizzgdev.github.io/jsmind-v2/docs/zh/guide/cli) — 文档站上的命令说明（预览版）；仓库里的规范源文件见 [v2-cli.md](requirements/v2-cli.md)

## 参考

- [API 快速上手（英文）](https://hizzgdev.github.io/jsmind-v2/docs/en/reference/api) · [中文](https://hizzgdev.github.io/jsmind-v2/docs/zh/reference/api) — 公开 API 预览
- [节点内容（英文）](https://hizzgdev.github.io/jsmind-v2/docs/en/reference/node-content) · [中文](https://hizzgdev.github.io/jsmind-v2/docs/zh/reference/node-content) — 节点内容类型与创建
- [节点移动（英文）](https://hizzgdev.github.io/jsmind-v2/docs/en/reference/node-move) · [中文](https://hizzgdev.github.io/jsmind-v2/docs/zh/reference/node-move) — 节点移动 API
- [图片导出（英文）](https://hizzgdev.github.io/jsmind-v2/docs/en/reference/image-export) · [中文](https://hizzgdev.github.io/jsmind-v2/docs/zh/reference/image-export) — 导出图片（API + 命令行）
- [序列化（英文）](https://hizzgdev.github.io/jsmind-v2/docs/en/reference/serialization) · [中文](https://hizzgdev.github.io/jsmind-v2/docs/zh/reference/serialization) — 序列化接口、JSON / FreeMind、校验层

## 设计说明

这些文章解释「为什么这么设计」和「各层怎么配合」，不是入门教程。

- [架构总览（英文）](https://hizzgdev.github.io/jsmind-v2/docs/en/design/) · [中文](https://hizzgdev.github.io/jsmind-v2/docs/zh/design/) — 六层架构、数据流、双通道设计
- [布局系统（英文）](https://hizzgdev.github.io/jsmind-v2/docs/en/design/layout-system) · [中文](https://hizzgdev.github.io/jsmind-v2/docs/zh/design/layout-system) — 坐标系统、盒模型、布局流程、间距规则
- [主题系统（英文）](https://hizzgdev.github.io/jsmind-v2/docs/en/design/theme-system) · [中文](https://hizzgdev.github.io/jsmind-v2/docs/zh/design/theme-system) — 主题数据驱动、tone、覆盖链、阴影合并
- [混合边系统（英文）](https://hizzgdev.github.io/jsmind-v2/docs/en/design/hybrid-edge-system) · [中文](https://hizzgdev.github.io/jsmind-v2/docs/zh/design/hybrid-edge-system) — 树用直接字段，额外关系用边

## 社区

- [Community](https://hizzgdev.github.io/jsmind-v2/docs/en/community/) · [社区](https://hizzgdev.github.io/jsmind-v2/docs/zh/community/) — 交流、贡献、赞助与支持

## 数据格式

- [数据格式](requirements/v2-data-format.md) — v2 磁盘格式规范（schema、校验规则、错误码）；文档站上的对应页面仍在编写中

## 示意图

布局相关的示意图在 [`images/layout/`](images/layout/)。源文件在 [ProcessOn](https://www.processon.com/diagraming/6959b6e33304bb1f4157446d)。
