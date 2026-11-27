# 本地验证与推送：实际在发生什么

> **分工。** [`ci-classification.md`](ci-classification.md) 管 CI 里哪些检查拦合并、哪些只是信息；[`commit-types.md`](commit-types.md) 管提交类型与 PR 标题；本文管**本地**：推送前该跑什么、钩子怎么判定、推送和开 PR 时哪几种失败是假象。本文链接到那两份，不互相复述；反过来的入链（含 `AGENTS.md` 里的入口行）要等后续改动补——那两份与 `AGENTS.md` 都不在本文的改动范围里。
>
> **事实会漂。** 钩子跑几步、缓存文件长什么样、哪些 diff 会触发 CI job，这些都会变。本文里与脚本、配置有关的判定（第 1、2、4、5、6、11 节）都能用文末「怎么核对」里的命令重跑；其余各节靠推理或工具层行为得出，重跑不了——按各节标的「依据」核对。重跑对不上，以命令为准，然后改本文——一份过期的文档比没有更危险，它会让人为了躲一个已经不存在的问题做出错误操作。

## 0. 一句话

推送前本地只有两道闸：`format-check` 和 `type-check`。测试和构建是你自己的步骤，钩子不跑。

## 1. 推送前的闸门跑什么

**现象**：`git push` 先安静十几秒，然后要么放行，要么红。

**机制**：`scripts/git-hooks/pre-push`。它按顺序跑两条：

1. `npm run format-check`（`scripts/git-hooks/pre-push:117`）
2. `npm run type-check`（`scripts/git-hooks/pre-push:128`）

任一步非零就写日志、退出 1，push 不发生。**没有** `npm test`，**没有** `npm run build`，**也没有** `version-check`。

`format-check` 自己又是两层：`check-eof-newline.mjs`（尾换行）+ eslint（格式与规则）。

**耗时**（本仓库实测，同一台机器上重复测也会波动）：整条大致 20–40 秒，其中 format-check 14–30 秒、type-check 7–11 秒——波动主要来自 eslint 的冷热缓存与机器负载。缓存命中时几乎立刻返回（见第 2 节）。

为什么只这两条：它们秒级、确定性、不需要浏览器也不需要构建。测试要先 build 且是分钟级，放进每次 push 的代价大于收益——它在 CI 里是 required，在那里跑一遍就够。

**钩子怎么装上**：两种，先查你现在用的是哪种——

```sh
git config --get core.hooksPath                                # 输出 scripts/git-hooks 时，git 直接执行该目录下的钩子
ls -l "$(git rev-parse --git-path hooks/pre-push)"             # 另一种：符号链接到 scripts/git-hooks/pre-push（AGENTS.md 里那条命令）
```

`core.hooksPath` 指向 `scripts/git-hooks` 时，改脚本立刻生效，不需要再建链接；两个都配了的话 `core.hooksPath` 优先。

第二条命令要用 `git rev-parse --git-path` 而不是直接拼 `.git/hooks/...`：在 worktree 里 `.git` 是个文件（指向主仓库的 `worktrees/<name>`），`ls .git/hooks/pre-push` 会报 `Not a directory`，看起来像钩子没装；`git rev-parse --git-path` 会把它解析成真实路径（配了 `core.hooksPath` 时就解析成那份脚本）。

**怎么办**：别为了省这几十秒加 `--no-verify`。它是唯一一道本地闸门，拆掉之后你要等几分钟才知道 CI 说了什么，而 CI 的红是六条检查器一起说话，定位比本地一条命令贵得多。

## 2. 钩子按 SHA 缓存判定

**现象**：同一个 commit 第二次推送几乎立刻有结论；或者一次被打断的推送之后，这个 commit 每次推送都在一秒内失败，看起来像「我的改动弄坏了构建」。

**机制**：状态文件 `logs/pre-push/check-status-<local_sha>`（`scripts/git-hooks/pre-push:71`，`logs/` 已在 `.gitignore` 里）。判定只有三条：

