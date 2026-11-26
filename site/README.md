# site/

发布站点自有页面的源文件。`npm run assemble-site` 把它们写进 `_site/`，GitHub Pages 发布的是 `_site/`。

`_site/` 是构建产物：每次构建先删再写，已被 `.gitignore` 排除，不要手改。要改首页就改这里的 `index.html`。

```
site/
├── index.html              # 产品首页，发布为 _site/index.html
├── language-redirect.html  # /docs/、/tutorials/ 的语言重定向，填 {{TITLE}} 与 {{DOCS_LANG_STORAGE_KEY}}
├── page-redirect.html      # 旧文档路径的重定向，填 {{TO}}
└── README.md               # 本文件
```

页面就是纯 HTML，需要由构建决定的值用 `{{...}}` 占位，由 `scripts/assemble-site.ts` 渲染时填入。槽位没填会直接构建失败，不会把 `{{...}}` 发到线上站。

这里只放站点自有页面。`docs/` 和 `tutorials/` 各自是独立的 VitePress 站点，源文件留在各自目录，构建进 `_site/docs` 与 `_site/tutorials`。Playground 的源文件仍是 `example/playground.html`（`npm run server` 要用仓库内路径），发布时由 `assemble-site` 改写脚本地址和图标路径再复制到站点根。图标以 `docs/public/` 为唯一一份签入副本，bundle 取自 `dist/`。
