---
title: 用 jsMind Skill 做你的第一张思维导图
id: 161
date: "2026-11-26"
tags:
  - 技巧
---

# 用 jsMind Skill 做你的第一张思维导图

> 适用版本：2.x（当前为 preview，内容可能随版本变化）

这篇文章会带你请 AI agent 安装 jsMind Skill，用它做一张「周六出游」计划的思维导图，并导出成 PNG。下面的 prompt 可以直接复制使用。

<script setup>
import exampleMap from '../../assets/161-example.jm?url';
</script>


![完成后的周六出游思维导图](../../assets/161-result.png)

## 你将做成什么

一张不大的导图：一个根节点、三个一级分支，每个分支下面再放几个子节点。

- **周六出游**（根节点）
  - **上午**（左侧）：早市、河边咖啡
  - **下午**（右侧）：公园散步、书店
  - **随身带**（左侧）：水瓶、薄外套、购物袋，改过一次之后再加上「野餐垫」

然后再给整张导图换上蓝色（`primary`），成品就不再是默认的白色了。

做好的导图可以在这里下载：<a :href="exampleMap" download="saturday-outing.jm">161-example.jm</a>。

## 你需要准备什么

- Node.js 22.12.0 或更高版本
- 一个能安装 skill 的 AI agent
- jsMind 2.x
- 同一台机器上有基于 Chromium 的浏览器（CLI 导出 PNG 时要用它来渲染）

请明确安装 2.x 版本：

```bash
npm i jsmind@2
```

然后用 `npx jsmind@2` 来运行 CLI。Skill 里写的命令是 `jsmind ...`。如果 `jsmind` 已经在 PATH 里，那种写法也可以。除非你确定当前解析到的就是 2.x，否则请优先用 `npx jsmind@2`：不带版本的 `npx jsmind` 不一定会跑到 2.x。

## 安装 skill

把下面这段 prompt 交给你的 agent：

```
请从 https://hizzgdev.github.io/jsmind-v2/skills/jsmind/INSTALL.md 安装 jsMind skill：读这份文件并照做。
```

安装说明会把 skill 放到你的 agent 会加载的位置，并确认 2.x CLI 可用。你不必自己指定路径。