| 文件状态 | 钩子行为 | 依据 |
|---|---|---|
| 含 `PRE_PUSH_SUCCESS` 行 | 直接 exit 0，不跑检查 | `pre-push:79-82` |
| 存在但没有这一行 | 直接 exit 1，**不跑任何检查** | `pre-push:83-88` |
| 不存在 | 跑完检查，写结束段并追加 `PRE_PUSH_SUCCESS` | `pre-push:102-112`、`:137` |

所以「一秒内失败」从来不是检查结果，是缓存在说话。

**区分打断与真失败**：看日志末尾有没有 `record_end_time` 写的那一段——`---`、`[pre-push] End time:`、`[pre-push] Total elapsed time:`。有这一段 = 检查真的跑完并给出了结论：末尾还有 `PRE_PUSH_SUCCESS` 是全部通过，没有它就是失败，往上翻找红的那一步。只有开头几行、没有结束段 = 上次运行在检查中途被打断（超时、Ctrl-C、进程被杀），文件是半截的，内容不代表任何结论。

**怎么办**：

- 被打断：`rm logs/pre-push/check-status-<sha>`，再推，钩子会重跑全部检查。
- 真失败：先读日志里红的那一步，修完再推。修完如果 commit 变了，sha 就变了、缓存自然失效；如果没变（比如只改了工作树又改回来），仍要删掉那个文件，否则一直判失败。

**手动驱动一次钩子**（不 push，也不重复付已经付过的钱）：钩子从 stdin 读 `<local_ref> <local_sha> <remote_ref> <remote_sha>`，多行时只取第一行。取到之后 `local_sha` 是缓存键，`local_ref` 只在删分支判定里被看（`pre-push:65-68`：`local_ref` 为 `(delete)` 或 sha 全零就直接放行），两个 remote 字段不再参与任何判定。所以可以这样喂：

```sh
printf 'refs/heads/%s %s refs/heads/%s 0000000000000000000000000000000000000000\n' \
  "$(git branch --show-current)" "$(git rev-parse HEAD)" "$(git branch --show-current)" \
  | sh scripts/git-hooks/pre-push origin origin
```

缓存已命中时它会打印 `✅ Pre-push checks already passed for commit <sha>` 并 exit 0——这条命令正好用来回答「我这个 commit 到底过没过闸」，比看 `logs/` 目录猜可靠。

## 3. 不要把闸门接进管道再判退出码

**现象**：`npm run type-check | tail -3 && git commit` 提交上去了，类型其实是红的。

**机制**：`|` 之后 `$?` 是最后一条命令的退出码，也就是 `tail` 的；`tail` 只要读到输入就算成功。`&&` 判的是它。同理，`npm run x | tail` 之后你在同一个 `&&` 链里读到的一切都是 `tail` 的结论。

**怎么办**：重定向到文件，读命令自己的状态：

```sh
if npm run type-check > /tmp/type-check.log 2>&1; then
    echo "type-check ok"
else
    status=$?
    echo "type-check failed (exit $status):"
    tail -20 /tmp/type-check.log
    exit 1
fi
```

要留最后几行又不想丢状态，另一个办法是 `set -o pipefail`（bash）——但它只管当前 shell，包一层 `sh -c` 就没了。重定向没有这个问题。

实测：`git push origin nosuchbranch | tail -3` 退出 0；同样的命令重定向到文件后退出 1，错误在文件里。

## 4. 新文件的尾换行

**现象**：新写一个 `.md` / `.py` / `.sh`，`npm run format-check` 绿；`git add` 之后同一个命令红，提示 `1 tracked text file(s) do not end with a newline`。

**机制**：`format-check` = `node scripts/check-eof-newline.mjs && eslint --config .config/eslint.config.js`，两层看的文件集不一样：

