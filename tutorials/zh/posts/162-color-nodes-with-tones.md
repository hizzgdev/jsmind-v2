---
title: 给指定节点上色，把重点标出来
id: 162
date: "2026-11-28"
tags:
  - 技巧
---

# 给指定节点上色，把重点标出来

> 适用版本：2.x（当前为 preview，内容可能随版本变化）

<script setup>
import startMap from '../../assets/162-start.json?url';
import exampleMap from '../../assets/162-example.json?url';
</script>

在[用 jsMind Skill 做你的第一张思维导图](./161-first-mind-map-with-skill)里，整张图用了同一种色调。这篇从那张做好的图接着往下做，只给真正在意的选项上色，让你一眼能看出重点。如果还没有做过 161，先下载下面的起始图，不必重画。

起始图可以在这里下载：<a :href="startMap" download="weekend-outing.json">weekend-outing.json</a>。如果你手里已经有 161 里做成的那份文件，继续用那一份即可。下面的命令以 `weekend-outing.json` 作为文件名。

![一级选项「公园散步」和「约朋友爬山」变了颜色；它们的子节点仍是文档级的 primary 蓝](../../assets/162-color-nodes.gif)

## 让 agent 把重点标出来

把这段 prompt 复制到已经启用 jsMind Skill 的对话里，并附上或指向你的起始图：

```
我已经有一张周末出游的思维导图了。现在我想得更清楚一点：公园散步是我比较想去的，约朋友爬山要看大家有没有空，还不一定，早市和书店先记着就行。你帮我在图上用颜色标一下，让我一眼能看出哪些是更想做的，哪些还不一定。
```

同样的 prompt 可能标出不一样的颜色，这是正常的。这篇演示里用绿色表示比较想去、橙色表示还不一定，只是为了让配图有一个具体含义。如果你的 agent 选了别的色调，并不代表你做错了。

## 先找到一级节点的 id，再设置色调

161 用 `mind set-style --default-tone` 给整张图上色。这里文档的默认色调仍然是 `primary`（蓝色）。要给单个节点上色，用 `node set-style --tone`。

不要只按文字去匹配节点。这张图里，「公园散步」出现了两次：一次是一级选项，一次是它下面的同名子节点。先运行 `context`，再给一级选项上色。

`context --highlight` 并不是在图上做视觉高亮。它按标签查找节点 id（对完整标签做不区分大小写的匹配），并把结果列在输出的开头。

如果你接着做的是本页下载的起始图，下面演示里的 id 可以对上。如果你接着用的是 161 里自己生成的那张图，必须重新运行 `context`，使用那份文件打印出的 id。不要把本页的 id 贴到另一张图上。

```bash
npx jsmind@2 context weekend-outing.json --highlight "公园散步" --highlight "约朋友爬山" --full-text
```

```
highlighted:
  "公园散步"   -> "root"/"jm-mwxkp0ey" (+1 more)
  "约朋友爬山" -> "root"/"jm-mwxkp0kt"

fullmap:
style: theme=default defaultTone=primary overrides=defaultTone
root          周末出去转转 {side=center}
jm-mwxkp09e     逛新开的早市 {side=left}
jm-mwxkp0q3       逛早市
jm-mwxkp16a       没意思就去旁边书店
jm-mwxkp0ey     公园散步 {side=right}
jm-mwxkp1mm       公园散步
jm-mwxkp23l       走累了去河边喝咖啡
jm-mwxkp0kt     约朋友爬山 {side=left}
jm-mwxkp2jq       约朋友
jm-mwxkp304       爬山
```

「公园散步」后面的 `(+1 more)` 就是那个同名子节点。排在前面的 id `jm-mwxkp0ey` 才是一级选项，要上色的是它。

```bash
npx jsmind@2 node set-style weekend-outing.json --node-id jm-mwxkp0ey --tone success
npx jsmind@2 node set-style weekend-outing.json --node-id jm-mwxkp0kt --tone warning
```

```
set style of jm-mwxkp0ey: {"tone":"success"}
set style of jm-mwxkp0kt: {"tone":"warning"}
```

「逛新开的早市」保持不变，所以它仍是文档级的 `primary`（蓝色）。文档里 `default` 是白色，`primary` 才是蓝色。

色调不会顺着分支往下传。只有你设置的那个节点会被覆盖；它的子节点仍回落到文档的 `primary`。从图里也能看出来：「公园散步」和「约朋友爬山」下面的子节点还是蓝色。

`node set-style` 也可以用 `--background` 和 `--color` 设置自定义颜色。这篇只用色调。

## 导出图片

```bash
npx jsmind@2 export image weekend-outing.json weekend-outing.png
```

```
weekend-outing.png: 2924x1600 (287.3 KB)
```

![给两个一级选项上色后的周末出游图](../../assets/162-result.png)

## 文件写在哪里

上面的命令会把结果写到工作目录里的 `weekend-outing.json` 和 `weekend-outing.png`，除非 agent 另外告诉了你别的位置。你的 agent 可能会取不一样的名字。

- `.json` 文件是导图本身，内容是一份 JSON 文档。
- `.png` 文件是图片。用任何看图软件或浏览器打开即可。

本页也可以下载这些文件：

- 起始图（全部是 `primary`）：<a :href="startMap" download="weekend-outing.json">weekend-outing.json</a>
- 给两个选项上色之后：<a :href="exampleMap" download="weekend-outing-colored.json">weekend-outing-colored.json</a>

## 接下来可以看

- [用 jsMind Skill 做你的第一张思维导图](./161-first-mind-map-with-skill) — 如果想从零做起始图
- [Skill](https://hizzgdev.github.io/jsmind-v2/docs/zh/guide/skill) — skill 的安装与用法
- [CLI](https://hizzgdev.github.io/jsmind-v2/docs/zh/guide/cli) — 全部命令和参数
- [Playground](https://hizzgdev.github.io/jsmind-v2/playground.html) — 在浏览器里打开一张导图并直接编辑
