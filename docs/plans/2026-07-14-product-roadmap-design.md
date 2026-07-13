# Bamboo Darts 产品路线图实现设计

> 日期：2026-07-14
> 来源：`docs/product-analysis/ROADMAP.md`
> 流程：superpowers（Brainstorm → Plan → TDD Build）
> 范围决策（已与用户确认）：6 项全做；存储层**先补 UI 单测再迁移**；移动端**最小可用（命令收敛 + 响应式）**

---

## 总体依赖顺序

```
[1+3] Onboarding + 零配置引导  ──┐
[4] README 锚点重写             ──┤ 低风险，可并行
[5a] 贡献者指引 + Issue/PR 模板 ──┘
[2] 移动端最小可用             ── 独立，命令收敛 + 响应式 CSS
[5b] UI 单测（pending 路径）   ── 必须先于 [6]
[6] 存储层 newNoteIndex→noteId  ── 依赖 [5b] 的测试保障
```

TDD 约束：每个任务 = 写失败测试 → 实现 → 测试通过 → commit。

---

## 项 1+3：Onboarding 首启引导 + 零配置闭环

### 现状
- `DEFAULT_SETTINGS`（`src/ui/setting-tab.ts:99-148`）已含 endpoint/model/温度/嵌入模型默认值，**仅 `deepseekApiKey: ''` 必需无默认**。
- 缺 Key 时提炼报错（`src/services/extraction-service.ts:133`、`setting-tab.ts:929`）。
- 无首启引导（`src/main.ts:66` onload 无 firstRun 检测）。
- 已有被动式 AboutTab（`src/ui/tabs/about-tab.ts`、内容 `src/ui/about-content.ts`）可复用为引导素材。

### 设计
1. **firstRun 标记**：在 `PluginSettings` 增加 `firstRun: boolean`（默认 true），`loadSettings` 合并后若为 true，触发引导并置 false 保存。
2. **首启 Notice**：`onload` 末尾，若 `firstRun`，弹欢迎 Notice（"欢迎使用竹叶飞刃，先到设置填 DeepSeek API Key 即可开始"），并 `openSettingTab()`。
3. **零配置闭环**：设置页 API Key 输入框下方加一行提示 + "去 DeepSeek 控制台获取" 链接；其余参数已默认，无需改动。
4. **复用 AboutTab**：首启 Notice 可选带"查看设计理念"按钮跳转 AboutTab。

### 验收
- 全新安装首次加载弹欢迎 Notice；再次加载不弹。
- 填 Key 后直接点命令能跑通（其余参数用默认）。
- 现有 627 测试不受影响。

---

## 项 2：移动端最小可用

### 现状
- 全局 0 处 `isMobile`/`Platform.isMobile` 判断（`code-explorer` 确认）。
- 6 个命令含 4 个面板位置命令（左/右/分屏/新标签页），移动端无侧栏概念，这些命令在手机上无意义甚至报错风险。
- 设置页 36KB、Modal 用内联 style，无响应式。

### 设计
1. **命令收敛**：`src/main.ts:174-194` 的 4 个面板位置命令，移动端（`Platform.isMobile`）只注册 `open-panel-tab`（新标签页，移动端唯一合理形式）；桌面端全注册。提炼类命令（selection/url/clipboard）两端都保留。
2. **Ribbon**：移动端 ribbon 行为同桌面（有选中→提炼，无→打开面板以 tab 形式），无需特殊处理，仅确保 `openPanelAt('tab')` 在移动端正确。
3. **响应式 CSS**：在 `styles.css` 增加媒体查询（`@media (max-width: 768px)`），对设置页与 Modal 的长文本输入、按钮做最小适配（不重做布局，仅保证不溢出、可点）。
4. **不补移动端单测**（环境限制），靠 `npm run build` 通过 + 手动 Obsidian 移动端验证。

### 验收
- `npm run build` 通过，无新增 lint 告警。
- 移动端：提炼类命令可用，面板以新标签页打开，设置页不溢出。

---

## 项 4：README 锚点重写

### 现状
- `README.md:1-3` 已有标题 + 一句话锚点（"AI 提炼原子笔记，过滤信息垃圾…"）+ 双语锚点（:5）。基础好。

### 设计
1. **强化一句话锚点**：第 3 行改为更吸睛的电梯陈述，建议："把读过的变成自己的原子笔记——本地运行，隐私不出本机。"
2. **30 秒上手 3 步**：在功能清单前插入：`安装 → 设置里填 DeepSeek API Key → 选中文本右键"提炼原子笔记"`。
3. 其余结构保留。

### 验收
- README 开头更抓人，含 3 步上手。纯文档，零风险。

---

## 项 5a：贡献者指引 + Issue/PR 模板

### 设计
1. 新增 `CONTRIBUTING.md`：开发环境（npm install/dev/build/test/lint/gate）、分支约定、提交规范、测试要求（覆盖率门槛）。
2. 新增 `.github/ISSUE_TEMPLATE/bug_report.md` + `feature_request.md`。
3. 新增 `.github/PULL_REQUEST_TEMPLATE.md`。

### 验收
- 三个文件存在且内容合理。

---

## 项 5b：UI 单测（pending 路径）— 存储层迁移的前置

