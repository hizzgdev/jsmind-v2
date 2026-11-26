---
title: Tutorials
---

# jsMind V2 tutorials

Each tutorial walks through one thing you can do with jsMind 2.x — a single technique, or a complete scenario with example files. jsMind 2.x is currently a preview, so details may change between releases.

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
  New tutorials will be listed here as they are published. Until then, installation, the API and the CLI are covered by the product documentation.
</p>

- [Documentation](https://hizzgdev.github.io/jsmind-v2/docs/en/)
- [Playground](https://hizzgdev.github.io/jsmind-v2/playground.html)
