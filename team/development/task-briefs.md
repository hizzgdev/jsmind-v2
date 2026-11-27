# 任务 brief 的写法

> 本文是**写作侧**的规则：一份 brief 要写成什么样，才能让执行的人照着做、让评审的人照着查。**评审侧**的标准在 [jsmind-review/SKILL.md](../automations/skills/jsmind-review/SKILL.md) 的 "Claims to verify, not read" 一节——那边要求评审者问「哪个输入会让这条断言变红」，本文要求写 brief 的人在交付之前就回答这个问题。两份文档各写各的，不互相复制：抄一遍的条目会在下一次改动时走散。
>
> 读者是开 issue 的人，或者替人给 agent 写 brief 的人。
>
> 下面每条都挂一个这个仓库真实发生过的反例，出处可核（`gh issue view <n>`、`gh pr view <n> --comments`、`git show <sha>`）。讲不出失败长什么样的规则没有收进来；出处对不上的反例也不写。

## 1. 每条验收标准都要写出让它变红的方式

**要求**：一条标准如果只能靠「补上」「改成」「保持」说完，它不是验收标准。要么给命令与期望输出，要么给反证：「把 X 改回去，这条必须重新红」。反证通常更值钱——一条不会红的标准，和没写差不多。

**反例**：2.1.0 发版（PR #161）第 1 轮。交付的正文是一句「`Since: 2.1.0` now sits on everything this release adds」。评审只能拿 `grep` 加逐页实查把调查重做一遍，结果找到三处没标：`mind` 子命令表里的 `set-style` 行、`JSMIND_BROWSER_START_MS` 的四个位置、`context` 的文档级 `style` 摘要（`docs/{en,zh}/guide/cli.md`、`docs/requirements/v2-cli.md` §5.1）。「该标而没标」在这个仓库没有任何自动检查：`scripts/check-version-refs.mjs` 只拦 `Since:` 之外的三段版本号，缺标它不管。同一件事在 2.2.0 的 brief（issue #189）里改成了可核对的形式——先给基线 `v2-cli.md` 3、`zh/guide/cli.md` 2、`en/guide/cli.md` 2，要求补完读到 4 / 3 / 3，再加一句「把三处标记里的任意一处删掉，上面那条 `grep -c` 的数字必须对不上」。PR #190 的正文里直接贴了基线与补完后的计数，评审不必重查。

## 2. 检查类任务的交付是逐项状态，不是一句总结

**要求**：brief 里说「N 项」，交付就得是 N 行，每行一项加该一项的证据（命令输出、`文件:行`、页面锚点）。「都改了」和「漏了三项」在文本上长得一模一样，验收方只能选择相信或者选择重来，而重来的成本通常等于从头做。

**反例**：还是 PR #161 的同一份交付。「sits on everything」与实况差三项，评审的原话是「body 里『`Since: 2.1.0` now sits on everything this release adds』与上面 1–3 冲突。标完以后同步这句，或者把它改成逐项清单」。第 2 轮改成 6 行 `Item | Where` 表之后，6 行与 diff 一行不缺，逐条复核才有可能。补进正文的注释把这个形状说清楚了：「The table is the list, one row per item, so "everything" is checkable instead of asserted」。

## 3. 涉及「现在是什么行为」的断言，写的人先跑一遍

**要求**：命令和输出一起贴进 brief。跑不了的（要凭据、要生产环境、要等很久）就明写「未验证」，让执行的人自己确认——「未验证」是一句可以说出口的话，从代码推出来的结论不是。

**反例**：issue #189 的正文断言「照旧敲 `--focus` 会静默退回全量树」，是照代码推的，没跑。PR #190 在 head 的 `dist/` 上实测 `jsmind context m.json --focus "Earth"`：stderr 是 `unknown option for "context": --focus (--strict makes this an error)` 加 `Unexpected arguments: Earth`，exit 2，不是「静默退回」；只有裸 `--focus`（不带值）才走那行警告加全量树、exit 0。同一个形状还出现过一次自述：issue #215 开头记着自己上一轮的检索错误——结论「`tutorials/` 整个目录没有引用」错在模式上（用的是 `grep "jsmind export"`，而教程写的是 `npx jsmind@2 export …`，中间隔着 `@2`），换成 `grep -rnE "jsmind(@2)? +export( |$)"` 之后全仓 39 处。

## 4. 交付物是文字时，给逐字替换文本

