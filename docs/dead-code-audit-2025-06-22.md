# Bamboo Darts 死代码审计报告

> 日期：2025-06-22
> 审计范围：`src/` 下所有 40 个 TypeScript 源文件
> 方法：全量 import/export 交叉引用 + 内部调用链分析

> **修订状态（2026-07-14）**：本报告所列问题（saveNote 死函数、StorageConfig 死导出、gate ok/warn/block 死导出、Jaccard 重复逻辑、isSemanticDedupEnabled 死导入、ExtractorConfig 幽灵字段等）均已在 v2.0.0 ~ v2.1.7 期间通过死代码清理提交修复。以下条目仅作历史留档，不再反映当前代码状态。

---

## 一、确认死代码

### 1. `src/storage.ts` — `saveNote` 函数（63 行）🔴 高优先级

**位置**：第 113-162 行
**严重程度**：🔴 死函数，完全不可达

```typescript
async function saveNote(app, note, config) { ... } // 63 行代码
```

**原因**：未 export（是内部函数），且在整个代码库中没有任何调用点。已被 `saveNotes`（批量存储）完全替代。`saveNotes` 在第 208-243 行实现了相同的逐条存储逻辑但更优化（预获取已存在文件列表）。

**影响**：零功能影响，纯代码膨胀。

### 2. `src/storage.ts` — `StorageConfig` 接口 🔴 死导出

**位置**：第 10 行
**严重程度**：🔴 导出但零引用

```typescript
export interface StorageConfig { ... }
```

**原因**：被 export，但在 `src/` 下没有任何文件 import 它。仅在 `storage.ts` 内部定义 `DEFAULT_CONFIG` 和函数参数类型时使用。

### 3. `src/storage.ts` — 4 个仅用于测试的导出 🟡 低优先级

| 导出 | 行号 | 说明 |
|------|------|------|
| `generateFileName` | 33 | 仅内部使用 + 测试文件引用 |
| `sanitizeFileName` | 56 | 仅内部使用 + 测试文件引用 |
| `escapeYamlValue` | 67 | 仅内部使用 + 测试文件引用 |
| `formatNoteAsMarkdown` | 80 | 仅内部使用 + 测试文件引用 |

**原因**：生产代码中无人直接 import 这些函数，它们都由 `saveNotes` 内部调用。建议加 `@internal` 注释或拆分测试辅助模块。

### 4. `src/gate/noise.ts` — `isNoise` 函数 🟡 死导出

**位置**：第 29 行

```typescript
export function isNoise(ch: string): boolean { ... }
```

**原因**：被 export，但整个代码库中没有任何文件 import 它。仅被 `noise.ts` 内部的 `checkNoiseRatio` 调用。

### 5. `src/gate/types.ts` — `ok()`, `warn()`, `block()` 3 个工厂函数 🟡 死导出

**位置**：第 17-27 行

**原因**：export 了 3 个构造函数，但只被 gate 模块内部（length.ts、html.ts、density.ts 等）使用，外部无任何引用。如果 gate 模块对外只暴露 `runGateChecks` 和 `GateCheckResult`，这 3 个工厂不应 export。

### 6. `src/extractor.ts` — `isSemanticDedupEnabled` 死导入 🟡

**位置**：第 15 行

```typescript
import { SemanticDedupManager, isSemanticDedupEnabled } from './utils/embedding';
```

**原因**：`isSemanticDedupEnabled` 被 import 到 extractor.ts，但在整个 `src/` 中零调用。extractor.ts 实际直接检查 `settings.enableSemanticDedup && settings.hunyuanApiKey`，并未使用这个工具函数。它只被定义（embedding.ts:384）和 import（extractor.ts:15），从未执行。

---

## 二、重复逻辑（技术债，非严格死代码）

### 7. `src/discovery/keywords.ts` — 3 行薄封装 🟢

```typescript
export function extractKeywords(text: string): Set<string> {
  return extractKeywordSet(text);
}
```

**调用链**：
```
panel-view.ts → similarity-matrix.ts → discovery/keywords.ts → utils/tokenizer.ts
```

`extractKeywords` 只是 `extractKeywordSet` 的别名，无任何附加逻辑。建议删除 keywords.ts，让 similarity-matrix.ts 直接 import `extractKeywordSet`。

### 8. Jaccard 相似度重复实现 🟢

**位置 A**：`src/deduplicator.ts:264` — `jaccardSimilarity(a, b)`
**位置 B**：`src/discovery/similarity-matrix.ts:58` — `jaccardSim(setA, setB)`

两处实现完全相同的算法（交集/并集），只是函数签名不同：
- A 接受 `Set<string> | string[]`
- B 接受 `Set<string>`

都是私有函数（未 export），不造成外部死代码，但构成维护负担。

---

## 三、配置问题（潜在 bug）

### 9. `src/extractor.ts` DEFAULT_CONFIG 中的幽灵字段 🟡

**位置**：第 297-301 行

```typescript
const DEFAULT_CONFIG: ExtractorConfig = {
  // ... 其他字段 ...
  enableSemanticDedup: false,      // ❌ 不在 ExtractorConfig 接口中
  hunyuanApiKey: '',               // ❌ 不在接口中
  hunyuanApiUrl: '',               // ❌ 不在接口中
  semanticSimilarityThreshold: 0.82, // ❌ 不在接口中
};
```

`DEFAULT_CONFIG` 的类型标注是 `ExtractorConfig`，但 TypeScript 的 `...` 展开会将这 4 个额外属性注入对象，类型检查却不会报错（结构性类型兼容）。在实际使用中 `main.ts` 未通过 `ExtractorConfig` 传递这些值，语义去重配置通过独立路径管理。

建议：删除这 4 行，或把它们加入 `ExtractorConfig` 接口。

---

## 四、统计总览

| 类别 | 数量 | 估计行数 |
|------|------|----------|
| 🔴 死代码（函数/接口） | 2 | ~70 |
| 🟡 死导出（仅测试/内部使用） | 9 | ~10（定义行） |
| 🟡 死导入 | 1 | ~0 |
| 🟢 重复逻辑 | 2 | ~20 |
| 🟡 配置问题 | 1 | ~4 |
| **合计影响** | **15** | **~104** |

占总源码行数的 < 3%，但清理后可提升代码可读性。

---

## 五、清理建议

### 立即执行（低风险，高收益）

1. **删除 `storage.ts` 的 `saveNote` 函数**（第 113-162 行，共 50+ 行代码）
2. **删除 `extractor.ts` 的 `isSemanticDedupEnabled` 导入**
3. **清理 `extractor.ts` DEFAULT_CONFIG 中的 4 个幽灵字段**

### 可执行（需验证测试）

4. **合并 `discovery/keywords.ts`** → 删除文件，让 `similarity-matrix.ts` 直接 import `extractKeywordSet`
5. **提取共享 Jaccard 函数** → 放到 `utils/` 下，两个模块共用

### 可选（低优先级）

6. **清理 `storage.ts` 的 4 个测试用导出** → 拆分为 `storage.ts` + `storage-internals.ts`（仅测试 import）
7. **清理 `gate/types.ts` 的 `ok/warn/block` 导出** → 取消 export，改为模块内部使用
8. **清理 `gate/noise.ts` 的 `isNoise` 导出** → 取消 export
