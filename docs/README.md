# jsMind V2 文档

```
docs/
├── README.md                       # 本文件
├── requirements/                   # 产品需求
│   ├── v2-requirements.md          # v2 定位、目标、功能边界与决策记录
│   ├── v2-data-format.md           # v2 磁盘格式规范（schema、校验规则、错误码）
│   └── v2-cli.md                   # CLI 命令结构、退出码契约
├── architecture/                   # 体系文章（横向贯穿多层）
│   ├── architecture-overview.md    # 六层架构总览、数据流、双通道设计
│   ├── layout-system.md            # 坐标系统、盒模型、布局流程、间距规则
│   ├── theme-system.md             # 主题数据驱动、tone、覆盖链、阴影合并
│   └── hybrid-edge-system.md       # 混合边系统：树用直接字段，额外关系用边
├── features/                       # 单功能文档
│   ├── serialization.md            # 序列化接口、JSON / FreeMind、校验层、autofix
│   ├── image-export.md             # 导出图片（API + 命令行）
│   ├── node-content.md             # 节点内容类型与创建
│   └── node-move.md                # 节点移动 API
├── development/
│   ├── roadmap.md                  # 开发计划、PR 序列、各层状态、剩余工作
│   └── render-test-plan.md         # 渲染回归测试清单
└── images/
    └── layout/                     # 布局相关的示意图（ProcessOn 源文件）
        ├── README.md
        ├── box-model.png
        ├── box-model-node.png
        ├── box-model-compose.png
        ├── coordinates.png
        └── coordinates-node.png
```

## 目录说明

### requirements/

产品层面的需求与规范。定了就不再频繁改动，实现时回来对照。

### architecture/

横跨多层的体系文章。不是单个功能的 API 参考，是解释「为什么这么设计」和「各层怎么配合」。新加入项目先读 `architecture-overview.md`。

### features/

单个功能的说明。偏「怎么用」而不是「为什么」，适合实现时查阅。

### development/

开发过程文档。`roadmap.md` 追踪实现进度与剩余工作，`render-test-plan.md` 是渲染测试的策略文档。

### images/

布局相关的示意图。源文件在 [ProcessOn](https://www.processon.com/diagraming/6959b6e33304bb1f4157446d)。