# 设计文档：extractor 编排层依赖注入（DI）脚手架

日期：2026-07-13
作者：AI 助手（superpowers 管线）
关联：复盘与改进计划-2026-07-13.md — P1-1

## 1. 背景与目标

### 1.1 现状问题
`src/extractor.ts` 是提炼管线的**编排层**（Phase 1-6），但当前覆盖率仅 52.87% 行 / 33.78% 分支。
根因：`runExtractionPhases` 内 Phase 3-6（AI 提炼、交叉去重、知识库去重、内容核查、笔记复查）
全部是**静态 import 的真实模块**。现有测试（tests/extractor.test.ts）只覆盖了 Phase 1/2/中断/超时，
无法独立驱动这些分支，导致无法在测试中模拟「AI 失败/降级」「复查过滤」「核查超源」等关键场景。

### 1.2 目标
通过**依赖注入**改造 `extractor.ts`，让下游依赖可通过配置注入，从而：
1. 测试可精确控制每个 Phase 的「成功 / 失败 / 降级 / 过滤」分支；
2. 不改动任何生产行为（不注入时行为 100% 不变）；
3. 生产调用方（`extraction-service.ts`）零改动、零风险；
4. 为后续 P1-2（extractor 分支 TDD 补测）提供可复用脚手架。

## 2. 设计决策

### 2.1 用户已选定：方案 B（依赖注入改造，非纯 mock）
理由：生产代码更松耦合、零 mock 框架耦合、长期价值更高。
代价：需改生产接口（范围较大），但改动局限在 `extractor.ts` 内部 + 一个新增可选字段。

### 2.2 注入方式
在 `ExtractorConfig` 增加**可选**字段 `deps?: Partial<ExtractionDeps>`。
所有下游调用改为：
```ts
const fn = config.deps?.extractAtomicNotes ?? realExtractAtomicNotes;
```
- `deps` 为 `undefined` 或未提供某函数 → 使用真实实现（默认路径，向后兼容）。
- 提供某函数 → 使用注入版本（测试专用）。

**为什么用可选 Partial 而不是必填**：保证 `extraction-service.ts` 等现有调用方无需任何改动，
且真实运行路径永远走真实实现，不会因漏配而误用 mock。

## 3. 接口设计

### 3.1 注入依赖类型
新增到 `extractor.ts`（或独立 `src/extraction/deps.ts` 以避循环依赖）：

```ts
export interface ExtractionDeps {
  /** Phase 3：AI 提炼（普通模式） */
  extractAtomicNotes?: (
    content: string,
    config: Partial<ExtractorConfig>,
  ) => Promise<{ success: boolean; notes?: AtomicNote[]; error?: string }>;

  /** Phase 3：深度模式分段提炼 */
  extractChunked?: (
    content: string,
    config: ExtractorConfig,
    truncateLength: number,
    tracker: ProgressTracker,
  ) => Promise<AtomicNote[]>;

  /** Phase 4：同批交叉去重 */
  crossCheckBatch?: (notes: AtomicNote[], threshold?: number) => Promise<DedupResult>;

  /** Phase 4b：知识库去重 */
  checkAgainstVaultDetailed?: (
    vault: Vault,
    notes: AtomicNote[],
    folder: string,
    cache: unknown,
    manager: SemanticDedupManager | undefined,
    onProgress?: unknown,
  ) => Promise<VaultMatchInfo[]>;

  /** Phase 5：内容核查 */
  verifyClaims?: (
    truncatedContent: string,
    notes: AtomicNote[],
    config: unknown,
    fullContent?: string,
  ) => Promise<{ traced: number; needsCompare: number; outOfScope: number; error?: string }>;

  /** Phase 6：笔记复查 */
  reviewNotes?: (notes: AtomicNote[], config: ReviewConfig) => Promise<ReviewResult & { reviewedNotes: AtomicNote[] }>;

  /** 纯函数（Phase 2 / profile）：可选注入以覆盖分类分支 */
  classifyContent?: (text: string) => ContentProfile;
  resolveProfileConfig?: (profile: ContentProfile, overrides?: unknown) => ProfileConfig;
  runGateChecks?: (content: string, profileConfig: ProfileConfig, inputType: string) => { passed: boolean; summary: string; reasons: string[]; warnings: string[] };
}
```

### 3.2 在 ExtractorConfig 上挂载
```ts
export interface ExtractorConfig extends ApiConfig, PipelineRuntime, DedupConfig, ProfileSettings {
  // ... 现有字段 ...
  /** 测试注入点：覆盖下游依赖以驱动编排分支（生产环境不传） */
  deps?: Partial<ExtractionDeps>;
}
```

## 4. 实施要点（防破坏清单）

1. **re-export 不变**：`export { extractAtomicNotes } from './extraction/ai-extractor'`
   必须保留，否则 `chunked-extractor.ts` 的 `import { extractAtomicNotes } from '../extractor'` 断裂。
2. **真实实现引用**：在文件顶部将静态 import 的实现保存为局部常量（如 `const realExtractAtomicNotes = ...`），
   注入层在 `deps` 缺失时回退到这些常量。
3. **调用点改造**：`runExtractionPhases` 内 6 处下游调用改为经 `deps` 解析。
4. **verifyClaims 的 config 参数**：真实调用传 `{ deepseekApiKey, deepseekApiUrl, model, maxTokens, signal }`；
   注入时透传同一对象，类型用 `Pick<ApiConfig,...> & {signal?}` 保持一致。
5. **不注入时行为等价**：通过现有 `tests/extractor.test.ts` 全绿 + 全量 `npm test` 验证。

## 5. 验收标准

- [ ] `ExtractorConfig` 新增 `deps?: Partial<ExtractionDeps>`，类型导出可见。
- [ ] `runExtractionPhases` 的 6 个下游调用点全部经 `deps` 解析，缺失时回退真实实现。
- [ ] `npm test` 全量通过（414 → 不回退），`npm run lint` 无新增告警。
- [ ] 现有 `extraction-service.ts` 调用方无需改动。
- [ ] 新建 `tests/extractor-di.test.ts`（脚手架雏形）：至少 1 个用例验证「注入 fake extractAtomicNotes 后，管线走注入路径并返回注入的笔记」，
      为 P1-2 全分支补测铺路。

## 6. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 循环依赖（chunked-extractor → extractor） | 保留 re-export；deps 类型独立文件，避免 import 真实实现造成环 |
| 真实路径被意外替换 | 仅当 `deps?.xxx` 存在才用注入值，默认永远真实实现 |
| 签名漂移 | deps 类型与真实函数签名对齐；lint + 全量测试兜底 |
| 改动引入回归 | 改造后立即跑全量 test + lint，并补 1 个 DI 冒烟用例 |

## 7. 后续（P1-2，本设计不实现）
基于本脚手架，在 `tests/extractor-di.test.ts` 补齐：
- Phase 3 失败 → 管线返回 error
- Phase 4 交叉去重过滤后为空 → 返回「未提炼出笔记」
- Phase 4b 高/中相似度 pending 派生
- Phase 5 verifiedOnly 过滤超源
- Phase 6 复查过滤低分 + 降级
- 超时 / AbortController 各检查点
