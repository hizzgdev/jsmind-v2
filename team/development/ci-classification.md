# CI 检查分类

> **本文定义哪些检查拦合并、哪些只是信息。** 规则集在 GitHub 上配置（Settings → Rules → `branch-master-protection`），本文是它的代码侧对照表：新增检查先在这里定它属于哪一档，改一个 required 检查的名字之前先读第 3 节。

## 1. 分类

| 类别 | 工作流 | job id | 检查名 | 说明 |
|---|---|---|---|---|
| required | CI | `checks` | `Format, types, tests, build` | 格式、版本引用、类型、单测、构建；刻意不含浏览器 |
| required | CI | `docs-site` | `Docs site` | `docs/` 或 `skills/` 变了才跑，否则 skipped |
| required | CI | `ui` | `UI tests` | 真实浏览器加载 `dist/` 跑断言 |
| required | CI | `changes` | `Change detection` | 分类器，只决定别的 job 跑不跑，见 3.3 |
| optional | CI | `optional-tests` | `Optional tests` | 失败是信息不是门，见 3.2 |
| optional | CI | `preview` | `Render preview` | 出图并贴评论，仅 PR |
| production | Forward Hubie events | `forward` | `Custom webhook` | 事件转发，不是检查 |
| — | Publish npm package | `publish-npm` | `Stage v2-preview` | 发版，不是检查 |
| — | Deploy static content to Pages | `build` / `deploy` | — | 站点发布，不是检查 |

`required` 四行是规则集里唯一的名单；`optional` 两行允许红，`production` 与 `—` 三行不参与合并门。两个 job 改过名：`What changed` → `Change detection`（CI）、`Filter and forward` → `Custom webhook`（Forward Hubie events）。原本 `Forward Hubie events` 里的 `Filter tests` job 已删除，它的测试成为 `Optional tests` 的第一步。

## 2. skip 在 required check 里不等于没运行

GitHub 对 required check 的判定：

| 情况 | 结果 |
|---|---|
| 工作流被工作流级 `paths:` / 分支过滤 / `[skip ci]` 跳过 | 检查停在 **Pending**，拦合并 |
| job 被 `if:` 条件跳过 | 报 **Success** |
| job 因为依赖的 job 失败而被跳过 | **可能不拦合并** |

第二行是 conditional 能在 `ci.yml` 里用的原因，第一行是工作流级 `paths:` 不能用的原因，第三行是 3.3 那个洞的来源。

## 3. 规则

### 3.1 `ci.yml` 不加工作流级 `paths:`

见 2 第一行。工作流整个被过滤掉时，它一个检查也不上报，而 required 名单里那四个名字还在等报告 —— 于是每个没匹配上 `paths:` 的 PR 都不可合并。条件写在 job 上（`if:`），那里跳过算成功。

### 3.2 `Optional tests` 保持 optional，且不加 `continue-on-error`

- 一个 job 只能整体 required 或整体 optional。以后要把桶里某个测试提成 required，先把它拆成单独的 job；直接把桶标 required 会把同桶里后来加进来的测试一起拖进合并门。
- `continue-on-error: true` 会把 job 的结论写成 success，检查永远绿，真需要它拦的时候没有东西可拦。它和 3.3 那个洞不是一回事：不需要别的 job 配合，`continue-on-error` 自己就能让一个 required 检查永远绿。

### 3.3 `Change detection` 必须是 required

`checks`、`docs-site`、`ui` 都 `needs: changes`。`changes` 失败时这三个被跳过、报 Success（见 2 第三行），于是三个 required 检查在什么都没跑的情况下全绿。把 `Change detection` 自己也设成 required，它红了就拦 —— 这个洞才关上。

这关不掉的残余：分类器跑通但分错（例如 diff range 算错，`library=false`），各套件照样跳过、全绿。缓解是分类器用原生 `git diff` 加 `set -euo pipefail`，失败会响；纯逻辑错误的残余风险，任何 gate 都盖不住。

## 4. 规则集

`branch-master-protection`（ruleset id 27518846）目前只有 `deletion` 与 `non_fast_forward` 两条规则，没有 `required_status_checks`。配 required 检查属于仓库管理员操作，PR 改不了。

开 required 之后，名单里放且只放这四个名字：

```
Format, types, tests, build
Docs site
UI tests
Change detection
```

在改名落地之后加。要求绑定的是名字字符串：改名不跟着改规则集，旧名字没有人上报，PR 卡在一个永远不会来的检查上；反过来先加名单再改名，中间那段时间所有 PR 都不可合并。

## 5. 怎么确认

```bash
# 一次 run 的 job 名与结论
gh api repos/hizzgdev/jsmind-v2/actions/runs/<id>/jobs \
  --jq '.jobs[] | "\(.name)\t\(.conclusion)"'

# 规则集里现在有几个 required 名字
gh api repos/hizzgdev/jsmind-v2/rulesets/27518846 \
  --jq '.rules[] | select(.type == "required_status_checks")'
```

只改 `docs/` 的 PR 上，`UI tests`、`Optional tests` 是 skipped，`Docs site` **会跑**：分类器对 `docs/` 下任何文件都置 `docs=true`，剩下的交给这个 job 自己判断这批文件动不动发布出来的站点 —— 不影响时（只动了 `docs/architecture/`、`docs/images/` 之类）它内部的步骤跳过，结论仍是 success，不是 skipped。只改 `docs/`、`skills/` 之外的 `*.md`（根目录 `README.md`、`team/` 下的文档、`scripts/README.md` 之类）的 PR 上，三个 job 全是 skipped。两种都可合并。

合并门的验证只能由管理员做：让一个 required 检查红，确认拦合并；让 `Optional tests` 红，确认不拦。
