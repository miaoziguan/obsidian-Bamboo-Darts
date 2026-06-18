# Bamboo Darts（竹叶飞刃）

AI 提炼原子笔记，过滤信息垃圾，把阅读转化为可检索的知识节点。

[English](#english) | [中文](#中文)

---

## 中文

### 什么是原子笔记？

原子笔记（Atomic Note）是 Obsidian 核心理念之一——每条笔记只记录一个知识点，短小精悍、独立可读、可复用。

本插件帮你把长文、网页、选中文本，用 AI 一键提炼成规范的原子笔记，自动去重后存入你的知识库。

### 功能特性

- ✅ **多种输入方式**：支持 URL、选中文本、剪贴板三种输入
- ✅ **质量门控**：自动检测内容长度、广告、重复内容、信息密度、噪声占比
- ✅ **AI 提炼**：调用 DeepSeek API，提炼符合五条标准的原子笔记
- ✅ **同批去重**：自动去除本次提炼中的重复笔记
- ✅ **知识库去重**：与已有笔记比对，避免重复存储
- ✅ **灵活存储**：自定义目标文件夹、文件名模板
- ✅ **事实核查**：逐条比对原文，标记有据 / 存疑 / 无据，支持长文分段核查
- ✅ **数据核查**：检查笔记中的数字、百分比、日期等数据准确性（内部比对 + 外部验证）
- ✅ **笔记复查**：AI 二次评分，从洞察力和知识价值两个维度过滤低价值笔记
- ✅ **关联推荐**：选中笔记后显示 Top10 相关笔记（知识发现）

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
| **Phase 2** | 质量门控 | 5 层规则前置过滤低质/噪声内容（硬拦截 + 软警告） |
| **Phase 3** | AI 提炼 | 调用 DeepSeek 将内容拆解为原子笔记 |
| **Phase 4** | 同批去重 | 检测同批次中高度相似的笔记并合并 |
| **Phase 5** | 事实核查 | 逐条比对原文，标记有据 / 存疑 / 无据，支持长文分段核查 |
| **Phase 5b** | 数据核查 | 检查笔记中的数字、百分比、日期等数据准确性（内部比对 + AI 外部验证） |
| **Phase 6** | 笔记复查 | AI 二次评分，从洞察力和知识价值两个维度过滤低价值笔记 |

最终输出经过质量筛选的原子笔记，可预览确认或自动保存至指定文件夹。

### 质量保障机制

#### 事实核查（Phase 5）

从每条笔记中提取包含数字、百分比、日期、实体名称的事实声明，逐条与原文比对，标记为：
- **有据**：声明与原文完全一致或可直接推导
- **存疑**：部分相关但存在夸大、跳跃或无法验证
- **无据**：无法找到任何支持

对于长文章（超过 4000 字符），插件会自动分段核查，确保每个段落的事实都能被准确验证。

#### 数据核查（Phase 5b）

专门检查笔记中的数字、百分比、日期、金额、排名等数据点：
1. **内部验证**：与原文精确或模糊比对，检测数据偏差
2. **外部验证**：无法在原文中比对的数据点，调用 AI 验证公开事实

标记结果：**一致** / **偏差** / **无法验证**

#### 笔记复查（Phase 6）

AI 从两个维度对每条笔记打分（1-5 分）：
- **洞察力分**：是否包含独立观点或独特视角
- **知识价值分**：是否能为读者提供可迁移的领域知识

总分 < 3 的笔记被自动过滤，不进入知识库。这是提炼后的最后一道质量防线。

### 使用方法

#### 命令面板

- `Bamboo Darts: 从选中文本提炼原子笔记`
- `Bamboo Darts: 从 URL 提炼原子笔记`
- `Bamboo Darts: 从剪贴板提炼原子笔记`

#### 右键菜单

在编辑器中选中文本后右键，点击"提炼原子笔记"

#### Ribbon 图标

点击左侧边栏的 ⚛️（atom）图标

### 配置说明

在 Obsidian 设置 → Bamboo Darts 中配置：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| API Key | 你的 DeepSeek API Key（必需） | — |
| API URL | DeepSeek API 地址 | `https://api.deepseek.com/v1/chat/completions` |
| 模型 | 使用的 DeepSeek 模型 | `deepseek-v4-flash` |
| 最大 Token 数 | AI 输出的最大 Token 数 | `2000` |
| 目标文件夹 | 原子笔记保存的文件夹 | `Atomic Notes` |
| 文件名模板 | 支持变量 `{{title}}`, `{{date}}`, `{{time}}`, `{{timestamp}}` | `{{title}}` |
| 自动保存 | 启用后，提炼完成后自动保存（不显示结果弹窗） | 关闭 |
| 标签词汇表 | 偏好标签，逗号或换行分隔 | — |
| 标签模式 | 宽松：优先使用偏好标签，允许新增；严格：仅使用偏好标签 | 宽松 |
| 自动创建反向链接 | 从选中文本提炼时，在源文件插入笔记链接 | 关闭 |
| 启用事实核查 | 提炼后自动核实关键事实声明是否能在原文中找到依据 | 开启 |
| 仅保存已核实笔记 | 开启时自动取消存疑/无据笔记的复选 | 关闭 |
| 启用数据核查 | 核查笔记中的数字、百分比、日期等数据是否与原文一致 | 开启 |
| 启用笔记复查 | AI 二次评分，自动过滤低质量笔记（评分<3） | 关闭 |
| 复查模型（可选） | 复查用模型名称，留空则复用提炼模型 | — |
| 启用关联推荐 | 选中笔记后显示 Top10 相关笔记 | 开启 |

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
- DeepSeek API（AI 提炼）
- Obsidian API（插件接口）

### 常见问题

**Q：是否需要付费 API？**  
A：需要 DeepSeek API Key，DeepSeek 有免费额度，具体请参考 [DeepSeek 官网](https://platform.deepseek.com)。

**Q：支持离线使用吗？**  
A：不支持，本插件依赖 DeepSeek API 进行内容提炼。

**Q：笔记保存到哪里？**  
A：默认保存到 `Atomic Notes` 文件夹，可在设置中自定义。

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
- ✅ **Quality gate**: Automatically checks content length, detects ads, duplicates, information density, and noise ratio
- ✅ **AI extraction**: Calls DeepSeek API to extract atomic notes following five quality standards
- ✅ **In-batch deduplication**: Removes duplicates within the current extraction batch
- ✅ **Vault deduplication**: Compares with existing notes to avoid storage duplication
- ✅ **Flexible storage**: Customize target folder and file name template
- ✅ **Fact check**: Cross-reference each note against source text; mark as supported / questionable / unsupported, with support for long article chunking
- ✅ **Data verification**: Verify numbers, percentages, dates, and other data points (internal comparison + AI external verification)
- ✅ **Note review**: AI re-scores notes from two dimensions (insight + knowledge value) to filter low-value output
- ✅ **Related recommendation**: Show Top10 related notes when selecting a note (knowledge discovery)

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
| **Phase 2** | Quality Gate | 5-layer rules filter low-quality/noisy content (hard block + soft warning) |
| **Phase 3** | AI Extraction | Call DeepSeek API to decompose content into atomic notes |
| **Phase 4** | Batch Deduplication | Detect & merge highly similar notes within the same batch |
| **Phase 5** | Fact Check | Cross-reference each note against source text; mark as supported / questionable / unsupported, with support for long article chunking |
| **Phase 5b** | Data Verification | Verify numbers, percentages, dates, and other data points (internal comparison + AI external verification) |
| **Phase 6** | Note Review | AI re-scores notes from two dimensions (insight + knowledge value) to filter low-value output |

Final output: quality-filtered atomic notes, ready for preview or auto-save.

### Quality Assurance

#### Fact Check (Phase 5)

Extract fact claims containing numbers, percentages, dates, and entity names from each note, cross-reference against source text, and mark as:
- **Supported**: Claim matches source text exactly or can be directly derived
- **Questionable**: Partially related but contains exaggeration, leap, or cannot be verified
- **Unsupported**: No support found in source text

For long articles (over 4000 characters), the plugin automatically chunks and verifies each section.

#### Data Verification (Phase 5b)

Specialized verification for numeric data in notes:
1. **Internal validation**: Compare against source text (exact or fuzzy matching)
2. **External validation**: For data points not found in source, call AI to verify against public knowledge

Results: **Consistent** / **Deviation** / **Unverifiable**

#### Note Review (Phase 6)

AI scores each note from two dimensions (1-5 points):
- **Insight Score**: Whether the note contains independent viewpoints or unique perspectives
- **Knowledge Value Score**: Whether the note provides transferable domain knowledge

Notes with total score < 3 are automatically filtered out. This is the final quality checkpoint.

### How to Use

#### Command Palette

- `Bamboo Darts: Extract atomic notes from selected text`
- `Bamboo Darts: Extract atomic notes from URL`
- `Bamboo Darts: Extract atomic notes from clipboard`

#### Context Menu

Right-click on selected text in the editor, then click "Extract atomic notes"

#### Ribbon Icon

Click the ⚛️ (atom) icon in the left sidebar

### Configuration

Configure in Obsidian Settings → Bamboo Darts:

| Setting | Description | Default |
|---------|-------------|---------|
| API Key | Your DeepSeek API Key (required) | — |
| API URL | DeepSeek API endpoint | `https://api.deepseek.com/v1/chat/completions` |
| Model | DeepSeek model to use | `deepseek-v4-flash` |
| Max Tokens | Maximum tokens for AI output | `2000` |
| Target Folder | Folder for saving atomic notes | `Atomic Notes` |
| File Name Template | Supports `{{title}}`, `{{date}}`, `{{time}}`, `{{timestamp}}` | `{{title}}` |
| Auto Save | When enabled, automatically saves after extraction (no result modal) | Off |
| Tag Vocabulary | Preferred tags, separated by commas or newlines | — |
| Tag Mode | Loose: prefer preferred tags but allow new ones; Strict: only use preferred tags | Loose |
| Auto Create Backlinks | Insert note links in source file when extracting from selected text | Off |
| Enable Fact Check | Automatically verify key fact claims against source text | On |
| Verified Only | Auto-uncheck questionable/unsupported notes | Off |
| Enable Data Verification | Verify numbers, percentages, dates in notes against source | On |
| Enable Note Review | AI re-scores notes and filters low-quality ones (score < 3) | Off |
| Review Model (Optional) | Model for review, leave empty to reuse extraction model | — |
| Enable Related Recommendation | Show Top10 related notes when selecting a note | On |

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
A: Notes are saved to the `Atomic Notes` folder by default; you can customize this in settings.

### Changelog

See [CHANGELOG](./CHANGELOG.md) or the [Releases](https://github.com/miaoziguan/obsidian-Bamboo-Darts/releases) page.

### License

MIT

### Links

- GitHub: [https://github.com/miaoziguan/obsidian-Bamboo-Darts](https://github.com/miaoziguan/obsidian-Bamboo-Darts)
- Report Issues: [https://github.com/miaoziguan/obsidian-Bamboo-Darts/issues](https://github.com/miaoziguan/obsidian-Bamboo-Darts/issues)
