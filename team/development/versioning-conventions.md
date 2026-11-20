# 版本标注约定

> **本文是「某个 API、子命令、格式字段从哪个版本起可用」的唯一约定。**
> 对外的简短版在两份需求文档开头：[v2-cli.md](../../docs/requirements/v2-cli.md)、[v2-data-format.md](../../docs/requirements/v2-data-format.md)。发版的机械步骤在 [npm-release.md](npm-release.md)，本文只管标注本身。

## 1. 规则

- **不标 = 2.0 起就有。** v2 第一次公开的 API、子命令、格式字段一律不标。
- **只有 2.1 及之后新增的才标。** 标注写在对应条目上：表格里是该行的版本列或行末，散文里紧跟名称。
- **格式固定为 `Since: 2.<minor>.0`。** `<minor>` 是引入它的 minor 版本号，例：`Since: 2.1.0`。
- **一律用半角 `Since:`。** `scripts/check-version-refs.mjs` 只认这个字面；写成 `**Since**:` 或全角 `Since：` 会被当成普通文本，里面的三段号照旧被拦。
- **patch 版本不标。** 补丁版只修 bug；patch 里真出现新功能，说明本该发 minor。
- **老功能不补标。** 不标已经表示「2.0 就有」，补一条 `Since: 2.0.0` 只是噪音。要回填由发版脚本按 git tag 批量生成，不手写。
- **写下就是事实。** 标注记的是它出现的那个版本，此后不再改 —— 发了 2.3.0，`Since: 2.1.0` 仍是 2.1.0。
- **`Since:` 是文档里唯一该写三段版本号的地方。** `docs/` 其余位置写 `2.x`，因为写死的版本号会和下一次发版对不上。`scripts/check-version-refs.mjs`（CI 的 `version-check` 步）守着这条边界：放行 `Since:` 标注，其他三段号一律 exit 1 并报 `file:line`。

## 2. 发版时的检查清单

发 minor 之前那个 PR（`npm run release:prepare -- minor` 之后）：

1. 列出本版本的新增项：`git log --oneline <上一个 tag>..master`。
2. 新增的 API / 子命令 / 格式字段逐个补 `Since: 2.<minor>.0`；只修 bug 的项不动，老功能不补。
3. 不改任何已有标注 —— 它们记的是过去，过去没变。
4. `npm run version-check` 必须 exit 0（CI 的 `Version references` 步跑的是同一条命令）。
5. 发 patch：第 1、2 条跳过，确认没有新增项。真发现了新增项，把版本号改成 minor。

## 3. 示例

命令写在哪：`docs/requirements/v2-cli.md` §5 按小节逐个写（`5.0 create`、`5.1 context`、`5.2 validate`、`5.3 export`、`5.4 convert`），没有一张总的子命令表。新增命令就在 §5 对应小节里标 —— 散文里紧跟名称，列成表格时放版本列。下表只是形状示意，不是 `v2-cli.md` 里现有的表：

| 命令 | 作用 | 版本 |
|---|---|---|
| `jsmind validate <file>` | 校验 | — |
| `jsmind export <file> <out.png>` | 渲染出图 | — |
| `jsmind convert <input> --from v1 --to v2` | 格式转换 | `Since: 2.1.0` |

> 表里的版本号是示意；真实标注按该功能实际出现的版本写。`convert` 目前只有设计（`5.4`，不在 S7 实现），正属于「后补的项」这一类。

散文里紧跟名称：

> `JmNodeStyle.fontSize` 控制节点文字大小。`Since: 2.2.0`

被 `version-check` 拦下的写法：

```
| add-edge | 加一条关系边，当前 2.1.0 |    ← 写死了当前版本，应写 2.x
未标注版本的命令从 2.0.0 起可用。          ← 三段号不在 Since: 里，应写 2.0
```

标注只服务「从哪个版本起有」这一个问题。谁需要知道当前版本，去读 `package.json`，或让文档在构建时读它。