- 尾换行这一层读 `git ls-files`（`scripts/check-eof-newline.mjs:60-68`），只看得见**已跟踪**的文件。未跟踪的新文件对它不存在。
- eslint 这一层不带路径参数，扫的是**工作树**里匹配 `files` 的文件（`.config/eslint.config.js:20`），**未跟踪文件照样检查**。

这就是那个不对称：同一个未跟踪的新文件，eslint 会报它，尾换行不会。而 `.md` 不在 eslint 的 `files` 里，所以纯 markdown 新文件在 `git add` 之前两道都看不见——绿得毫无信息量。

**怎么办**：新文件落盘时就写结尾换行。要把检查提前到 `git add` 之前，用 intent-to-add 让它进 `git ls-files`：

```sh
git add -N team/development/new-page.md   # 只登记路径，不暂存内容
npm run format-check                      # 现在这一层看得见它了
```

**顺序**：写好 → `git add`（或 `git add -N`）→ `npm run format-check` → 提交。`npm run format` 能补换行，但它同样只遍历已跟踪文件，对未跟踪的新文件无能为力。

## 5. `npm run build` 不是类型闸门

**现象**：`src/` 里有一个类型错误，本地 `npm run build` exit 0、`dist/` 照出，看着什么都没坏；于是「用 build 代替测试」的提案反复出现。CI 上拦下它的是独立的一步 `Type check`（`.github/workflows/ci.yml:276-278`，`library` 相关文件变动时必跑），不是 `build` 的结论——所以「build 绿了」这件事在本地和 CI 都不构成类型断言。

**机制**：`.config/rollup.config.js` 用 `@rollup/plugin-typescript`，没开 `noEmitOnError`，插件把 TypeScript 诊断降级成 rollup warning（输出形如 `(!) [plugin typescript] TS2322: ...`）后继续产出。诊断被打印了，但构建成功。真正的类型闸是 `npm run type-check`（`tsc --noEmit -p tsconfig.json`）。

实测：往 `src/` 里塞一个 `const x: number = "s"`，

- `npm run type-check` → exit 2，`error TS2322: Type 'string' is not assignable to type 'number'.`
- `npm run build` → exit 0，同一条 TS2322 以 `(!)` 前缀出现，五个 bundle 全部照常产出。

build 本身一分钟上下（两次实测 40 秒与 65 秒），是 type-check 的好几倍，这也是它不适合塞进钩子的第二个原因。

**怎么办**：不要用 build 代替 type-check 或代替测试。它证明的是「能打包」，不是「类型对」也不是「行为对」。

**通用判据**：**不信某个闸门，就先让它失败一次。** 造一个它本该拦住的错，看它是否真的拦住。只看它绿说明不了任何事——`continue-on-error`、`if:` 跳过、被管道吃掉的退出码、被降级的诊断，全都表现为绿。

## 6. 测试怎么调

**现象**：按目录跑子集，得到 `Error: Cannot find module '.../__tests__/cli'`。

**机制**：`package.json` 里 `test` 是 `node --test "__tests__/!(ui)/**/*.test.ts"`。`node --test` 的参数是**文件路径**（或 glob），不是目录——给它一个目录名，它会把这个字符串当成一个文件去 require。

**怎么办**：

```sh
# 全量（不含 UI 套件，因为 glob 排除了 ui/）
npm test

# 一个目录的子集：必须带 glob
node --test "__tests__/cli/**/*.test.ts"
```

glob 要加引号，否则 shell 先展开它。

实测：第二条在 `__tests__/cli` 上跑出 `# tests 216 / # pass 216 / # fail 0`，exit 0；`node --test "__tests__/cli"` 得到 `# tests 1 / # fail 1`，报 `Cannot find module .../__tests__/cli`，exit 1。

