---
title: 用 jsMind Skill 做你的第一张思维导图
id: 161
date: "2026-11-26"
tags:
  - 技巧
---

# 用 jsMind Skill 做你的第一张思维导图

> 适用版本：2.x（当前为 preview，内容可能随版本变化）

这篇文章会带你请 AI agent 安装 jsMind Skill，用它整理这个周末的出游选项，做成思维导图，并导出成 PNG。下面的 prompt 可以直接复制使用。导图的具体内容由 agent 来想：你得到的树不必和本页这张一样。

<script setup>
import exampleMap from '../../assets/161-example.json?url';
</script>

![完成后的周末出游思维导图](../../assets/161-result.png)

## 你将做成什么

一张整理周末出游选项的思维导图，并在每个选项下列出需要做的准备。上面这张图来自一次真实运行，中间还换过颜色。你用同一段 prompt，agent 完全可能排出不一样的树——这很正常。你要学的是流程（安装、提出需求、让 CLI 生成导图，再换色、导出），而不是抄一份固定大纲。

这次运行做成的导图可以在这里下载：<a :href="exampleMap" download="weekend-outing.json">161-example.json</a>。

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
这个周末我计划出去转转，旁边新开了一个早市我想去逛逛，如果没意思的话就顺便再去旁边的书店看看书；或者也可以去公园散步，走累了还可以去河边喝个咖啡，如果能约上朋友就更好了，那样的话就可以去爬山。但是我还没想好具体要怎么安排，你用 jsmind 画一个思维导图帮我整理一下这些选项，并在这些选项下列出需要做什么样的准备。
```

也可以在同一条消息里，或者再跟一句，请它导出一张 PNG。下面的演示包含这次导出。

agent 应当通过 jsMind CLI 来创建和修改文件，不要亲手去写这份导图。分支和节点文字由它来想，所以你这边的树未必会和下面对得上。

## agent 实际会做什么

本页的图片和下载来自上面这类 prompt 的一次真实运行，用来说明流程，并不是标准答案。每次写入之后，请用刚刚那条命令返回的 id，或者再运行一次 `context`，不要把下面这些 id 抄进自己的命令里。

Skill 里写的是 `jsmind`。下面的会话用 `npx jsmind@2`，这是 CLI 还不在 PATH 里时更稳妥的写法。这次运行里，导图保存为 `weekend-outing.json`（后来还有 `weekend-outing.png`）；你那边可能会不一样。

它先创建导图。`create` 会打印根节点 id——这里是 `root`，也就是默认值，但仍然要从回复里读，不要直接假定。根节点的 id 是数据，在别处生成或编辑过的文件完全可能叫别的名字。

```
$ npx jsmind@2 create weekend-outing.json --title "周末出去转转"
created weekend-outing.json (root node id root)
```

接着用 `mind add-child` 添加分支，每次只能加一个节点：`add-child` 没有批量写法。`--side left` 或 `--side right` 只在父节点是根节点时才允许使用。如果省略 `--side`，新的根子节点默认放在右侧。更深层的节点会继承所属一级分支的侧向，在那里再传 `--side` 会报错。

每条 `add-child` 的回复里带有新节点的 id。把它当作后续子节点的 `--parent-id` 即可，不必再查一遍。

这次运行把周末整理成了三个选项：逛新开的早市（左侧）、公园散步（右侧），以及约朋友爬山（也在左侧）。每个选项下面列出了需要做的准备——其中有几处子节点和父节点用了相同的文字，这里保持 agent 当时写下的样子。

然后 agent 会校验文件，并查看整棵树。`context` 默认只显示两层，所以这次加了 `--depth 3`，才能看到准备工作；又加了 `--full-text`，以免较长的标签被截断：

```
$ npx jsmind@2 validate weekend-outing.json
weekend-outing.json: valid

