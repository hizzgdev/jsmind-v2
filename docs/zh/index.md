---
layout: home
hero:
  name: jsMind V2
  text: jsMind 的下一代
  tagline: 面向人与 agent 的思维导图内核，API 更合理，架构更好。人可以查看、编辑和导出导图；agent 可以创建、读取和修改结构化导图。
  actions:
    - theme: brand
      text: 快速上手
      link: /zh/guide/getting-started
    - theme: alt
      text: Playground
      link: https://hizzgdev.github.io/jsmind-v2/playground.html
---

<script setup>
import pkg from '../../package.json'
</script>

::: info 当前预览版本
v{{ pkg.version }} · npm tag `v2-preview` · 安装：`npm i jsmind@2`
:::

指南里已经写好了概述、安装方法、仓库中的 skill 和 CLI。[API](/zh/reference/api) 已按预览版写好。[参考](/zh/reference/) 还收录了节点内容、节点移动、导出图片和序列化等功能说明。[设计](/zh/design/) 说明库是如何组织的。[社区](/zh/community/) 收录贡献与支持相关链接。数据格式页面仍在编写中。
