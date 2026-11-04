jsMind V2
===

Development Environment
---

- IDE: VS Code
- Plugins:
    - [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
    - [Nodejs Test Runner](https://marketplace.visualstudio.com/items?itemName=connor4312.nodejs-testing)
- Scripts:
    - Setup pre push: `ln -s ../../scripts/git-hooks/pre-push .git/hooks`
- Node.js (for dev): v24.12.0



Repo Layout & Workflow
---

### Directories

```
jsmind-v2/
├── src/            # 源码
├── __tests__/      # 测试（node --test）
├── docs/           # 文档：architecture / features / development
├── scripts/        # 工具脚本（含 git-hooks）
├── example/        # 示例
└── tmp/            # 临时目录 —— 已 gitignore，不进版本控制
```

**`tmp/` 是刻意保留的落脚点**：AI agent 与本机实验的产物都放这里 —— 渲染测试截图、一次性探测脚本、临时试验页。随时可以 `rm -rf tmp/*` 清空，不会有残留污染仓库。

### Branch & PR

**所有改动走 PR，不直接推 master。**

分支命名 `<type>/<short-slug>`，type 取自 Conventional Commits：

| type | 用途 | 例 |
|---|---|---|
| `feat` | 新功能 | `feat/view-theme-system` |
| `fix` | 修复 | `fix/arranger-cousin-spacing` |
| `refactor` | 重构（行为不变） | `refactor/view-settle` |
| `test` | 测试 | `test/arranger-coverage` |
| `docs` | 文档 | `docs/v2-requirements` |
| `chore` | 杂务（依赖、配置） | `chore/tmp-gitignore` |

PR title 格式 `<type>(<scope>): <subject>`，**标题用英文，描述可用中文**：

```
docs: add v2 requirements and repo workflow conventions
feat(view): support theme and node-level styles
fix(arranger): correct cousin spacing calculation
```

**为什么标题用英文**：与 `docs/` 保持一致；便于将来的英文贡献者扫 PR 列表；`<type>(<scope>)` 前缀可被工具自动解析，用于生成 changelog 或过滤 PR。

**commit message 同样用英文**，规则与 PR title 一致（Conventional Commits）：

```
docs: add v2 requirements and refresh outdated status docs
chore: add repo layout and workflow conventions
feat(view): support theme and node-level styles
```

**PR 标题和 commit message 用同一条规则** —— 这样 PR 列表和 `git log` 读起来是同一个体系，不用在两套措辞之间来回切换。中文只出现在 PR 描述里（那是给人读的说明，不是索引）。

**scope 建议值**（对应 `src/` 下的目录）：`model` / `arranger` / `view` / `serialization` / `docs` / `tests` / `build`。

### Running

```bash
npm test                                 # 全部测试
npm run test-lite                        # 精简输出
npm run type-check                       # tsc --noEmit
npm run build                            # rollup 打包到 dist/

# 直接跑单个 TS 文件做验证（Node 22+ 类型剥离，无需编译）
node --experimental-strip-types path/to/probe.ts
```

TODO
---

- Serialization in node_tree and freemind format