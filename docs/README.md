# jsMind V2 文档

本目录只收录**对外发布的产品文档**。对内的开发材料（里程碑、路线图、内部需求、归档等）不在此索引。

`architecture/` 是设计说明，解释系统为什么是现在这样、各层如何配合，**不是上手手册**。想查某个功能怎么用，请看 `features/`。

```
docs/
├── README.md                       # 本文件：对外文档索引
├── features/                       # 单功能说明（怎么用）
│   ├── serialization.md            # 序列化接口、JSON / FreeMind、校验层、autofix
│   ├── image-export.md             # 导出图片（API + 命令行）
│   ├── node-content.md             # 节点内容类型与创建
│   └── node-move.md                # 节点移动 API
├── architecture/                   # 设计说明（为什么这样设计，不是上手手册）
│   ├── architecture-overview.md    # 六层架构总览、数据流、双通道设计
│   ├── layout-system.md            # 坐标系统、盒模型、布局流程、间距规则
│   ├── theme-system.md             # 主题数据驱动、tone、覆盖链、阴影合并
│   └── hybrid-edge-system.md       # 混合边系统：树用直接字段，额外关系用边
├── requirements/                   # 对外规范
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

## 功能说明

- [序列化](features/serialization.md) — 序列化接口、JSON / FreeMind、校验层、autofix
- [图片导出](features/image-export.md) — 导出图片（API + 命令行）
- [节点内容](features/node-content.md) — 节点内容类型与创建
- [节点移动](features/node-move.md) — 节点移动 API

## 设计说明

这些文章解释「为什么这么设计」和「各层怎么配合」，不是入门教程。

- [架构总览](architecture/architecture-overview.md) — 六层架构、数据流、双通道设计
- [布局系统](architecture/layout-system.md) — 坐标系统、盒模型、布局流程、间距规则
- [主题系统](architecture/theme-system.md) — 主题数据驱动、tone、覆盖链、阴影合并
- [混合边系统](architecture/hybrid-edge-system.md) — 树用直接字段，额外关系用边

## 数据格式与 CLI

- [数据格式](requirements/v2-data-format.md) — v2 磁盘格式规范（schema、校验规则、错误码）
- [CLI](requirements/v2-cli.md) — 命令结构与退出码契约

## 示意图

布局相关的示意图在 [`images/layout/`](images/layout/)。源文件在 [ProcessOn](https://www.processon.com/diagraming/6959b6e33304bb1f4157446d)。
