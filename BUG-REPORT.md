## Atomic Notes Extractor 项目 Bug 复盘报告

审查范围：`obsidian-atomic-notes/src/` 下全部 19 个 TypeScript 源文件，以及 `esbuild.config.mjs`、`package.json`、`tsconfig.json` 等配置文件。

---

### 一、运行时崩溃级 Bug（Critical）

**Bug #1：`SYSTEM_PROMPT` 未定义 — 提炼流程必定崩溃**

文件：`src/extractor.ts`，第 163 行

```typescript
messages: [
  { role: 'system', content: SYSTEM_PROMPT },  // ReferenceError!
  { role: 'user', content: prompt },
],
```

`SYSTEM_PROMPT` 既没有在本文件声明，也没有从任何模块导入。文件头部的 import 是：

```typescript
import { buildSystemPrompt, buildExtractionPrompt } from './extraction/tag-preferences';
```

导入的是 `buildSystemPrompt` 函数和 `BASE_SYSTEM_PROMPT` 常量（但 `BASE_SYSTEM_PROMPT` 并未被导入），实际使用的却是未声明的 `SYSTEM_PROMPT`。这会在运行时触发 `ReferenceError`，导致整个提炼流程直接崩溃。

修复方向：应改为调用 `buildSystemPrompt(config.tagPreferences, config.tagMode)` 来动态生成 system prompt，或导入 `BASE_SYSTEM_PROMPT`。

---

**Bug #2：`_isExtracting` 属性未在插件类中声明**

文件：`src/ui/panel-view.ts`，第 244、275、282 行

```typescript
if (this.plugin._isExtracting) return;     // line 244
this.plugin._isExtracting = true;          // line 275
this.plugin._isExtracting = false;         // line 282
```

但 `src/main.ts` 中的 `AtomicNotesPlugin` 类从未声明 `_isExtracting` 属性：

```typescript
export default class AtomicNotesPlugin extends Plugin {
  settings: PluginSettings;
  // 没有 _isExtracting
}
```

TypeScript 严格模式下这是编译错误。即使编译通过，由于插件类没有初始化该属性，第一次读取时值为 `undefined`（falsy），功能上恰好"能用"，但属于不安全代码。

---

**Bug #3：面板调用 `private` 方法 — TypeScript 编译错误**

文件：`src/ui/panel-view.ts`，第 280 行

```typescript
await this.plugin.runExtraction(inputData);
```

而 `src/main.ts` 中 `runExtraction` 被声明为 `private`：

```typescript
private async runExtraction(input: { ... }) { ... }
```

TypeScript 严格模式下，外部类调用 `private` 方法是编译错误。需要将 `runExtraction` 改为 `public` 或使用其他访问方式。

---

### 二、严重功能缺失（Major — 已实现的功能从未被接入主流程）

**Bug #4：提炼模式（本地/混合）是死代码**

文件：`src/extractor.ts`，`src/extraction/textrank.ts`

设置页面提供了三种提炼模式（`extractionMode: 'ai' | 'local' | 'hybrid'`），`textrank.ts` 中完整实现了 `localExtract()`、`wrapLocalNotes()`、`buildHybridPrompt()` 三个函数。但 `extractor.ts` 的 `runExtraction()` 从头到尾只走了 AI 路径，完全没有根据 `extractionMode` 分支。用户选择"纯本地"或"混合模式"后，实际行为与"纯AI"完全相同。

**Bug #5：事实核查模块从未被调用**

文件：`src/extraction/fact-checker.ts`

设置页面有 `factCheck` 和 `verifiedOnly` 两个开关，`fact-checker.ts` 完整实现了 `verifyFacts()` 函数。但主提炼流程 `runExtraction()` 中从未调用它。事实核查功能完全无效。

**Bug #6：反向链接从未被插入**

文件：`src/services/backlink-service.ts`

设置页面有 `autoBacklink` 开关，`backlink-service.ts` 实现了 `insertBacklinks()` 函数。但主流程从未在保存笔记后调用它。

**Bug #7：相关笔记推荐从未被使用**

文件：`src/discovery/similarity-matrix.ts`

设置页面有 `autoRelatedNotes` 开关，`similarity-matrix.ts` 导出了 `findRelatedNotes()` 函数。但整个提取和保存流程中从未调用过它。

**Bug #8：提炼历史从未被记录**

文件：`src/services/history-service.ts`，`src/ui/panel-view.ts`

面板的"历史"Tab 读取 `this.plugin.settings.extractionHistory` 来展示历史记录，`history-service.ts` 实现了 `addHistoryEntry()`、`computeSourceHash()` 等函数。但主提炼流程中从未调用 `addHistoryEntry()`，因此 `extractionHistory` 永远为空，历史 Tab 始终显示"暂无提炼历史"。

---

### 三、数据损坏风险（Data Corruption）

