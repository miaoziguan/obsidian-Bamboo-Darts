# Bamboo Darts（竹叶飞刃）

把读过的变成自己的原子笔记——本地运行，隐私不出本机，AI 一键提炼、去重、入库。

[English](#english) | [中文](#中文)

---

## 中文

### 什么是原子笔记？

原子笔记（Atomic Note）是 Obsidian 核心理念之一——每条笔记只记录一个知识点，短小精悍、独立可读、可复用。

本插件帮你把长文、网页、选中文本，用 AI 一键提炼成规范的原子笔记，自动去重后存入你的知识库。

### 30 秒上手

1. **装插件** —— 在 Obsidian 社区插件市场搜索「Bamboo Darts / 竹叶飞刃」并启用。
2. **填 Key** —— 设置里填入 DeepSeek API Key（其余参数已默认，开箱即用；首次启动会自动弹引导）。
3. **提炼** —— 选中一段文本，右键「提炼原子笔记」，AI 即拆出多条原子笔记供你确认入库。

### 功能特性

- ✅ **多种输入方式**：支持 URL、选中文本、剪贴板三种输入
- ✅ **质量门控**：多维度规则前置过滤低质/噪声内容（长度、信息密度、噪声占比、HTML 残留、乱码、链接堆砌、关键词堆砌、低质信号），支持硬阻断 + 软警告 + 累积升级 + 强制提炼
- ✅ **URL 内容提取**：基于 DOMParser + querySelector 精确解析网页，100+ 选择器剥离噪声（导航、广告、评论区、推荐、社交分享等），HTML 实体解码 + 注释清理，URL 提取结果缓存 1 小时
- ✅ **Profile 差异化**：根据内容类型（技术文献/通用文章/观点评论）自动调整门控阈值
- ✅ **强制提炼机制**：门控失败后可选择强制提炼，跳过门控直接处理
- ✅ **AI 提炼**：调用 DeepSeek API，提炼符合五条标准的原子笔记
- ✅ **同批去重**：BM25 + jieba 风格中文分词 + 余弦相似度 + 编辑距离兜底，综合评分自动检测重复笔记
- ✅ **知识库去重**：SimHash 64 位指纹预过滤 + BM25 余弦比对，高效检出库内重复
- ✅ **实时进度反馈**：每一步都显示当前阶段名称、耗时、子进度，可随时取消
- ✅ **灵活存储**：自定义目标文件夹、文件名模板
- ✅ **内容核查**：三层管线逐条核查事实声明和数据准确性（Layer 1 原文溯源零 API → Layer 2 语义比对 AI 辅助，仅发送截断文本 → Layer 3 超源标记），标记为已溯源 / 需对比 / 超源
- ✅ **笔记复查**：AI 二次评分，洞见价值 + 知识价值直加（2-10），差/中/良/优四级，低于策略门槛自动过滤
- ✅ **语义去重（Beta）**：接入腾讯混元向量模型，对可疑重复笔记做语义精判；本地算法快筛 + 向量模型精判，结果展示「本地 X% / 语义 Y%」；支持预构建向量索引和缓存清理
- ✅ **关联推荐**：选中笔记后显示 Top10 相关笔记（知识发现），MMR 多样性重排避免推荐扎堆
- ✅ **发现索引**：自动缓存笔记特征（标题、关键词、内容哈希），发现 Tab 无需重复读文件，几千篇笔记也能秒级响应

### 原子笔记五条标准

1. **一条笔记只说一件事** —— 聚焦单一知识点
2. **独立可读** —— 不依赖上下文，单独看能懂
3. **有信息密度** —— 不是定义，是有洞见的陈述
4. **可行动或可引用** —— 要么是能用的方法，要么是能引用的观点/数据
5. **用自己的话写** —— 不是原文复制，是经过理解后的表达

### 处理流程

插件采用七阶段流水线处理，从原始输入到最终保存，每一步都有质量把关：

| 阶段 | 名称 | 说明 |
|:---:|------|------|
| **Phase 1** | 读取内容 | 从文本、URL 或剪贴板获取原始内容 |
| **Phase 2** | 质量门控 | 多维规则前置过滤低质/噪声内容（硬阻断 + 软警告 + 强制提炼） |
| **Phase 3** | AI 提炼 | 调用 DeepSeek 将内容拆解为原子笔记 |
| **Phase 4** | 同批去重 | BM25 + 中文分词 + 综合加权评分（余弦 0.5 + 关键词 0.3 + 标题 0.2） |
| **Phase 4b** | 知识库去重 | SimHash 预过滤 + BM25 余弦，与已有笔记高效比对 |
| **Phase 5** | 内容核查 | 三层管线：原文溯源 → 语义比对 → 超源标记，核查事实声明和数据准确性 |
| **Phase 6** | 笔记复查 | 洞见 + 知识直加（2-10），四级制（差/中/良/优），低于策略门槛自动过滤 |

最终输出经过质量筛选的原子笔记，可预览确认或自动保存至指定文件夹。

### 质量保障机制

#### 去重机制（Phase 4 / Phase 4b）

采用 **BM25 + 中文分词 + 余弦相似度**，配合 SimHash 预过滤和综合加权评分：

- **同批去重（Phase 4）**：BM25 饱和词频 + jieba 风格中文分词（trie + DAG + 最大概率路径），综合评分（余弦 0.5 + 关键词 Jaccard 0.3 + 标题 0.2）超过阈值自动合并；短笔记用编辑距离兜底
- **知识库去重（Phase 4b）**：SimHash 64 位指纹预过滤（汉明距离 < 3 候选），BM25 余弦综合评分；**严格只读取指定文件夹**，不会扫描知识库其他区域

相比传统 TF-IDF：BM25 避免高频术语污染向量，jieba 风格分词提高跨表述匹配能力，SimHash 大幅降低计算量。

#### 内容核查（Phase 5）

从每条笔记中提取事实声明（数字、百分比、日期、实体名称），通过**三层管线**逐条核查：

1. **Layer 1 · 原文溯源**（零 API 调用）：在原文中精确或模糊匹配声明锚点，标记为「已溯源」
2. **Layer 2 · 语义比对**（单次 AI 调用）：对 Layer 1 未命中的声明进行语义级别比对，标记为「需对比」（附原文引用和差异说明）
3. **Layer 3 · 超源标记**（零 API 调用）：仍无法匹配的声明标记为「超源」（超出原文范围）

标记结果：**已溯源** / **需对比** / **超源**

#### 笔记复查（Phase 6）

AI 从两个维度对每条笔记打分（各 1-5 分）：
- **洞见价值**：是否包含独立见解、反直觉判断或有价值的观点
- **知识价值**：是否提供可学习的新领域知识或方法论

总分 = 洞见 + 知识（2-10），分四级：差(2-3) 中(4-5) 良(6-7) 优(8-10)。低于策略门槛的笔记被自动过滤，不进入知识库。这是提炼后的最后一道质量防线。

### 使用方法

#### 命令面板

- `Bamboo Darts: 从选中文本提炼原子笔记`
- `Bamboo Darts: 从 URL 提炼原子笔记`
- `Bamboo Darts: 从剪贴板提炼原子笔记`
- `Bamboo Darts: 打开面板 - 右侧栏`
- `Bamboo Darts: 打开面板 - 左侧栏`
- `Bamboo Darts: 打开面板 - 新标签页`
- `Bamboo Darts: 打开面板 - 分屏`

#### 右键菜单

在编辑器中选中文本后右键，点击"提炼原子笔记"

#### Ribbon 图标

点击左侧边栏的 ⚛️（atom）图标

### 配置说明

在 Obsidian 设置 → Bamboo Darts 中配置：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| API Key | 你的 DeepSeek API Key（必需）— AES-256 加密存储，换设备需重填 | — |
| API URL | DeepSeek API 地址 | `https://api.deepseek.com/v1/chat/completions` |
| 模型 | 使用的 DeepSeek 模型 | `deepseek-v4-flash` |
| 最大 Token 数 | AI 输出的最大 Token 数 | `6000` |
| 目标文件夹 | 原子笔记保存的文件夹 | `原子笔记` |
| 文件名模板 | 支持变量 `{{title}}`, `{{date}}`, `{{time}}`, `{{timestamp}}` | `{{title}}` |
| 自动保存 | 开启后，提炼完成后仍展示结果弹窗，但默认全选所有笔记 | 关闭 |
| 去重目标文件夹 | 去重比对的专用文件夹，留空则复用"目标文件夹" | 留空 |
| 标签词汇表 | 偏好标签，逗号或换行分隔 | — |
| 标签模式 | 宽松：优先使用偏好标签，允许新增；严格：仅使用偏好标签 | 宽松 |
| 自动创建反向链接 | 从选中文本提炼时，在源文件插入笔记链接 | 关闭 |
| 启用内容核查 | 提炼后自动核查事实声明和数据准确性（Phase 5） | 开启 |
| 仅保存可溯源笔记 | 开启时自动取消存疑/无据笔记的复选（需先启用内容核查） | 关闭 |
| 启用笔记复查 | AI 二次评分，自动过滤低质量笔记（Phase 6） | 关闭 |
| 复查模型（可选） | 复查用模型，留空则复用提炼模型 | — |
| 复查 API URL（可选） | 复查用 API 地址，留空则复用提炼 API 地址 | — |
| 复查 API Key（可选） | 复查用 API Key，留空则复用提炼 API Key | — |
| 启用关联推荐 | 选中笔记后显示 Top10 相关笔记 | 开启 |
| 启用发现索引 | 缓存笔记特征加速发现 Tab，几千篇笔记也能秒级响应 | 开启 |
| 索引最大笔记数 | 发现索引最多缓存多少篇笔记的特征（0=不限制） | 500 |
| Jaccard 相似度门槛 | 候选笔记与当前笔记的关键词重叠度最低要求（0=不过滤） | 0 |
| MMR 相关度权重 | 推荐结果的相关度 vs 多样性平衡（0=纯多样性，1=纯相关度） | 0.7 |
| 推荐结果数量 | 发现 Tab 显示的推荐笔记数量 | 10 |
| 智能识别文章类型 | 自动判断内容特征，选择最合适的过滤策略 | 开启 |
| 过滤策略 | 手动指定过滤强度（技术文献 / 通用文章 / 观点评论） | — |
| 高级参数调整 | 手动调整各策略的去重阈值和质量门槛 | — |
| 启用深度提炼模式 | 对超长文章自动分段提炼，消耗更多 token | 关闭 |
| 输入截断长度 | 送入 AI 前截断原文的最大字符数 | `10000` |
| 面板位置 | 插件面板显示位置（右侧栏 / 左侧栏 / 新标签页 / 分屏） | 右侧栏 |

### 安装方法

#### 方法 1：社区插件市场

在 Obsidian 设置 → 社区插件中搜索 **Bamboo Darts** 安装。

#### 方法 2：BRAT 安装

1. 安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件
2. 在 BRAT 设置中添加仓库：`miaoziguan/obsidian-Bamboo-Darts`

#### 方法 3：手动安装

1. 下载本插件的最新 Release
2. 解压到你的 Obsidian vault 的 `.obsidian/plugins/` 目录
3. 在 Obsidian 设置 → 社区插件 → 已安装插件中启用

### 截图

插件界面包括：命令面板（Command Palette）、提炼结果弹窗（Result Modal）、设置页面（Settings Tab）。

### 技术栈

- TypeScript
- esbuild（构建工具）
- vitest（单元测试，627 个测试）
- ESLint + Prettier（代码质量）
- GitHub Actions（CI + 增量覆盖率门禁）
- DeepSeek API（AI 提炼）
- Obsidian API（插件接口）
- BM25 + 中文分词 + SimHash + 余弦相似度（去重算法）

### 常见问题

**Q：是否需要付费 API？**  
A：需要 DeepSeek API Key，DeepSeek 有免费额度，具体请参考 [DeepSeek 官网](https://platform.deepseek.com)。

**Q：支持离线使用吗？**  
A：不支持，本插件依赖 DeepSeek API 进行内容提炼。

**Q：笔记保存到哪里？**  
A：默认保存到 `原子笔记` 文件夹，可在设置中自定义。

**Q：API Key 安全吗？**  
A：API Key 使用 AES-256-GCM 加密后存储在本地，密钥由机器指纹派生（平台 + 主机名 + 用户名），同步到其他设备无法解密。

### 本地开发

```bash
npm install            # 安装依赖
npm run dev            # 监听模式编译（带 sourcemap，不压缩）
npm run build          # 正式版编译（压缩）
npm run test           # 运行单元测试
npm run test:coverage  # 运行测试并生成覆盖率报告
npm run lint           # ESLint 检查
npm run lint:fix       # ESLint 自动修复
npm run gate           # 质量门禁：lint 零告警 + 覆盖率达标
npm run sync           # 编译并同步到 ../test-vault 测试仓库
npm run sync --dev     # 同步开发版（带 sourcemap）
```

测试覆盖率门槛：行/语句 82%、分支/函数 80%；新增代码需满足 60% 增量覆盖率门禁（CI 自动校验）。

### 更新日志

详见 [CHANGELOG](./CHANGELOG.md) 或 [Releases](https://github.com/miaoziguan/obsidian-Bamboo-Darts/releases) 页面。

### 许可证

MIT

---

## English

### What is an Atomic Note?

Atomic Notes are a core concept in Obsidian—each note captures exactly one knowledge point: concise, self-contained, and reusable.

This plugin helps you transform long articles, web pages, or selected text into well-structured atomic notes using AI, with automatic deduplication before saving to your vault.

### Features

- ✅ **Multiple input methods**: URL, selected text, or clipboard
- ✅ **Profile-based differentiation**: Automatically adjust gate thresholds based on content type (technical documentation / general articles / opinion pieces)
- ✅ **Quality gate**: Multi-dimensional rules filter low-quality/noisy content with hard block + soft warning + cumulative escalation
- ✅ **URL content extraction**: DOMParser + querySelector based parsing with 100+ selectors to strip webpage noise; HTML entity decoding + comment removal; 1-hour cache
- ✅ **Forced extraction**: Option to force extraction when gate check fails, skipping quality filters
- ✅ **AI extraction**: Calls DeepSeek API to extract atomic notes following five quality standards
- ✅ **In-batch dedup**: BM25 + word segmentation + weighted combined score; edit distance fallback for short notes
- ✅ **Vault dedup**: SimHash fingerprint pre-filter + BM25 cosine scoring against existing notes
- ✅ **Real-time progress feedback**: Shows current phase, elapsed time, and sub-progress at each step; cancellable anytime
- ✅ **Flexible storage**: Customize target folder and file name template
- ✅ **Content verification**: Three-layer pipeline (source tracing → semantic compare with truncated text → out-of-scope marking) to verify factual claims; marked as Traced / Compare / Out-of-scope
- ✅ **Note review**: AI scores notes on insight + knowledge value (sum 2-10, four tiers: Poor / Fair / Good / Excellent), auto-filters below threshold
- ✅ **Semantic dedup (Beta)**: Tencent Hunyuan embedding model for semantic-level duplicate detection; local algorithm pre-filter + vector model precise judgment; results show "Local X% / Semantic Y%"; supports pre-building vector index and cache cleanup
- ✅ **Related recommendation**: Show Top10 related notes when selecting a note (knowledge discovery), MMR diversity reranking avoids clustered recommendations
- ✅ **Discovery index**: Automatically caches note features (title, keywords, content hash), discovery tab responds instantly without re-reading files, works well with thousands of notes

### Five Standards for Atomic Notes

1. **One note, one idea** —— Focus on a single knowledge point
2. **Self-contained** —— Readable without additional context
3. **Information-dense** —— Not a definition; a statement with insight
4. **Actionable or citable** —— Either a usable method or a quotable insight/data point
5. **Written in your own words** —— Not a copy-paste from the source

### Processing Pipeline

The plugin uses a 7-stage pipeline, with quality checks at each step:

| Phase | Name | Description |
|:---:|------|-------------|
| **Phase 1** | Read Content | Fetch raw content from text, URL, or clipboard |
| **Phase 2** | Quality Gate | Multi-dimensional rules filter low-quality/noisy content (hard block + soft warning + forced extraction) |
| **Phase 3** | AI Extraction | Call DeepSeek API to decompose content into atomic notes |
| **Phase 4** | Batch Dedup | BM25 + Chinese word segmentation + weighted combined score (cosine 0.5 + keyword 0.3 + title 0.2) |
| **Phase 4b** | Vault Dedup | SimHash 64-bit fingerprint pre-filter + BM25 cosine against existing notes |
| **Phase 5** | Content Verification | Three-layer pipeline: source tracing → semantic compare → out-of-scope marking; verify factual claims and numeric data |
| **Phase 6** | Note Review | AI re-scores notes from two dimensions (insight + knowledge value) to filter low-value output |

Final output: quality-filtered atomic notes, ready for preview or auto-save.

### Quality Assurance

#### Deduplication (Phase 4 / Phase 4b)

Uses **BM25 + Chinese word segmentation + cosine similarity**, with SimHash pre-filtering and weighted combined scoring:

- **Batch dedup (Phase 4)**: BM25 saturated term frequency + jieba-style Chinese word segmentation (trie + DAG + max-probability path), combined score (cosine 0.5 + keyword Jaccard 0.3 + title 0.2); edit distance fallback for short notes
- **Vault dedup (Phase 4b)**: SimHash 64-bit fingerprint pre-filter (Hamming distance < 3 candidates), BM25 cosine combined scoring; **dedup target folder** can be configured separately for privacy

Compared to traditional TF-IDF: BM25 prevents high-frequency term pollution, jieba-style segmentation improves cross-expression matching, and SimHash dramatically reduces computation.

#### Content Verification (Phase 5)

Extract fact claims containing numbers, percentages, dates, and entity names from each note, and verify through a **three-layer pipeline**:

1. **Layer 1 · Source Tracing** (zero API): Match claim anchors in source text via exact or fuzzy matching — marked as **Traced**
2. **Layer 2 · Semantic Compare** (single AI call): For claims unmatched by Layer 1, perform semantic-level comparison against the original text — marked as **Compare** (with source citation and diff notes)
3. **Layer 3 · Out-of-scope Marking** (zero API): Claims still unmatched are marked as **Out-of-scope** (beyond source text scope)

Results: **Traced** / **Compare** / **Out-of-scope**

#### Note Review (Phase 6)

AI scores each note from two dimensions (1-5 points):
- **Insight Value**: Does it contain independent insights, counterintuitive judgments, or valuable viewpoints?
- **Knowledge Value**: Does it provide transferable domain knowledge or methodology?

Total = insight + knowledge (2-10), graded: Poor(2-3) Fair(4-5) Good(6-7) Excellent(8-10). Notes below the strategy threshold are automatically filtered out. This is the final quality checkpoint.

### How to Use

#### Command Palette

- `Bamboo Darts: Extract atomic notes from selected text`
- `Bamboo Darts: Extract atomic notes from URL`
- `Bamboo Darts: Extract atomic notes from clipboard`
- `Bamboo Darts: Open Panel - Right Sidebar`
- `Bamboo Darts: Open Panel - Left Sidebar`
- `Bamboo Darts: Open Panel - New Tab`
- `Bamboo Darts: Open Panel - Split`

#### Context Menu

Right-click on selected text in the editor, then click "Extract atomic notes"

#### Ribbon Icon

Click the ⚛️ (atom) icon in the left sidebar

### Configuration

Configure in Obsidian Settings → Bamboo Darts:

| Setting | Description | Default |
|---------|-------------|---------|
| API Key | Your DeepSeek API Key (required) — AES-256 encrypted, re-enter on new devices | — |
| API URL | DeepSeek API endpoint | `https://api.deepseek.com/v1/chat/completions` |
| Model | DeepSeek model to use | `deepseek-v4-flash` |
| Max Tokens | Maximum tokens for AI output | `6000` |
| Target Folder | Folder for saving atomic notes | `原子笔记` |
| File Name Template | Supports `{{title}}`, `{{date}}`, `{{time}}`, `{{timestamp}}` | `{{title}}` |
| Auto Save | When enabled, shows result modal with all notes pre-selected for review | Off |
| Tag Vocabulary | Preferred tags, separated by commas or newlines | — |
| Tag Mode | Loose: prefer preferred tags but allow new ones; Strict: only use preferred tags | Loose |
| Auto Create Backlinks | Insert note links in source file when extracting from selected text | Off |
| Dedup Target Folder | Separate folder for dedup comparison; leave empty to reuse "Target Folder" | Empty |
| Enable Content Verification | Auto-verify factual claims and numeric data after extraction (Phase 5) | On |
| Verified Only | Auto-uncheck questionable/unsupported notes (requires Content Verification enabled) | Off |
| Enable Note Review | AI re-scores notes and filters low-quality ones (Phase 6) | Off |
| Review Model (Optional) | Model for review, leave empty to reuse extraction model | — |
| Review API URL (Optional) | API endpoint for review, leave empty to reuse extraction API URL | — |
| Review API Key (Optional) | API Key for review, leave empty to reuse extraction API Key | — |
| Enable Related Recommendation | Show Top10 related notes when selecting a note | On |
| Enable Discovery Index | Cache note features to speed up discovery tab, works well with thousands of notes | On |
| Max Notes in Index | Maximum number of notes to cache in discovery index (0 = no limit) | 500 |
| Jaccard Similarity Threshold | Minimum keyword overlap required between candidate and current note (0 = no filter) | 0 |
| MMR Relevance Weight | Balance between relevance and diversity for recommendations (0 = pure diversity, 1 = pure relevance) | 0.7 |
| Recommendation Count | Number of recommended notes to show in discovery tab | 10 |
| Auto-classify Content Type | Automatically detect content type and select the best filter strategy | On |
| Filter Strategy | Manually specify filter intensity (technical / general / opinion) | — |
| Advanced Parameters | Manually adjust dedup thresholds and quality thresholds for each strategy | — |
| Enable Deep Extraction | Auto-chunk very long articles for extraction (uses more tokens) | Off |
| Input Truncation Length | Maximum characters of source text sent to AI | `10000` |
| Panel Position | Where the plugin panel appears in the Obsidian UI | Right sidebar |

### Installation

#### Method 1: Community Plugin

Search for **Bamboo Darts** in Obsidian Settings → Community Plugins.

#### Method 2: BRAT

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin
2. Add this repository in BRAT settings: `miaoziguan/obsidian-Bamboo-Darts`

#### Method 3: Manual Installation

1. Download the latest release from the [Releases](https://github.com/miaoziguan/obsidian-Bamboo-Darts/releases) page
2. Extract to `.obsidian/plugins/` in your vault
3. Enable the plugin in Obsidian Settings → Community Plugins → Installed Plugins

### FAQ

**Q: Is a paid API required?**  
A: A DeepSeek API Key is required. DeepSeek offers free credits—see the [DeepSeek website](https://platform.deepseek.com) for details.

**Q: Does it work offline?**  
A: No, this plugin relies on the DeepSeek API for content extraction.

**Q: Where are notes saved?**  
A: Notes are saved to the `原子笔记` folder by default; you can customize this in settings.

**Q: Is my API Key secure?**  
A: API Keys are encrypted with AES-256-GCM before storage, with a key derived from your machine fingerprint (platform + hostname + username). Sync'd keys cannot be decrypted on other devices.

### Changelog

See [CHANGELOG](./CHANGELOG.md) or the [Releases](https://github.com/miaoziguan/obsidian-Bamboo-Darts/releases) page.

### License

MIT

### Links

- GitHub: [https://github.com/miaoziguan/obsidian-Bamboo-Darts](https://github.com/miaoziguan/obsidian-Bamboo-Darts)
- Report Issues: [https://github.com/miaoziguan/obsidian-Bamboo-Darts/issues](https://github.com/miaoziguan/obsidian-Bamboo-Darts/issues)