**build 在 test 之前**：`__tests__/build/` 与 `__tests__/ui/` 读的是 `dist/cli.js`——`package-contents.test.ts` 校验包内容（它自己会先 `npm run build`），`__tests__/ui/agent-workflow.test.ts` 直接驱动打包后的 CLI。`npm test` 排除了 `ui/`，所以全量测试不依赖你先手动 build；但 `npm run test:ui` 依赖 `dist/` 里已有的那份，改完 `src/` 之后必须先 `npm run build`，否则它验的是上一版产物——绿得没有意义。

## 7. `AGENTS.md` 的批准流程

**现象**：写 `AGENTS.md` 时卡住，最后报 `BLOCKED: write to protected agent-instruction file(s)`；无人值守的运行里没人点批准，超时即拒绝。

**机制**：`AGENTS.md`、`CLAUDE.md`、`SOUL.md`、`.cursorrules` 这四个文件名（任何目录、大小写不敏感）被工具层保护：写入要人工批准，没人批就超时，超时算拒绝。

**怎么办**：

- 约定正文写进 `team/development/<topic>.md`，`AGENTS.md` 只加一行链接指向它。`AGENTS.md` 是入口，不是仓库；把正文塞进去还会让每次修改都变成一次需要人批准的操作。
- 被拒之后不要换路径绕：`sed`、临时脚本、`execute_code` 都算绕，而且都过不去（保护在工具层，不在某一个工具的命令行上）。
- 确实需要改时，把要粘贴的整行写进 PR 描述，交给人补。不要把「卡在审批」当成 `kanban_block` 的理由把整条流程停住——剩下的工作照常交接，人补完再合并。

## 8. 推送和开 PR

**分支命名**：`<type>/<short-slug>`，type 取自 [`commit-types.md`](commit-types.md)（`feat` / `fix` / `docs` / `team` …）。自动化流程给的分支名（形如 `jsmind-v2/t_<task>-<n>-<slug>`）照用，不要为了改成规范名重开分支——分支名不是交付物，重开会丢掉 PR 与看板的对应关系。

**语言**：commit message 与 PR 标题用英文 Conventional Commits（`<type>(<scope>): <subject>`），PR 描述可以中文。理由是索引与叙述分开：`git log` 和 PR 列表是可扫的索引，描述是给人读的说明。

**类型怎么选**：类型说的是对**发布出去的东西**做了什么，不是「作者挑了个前缀」。

- `feat` / `fix` / `refactor` 必须改了 `src/`（只有 `src/` 会编译进 `dist/`）。
- `docs` 只指用户读的 API / CLI 文档（`docs/{zh,en}/guide`、`docs/{zh,en}/reference`）。需求、设计笔记、约定、团队流程都不是 `docs`。
- `team/**` 与 `AGENTS.md` 归 `team(<scope>)`：团队流程、agent 指令、规格、约定；混合或无法归类的改动也落 `team`，别默认借 `feat`。
- `skills/**` 是 `skill`，不是 `team`——它是对外发布的 agent skill，和团队流程是两回事。
- `scope` 可选，写改动落在哪个子系统即可（`development`、`cli`、`weka` …）。

**提交前确认分支**：

```sh
git branch --show-current     # 空 = detached HEAD；master = 危险
```

在 `master` 上提交，提交就落在 `master` 上；接着 `git push origin <branch>` 推的是那条本地分支，它没动，于是 git 打印 `Everything up-to-date` 并 **exit 0**。看起来成功，实际什么都没推。

实测（沙箱仓库）：master 上多一个提交，分支 `feature` 与 `origin/feature` 都在旧 sha 上——

```
## master...origin/master [ahead 1]
$ git push origin feature
Everything up-to-date
EXIT=0
local feature=934c9f7  remote feature=934c9f7  local HEAD=1da5dde
```

HEAD 那个提交从未离开本机。

## 9. 推送看起来成功但没成功

**现象**：命令退出 0、输出里还有 `Everything up-to-date`；或者后台任务弹了个「完成」通知，你以为远端更新了。

**机制**：