**Bug #9：YAML frontmatter 未转义特殊字符**

文件：`src/storage.ts`，第 67-76 行

```typescript
lines.push(`title: ${note.title}`);
```

如果笔记标题包含 YAML 特殊字符（如冒号、引号、方括号），生成的 frontmatter 会变成非法 YAML。例如标题为 `Node.js: A Runtime` 时，输出 `title: Node.js: A Runtime` 会被 YAML 解析器误解。类似地，`source` 字段也未转义。

**Bug #10：标签格式解析错误 — AI 输出与解析器不匹配**

文件：`src/utils/notes-standards.ts`，第 114 行

AI 的 system prompt（`extraction/tag-preferences.ts` 第 22 行）要求输出格式为：

```
tags: [标签1], [标签2], [标签3]
```

但解析代码是简单的 `split(',')`：

```typescript
if (tagsMatch) note.tags = tagsMatch[1].split(',').map(t => t.trim());
```

当 AI 遵循指示输出 `tags: [设计思维], [用户研究]` 时，解析结果为 `["[设计思维]", "[用户研究]"]`，标签名被错误地包含了方括号。

**Bug #11：`generateFileName()` 使用两个 Date 对象导致时间不一致**

文件：`src/storage.ts`，第 38-39 行

```typescript
const date = new Date().toISOString().slice(0, 10);
const time = new Date().toISOString().slice(11, 19).replace(/:/g, '-');
```

两行代码各创建了一个 `new Date()`，它们之间有微小时间差。如果恰好在午夜 23:59:59 → 00:00:00 之间执行，`date` 可能取到前一天而 `time` 取到后一天，产生 `2026-06-14 00-00-01` 这样的矛盾文件名。

---

### 四、逻辑错误（Logic Bugs）

**Bug #12：孤立笔记检测算法错误 — 检测的不是"孤立"而是"自引用"**

文件：`src/discovery/similarity-matrix.ts`，第 200-221 行

```typescript
const content = await vault.read(file);
const incomingRegex = new RegExp('\\[\\[' + escapedTitle + '\\]\\]', 'g');
const incomingMatches = content.match(incomingRegex);
incomingLinks = incomingMatches ? incomingMatches.length : 0;
```

这里读取的是**当前文件自身的内容**，然后在自身内容中搜索 `[[自己的标题]]`。这检测的是"自引用"，不是"入链"。真正的入链应该遍历**其他所有文件**，检查它们是否引用了当前文件。结果就是：大多数笔记的 `incomingLinks` 为 0（因为很少有文件引用自己），而 `outgoingLinks` 只要文件内有 `[[...]]` 就大于 0，导致几乎没有笔记会被标记为孤立笔记。

**Bug #13：Prompt 中的 JS 注释被当作内容发送给 AI**

文件：`src/extraction/tag-preferences.ts`，第 62-63 行；`src/prompts/extraction-prompt.ts`，第 47-48 行

```typescript
return `请从以下内容中提炼原子笔记：

\`\`\`
${content.slice(0, 10000)} // 限制输入长度，避免超 token
\`\`\`
```

`// 限制输入长度，避免超 token` 是 JavaScript 注释，但它在模板字符串内部，会被原样拼入 prompt 发给 AI。AI 会看到这段中文注释，可能产生困惑。

**Bug #14：标准数量不一致 — 五条 vs 六条**

文件间存在矛盾：

- `src/extraction/tag-preferences.ts` 的 `BASE_SYSTEM_PROMPT` 说"原子笔记**五**条标准"，列出 5 条
- `src/prompts/extraction-prompt.ts` 的 `SYSTEM_PROMPT` 说"原子笔记**六**条标准"，列出 6 条（多了"标注来源"）
- `src/utils/notes-standards.ts` 的 `NOTES_STANDARDS` 说"**六**条标准"
- `BASE_SYSTEM_PROMPT` 注意事项（第 29 行）说"严格遵循**六**条标准"，但正文只列了 5 条
- `buildExtractionPrompt`（第 68 行）说"严格遵循原子笔记**六**条标准"

AI 收到的 system prompt 和 user prompt 中的标准数量和描述不一致，会影响输出质量。

**Bug #15：`buildSystemPrompt()` 和 `buildExtractionPrompt()` 在 `extractor.ts` 中被导入但从未使用**

文件：`src/extractor.ts`，第 14 行

```typescript
import { buildSystemPrompt, buildExtractionPrompt } from './extraction/tag-preferences';
```

但 `extractor.ts` 的 `extractAtomicNotes()` 函数实际使用的是未声明的 `SYSTEM_PROMPT`（Bug #1），而 `buildExtractionPrompt` 虽然在第 147 行被调用了，但来自 `tag-preferences.ts` 的版本硬编码了截断长度 `10000`，没有使用 `INPUT_TRUNCATE_LENGTH` 常量。

