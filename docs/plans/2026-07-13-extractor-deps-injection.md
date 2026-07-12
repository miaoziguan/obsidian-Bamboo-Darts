# 实施计划：extractor 编排层依赖注入（P1-1）

日期：2026-07-13
设计文档：docs/plans/2026-07-13-extractor-deps-injection-design.md

遵循 superpowers TDD：每个任务 = 写失败测试 → 看失败 → 实现 → 看通过 → commit。

## 任务列表

### Task 1：定义 ExtractionDeps 类型并挂载到 ExtractorConfig
- 新建 `src/extraction/deps.ts`，导出 `ExtractionDeps` 接口（6 个下游函数 + 3 个纯函数）。
- 在 `extractor.ts` 中 `import type { ExtractionDeps }`，给 `ExtractorConfig` 加 `deps?: Partial<ExtractionDeps>`。
- **TDD**：写 `tests/extractor-di.test.ts`，用例「deps 字段存在且为可选，不影响默认调用」→ 先写测试（此时 deps 未生效，测试预期 DI 冒烟通过）→ 实现后通过。
- 验收：`tsc`/lint 无错，`ExtractorConfig` 含 `deps`。

### Task 2：Phase 3 / 3-深度 调用点经 deps 解析
- 顶部保存真实实现常量 `realExtractAtomicNotes`、`realExtractChunked`。
- `runExtractionPhases` 中两处改为 `config.deps?.extractAtomicNotes ?? realExtractAtomicNotes` 等。
- **TDD**：测试「注入 fake extractAtomicNotes 返回 2 条笔记 → 管线 success 且 notes 来自注入」。
- 验收：测试通过，且未注入时现有测试仍绿。

### Task 3：Phase 4 / 4b 调用点经 deps 解析
- 保存 `realCrossCheckBatch`、`realCheckAgainstVaultDetailed`。
- 改造 `runVaultDedupPhase` 与 `runExtractionPhases` 内调用。
- **TDD**：测试「注入 fake crossCheckBatch 返回过滤后 0 条 → 管线返回未提炼出笔记 error」。
- 验收：通过。

### Task 4：Phase 5 / 6 调用点经 deps 解析
- 保存 `realVerifyClaims`、`realReviewNotes`。
- 改造 `runFactCheckPhase`、`runReviewPhase` 内调用。
- **TDD**：测试「注入 fake reviewNotes 过滤 1 条 → vaultDedupPending 经 remap 重映射；注入 fake verifyClaims verifiedOnly 过滤超源」。
- 验收：通过。

### Task 5：全量验证 + 脚手架冒烟固化
- 运行 `npm test`（全绿，≥414）、`npm run lint`（无新增告警）。
- 固化 `tests/extractor-di.test.ts` 至少含：DI 冒烟（注入路径生效）、未注入回退真实路径。
- commit。

## 执行模式
手动执行（本会话内逐任务 TDD）。每任务完成即 commit。

## 完成标准
- ExtractorConfig.deps 可用，6 个下游 + 3 个纯函数可注入。
- 未注入行为与改造前字节级等价（全量测试绿）。
- 脚手架测试文件就位，P1-2 可直接复用。
