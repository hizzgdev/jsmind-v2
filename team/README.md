# team/

`team/` 存放对内材料（文档、图片、稿件等）。它的性质接近源码，不是对外发布的产品。npm 包、GitHub Pages 和产品 README 都不应链接到 `team/`。

对外发布的文档产品放在 `docs/`。

## 子目录与负责人

下面是已约定的分工。当前已落地 `team/automations/`；`team/development/`、`team/archive/`、`team/marketing/` 是约定位置，可能在并行 PR 中落地。

- `team/development/`（milestones、roadmap、对内需求）和 `team/archive/`：由 Mira 负责。
- `team/automations/`（协作流程、团队约定）：下面有 hubie 和 weka 两套独立的开发流程，各用各的 GitHub 标签（`hubie` / `weka`），不要混用。hubie 见 [agent-team-collaboration.md](automations/hubie/agent-team-collaboration.md)；weka 见 [weka/README.md](automations/weka/README.md)。
- 以后的 `team/marketing/`：由 Moka 负责。

## 相关入口

仓库根目录的 `AGENTS.md` 是给编码 agent 的对内入口。协作和 PR 约定方面，hubie 流程以 [agent-team-collaboration.md](automations/hubie/agent-team-collaboration.md) 为准，weka 流程以 [weka/README.md](automations/weka/README.md) 为准。

`docs/` 是对外文档产品。
