# team/

`team/` 存放对内材料（文档、图片、稿件等）。它的性质接近源码，不是对外发布的产品。npm 包、GitHub Pages 和产品 README 都不应链接到 `team/`。

对外发布的文档产品放在 `docs/`。

## 子目录

`team/automations/`、`team/development/`、`team/archive/` 已落地；`team/marketing/` 是约定位置，可能尚未创建。

- `team/automations/`：自动化流程与团队协作约定，按流程分目录。从 [automations/README.md](automations/README.md) 进入，具体流程、标签和重建步骤都在各自目录里说明，这里不逐条展开。
- `team/development/`：milestones、roadmap、对内需求和渲染测试计划；版本标注规则见 [development/versioning-conventions.md](development/versioning-conventions.md)，CI 检查的 required / optional 分类见 [development/ci-classification.md](development/ci-classification.md)。
- `team/archive/`：不再维护但仍有参考价值的内容。
- `team/marketing/`：营销草稿的约定位置，可能尚未创建。真正对外的文案再进入落地页或 `docs/`。

## 相关入口

仓库根目录的 `AGENTS.md` 是给编码 agent 的对内入口。协作和 PR 约定以 `team/automations/` 下各流程目录的文档为准，入口同样是 [automations/README.md](automations/README.md)。

`docs/` 是对外文档产品。