**要求**：旧句、新句、一句理由，三样都要。只说「把这段改得更清楚」，评审能判断的就只剩口味，而口味没有终局：每一轮都要重新猜口径，改出来的措辞还可能和同一份改动里别处的文字对不上。

**反例**：PR #173 的正文在两个连续回合里改的是同一批句子。第 2 轮的要求是「第三点按 guide 的措辞改写并带上两个反例」，没有旧句新句；改写后的「由同一个函数生成（不是"长得像"）」在第 3 轮被发现与同一份 PR 的 guide 已经改成的「同一形状，不一定是同一条记录」互相矛盾——一份 PR 里两套说法，还得再改一次，而那一轮要改的文件一行没动。同一形状在非文字的交付上也出现过：PR #207 的目标写成「换成 docs 和 tutorials 的样式」，交付后 owner 的评论是「现在看你把 docs 和 tutorails 改得也不太好了」，随后逐项重列三个面的标题与右侧功能区。

## 5. 边界要写「不许做什么」

**要求**：落到发布现场、外部系统、生产数据、git 提交范围时，「要做什么」永远不完整。写清不许碰什么，并给一条能核对的命令（`git status --short` 的文件清单、`git diff --stat` 的范围），别指望执行的人自己推断哪些文件是禁区。

**反例**：一次 `git add -A` 把 vim 的 `.config.json.swp` 一起提交了——那是 weka webhook 配置的 swap 文件，带着 HMAC secret。brief 写了要做什么，没写不许碰什么。仓库里留下的防线是 `.gitignore` 的 `*.swp` / `*.swo` / `*.swn` 与那行注释「never commit these — they can carry file contents」（`git log -S'never commit these' -- .gitignore` → `e186963`）。写对了的形状见 issue #215 的「不要动的」：`releases/2.1.0.md`、`team/archive/**`、`tmp/**`、教程里的行为描述数字、配图与 assets，逐项点名。

## 6. 版本判断按「是否发布过」，不按「是不是 breaking」

**要求**：2.x 还在 preview 线，没有兼容承诺，所以「算不算 breaking」不决定版本号——删掉一个已经发布过的选项走 minor，不升 major。真正要回答的是「用户见过没有」，依据是能证明发过没发过的命令（`git show v<last>:src/cli/options.ts`、`git tag --list`），不是印象。只在 unreleased window 里生灭、用户从没见过的改动，才可以不算 breaking。标注格式与发版步骤分别在 [versioning-conventions.md](versioning-conventions.md)、[npm-release.md](npm-release.md)，这里不重复。

**反例**：issue #189 由「2.x 在 preview 线、没有兼容承诺」推出「既不升 major，也不写 `### Breaking` 一节」，于是 `--focus` 被删掉这件事差点只留在 feature 列表里。owner 在 `releases/2.2.0.md:14` 的行内评论要求加回来：「这里也可以加上 breaking，在这里提一下 --focus 被删掉了」（PR #190）。换成「发过没发过」来判断就一致了：issue #189 自己已经用 `git show v2.1.0:src/cli/options.ts` 证明 `--focus` 在 v2.1.0 就发布过，用户会撞上，所以它必须写进 Breaking；版本号仍是 2.2.0 minor。

## 反例出处

| 规则 | 反例 | 出处 |
| --- | --- | --- |
| 1 | 「已标好」无法核对，实查漏三处；缺标没有自动检查 | PR #161 评论第 1 轮「必须改」1–4、`scripts/check-version-refs.mjs`；对照 issue #189 验收与 PR #190 正文 |
| 2 | 一句总结代替逐项清单，第 2 轮才改成表 | PR #161 评论第 1 轮第 4 条、第 2 轮复核 |
| 3 | `--focus` 静默回落的断言，实测 exit 2；另一次是错误 grep 模式 | issue #189 正文、PR #190 正文与评论；issue #215 开头 |
| 4 | 同一批句子改了两个回合；界面目标只给了参照物 | PR #173 评论第 2、3 轮；PR #207 的 changes-requested 评论 |
| 5 | `.swp` 带 secret 随 `git add -A` 进提交 | `.gitignore` 的 `*.swp` 行（`e186963`）；写对了的形状见 issue #215「不要动的」 |
| 6 | preview 线推出「不写 Breaking」，owner 加回 | issue #189 正文、PR #190 在 `releases/2.2.0.md:14` 的行内评论 |
