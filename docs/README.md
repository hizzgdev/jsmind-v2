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
│   ├── milestones.md               # 先做什么：M1/M2/M3 优先级、任务清单、验收标准
│   ├── roadmap.md                  # 怎么实现：PR 序列、各层状态、已知的坑
│   └── render-test-plan.md         # 渲染回归测试清单
├── archive/                        # 归档：不再维护但仍有参考价值的内容
│   ├── README.md                   # 归档说明与索引
│   ├── articles/                   # 早期的技术文章
│   ├── design-decisions/           # 各模块设计决策的完整推演过程
│   ├── v1-api-checklist.md         # v1 全部 API 对照清单（178 项）
│   └── tslib-explanation.md        # tslib 是什么、为什么需要
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

开发过程文档。两份配合看：

- **`milestones.md`** 决定**做什么**。按受益者排优先级（Agent → 用户 → 功能深度），每个里程碑带任务清单和验收标准
- **`roadmap.md`** 决定**怎么做**。按技术层次组织，存的是每层怎么实现、有哪些已知的坑

先读 milestones 再读 roadmap。`render-test-plan.md` 是渲染测试的策略文档。

### archive/

**不再维护、但仍然有参考价值的内容。**

这里的东西**不是垃圾**，是两种情况的产物：

1. **被更新的文档取代了** —— 新版在别处，旧版的完整推演过程留在这里
2. **对当前工作没有直接影响** —— 比如早期的技术文章、v1 的 API 清单

**归档不是删除。**决策是怎么做出来的、当时考虑过哪些被否决的方案，这些信息在新文档里通常只剩一句结论 —— 想知道为什么的人来这里。

每份归档文档顶部都注明新版的位置；索引见 [`archive/README.md`](archive/README.md)。

### images/

布局相关的示意图。源文件在 [ProcessOn](https://www.processon.com/diagraming/6959b6e33304bb1f4157446d)。