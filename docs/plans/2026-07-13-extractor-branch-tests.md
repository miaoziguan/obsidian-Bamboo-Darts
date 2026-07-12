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

### Task 5：超时 Promise 分支（调整为设计改进项，非单测）
- 发现：EXTRACTION_TIMEOUT_MS=5min 为硬编码常量，runExtraction 不读 config 超时，
  单测无法在合理时间内驱动 timeoutPromise resolve 分支。
- 结论：本分支不可单测，记为 P2 设计改进项「超时时长可配置/可注入」，P1-2 不覆盖。
- 现有 extractor.test.ts 已覆盖「预 abort 立即返回」的取消路径，超时语义部分被间接覆盖。

### Task 6：全量验证 + commit
- npm test 全绿、npm run lint 无新增、覆盖率达标。
- commit。

## 执行模式
手动 TDD（本会话）。每任务完成即 commit。