- `| tail`（以及任何管道）吃掉退出码，见第 3 节。
- 后台推送的完成通知是**进程回执**，不是「远端引用已更新」这个事件。进程可以正常退出而什么都没推（分支没动、被 pre-push 早退、推错了 refspec 名）。

**怎么办**：不信回执，信远端：

```sh
git ls-remote origin "refs/heads/<branch>"
git rev-parse HEAD
```

两个 sha 相等才算推到了。不相等时**不要重推**——先看第 8、10 节（分支对不上 / 提交在 master 上），重推只会再得到一次假的成功。要在推送时就把状态留住：

```sh
if git push origin <branch> > /tmp/push.log 2>&1; then
    echo "pushed: $(git rev-parse --short HEAD)"
else
    echo "push failed:"; tail -20 /tmp/push.log; exit 1
fi
```

## 10. owner 在你编辑中途合并了 PR

**现象**：`git push origin <branch>` 报 `error: src refspec <branch> does not match any`；`git status -sb` 显示 `master [ahead 1]`。你的提交还在，但不在任何一条会被推出去的分支上。

**机制**：PR 合并后远端分支被删，本地的同名分支指针也没了（或被清理进 worktree 的回收里）；你后续的提交就挂在当时检出的 `master` 上。`git push` 先解析 refspec——本地没有这个名字，它连网络都没走就退 1。`[ahead 1]` 说的就是「这个提交只在本地 master 上」。

**怎么办**：先把提交挪到一条分支上，再把 master 拨回远端：

```sh
git branch --show-current          # 确认在 master
git log --oneline -3               # 确认 HEAD 是你要交的那个提交
git switch -c <branch>             # 提交跟着走到新分支，工作树不变
git update-ref refs/heads/master origin/master   # master 回到远端位置
git status -sb                     # ## <branch>  （不再 [ahead 1]）
```

`git update-ref` 和 `git branch -f master origin/master` 等价；用后者必须在**已经离开 master** 之后执行，git 拒绝 force-update 当前检出的分支。`git reset --hard` 也能达到同样效果，但它是不可逆的，还要先把分支建好，没必要。

如果本地分支还在、只是没拿到那个提交（`git status -sb` 是 `master [ahead 1]` 而 `<branch>` 停在旧 sha）：`git switch <branch>` → `git cherry-pick <sha>` → 同样把 master 拨回。

实测（沙箱）：上面四步之后 `## feature...origin/feature [ahead 1]`，push 成功，`git ls-remote origin refs/heads/feature` 与 `git rev-parse feature` 同一个 sha。

然后开**新的** PR：旧 PR 已合并关闭，head 分支被删过之后 `gh pr reopen` 也回不来。

## 11. 推送之后看什么

**现象**：PR 页面一排绿勾，但没人知道能不能合；或者一条检查红着，也不确定是不是自己的改动弄的。

**机制**：

```sh
gh pr view <n> --json mergeable,mergeStateStatus
```

`mergeStateStatus: CLEAN` 是放行信号：与 base 无冲突，且 required 检查全部通过。引用它，不要去数绿勾——被 `if:` 跳过的 job 不显示成勾，没上报的 required 检查也不会显示，页面上的「绿」和规则集的判定不是一回事。

`CLEAN` **不等于可以合并**：draft 的 PR 也报 `MERGEABLE` / `CLEAN`（实测一个 draft PR 就是这个组合）。合并还受 draft 状态与规则集约束。

required 名单本身现查，别背：规则在哪个 ruleset 里、哪几条是 required，机制见 [`repo-conventions.md`](repo-conventions.md) 的「合并门」一节，可重跑的命令在本文第 13 节。查的时候注意 **ruleset 不止一个，只有带 `required_status_checks` 的那个说明问题**——去查不带它的那个（比如只管禁删除和 force push 的那个），输出是空的，看上去像「没有门」，实际是查错了对象。`/branches/master/protection` 那个接口更糟：它因权限返回 404，同样长得像「没有保护」。

