# 复盘改进计划（2026-07-14）

> 基于全面代码探索（16488 行 src / 8215 行 tests）得出的改进清单。
> 原则：**谨慎、不过度工程、每项改完跑回归、删死代码、查 bug**。

## 项目现状基线

- 工程化良好：ESLint 0 warning、Vitest 覆盖率门禁（行 82/分支 80/函数 80）、CI 完整。
- 核心逻辑层（extractor / gate / storage / dedup）测试充分，死代码已清理。
- 主要薄弱区：UI 层零单测、构建配置重复、少量文档/版本号陈旧。

## 本次执行项（低风险、有确凿证据）

### 1. sync.sh 去重 external 列表（DRY 违反）
- 证据：`sync.sh:64-83` 在 dev 模式手写了一份与 `esbuild.config.mjs:18-52` 几乎相同的 `--external` 列表（含全部 @codemirror/*）。两处需手动同步，易漂移。
- 改法：dev 模式直接调用 `node esbuild.config.mjs dev`（该配置 dev 模式已用 `sourcemap: inline` 且 `minify: false`，等价）。删除 `sync.sh` 中 `npx esbuild ...` 手写块。
- 验证：`bash sync.sh --dev` 仍产出具 sourcemap 的 `main.js`。

### 2. README 同步测试数 + 补开发章节
- 证据：`README.md:169` 写 "414 个测试"，实际运行 `npm test` 为 627 个测试。
- 改法：测试数改为 455；末尾补充「本地开发」章节（dev/build/test/lint/gate 命令）。

### 3. CHANGELOG v2.1.8 补实质变更
- 证据：`CHANGELOG.md:3-7` 仅写"重新编译/同步版本号"，信息过薄。
- 改法：补充 2.1.8 真实变更（版本号升级、正式版重编译、三处版本文件同步）。

### 4. docs/dead-code-audit 标注已修复
- 证据：探索确认审计文档列的问题（saveNote / StorageConfig / 死导出 / Jaccard 重复等）均已修复，但文档未标注状态，易误导。
- 改法：文档顶部加「修订状态：所列问题已于 v2.0.0/v2.1.7 间全部修复」。

### 5. package-lock.json version 同步
- 证据：`package-lock.json:3` 为 `1.3.8`，而 `package.json` 已是 `2.1.8`（陈旧）。
- 改法：仅修正 lock 顶层 `version` 字段为 `2.1.8`（不重生成 lock，避免大 diff）。

## 跑回归
- `npm run gate`（lint:gate + test:coverage）确认无破坏。
- `bash sync.sh --dev` 确认编译链路正常。

## 已核实但**不改动**的项（避免过度工程 / 行为风险，留给用户决策）

| 项 | 核实结论 | 处理方式 |
|----|---------|---------|
| UI 层零单测（setting-tab.ts 36KB 等 12 文件） | `vitest.config.ts:14-18` exclude；加完整 UI 测试是大型工程 | 不擅自解除 exclude（会拉低覆盖率致 gate 失败）；列为后续专项 |
| `@deprecated newNoteIndex` 仍在活跃使用 | `src/extractor.ts:161,176,968` + UI 层 `:297,307,312,319` 均用下标引用，且有 `idToIndex` 双向映射 | 属未完成迁移，直接删会破坏功能；需设计型重构，留给用户拍板 |
| index-manager 临时重试无日志 | **核实：实际已有成功 warn + 失败 error/log（`index-manager.ts:149-153`）**，探索报告此条为误报 | 不改 |
| 依赖升级（ESLint 9 / Vitest ≥1.x） | 有破坏风险的中型工程 | 不主动升级，仅标注 |
| prettier `^3.8.4` 版本号存疑 | 不确认是否真实存在；升级会触发大量格式 diff | 不升级，仅标注观察 |
| CI Node 20 vs Release Node 22 | 低优先级环境漂移 | 标注，不改 |
| Release 未校验 main.js 为本次构建产出 | 低优先级隐患 | 标注，不改 |
