---
title: 教程
---

# jsMind V2 教程

每篇教程带你把一件事做成：一个具体技巧，或者一个带示例文件的完整场景。jsMind 2.x 目前是 preview，内容可能随版本变化。

<script setup>
import { data as posts } from './posts.data.ts';
</script>

<ul v-if="posts.length" class="tutorial-list">
  <li v-for="post in posts" :key="post.url">
    <a :href="post.url">{{ post.title }}</a>
    <time :datetime="post.date">{{ post.date }}</time>
    <span v-if="post.tags.length" class="tutorial-tags">{{ post.tags.join(' · ') }}</span>
  </li>
</ul>

<p v-else>
  新教程发布后会列在这里。在此之前，安装、API 和 CLI 的说明都在产品文档里。
</p>

- [文档](https://hizzgdev.github.io/jsmind-v2/docs/zh/)
- [Playground](https://hizzgdev.github.io/jsmind-v2/playground.html)
