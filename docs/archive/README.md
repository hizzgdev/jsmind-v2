# 归档

**不再维护、但仍然有参考价值的内容。**

这个目录的存在，是因为一次文档整理（PR #28）把许多文档从「长篇论证」压成了「结论 + 用法」。压缩本身是对的 —— 想查 `moveNode()` 怎么用的人不该先读两千字设计推演。

但压缩会丢掉一样东西：**决策是怎么做出来的，以及当时否决过哪些方案。**

那份东西在改动代码时价值很高。没有它，半年后会有人重新提出一个当年已经论证过行不通的方案，然后花两周才重新得出同样的结论。

**所以这里的规则是：新文档放结论，归档放推演过程，两边互相链接。**

## 索引

### design-decisions/

各模块设计决策的完整推演。**改代码之前值得读。**

| 文件 | 留了什么 | 新版在哪 |
|---|---|---|
| [`node-move.md`](design-decisions/node-move.md) | 5 个关键决策（单方法 vs 多方法、options 对象 vs 多参数、智能事件发射、helper 提取、结果检测）各自的 Rationale 与被否决的替代方案；实现挑战与性能取舍 | [`features/node-move.md`](../features/node-move.md) |
| [`node-content.md`](design-decisions/node-content.md) | enum vs 字符串字面量、工厂方法 vs 直接构造、构造时严格校验、内容为必填、类型判断方法；从 v1 演进的取舍；加新内容类型的扩展指南 | [`features/node-content.md`](../features/node-content.md) |
| [`hybrid-edge-system.md`](design-decisions/hybrid-edge-system.md) | 「树关系用直接字段、额外关系用边」这个混合设计为什么成立；否决过的纯边模型和纯字段模型 | [`architecture/hybrid-edge-system.md`](../architecture/hybrid-edge-system.md) |
| [`serialization.md`](design-decisions/serialization.md) | 从 Manager 模式改成 Serializer 接口的完整理由与迁移过程 | [`features/serialization.md`](../features/serialization.md) |
| [`custom-node-renderer.md`](design-decisions/custom-node-renderer.md) | **完整的 `JmNodeRenderer` TS 接口定义**；为什么必须由调用方返回 Promise 和清理函数；**四个动手时会踩的坑**（渲染器调用点必须在临时挂载之后、React 需要 `flushSync`、尺寸缓存吞掉重画、节点删除必须 unmount）；`innerHTML` 的 XSS 面 | [`development/roadmap.md`](../development/roadmap.md) 第 7.4 节（只有一句结论） |
| [`roadmap-before-reorg.md`](design-decisions/roadmap-before-reorg.md) | 重组前的 roadmap 全文。**写后校验 + 逐字节回滚的完整代码块**（`writeJsonFile` / `restoreFile` / `dataError`）；「原计划 vs 实际落点」对照表，记录三处方案变更（三种引用形态合并、`mergeJmTheme` 深合并的原因、`resolveTheme` → `resolveJmStyle`）；每个 S 项的实现细节 | [`development/roadmap.md`](../development/roadmap.md) |

### articles/

早期的技术文章。**不是项目文档，是背景阅读。**

| 文件 | 内容 | 和项目的关系 |
|---|---|---|
| [`runtime-type-validation.md`](articles/runtime-type-validation.md) | TypeScript 编译成 JS 后，静态类型在纯 JS 调用方那边完全失效 —— 成因与几种解法 | v2 运行时校验体系（37 个错误码）的思路来源 |
| [`git-multiple-push-urls.md`](articles/git-multiple-push-urls.md) | 同一 remote 配多个 `pushurl` 时 `pre-push` hook 被多次调用怎么办 | 本仓库预推送钩子用的就是这套结论 |
| [`es-to-ts-migration.md`](articles/es-to-ts-migration.md) | v1 从原生 JS 迁到 TS 的实战：JSDoc 的局限、`tslib` 引入、构建产物形态 | v2 `tsconfig.json` 里几个关键选项的来龙去脉 |

### 单篇归档

| 文件 | 内容 | 为什么不在别处 |
|---|---|---|
| [`v1-api-checklist.md`](v1-api-checklist.md) | v1 全部 API 的逐项清单，178 项、14 个系统 | 清单的**结论**已过期（写着 theme 和曲线边没做，其实都做了），放在 `development/` 下会误导人。但那张 178 项的表没过期，做 v1 兼容层时要照着它核对 |
| [`tslib-explanation.md`](tslib-explanation.md) | `tslib` 是什么、为什么需要 | 通用的 TypeScript 知识，不是项目特有。但本仓库开了 `importHelpers`，产物依赖它 |

## 怎么用这个目录

**想查「这个 API 怎么用」** → 看新版文档，别在这里翻。

**想改某个模块，或者想知道「为什么不那样做」** → 来这里。

**想知道「v1 有没有某个功能」** → `v1-api-checklist.md`，但记住它的勾选框已经过期。

## 一句话原则

**归档不是删除。** 一份文档进了这里，说明它的结论被别处取代了，但它记录的过程还在。真要让某份彻底消失，那是另一回事，得单独说。