一条红的检查是对**这条分支**的断言，诊断前先问：**这个 job 的输入被这次 diff 碰到了吗？** 分类在 `ci.yml` 的 `changes` job，`render` 只由这些路径触发：

- `src/*`、`example/*`、`package.json`、`package-lock.json`、`tsconfig.json`
- `.github/actions/render-map/*`、`.github/workflows/ci.yml`
- `scripts/render-preview.ts`、`scripts/prepare-preview.ts`

其余文件不会让 `Render preview` 跑。所以 `docs/` 下的 diff 不会触发它；`example/playground.html` **会**（它在 `example/*` 里）。判断一条红是不是你的改动碰的，看这张分类，而不是看 job 名字像不像。

**怎么办**：红了先做这一步判断。该 job 的输入没被碰到 → 是跑在共享环境上的噪声（浏览器启动、外部服务），不是 diff 的结论，记录证据而不是改代码；碰到了 → 才是你的问题。

## 12. 「说留下了 review 意见」但查不到

**现象**：对方说在 PR 上写了 review 意见，你查两个接口都是空的：

```sh
gh api repos/<owner>/<repo>/pulls/<n>/reviews
gh api repos/<owner>/<repo>/pulls/<n>/comments
```

**机制**：GitHub 的 review 先以 draft（pending）状态存在，只有作者本人（以及他在同一浏览器会话里）看得见；**提交之后**才出现在上面两个接口里。两个接口都空、而对方确定写过 = 那条 review 还在草稿状态，不是「对方没说过」。

**怎么办**：请作者把那条 review 提交（页面右上角 `Finish your review`），或让他把意见改贴成普通评论。在那之前不要把它当成「没有意见」继续交付——返工轮里最容易漏掉的就是这种还没提交的意见。

## 13. 怎么核对本文有没有过期

```sh
# 钩子到底跑哪几步（第 1 节）
grep -E "npm run (format-check|type-check|test|build)" scripts/git-hooks/pre-push

# 测试 glob（第 6 节）
node -e "console.log(require('./package.json').scripts.test)"

# required 检查的名字与 job 的 name:（第 11 节，名单现查，本文不复制）
# 必须遍历：ruleset 不止一个，只有带 required_status_checks 的那个有东西可查；
# 单独查某一个 id 可能拿到空输出，那不代表没有门
for id in $(gh api repos/hizzgdev/jsmind-v2/rulesets --jq '.[].id'); do
  gh api "repos/hizzgdev/jsmind-v2/rulesets/$id" \
    --jq '.rules[] | select(.type == "required_status_checks") | .parameters.required_status_checks[].context'
done
grep -nE "^    name:" .github/workflows/ci.yml

# 缓存的两种状态（第 2 节）
grep -n "PRE_PUSH_SUCCESS\|check-status" scripts/git-hooks/pre-push

# 尾换行为什么看不见未跟踪文件（第 4 节）
grep -n "git ls-files\|trackedFiles" scripts/check-eof-newline.mjs

# build 为什么放过类型错误（第 5 节）：插件有没有开 noEmitOnError
grep -n "typescript(" .config/rollup.config.js

# render 由哪些路径触发（第 11 节）
grep -nE "src/\*|render-map/|scripts/(render|prepare)-preview\.ts" .github/workflows/ci.yml
```

第 1 节的 `grep` 应该只列出 `format-check` 与 `type-check` 两行。多出 `test` 或 `build`，说明钩子变了，改第 1 节并把第 5、6 节的推论重读一遍。

规则集那个循环应该输出几条 context，**每一条都能在上面的 `name:` 列表里找到**；一条都没有，要么规则被删了，要么 `gh` 没登录/没权限，两种都不等于「没有门」。

本文出现的耗时数字都是本仓库实测（format-check、type-check、build 各测过两次，整条钩子测过一次；同一台机器上前后差可达两倍），只给「这值得等吗」一个量级。数字随机器、负载、缓存状态变化，判据不随它变。