**Bug #16：`main.ts` 传递给 `runExtraction` 的配置包含多余属性**

文件：`src/main.ts`，第 194-204 行

```typescript
const result = await runExtraction(
  { ...input, app: this.app },   // `app` 不在 runExtraction 的 input 类型中
  {
    deepseekApiKey: ...,
    tagPreferences: ...,         // 不在 ExtractorConfig 接口中
    tagMode: ...,                // 不在 ExtractorConfig 接口中
  }
);
```

TypeScript 严格模式下，对象字面量传递给强类型参数时多余属性会触发编译错误（excess property check）。同时 `ExtractorConfig` 接口缺少 `tagPreferences` 和 `tagMode` 字段，导致即使传入了也无法在底层使用。

---

### 五、性能问题

**Bug #17：质量门控的 Levenshtein 距离计算复杂度为 O(n*m)，且 n, m 最大 5000**

文件：`src/utils/gate-rules.ts`，第 91-99 行

```typescript
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().replace(/\s+/g, '').slice(0, 5000);
  const s2 = str2.toLowerCase().replace(/\s+/g, '').slice(0, 5000);
  const distance = levenshteinDistance(s1, s2);
  ...
}
```

Levenshtein 距离算法的时间复杂度和空间复杂度都是 O(n * m)。当两段文本都接近 5000 字符时，需要分配一个 5000 x 5000 的矩阵（约 100MB 内存），计算 2500 万次操作。虽然在 `runExtraction` 中当前 `processedContents` 总是空数组（因为 Bug #8 的上下文），但如果未来修复了历史去重，每次提炼都会触发这个高开销计算。

**Bug #18：相似度矩阵构建没有分批读取**

文件：`src/discovery/similarity-matrix.ts`，第 156-163 行

```typescript
await Promise.all(
  files.slice(0, 500).map(async file => {
    const raw = await vault.read(file);
    ...
  })
);
```

一次性并发读取最多 500 个文件的全部内容到内存中。而 `deduplicator.ts` 中的 `checkAgainstVault` 使用了 `DEDUP_BATCH_SIZE` 分批读取。这里的发现模块没有做分批处理，在大型知识库中可能导致内存飙升。

---

### 六、其他问题

**Bug #19：`extractor.ts` 中 `content` 变量名遮蔽**

文件：`src/extractor.ts`，第 174 行

```typescript
const content = response.json?.choices?.[0]?.message?.content;
```

这个 `content` 变量与外层函数的参数 `content: string` 同名，形成变量遮蔽（shadowing）。虽然在当前代码结构中不会导致逻辑错误（因为外层 `content` 在此之后不再被使用），但会降低代码可读性，增加后续维护中的出错风险。

**Bug #20：`extraction-prompt.ts` 与 `tag-preferences.ts` 存在重复实现**

两个文件各自定义了一个 `buildExtractionPrompt()` 函数和一份 system prompt 常量。`extraction-prompt.ts` 标注了 `@deprecated`，但仍然存在且可能被意外引用。两份实现的截断长度不同（一个硬编码 10000，一个用 `INPUT_TRUNCATE_LENGTH` 常量），标准数量也不同（5 条 vs 6 条）。

**Bug #21：`tsconfig.json` 使用了已废弃的编译器选项**

文件：`tsconfig.json`，第 21 行

```json
"suppressImplicitAnyIndexErrors": true
```

此选项在 TypeScript 5.0 中已被移除。项目依赖 `typescript: ^5.0.0`，使用此选项会导致编译警告或错误。

**Bug #22：`getLeaf('split', 'vertical')` 的 API 签名可能不正确**

文件：`src/main.ts`，第 105 行

```typescript
const leaf = this.app.workspace.getLeaf('split', 'vertical');
```

Obsidian 的 `Workspace.getLeaf()` 方法签名通常为 `getLeaf(newLeaf?: boolean | 'split' | 'tab' | 'window')`，只接受一个参数。传入 `'vertical'` 作为第二个参数会被忽略，分裂方向由 Obsidian 自行决定，可能不是预期的垂直分裂。

---

### 汇总

| 类别 | 数量 | 严重程度 |
|---|---|---|
| 运行时崩溃（Critical） | 3 | 编译失败或直接报错 |
| 功能未接入（Major） | 5 | 完整模块无法生效 |
| 数据损坏风险 | 3 | 生成错误文件/数据 |
| 逻辑错误 | 5 | 功能行为与预期不符 |
| 性能问题 | 2 | 大数据量下可能卡死 |
| 其他（代码质量） | 4 | 维护性和兼容性风险 |
| **合计** | **22** | |

其中 Bug #1（`SYSTEM_PROMPT` 未定义）是最紧急的问题，直接导致插件的核心提炼功能完全无法工作。