其他安装方式见文档里的 [Skill](https://hizzgdev.github.io/jsmind-v2/docs/zh/guide/skill) 页面。

## 请 agent 生成这张导图

skill 装好之后，把下面这段 prompt 贴给它：

```
请使用 jsMind skill，围绕「周六出游」生成一张思维导图，并导出为 PNG。

- 如果本会话已经加载过 jsMind skill，不要重复加载，直接用。
- 输出到当前工作目录，文件名用 saturday-outing.jm 和 saturday-outing.png。不要用系统临时目录，也不要先问要不要移动。
- 如果同名文件已存在，换个名字，不要覆盖。
- 内容：根节点是「周六出游」。它下面有三个一级分支：「上午」放在左侧，「下午」放在右侧，「随身带」放在左侧。
  - 「上午」下面：早市、河边咖啡
  - 「下午」下面：公园散步、书店
  - 「随身带」下面：水瓶、薄外套、购物袋
- 完成的标准：两个文件都在；PNG 里层级分得清、左右不一边倒；完成后给出两个文件的绝对路径。
```

agent 应当通过 jsMind CLI 来创建和修改文件，不要亲手去写这份导图。

## agent 实际会做什么

下面是生成本页这张中文导图时的真实会话。你这边的节点 id 会不一样。每次写入之后，请用刚刚那条命令返回的 id，或者再运行一次 `context`，不要把下面这些 id 抄进自己的命令里。

Skill 里写的是 `jsmind`。下面的会话用 `npx jsmind@2`，这是 CLI 还不在 PATH 里时更稳妥的写法。

它先创建导图。`create` 会打印根节点 id——这里是 `root`，也就是默认值，但仍然要从回复里读，不要直接假定。根节点的 id 是数据，在别处生成或编辑过的文件完全可能叫别的名字。

```
$ npx jsmind@2 create saturday-outing.jm --title "周六出游"
created saturday-outing.jm (root node id root)
```

接着用 `mind add-child` 添加一级分支。`--side left` 或 `--side right` 只在父节点是根节点时才允许使用。如果省略 `--side`，新的根子节点默认放在右侧。更深层的节点会继承所属一级分支的侧向，在那里再传 `--side` 会报错。

```
$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id root --text "上午" --side left
added node (id jm-mwxb9ciw) under root (side=left)
```

这条回复里带有新节点的 id。把它当作后续子节点的 `--parent-id` 即可，不必再查一遍：

```
$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id jm-mwxb9ciw --text "早市"
added node (id jm-mwxb9ck9) under jm-mwxb9ciw

$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id jm-mwxb9ciw --text "河边咖啡"
added node (id jm-mwxb9cld) under jm-mwxb9ciw
```

另外两个分支也是同样的做法：

```
$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id root --text "下午" --side right
added node (id jm-mwxb9cmk) under root (side=right)

$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id jm-mwxb9cmk --text "公园散步"
added node (id jm-mwxb9cnu) under jm-mwxb9cmk

$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id jm-mwxb9cmk --text "书店"
added node (id jm-mwxb9cp2) under jm-mwxb9cmk

$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id root --text "随身带" --side left
added node (id jm-mwxb9cq9) under root (side=left)

$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id jm-mwxb9cq9 --text "水瓶"
added node (id jm-mwxb9crl) under jm-mwxb9cq9

$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id jm-mwxb9cq9 --text "薄外套"
added node (id jm-mwxb9cst) under jm-mwxb9cq9

$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id jm-mwxb9cq9 --text "购物袋"
added node (id jm-mwxb9cu4) under jm-mwxb9cq9
```

每次只能加一个节点：`add-child` 没有批量写法。

然后 agent 会校验文件，并查看整棵树。`context` 默认只显示两层，所以这次加了 `--depth 3`，才能看到孙节点：

```
$ npx jsmind@2 validate saturday-outing.jm
saturday-outing.jm: valid

$ npx jsmind@2 context saturday-outing.jm --depth 3
root          周六出游 {side=center}
jm-mwxb9ciw     上午 {side=left}
jm-mwxb9ck9       早市
jm-mwxb9cld       河边咖啡
jm-mwxb9cmk     下午 {side=right}
jm-mwxb9cnu       公园散步
jm-mwxb9cp2       书店
jm-mwxb9cq9     随身带 {side=left}
jm-mwxb9crl       水瓶
jm-mwxb9cst       薄外套
jm-mwxb9cu4       购物袋
```

`export` 会在导图旁边写出一张 PNG。默认尺寸是 2400×1600 像素。如果 Chromium 不在常见位置，需要设置 `CHROME_PATH`。

```
$ npx jsmind@2 export saturday-outing.jm saturday-outing.png
saturday-outing.png: 2400x1600 (134.0 KB)
```

这时的图片是第一次导出的结果，还没有「野餐垫」：

![第一次导出的图片，还没有「野餐垫」](../../assets/161-first-export.png)

## 再改一处，然后重新导出

第一张图看起来已经完整了，不过出游还少一张野餐垫。请 agent 补上这个节点，再导出一次：

```
请使用 jsMind skill，打开 saturday-outing.jm，在「随身带」下面加上「野餐垫」。校验这张导图，并再次导出为 saturday-outing.png。
```

`export` 会原地覆盖原来的 PNG。如果想保留第一张图，第二次导出时换一个文件名，或者先把旧文件改个名字。

agent 应当重新查找父节点，不要沿用更早记住的 id。`context --highlight` 可以把标签对应到当前的 id：

```
$ npx jsmind@2 context saturday-outing.jm --highlight "随身带"
highlighted:
  "随身带" -> "root"/"jm-mwxb9cq9"
```

```
$ npx jsmind@2 mind add-child saturday-outing.jm --parent-id jm-mwxb9cq9 --text "野餐垫"
added node (id jm-mwxb9div) under jm-mwxb9cq9

$ npx jsmind@2 validate saturday-outing.jm
saturday-outing.jm: valid

$ npx jsmind@2 export saturday-outing.jm saturday-outing.png
saturday-outing.png: 2400x1600 (144.6 KB)
```

## 给整张导图换个颜色

默认色调是白色，第一次导出用的就是它。一条命令就能改掉所有还没有自己色调的节点。这条命令是 `mind set-style`，不必对每个节点再跑一遍 `node set-style`。

现成的色调有 `default`（白）、`primary`（蓝）、`success`（绿）、`warning`（橙）、`danger`（红）、`info`（浅蓝）和 `accent`（紫）。这次演示用 `primary`。如果某个节点已经有自己的色调，仍然以节点自己的为准。

把下面这段交给 agent：

```
请使用 jsMind skill，打开 saturday-outing.jm，把整张导图的默认色调设为 primary，并再次导出为 saturday-outing.png。
```

```
$ npx jsmind@2 mind set-style saturday-outing.jm --default-tone primary
set style of saturday-outing.jm: default-tone=primary

$ npx jsmind@2 export saturday-outing.jm saturday-outing.png
saturday-outing.png: 2400x1600 (150.2 KB)
```

![完成后的周六出游思维导图](../../assets/161-result.png)

## 文件写在哪里

这两个文件会出现在你指定的工作目录里——也就是你发出 prompt 时所在的目录，除非 agent 另外告诉了你别的位置。

- `saturday-outing.jm` 是导图本身。它是一份 JSON 文档，用 `.jm` 做扩展名完全可以，CLI 也接受这种写法。
- `saturday-outing.png` 是图片。用任何看图软件或浏览器打开即可。

agent 还应当给出两个文件的绝对路径。本页也可以下载做好的示例：<a :href="exampleMap" download="saturday-outing.jm">161-example.jm</a>。

## 接下来可以看

- [快速上手](https://hizzgdev.github.io/jsmind-v2/docs/zh/guide/getting-started) — 安装 jsMind 2.x，自己做一张导图
- [Skill](https://hizzgdev.github.io/jsmind-v2/docs/zh/guide/skill) — skill 的安装与用法
- [CLI](https://hizzgdev.github.io/jsmind-v2/docs/zh/guide/cli) — 全部命令和参数
- [Playground](https://hizzgdev.github.io/jsmind-v2/playground.html) — 在浏览器里打开一张导图并直接编辑
