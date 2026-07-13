# 实施计划：extractor 编排层全分支补测（P1-2）

日期：2026-07-13
依赖：docs/plans/2026-07-13-extractor-deps-injection-design.md（DI 脚手架已落地）
目标：将 extractor.ts 行覆盖 70%→82%、分支 51%→80%（达成复盘 P1 门槛）

TDD：每个任务先写失败测试 → 看失败 → （若只需测试无需改生产代码则直接绿）→ commit。

## 当前未覆盖分支（来自覆盖率报告）
- 收尾：vaultDedupResult 更新 uniqueNotes（953-957）、duplicateHints 派生（960-970）
- Phase 4b：高/中相似度 pending 派生（runVaultDedupPhase 内部 matchInfos 分支）
- Phase 5：verifyClaims verifiedOnly 过滤超源
- Phase 1：URL Jina 渲染回退分支（REQuIRES_JS）
- 超时 Promise 分支（runExtraction 的 timeoutPromise resolve）

## 任务列表

### Task 1：duplicateHints 派生 + vaultDedupResult.uniqueNotes 更新
- 注入 fake checkAgainstVaultDetailed 返回 1 条中相似度 matchInfo，fake extractAtomicNotes 返回笔记，fake reviewNotes/verifyClaims 过滤掉 1 条。
- 断言：result.vaultDedupPending 存在、result.duplicateHints 由 pending 派生、result.vaultDedupResult.uniqueNotes 等于最终过滤后 notes。
- 验收：覆盖 952-970。

### Task 2：Phase 4b 高/中相似度 pending 分类
- 注入 fake checkAgainstVaultDetailed 返回 2 条 matchInfo（1 高 ≥highThreshold、1 中 ≥midThreshold）。
- 断言：vaultDedupPending 含 highSimilarity 标记项；result 含高/中相似度统计文案。
- 验收：覆盖 runVaultDedupPhase 内高/中/无匹配三分支。

### Task 3：Phase 5 verifiedOnly 超源过滤
- 注入 fake verifyClaims 返回 outOfScope=1，notes 带 verification=[{status:'超源'}]。
- 断言：result.notes 过滤掉超源项；verificationSummary.outOfScope=1。
- 验收：覆盖 verifiedOnly 过滤 + remapPendingDuplicates 分支。

### Task 4：Phase 1 URL Jina 渲染回退
- 用 spyOn(requestUrl) 模拟主提取 REQUIRES_JS + Jina 成功。
- 断言：result 成功且 content 来自 Jina。
- 验收：覆盖 readContent 的 Jina 分支（此分支非 DI 范畴，用真实 requestUrl spy）。

### Task 5：超时 Promise 分支（P2 已落地：超时可配置/可注入）
- 原结论：EXTRACTION_TIMEOUT_MS=5min 硬编码、runExtraction 不读 config 超时，单测无法驱动。
- P2 改进（已落地）：`ExtractorConfig` 新增可选 `extractionTimeoutMs`；`runExtraction` 优先读取，
  回退 `EXTRACTION_TIMEOUT_MS`；深度模式仍 = 注入值 × 2。
- 单测（tests/extractor-timeout.test.ts，3 用例）：
  - 注入 extrationTimeoutMs:1 + 挂起 AI → 触发 timeoutPromise resolve，返回「超时」且 abort 管线；
  - 深度模式注入 80ms → 实测 ~160ms 超时（证明 ×2）；
  - 不注入 → 回退默认，管线正常走完。
- 覆盖 L720 的 `enableDeepMode ? base*2 : base` 分支及 timeoutPromise resolve 分支。

### Task 6：全量验证 + commit
- npm test 全绿、npm run lint 无新增、覆盖率达标。
- commit。

### Task 7：整体门槛上调 + lint 清零 + P2-1/3/4（后续轮次）
- 整体分支门槛 `thresholds.branches` 75 → **80**（vitest.config.ts）。extractor.ts 已 85.31% 达标。
- 治理预存 53 个 lint warning（no-useless-escape / no-unused-vars / no-explicit-any / prefer-const），全部清零。
- P2-3 门禁零告警：package.json 新增 `lint:gate`（`--max-warnings 0`）与 `gate`（`lint:gate && test:coverage`）。
- P2-4 段落重复率检测：`src/gate/paragraph-repetition.ts` 新增段落级 Jaccard 规则，`runGateChecks` 接入，ProfileConfig 加 `gateParagraphRepBlock/Warn`；测试 `tests/paragraph-repetition.test.ts`（11 用例）。
- P2-1 UI 冒烟测试：`tests/ui-smoke.test.ts`（5 用例），fake DOM 驱动 `renderNotesList` / `ResultModal.onOpen`。
- 最终：测试 455 全绿；整体行 90.03% / 分支 80.39%（≥80%）/ 函数 86.4%；lint 0 warning；阈值门禁通过。

## 执行模式
手动 TDD（本会话）。每任务完成即 commit。
