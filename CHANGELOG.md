# Bamboo Darts 更新日志

## v1.3.6 (2026-06-22)

### 语义去重逻辑优化

- **修复本地与语义结果合并逻辑**：改为「本地快筛 + 向量精判 独立并行，取最高相似度」
  - 修复前：语义结果只在「本地无匹配」时才补充，导致语义高相似度（如 0.92）被本地低相似度（如 0.30）覆盖
  - 修复后：本地和语义独立计算，最终相似度 = `max(本地相似度, 语义相似度)`
- **新增「本地 X% / 语义 Y%」分解展示**
  - 去重报告（`renderDedupReport`）：显示 `相似度：85%（本地 75% / 语义 92%）`
  - 疑似重复面板（`renderPendingDuplicates`）：分别显示本地和语义相似度
- **类型定义补齐**：`DuplicateInfo`、`VaultMatchInfo`、`PendingDuplicate` 新增 `localSimilarity` 字段

### 涉及文件

- `src/deduplicator.ts`：合并逻辑改为取 max；类型加 `localSimilarity`
- `src/extractor.ts`：`PendingDuplicate` 加 `localSimilarity`；三处传参补齐
- `src/ui/result-modal.ts`：去重报告和疑似重复面板都显示分解

---

## v1.3.5 (2026-06-22)

### Bug 修复

- 修复 `defaultDedupCache is not defined` 运行时错误（`deduplicator.ts` 导出方式导致 esbuild tree-shaking 后变量丢失）
  - 改用 `export function getDefaultDedupCache()` 懒初始化单例模式
  - 涉及文件：`src/deduplicator.ts`、`src/extractor.ts`

### 功能优化

- 更新介绍面板（About Panel）Phase 4b 描述，补充语义去重（Beta）说明
  - 涉及文件：`src/ui/about-content.ts`

---

## v1.3.4 (2026-06-22)

### 语义去重（Beta）

- 新增**语义去重**功能（设置页「语义去重（Beta）」区块）
- 接入腾讯混元 `hunyuan-embedding` 向量模型，对「可疑重复」笔记做语义精判
- 本地算法（BM25 + SimHash）快筛 → 只有可疑重复才调用向量模型，节省 API 消耗
- 语义相似度与本地相似度并列展示：结果显示「本地 X% / 语义 Y%」
- 支持「预构建向量索引」按钮，一次性为全库笔记构建向量缓存
- 向量缓存持久化到 `.obsidian/plugins/atomic-notes-extractor/vectors.json`，避免重复调用
- 新增「清空语义缓存」按钮，可手动清理本地向量缓存
- API 调用带指数退避重试（最多 2 次），提高网络波动时的稳定性
- 自动清理失效缓存条目（笔记删除后对应的向量自动清除）
- 并发保护：`_isBuildingIndex` 标志防止提炼与建索引同时操作
- 新增设置项：语义去重开关、API Key、API URL、相似度阈值滑块

### Bug 修复

- 修复 `rebuildVectorIndex` 过滤逻辑错误（`startsWith` 误匹配子路径）
- 修复 `targetFolder` 未考虑 `dedupTargetFolder` 导致语义去重扫描范围错误
- 修复 `isPathInFolder` 未导出导致动态加载报错
- 修复语义相似度直接覆盖本地综合评分（不同尺度）导致结果异常

---

## v1.3.2 (2026-06-21)

### 去重算法升级
- TF → BM25 饱和词频：高频术语权重自动打折，解决术语污染误判
- 中文正向最大匹配分词：200+ 词汇词典，字符 n-gram + 词汇 token 双轨并行
- SimHash 64 位指纹预过滤：库内去重汉明距离 < 3 候选，比对量降 10-50 倍
- 综合评分：内容余弦 ×0.5 + 关键词 Jaccard ×0.3 + 标题 Jaccard ×0.2
- 短笔记编辑距离兜底：< 100 字用 Levenshtein 判重

### 复查评分重设计
- 砍掉溯源可信度维度，洞见价值 + 知识价值直加（2-10）
- 四级等级制：差(2-3)、中(4-5)、良(6-7)、优(8-10)
- 复查评分表默认折叠；笔记送 500 字完整内容参与评分

### URL 提取器全面强化
- 噪声选择器从 28 扩至 80+，覆盖导航/广告/推荐/社交/版权/元数据/隐藏元素
- HTML 注释剥离 + 完整实体解码；URL 提取结果缓存 1 小时

### 全管线优化
- 核查 Layer 2 改用截断文本发送，Layer 1 保留全文溯源
- 深度模式进度接入主 ProgressTracker
- 提炼整体超时保护：普通模式 5 分钟，深度模式 10 分钟
- 结果弹窗新增筛选和标题搜索；编辑笔记自动清空失效核查数据
- 门控警告累积 ≥3 条自动升级为阻断

### 模型与设置
- 默认模型统一为 `deepseek-v4-flash`
- API Key 和 API URL 旁新增「获取 Key」按钮直达 DeepSeek 官网

### 工程改进
- `extractAtomicNotes` 独立为 `extraction/ai-extractor.ts`
- 内联 Modal 提取到 `ui/aux-modals.ts`；介绍面板解除 max-height 截断
- 删除死代码 `gate/duplicate.ts` 及 12 项死常量/死变量
- SimHash 64 位 BigInt 重写，修复 hammingDistance 32 位截断 bug
- `any` 类型清理，静默 catch 补 `console.error`

### Bug 修复
- 修复 `extractAtomicNotes` 内 `truncateLength` 未定义
- 修复 Phase 2 进度信息残留和复查评分表标题 (未知)
- 修复发现面板高度截断导致搜索下拉裁剪

---

## v1.3.1 (2026-06-21)

- API Key 改为密码框
- 命令模式加取消按钮
- Ribbon 图标智能切换：有选中文本时直接提炼，无选中时打开面板
- 重复提炼改确认框（二次确认+查看上次结果）
- 复查设置折叠：关闭复查时隐藏相关字段
- 历史删除加确认（单条二次点击，清空弹确认框）
- 结果弹窗加筛选和搜索
- URL 格式校验（http/https 协议）
- 阈值改滑块，测试连接增强
- 发现面板矩阵缓存

---

## v1.3.0 (2026-06)

- 笔记复查评分（Phase 6，AI 二次评分）
- 深度提炼模式（超长文本自动分段提炼）
- 输入截断长度自定义
- URL 内容提取缓存
- About 面板重新设计

---

## v1.2.x (2026-05 ~ 2026-06)

- 内容核查三层管线（Phase 5）：原文溯源 / 语义比对 / 超源标记
- Profile 内容分类与差异化策略（技术文献 / 通用文章 / 观点评论）
- 强制提炼机制（门控失败后可跳过）
- 知识库去重（Phase 4b）
- 同批交叉去重（Phase 4）
- 文件拖拽导入（.md / .txt）
- 关联推荐（发现面板）
- 历史记录面板
- 反向链接自动创建

---

## v1.1.x (2026-04 ~ 2026-05)

- 多输入模式（面板、命令、右键菜单）
- 质量门控（9 层规则）
- AI 提炼调用 DeepSeek API
- 自定义存储文件夹和文件名模板
- 标签偏好设置
- 自动保存选项

---

## v1.0.x (2026-03 ~ 2026-04)

- 初始版本
- 从选中文本 / URL 提炼原子笔记
- 基本 AI 提炼流程
- DeepSeek API 集成

