# 从 ES 到 TS：jsMind 迁移实战与技术要点

## 前言

将 jsMind 库从原生 JavaScript 迁移至 TypeScript 的过程，涉及一系列典型的工程挑战。本文旨在记录此次迁移中遇到的核心问题、相应的解决方案及相关技术配置，为面临类似迁移任务的开发者提供一份实践参考。

## 迁移动机

原 jsMind 项目虽在 JSDoc 中嵌入了类型注释，但仍存在若干局限性。引入 TypeScript 旨在利用其静态类型系统，从根本上提升代码的健壮性与开发体验。主要解决的目标问题包括：

- **类型检查滞后**：JSDoc 的类型提示缺乏编译时强制约束，问题往往延至运行时暴露。
- **维护成本高**：类型声明与实现代码分离，难以保证长期同步一致。
- **开发体验不足**：IDE 无法基于精确类型提供可靠的智能提示与自动补全。

TypeScript 的静态类型分析能够在编码阶段捕获大量潜在错误，同时其类型系统本身可作为代码的实时文档，从而提升整体开发效率与代码质量。

## 迁移过程中的关键技术问题与解决方案

### 问题一：模块导入路径的规范—— `.ts` 与 `.js` 的选择

#### 问题描述

在 TypeScript 项目中，`import` 语句应引用 `.ts` 源文件扩展名，还是编译后的 `.js` 文件扩展名，是一个常见的配置抉择。传统实践倾向于引用 `.js` 扩展名，以模拟编译后的运行状态。然而，随着 Node.js 24 开始原生支持运行 TypeScript 代码，直接引用 `.ts` 源文件成为可能。

#### 解决方案

采用直接引用 `.ts` 源文件的方案。此方案需在 `tsconfig.json` 中进行如下关键配置：

**tsconfig.json 核心配置：**
```json
{
  "compilerOptions": {
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "rewriteRelativeImportExtensions": true,
    "verbatimModuleSyntax": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

**配置说明：**
- `"noEmit": true`：禁用文件输出，直接执行 TypeScript 源码。
- `"allowImportingTsExtensions": true`：允许在 `import` 语句中显式使用 `.ts` 扩展名。
- `"rewriteRelativeImportExtensions": true`：编译器自动重写相对导入路径的扩展名。
- `"verbatimModuleSyntax": true`：确保模块语法被原样保留。
- `"module": "NodeNext"` 与 `"moduleResolution": "NodeNext"`：采用 Node.js 的 ESM 模块系统。

**代码示例：**
```typescript
// ✅ 正确方式：显式使用 `.ts` 扩展名
import { JmMind } from './model/jsmind.mind.ts';
import { JsMindOptions } from './common/option.ts';

// ❌ 应避免的方式
import { JmMind } from './model/jsmind.mind'; // 缺少扩展名
import { JmMind } from './model/jsmind.mind.js'; // 引用不存在的 `.js` 文件
```

**此方案的优势：**
1. **简化流程**：无需独立的编译步骤即可运行，简化开发与调试。
2. **环境一致**：开发与运行环境使用同一份源码，避免因编译产物可能带来的不一致性。
3. **技术前瞻性**：顺应 Node.js 原生支持 TypeScript 的趋势。
4. **类型安全**：TypeScript 编译器可直接对源码进行完整的类型检查。

**注意事项：**
- 所有相对路径导入必须使用完整的 `.ts` 扩展名。
- 要求 Node.js 运行环境版本 >= 24（测试于 v24.12.0）。
- 此模式更适用于库开发；对于需要打包部署的应用项目，可能仍需传统的构建流程。

### 问题二：浏览器环境单元测试的适配

#### 问题描述

jsMind 是一个依赖于浏览器 DOM API 的库。在 Node.js 环境中执行其单元测试，需要完整地模拟浏览器环境。

#### 解决方案

**1. 采用 Node.js 原生测试框架**
直接使用 Node.js 18+ 版本内置的 `node:test` 模块，无需引入第三方测试框架。
```json
// package.json
{
  "scripts": {
    "test": "node --test"
  }
}
```

**2. 在 tsconfig.json 中排除测试文件**
避免 TypeScript 编译器处理测试文件，防止因运行环境差异导致的类型错误。
```json
{
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.spec.ts"]
}
```

**3. 使用 jsdom 模拟浏览器环境**
安装 jsdom 并创建环境初始化脚本。
```bash
npm install --save-dev jsdom @types/jsdom
```

**环境初始化脚本 (`__tests__/setup/jsdom.ts`):**
```typescript
import { JSDOM } from 'jsdom';

export function initDom() {
    const dom = new JSDOM(
        `<!DOCTYPE html><html><body><div id="jsmind-container"></div></body></html>`,
        { url: 'http://localhost', runScripts: 'dangerously' }
    );
    global.window = dom.window as typeof globalThis & Window;
    global.document = dom.window.document;
}
```

**单元测试示例：**
```typescript
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { DomUtility } from '../../src/common/dom.ts';
import { initDom } from '../setup/jsdom.ts';