### 现状
- `vitest.config.ts:14-18` 排除 `src/ui/**`；`src/ui/result-view-model.ts` 已有 `tests/result-view-model.test.ts`（用 `makePending({ newNoteIndex })`）。
- pending 保留/丢弃逻辑在 `result-view-model.ts:287-315`（`keepAllPending`/`discardAllPending`/`discardPendingNote`/`getSelectedNotes`），UI 消费在 `result-modal.ts:312/319`。

### 设计
1. **解除 exclude 的精确范围**：把 `vitest.config.ts` 的 exclude 从 `'src/ui/**'` 改为仅排除尚未测的 UI 文件，放开 `src/ui/result-view-model.ts`。即 exclude 改为：
   ```
   'src/main.ts', 'src/ui/setting-tab.ts', 'src/ui/panel-view.ts',
   'src/ui/result-modal.ts', 'src/ui/tabs/**', 'src/ui/aux-modals.ts',
   'src/ui/result/notes-list.ts', 'src/ui/result/result-report.ts',
   'src/ui/result-view-model.ts' 之外的 ui 文件...
   ```
   更稳妥做法：exclude 用否定——保留排除列表但**显式 include** `result-view-model.ts` 进覆盖率。实际用 vitest 的 `exclude` 不支持否定，故改为列举式排除（列出除 result-view-model.ts 外的所有 ui 文件）。
2. **扩充 result-view-model 单测**：覆盖 `keepAllPending`/`discardAllPending`/`discardPendingNote`/`getSelectedNotes`，断言 `selectedNotes` 集合内容（目前基于 `newNoteIndex`）。
3. **为 result-modal 的 keep/discard 回调补测试**（需 mock vm），确保迁移前已有回归网。

### 验收
- `npm run test:coverage` 通过，`result-view-model.ts` 覆盖率达标且不拉低整体门槛。

---

## 项 6：存储层 newNoteIndex → noteId 迁移

### 现状（高风险，必须先有 5b 测试网）
- `newNoteIndex` 定义：`src/extractor.ts:656-657`（`@deprecated`），替代字段 `noteId`（:659）已存在。
- 写入：`extractor.ts:161,176`（`newNoteIndex: info.noteIndex`）；`:70` `remapPendingDuplicates` 用 `noteId` 回填。
- 读取：`extractor.ts:968`（`noteIndex: p.newNoteIndex` 构造 duplicateHints）；`result-view-model.ts:297,307`（keep/all 用 `item.newNoteIndex`）；`result-modal.ts:312,319`（keep/discard 用 `item.newNoteIndex`）。
- `selectedNotes` 是 `Set<number>`（:288,297,307 当下标）；`getSelectedNotes()`（:314）用 `this.notes.filter((_, i) => this.selectedNotes.has(i))`。
- 测试：`tests/result-view-model.test.ts:33,479-481` 用 `newNoteIndex`。

### 设计（TDD，基于 5b 测试网）
1. **改消费端用 noteId**：
   - `result-view-model.ts`：`selectedNotes` 改为 `Set<string>`（存 noteId）；`keepAllPending`/`discardAllPending`/`discardPendingNote` 用 `item.noteId`；`getSelectedNotes()` 改为 `this.notes.filter(n => this.selectedNotes.has(n.id))`。
   - `result-modal.ts:312,319`：传 `item.noteId`。
2. **改 extractor 派生 hint**：`extractor.ts:968` 改用 `p.noteId`（或保留 `noteIndex` 字段但由 noteId 映射——最简是 `duplicateHints` 直接用 `noteId`）。
3. **删 newNoteIndex 字段**：从 `PendingDuplicate` 类型（extractor.ts:656）删除；同步删 `extractor.ts:161,176` 的赋值；`remapPendingDuplicates`（:70）简化。
4. **更新测试**：`tests/result-view-model.test.ts` 的 `makePending` 去掉 `newNoteIndex`，改断言 `noteId` 集合。

### 验收
- 全部测试通过（含 5b 扩充的 pending 路径）。
- `npm run gate` 绿（lint 零告警 + 覆盖率达标）。
- 手动验证：提炼含疑似重复的文本 → 面板"保留/丢弃"交互正常。

---

## 任务拆分（Phase 2 输出，供 Phase 3 执行）

| # | 任务 | 类型 | 预计 |
|---|------|------|------|
| T1 | 项1+3：firstRun 标记 + 首启 Notice + 设置页 Key 提示 | 功能 | 中 |
| T2 | 项4：README 锚点 + 3 步上手 | 文档 | 低 |
| T3 | 项5a：CONTRIBUTING + Issue/PR 模板 | 文档 | 低 |
| T4 | 项2：移动端命令收敛 + 响应式 CSS | 功能 | 中 |
| T5 | 项5b：解除 UI exclude（仅 result-view-model）+ 扩充 pending 单测 | 测试 | 中 |
| T6 | 项6：newNoteIndex→noteId 迁移（TDD，依赖 T5） | 重构 | 中高 |
| T7 | 回归：npm run gate + build + sync 验证 | 验证 | — |

每任务 TDD：红 → 绿 → commit。

---

## 不做（YAGNI）
- 不重做移动端 UI（仅命令收敛 + 响应式）。
- 不做多模型路由 / 图谱化（阶段三尾部再定）。
- 不补移动端单测（环境限制，靠 build + 手动验证）。
- 不碰"上传云端"类功能（与隐私卖点矛盾）。