$ npx jsmind@2 context weekend-outing.json --depth 3 --full-text
root          周末出去转转 {side=center}
jm-mwxkp09e     逛新开的早市 {side=left}
jm-mwxkp0q3       逛早市
jm-mwxkp0vi         查营业时间、地点
jm-mwxkp10v         带现金、环保袋
jm-mwxkp16a       没意思就去旁边书店
jm-mwxkp1br         查书店营业时间
jm-mwxkp1hd         带借书证、想看的书
jm-mwxkp0ey     公园散步 {side=right}
jm-mwxkp1mm       公园散步
jm-mwxkp1rw         看天气、穿舒服的鞋
jm-mwxkp1y5         定一条散步路线
jm-mwxkp23l       走累了去河边喝咖啡
jm-mwxkp28z         查河边咖啡店位置
jm-mwxkp2e5         带本书或耳机
jm-mwxkp0kt     约朋友爬山 {side=left}
jm-mwxkp2jq       约朋友
jm-mwxkp2p2         定人选和时间
jm-mwxkp2ui         确认大家体力
jm-mwxkp304       爬山
jm-mwxkp35j         登山鞋、水、防晒
jm-mwxkp3ay         查路线难度和天气
```

`export` 会在导图旁边写出一张 PNG。默认视口是 1200×800、缩放为 2，所以常见的导出尺寸是 2400×1600 像素；如果导图更宽，图片会跟着变大。这次导出是 2924×1600，因为有些标签稍长。如果 Chromium 不在常见位置，需要设置 `CHROME_PATH`。

```
$ npx jsmind@2 export weekend-outing.json weekend-outing.png
weekend-outing.png: 2924x1600 (270.7 KB)
```

这时的图片是这次运行的第一稿，还是默认的白色：

![第一次导出的图片，仍是默认的白色](../../assets/161-first-export.png)

## 想改的话可以继续聊

如果漏了什么，或想增减、调整某个条目，可以继续跟 agent 说，让它改导图，然后再导出一次。`export` 会原地覆盖原来的 PNG。如果想保留前面那张图，下一次导出时换一个文件名，或者先把旧文件改个名字。

本页保留了 agent 第一次生成的这棵树，只在下一步换了颜色。

## 给整张导图换个颜色

默认色调是白色，第一次导出用的就是它。一条命令就能改掉所有还没有自己色调的节点。这条命令是 `mind set-style`，不必对每个节点再跑一遍 `node set-style`。

现成的色调有 `default`（白）、`primary`（蓝）、`success`（绿）、`warning`（橙）、`danger`（红）、`info`（浅蓝）和 `accent`（紫）。这次演示用 `primary`。如果某个节点已经有自己的色调，仍然以节点自己的为准。

用平常的话说给 agent 即可：

```
默认的白色有点素。请把整张导图改成蓝色（用 primary 这个色调），再导出一次。
```

```
$ npx jsmind@2 mind set-style weekend-outing.json --default-tone primary
set style of weekend-outing.json: default-tone=primary

$ npx jsmind@2 export weekend-outing.json weekend-outing.png
weekend-outing.png: 2924x1600 (287.5 KB)
```

![完成后的周末出游思维导图](../../assets/161-result.png)

## 文件写在哪里

这两个文件通常会出现在这次对话的工作目录里，除非 agent 另外告诉了你别的位置。这次运行里，文件名是 `weekend-outing.json` 和 `weekend-outing.png`；你的 agent 可能会取不一样的名字。

- `.json` 文件是导图本身，内容是一份 JSON 文档。
- `.png` 文件是图片。用任何看图软件或浏览器打开即可。

agent 还应当给出两个文件的绝对路径。本页也可以下载这次做成的示例：<a :href="exampleMap" download="weekend-outing.json">161-example.json</a>。

## 接下来可以看

- [快速上手](https://hizzgdev.github.io/jsmind-v2/docs/zh/guide/getting-started) — 安装 jsMind 2.x，自己做一张导图
- [Skill](https://hizzgdev.github.io/jsmind-v2/docs/zh/guide/skill) — skill 的安装与用法
- [CLI](https://hizzgdev.github.io/jsmind-v2/docs/zh/guide/cli) — 全部命令和参数
- [Playground](https://hizzgdev.github.io/jsmind-v2/playground.html) — 在浏览器里打开一张导图并直接编辑