describe('DomUtility', () => {
    before(() => initDom()); // 在每个测试套件前初始化 DOM
    it('createElement 应创建带有属性的元素', () => {
        const element = DomUtility.createElement('div', 'test-id', { 'data-id': '123' });
        assert.strictEqual(element.getAttribute('data-id'), '123');
    });
});
```

**4. 配置 TypeScript 支持 DOM 类型**
确保 `tsconfig.json` 包含必要的类型定义。
```json
{
  "compilerOptions": {
    "lib": ["ES2020", "DOM"],
    "types": ["node", "jsdom"]
  }
}
```

**关键要点：**
- 利用 Node.js 原生测试工具链，减少外部依赖。
- 明确排除测试文件，隔离类型检查范围。
- 通过 jsdom 在全局对象上精确模拟 `window` 和 `document`。
- 测试环境初始化应在测试套件级别进行。

### 问题三：类型系统的渐进式增强策略

#### 问题描述

从无类型的 JavaScript 迁移至 TypeScript，初期不可避免地会大量使用 `any` 类型。为了充分发挥 TypeScript 的类型安全优势，需要一个系统性的策略来逐步消除 `any`，代之以精确的类型定义。

#### 解决方案

**1. 初期配置：将 `any` 设置为警告**
在迁移初期，将 ESLint 相关规则设置为警告级别，以便识别问题而不阻塞进程。
```javascript
// eslint.config.js (初始阶段)
{
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn'
  }
}
```

**2. 渐进式类型强化策略**
采用多种策略，分阶段、分区域地替换 `any` 类型。

**策略 A：定义具象接口**
对于结构清晰的数据模型，直接定义接口或类型别名。
```typescript
// ✅ 改进后：使用明确接口
interface SerializedNode {
    id: string;
    content: { type: JmNodeContentType; value: unknown };
    parent: string | null;
    children: string[];
}

function serializeNode(node: JmNode): SerializedNode {
    return { id: node.id, content: node.content, /* ... */ };
}
```

**策略 B：以 `unknown` 替代 `any`**
对于类型不确定的场合，使用类型安全的 `unknown`，并强制在使用前进行类型收窄。
```typescript
// ✅ 改进后：使用 unknown 确保安全
function processData(data: unknown): string {
    if (data && typeof data === 'object' && 'value' in data) {
        return (data as { value: string }).value; // 需要类型断言
    }
    throw new Error('Invalid data');
}
```

**策略 C：实现类型守卫 (Type Guards)**
对于需要验证的复杂数据结构，实现类型守卫函数来收窄类型。
```typescript
// ✅ 类型守卫函数
function isValidMindMap(data: unknown): data is SerializedMindMap {
    return !!(
        data &&
        typeof data === 'object' &&
        'meta' in data &&
        'root' in data &&
        'nodes' in data
    );
}

function deserialize(data: unknown): JmMind {
    if (!isValidMindMap(data)) {
        throw new JsMindError('Invalid data format');
    }
    // 此处 data 类型已被收窄为 SerializedMindMap
    // ...
}
```

**3. 最终阶段：启用严格类型规则**
当大部分 `any` 类型被清理后，将规则升级为错误级别，以保持代码库的长期类型安全。
```javascript
// eslint.config.js (最终阶段)
{
  rules: {
    '@typescript-eslint/no-explicit-any': 'error'
  }
}
```

**实践总结：**
- 类型强化是一个持续迭代的过程，不宜追求一次性完成。
- 优先处理核心公共 API 和数据结构，再逐步覆盖内部实现。
- 充分利用 `unknown`、类型守卫和泛型等 TypeScript 特性，平衡安全性与灵活性。
- 严格的 ESLint 规则是保障最终代码质量的有效工具。

## 迁移收益总结

通过此次迁移，可以观察到以下几方面的显著提升：

- **类型安全**：编译时类型检查提前拦截了大量潜在的类型错误，增强了代码的可靠性。
- **开发体验**：IDE 能够提供基于精确类型的智能提示、自动补全和跳转，提升了编码效率。类型定义本身也构成了良好的代码文档。
- **代码质量**：结合 ESLint 等工具，代码风格更统一，可维护性更强。明确的接口定义使得代码结构更清晰。

## 结论

将大型 JavaScript 库迁移至 TypeScript 是一项系统工程，关键点在于：

1. **工具链配置**：根据项目需求（如是否直接运行 `.ts`）合理配置 `tsconfig.json` 与相关工具。
2. **环境模拟**：针对浏览器 API 依赖，采用 jsdom 等库在 Node.js 测试环境中进行高保真模拟。
3. **渐进式类型化**：接受从 `any` 起步的现实，通过制定明确的策略（如 `unknown`、类型守卫、接口化），逐步向严格的类型安全推进。
4. **长期维护**：将严格的类型检查规则集成到 CI/CD 流程中，确保代码库的类型健康度持续改善。

迁移工作仍在进行中，上述方案为后续的深度类型化奠定了坚实基础。

---
**相关资源：**
- [jsMind v2 GitHub 仓库](https://github.com/hizzgdev/jsmind)
- [TypeScript 官方文档](https://www.typescriptlang.org/docs/)
- [Node.js 测试运行器文档](https://nodejs.org/api/test.html)