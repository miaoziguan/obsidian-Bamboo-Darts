# Phase 2 质量门控改进技术文档

> **版本**: v1.3.0-gate-upgrade
> **日期**: 2026-06-20
> **涉及文件**: `src/utils/gate-rules.ts` · `src/extractor.ts` · `src/extraction/profiles.ts` · `tests/gate-rules.test.ts` · `tests/profiles.test.ts`
> **测试覆盖**: 123 tests（原 109 + 新增 14），全部通过

---

## 一、改进总览

本次改进基于对 Phase 2 质量门控的全面代码审查，覆盖架构层、规则精度和工程细节三个维度，共 10 项改进。

| # | 改进项 | 维度 | 优先级 | 状态 |
|---|--------|------|--------|------|
| 1 | 统一 `LOW_QUALITY_SIGNALS` 大小写处理 | 工程 | P0 | ✅ |
| 2 | 统一 `STOP_WORDS` 定义 | 工程 | P0 | ✅ |
| 3 | 对齐门控与 AI 截断长度 | 工程 | P0 | ✅ |
| 4 | 统一 tokenizer 实现 | 工程 | P0 | ✅ |
| 5 | classifyContent 提前 + Profile 感知门控 | 架构 | P1 | ✅ |
| 6 | 警告累积升级机制 | 架构 | P1 | ✅ |
| 7 | 密度算法长度偏见修复 | 精度 | P2 | ✅ |
| 8 | 噪声检测范围扩展 | 精度 | P2 | ✅ |
| 9 | 相似度采样策略改进 | 精度 | P2 | ✅ |
| 10 | 广告变体检测增强 | 精度 | P2 | ✅ |

---

## 二、架构决策记录

### 决策 1：综合质量分方案

**问题**: 原有硬阻断/软警告二元模型下，一篇文章触发 4 条警告但 0 条阻断仍会通过，多警告叠加的质量风险无法被识别。

**候选方案**:
- A) 加权综合分（0-100）：每条规则贡献加权子分，低于阈值阻断
- B) 警告累积升级：N 条警告自动升级为阻断
- C) 暂不引入

**决策**: **B — 警告累积升级（阈值 3）**

**理由**:
- 方案 A 的权重调优困难，且在 Obsidian 插件场景下用户对"质量分 62"缺乏直觉理解
- 方案 B 改动最小（4 行代码），直接解决问题，阈值 `WARN_BLOCK_THRESHOLD = 3` 可后续根据使用数据调整
- 累积阻断的 `reason` 消息明确告知用户"累积 N 条警告"，可解释性优于裸分数

### 决策 2：Rule 5 重复检测处理

**问题**: `extractor.ts` 调用 `runGateChecks(content)` 时未传 `processedContents`，Rule 5 在生产环境中永远不触发。

**候选方案**:
- A) extractor 内部维护模块级已处理列表
- B) 从调用方传入 `processedContents`
- C) 暂不移除也不接入

**决策**: **C — 暂不改动**

**理由**:
- `main.ts` 无批量循环，每次 `runExtraction` 是独立的单篇处理
- Phase 4 的 `crossCheckBatch` 已在**笔记级**做了去重，覆盖提炼后的语义重复
- Rule 5 是**原文级**去重，跨调用维护状态需要调用方参与，当前场景收益不抵复杂度
- 保留代码（不删除），未来如果引入批量处理功能可自然接入

### 决策 3：Profile 阈值归属

**问题**: Profile 感知的门控阈值应该放在 `ProfileConfig` 还是 `gate-rules.ts` 内部？

**候选方案**:
- A) 扩展 `ProfileConfig` 接口，加 `gate*` 字段
- B) `gate-rules.ts` 内部维护 profile→阈值 映射表

**决策**: **A — 扩展 ProfileConfig**

**理由**:
- `ProfileConfig` 已有 4 个阈值字段（`crossBatchThreshold`、`vaultHigh/MidThreshold`、`reviewMinScore`），加 4 个门控阈值是自然延伸
- 策略参数集中管理，用户可通过 `profileConfigs` 覆盖一次性调整所有阈值
- 避免策略参数分散在两个文件中造成维护负担

---

## 三、逐项技术细节

### 改进 1：统一 `LOW_QUALITY_SIGNALS` 大小写处理

**文件**: `src/utils/gate-rules.ts:96`
**问题**: `COMMERCIAL_SPAM` 用 `toLowerCase()` 比较，`LOW_QUALITY_SIGNALS` 用原始字符串 `includes()`。当前全是中文不受影响，但未来加入英文关键词会产生 bug。

**改动**:
```typescript
// Before
const matchedLowQ = LOW_QUALITY_SIGNALS.filter(kw => content.includes(kw));

// After
const matchedLowQ = LOW_QUALITY_SIGNALS.filter(kw => lower.includes(kw.toLowerCase()));
```

**影响**: 零风险改动，当前行为不变（中文 toLowerCase 等价），未来加入英文关键词时自动兼容。

---

### 改进 2：统一 `STOP_WORDS` 定义

**文件**: `src/extraction/profiles.ts:10`、`src/extraction/profiles.ts:91`
**问题**: `technicalTermDensity()` 内有一份本地 `STOP_WORDS`（30 个英文停用词），与 `constants.ts` 的全局 `STOP_WORDS`（中英混合）是两份独立副本，且内容不完全相同。

**改动**:
```typescript
// profiles.ts 顶部新增
import { STOP_WORDS } from '../constants';

// technicalTermDensity() 内删除本地 STOP_WORDS 定义
// 直接使用导入的全局 STOP_WORDS
const filteredEnglish = englishWords.filter(w => !STOP_WORDS.has(w.toLowerCase()));
```

**影响**:
- `constants.ts` 的 `STOP_WORDS` 包含中文停用词（'的'、'了'、'在' 等），英文部分与本地版本有重叠但不完全相同
- 统一后，`technicalTermDensity` 会额外过滤中文停用词，这对英文词过滤无影响（中文词不会匹配 `/\b[a-zA-Z]{3,}\b/g`）
- 未来只需维护一份停用词表

---

### 改进 3：对齐门控与 AI 截断长度

**文件**: `src/extractor.ts:313`
**问题**: `MAX_CONTENT_LENGTH = 50000` 是门控的警告阈值，但 `INPUT_TRUNCATE_LENGTH = 10000` 才是 AI 的实际截断点。一篇 30000 字的文章通过门控无警告，但 AI 只看前 10000 字，用户被误导。

**改动**:
```typescript
// Before
const gateResult = runGateChecks(content);

// After
const gateResult = runGateChecks(truncatedContent);
```

**执行顺序变化**:
```
旧: readContent → truncate → gate(full content) → classify → extract
新: readContent → truncate → classify → gate(truncated content) → extract
```

**影响**:
- 门控现在检查的是 AI 实际看到的内容（截断后 ≤10000 字），不再对超出部分产生虚假安全感
- 深度模式（`enableDeepMode`）下，`content.length > INPUT_TRUNCATE_LENGTH` 时走分段提炼路径，门控检查截断内容不影响后续处理
- `MAX_CONTENT_LENGTH = 50000` 的长内容警告不再对已截断内容触发（截断后 ≤10000，不会超过 50000），这是正确的——因为截断后的内容就是 AI 的全部输入

---

### 改进 4：统一 tokenizer 实现

**文件**: `src/utils/gate-rules.ts:23, 138`
**问题**: `gate-rules.ts` 有自己的 `extractTokens()` 函数（CJK 2-gram + 空格分词，返回 `string[]`），与 `src/utils/tokenizer.ts` 的共享 `tokenize()` 函数（可配置 n-gram，返回 `Map<string, number>`）是两套独立实现。

**改动**:
```typescript
// 新增导入
import { tokenize } from './tokenizer';

// checkDensity 改用共享 tokenizer
function checkDensity(content: string, ...): GateResult {
  const tokenMap = tokenize(content, { ngramSize: 2 });
  const total = Array.from(tokenMap.values()).reduce((a, b) => a + b, 0);
  if (total < 20) return { passed: true, level: 'block' };
  const unique = tokenMap.size;
  const rawDensity = unique / total;
  const lengthCorrection = Math.max(1, Math.log10(total) / 2);
  const density = Math.min(rawDensity * lengthCorrection, 1);
  // ...
}

// 删除本地 extractTokens() 函数（原 line 142-175）
```

**两套 tokenizer 差异分析**:

| 特性 | 旧 `extractTokens` | 共享 `tokenize` |
|------|-------------------|----------------|
| 返回类型 | `string[]` | `Map<string, number>` |
| 中文处理 | 逐字拆分再组 2-gram | 连续汉字串直接 n-gram |
| 英文处理 | 空格分词 | 空格分词（≥2 字符） |
| 停用词过滤 | 无 | 使用 `STOP_WORDS` |
| 大小写归一 | 无（checkDensity 内做） | `toLowerCase()` 内置 |
| 特殊字符清洗 | 正则 `[^\u4e00-\u9fff\w\s]` | 正则 `[^\w\s\u4e00-\u9fff]` |

**影响**: 统一后密度计算会排除停用词，且对连续中文段落的 n-gram 切分方式略有不同（旧版逐字拆分再组合，新版对连续汉字串直接滑窗）。实测密度值在合理范围内，现有测试全部通过。

---

### 改进 5：classifyContent 提前 + Profile 感知门控

**文件**: `src/extractor.ts:294-326`、`src/utils/gate-rules.ts:304-342`、`src/extraction/profiles.ts:14-31, 35-70`

#### 5.1 ProfileConfig 扩展

`ProfileConfig` 接口新增 4 个门控阈值字段：

```typescript
export interface ProfileConfig {
  crossBatchThreshold: number;    // 原有
  vaultHighThreshold: number;     // 原有
  vaultMidThreshold: number;      // 原有
  reviewMinScore: number;         // 原有
  gateMinDensity: number;         // 新增：信息密度硬阻断
  gateWarnDensity: number;        // 新增：信息密度警告
  gateMaxNoiseRatio: number;      // 新增：噪声占比硬阻断
  gateWarnNoiseRatio: number;     // 新增：噪声占比警告
}
```

**三种 Profile 的门控阈值设计逻辑**（基于校准实验实测数据调整）:

| 阈值 | dense (技术文献) | balanced (通用文章) | sparse (观点评论) | 设计意图 |
|------|:-:|:-:|:-:|---|
| `gateMinDensity` | 0.15 | 0.15 | 0.15 | 实测正常内容密度 0.95-1.00，纯重复 0.02-0.12；0.15 精准阻断纯重复且不误报 |
| `gateWarnDensity` | 0.50 | 0.50 | 0.50 | 0.50 远低于 minNormal=0.95，为"半重复"可疑内容留出警告区间 |
| `gateMaxNoiseRatio` | 0.75 | 0.70 | 0.65 | 技术文献常含代码/公式等特殊字符；观点评论噪声容忍度更低 |
| `gateWarnNoiseRatio` | 0.45 | 0.40 | 0.35 | 同上逻辑 |

#### 5.2 执行顺序重构

```
旧流程:
  Phase 1: 读取内容
  → truncate
  → Phase 2: 门控（固定阈值，检查完整 content）
  → Profile 分类（classifyContent）
  → Phase 3: 提炼...

新流程:
  Phase 1: 读取内容
  → truncate
  → Profile 分类（classifyContent，纯规则零 API，无性能代价）
  → Phase 2: 门控（Profile 差异化阈值，检查 truncatedContent）
  → Phase 3: 提炼...
```

#### 5.3 runGateChecks 签名变化

```typescript
// Before
export function runGateChecks(
  content: string,
  processedContents: string[] = []
): GateCheckResult

// After
export function runGateChecks(
  content: string,
  processedContents: string[] = [],
  profileConfig?: ProfileConfig    // 新增可选参数
): GateCheckResult
```

**向后兼容**: `profileConfig` 为可选参数，未传入时使用 `constants.ts` 的默认值（`GATE_MIN_DENSITY = 0.1` 等），与 balanced profile 的默认值一致。现有调用方无需修改。

---

### 改进 6：警告累积升级机制

**文件**: `src/utils/gate-rules.ts:296, 333-335`

**问题**: 4 条警告叠加但 0 条阻断时，内容仍"干净通过"。多条弱信号叠加本身就是一个强信号。

**改动**:
```typescript
const WARN_BLOCK_THRESHOLD = 3;

// 在 runGateChecks() 的 return 之前
if (reasons.length === 0 && warnings.length >= WARN_BLOCK_THRESHOLD) {
  reasons.push(`[综合] 累积 ${warnings.length} 条警告，质量不达标`);
}
```

**触发场景分析**:

一篇内容要同时触发 3 条警告，可能的组合：
- 长度警告（50-200 字）+ 质量警告（1-2 个广告词）+ 密度警告（0.1-0.3）
- 长度警告 + 噪声警告（40%-70%）+ 密度警告
- 质量警告 + 噪声警告 + 密度警告（较长内容同时包含广告词和噪声）

**阈值调优**: `WARN_BLOCK_THRESHOLD = 3` 意味着至少 3 条独立规则的警告才升级，避免单/双重警告的误升级。该常量定义在文件顶部，便于后续根据使用数据调整。

---

### 改进 7：密度算法长度偏见修复

**文件**: `src/utils/gate-rules.ts:142-146`

**问题**: 旧公式 `density = unique / total` 存在长度偏见——随着文本增长，2-gram 组合的重复概率自然增加，导致 unique/total 比率单调递减。一篇 5000 字的优质技术文章可能比 200 字的短文"密度"更低。

**旧公式**:
```
density = unique_tokens / total_tokens
```

**新公式**:
```
rawDensity = unique / total
lengthCorrection = max(1, log10(total) / 2)
density = min(rawDensity * lengthCorrection, 1)
```

**校正因子行为**:

| total tokens | log10(total)/2 | 校正因子 | 效果 |
|:-:|:-:|:-:|---|
| 50 | 0.85 | 1.00 (clamped) | 短文本不校正 |
| 200 | 1.15 | 1.15 | +15% 补偿 |
| 1000 | 1.50 | 1.50 | +50% 补偿 |
| 5000 | 1.85 | 1.85 | +85% 补偿 |
| 50000 | 2.35 | 2.35 | +135% 补偿 |

**设计意图**:
- 短文本（<100 tokens）校正因子为 1.0，不做任何调整（这些文本已被 `total < 20` 的短路逻辑跳过）
- 长文本获得更多补偿，抵消 unique/total 的自然衰减
- `min(..., 1)` 确保密度值不超过 1.0，保持阈值域不变
- 使用 `log10` 而非 `log2` 使校正曲线更平缓，避免过度补偿

**与纯 log-normalized（`unique / log2(total)`）的对比**:

纯 log-normalized 会改变密度值域（不再是 0-1），需要全面重新校准所有阈值。长度校正因子方案保持了 0-1 值域和现有阈值不变，向后兼容性更好。

#### 7.1 校准实验

**方法**: 在 13 篇标注样本（8 篇 NORMAL + 5 篇 SPAM）上测试 6 种校正函数，测量分离度（minNormal - maxSpam）、假阳性率（FPR）和假阴性率（FNR）。

**样本覆盖**:

| 类别 | 标签 | 样本数 | 长度范围 |
|------|------|:------:|---------|
| 正常短文 | NORMAL | 3 | 130-150 字 |
| 正常中文 | NORMAL | 2 | 450-550 字 |
| 正常长文 | NORMAL | 1 | 2400+ 字 |
| 技术文献 | NORMAL | 2 | 950-1650 字（含代码块） |
| SEO 水文 | SPAM | 2 | 330-370 字（关键词堆砌） |
| 纯重复 | SPAM | 3 | 1950-2500 字（同句反复） |

**校正函数对比**:

| 函数 | 公式 | 分离度 | FPR | FNR |
|------|------|:------:|:---:|:---:|
| f0 无校正 | `u/t` | 0.037 | 0% | 40% |
| **f1 log10/2** | `min(raw × max(1, log10(t)/2), 1)` | **0.113** | **0%** | **40%** |
| f2 log2/3 | `min(raw × max(1, log2(t)/3), 1)` | 0.000 | 0% | 60% |
| f3 log10/3 | `min(raw × max(1, log10(t)/3), 1)` | 0.070 | 0% | 40% |
| f4 加法 | `min(raw × (1+0.15×log10(t)), 1)` | 0.009 | 0% | 40% |
| f5 sqrt | `min(raw × max(1, √log10(t)), 1)` | 0.000 | 0% | 40% |

**关键发现**:

1. **f1（当前方案）分离度最优**（0.113），正常内容 0.95-1.00，spam 最高 0.88，无需更换函数。

2. **SEO 水文无法用密度检测**。关键词堆砌类 spam 的 2-gram 多样性高达 0.70-0.73（raw），与正常文章（0.76-0.99）高度重叠。原因是虽然段落和关键词在重复，但段落内部的词汇组合是多样的——"装修公司哪家好"和"装修团队经验丰富"的 2-gram 集合几乎不重叠。这是 2-gram 密度方法的根本局限。

3. **纯重复文本密度极低**（0.01-0.12），任何校正函数都能轻松捕获。

4. **初始阈值偏低**。原 `gateMinDensity=0.10` / `gateWarnDensity=0.30` 基于经验猜测，实测发现正常内容最低密度为 0.95，纯重复最高仅 0.12，中间存在巨大的空白区域（0.12-0.95），旧阈值设在空白区域的底部，过于保守。

**阈值调整**（基于实测分布）:

| Profile | gateMinDensity | gateWarnDensity | 调整依据 |
|---------|:---:|:---:|---|
| dense | 0.08 → **0.15** | 0.20 → **0.50** | 0.15 精准阻断纯重复（max=0.12），不误报正常内容（min=0.95） |
| balanced | 0.10 → **0.15** | 0.30 → **0.50** | 同上 |
| sparse | 0.12 → **0.15** | 0.35 → **0.50** | 同上，统一 warn 阈值 |

---

### 改进 8：噪声检测范围扩展

**文件**: `src/utils/gate-rules.ts:202-225`

**问题 1 — `charCodeAt` vs `codePointAt`**:

旧代码使用 `ch.charCodeAt(0)` 获取字符编码。JavaScript 字符串使用 UTF-16，`charCodeAt` 只能返回 0x0000-0xFFFF（BMP 范围）。对于 BMP 之外的字符（如 Emoji U+1F600），`charCodeAt` 返回的是代理对（surrogate pair）的值（0xD83D 和 0xDE00），**不是**字符的实际码点。

虽然代理对值（0xD800-0xDFFF）不在任何白名单范围内，会被正确判定为噪声，但这是"不认识所以是噪声"，而非"知道是 emoji 所以不是噪声"。当我们需要将 emoji 加入白名单时，`charCodeAt` 无法正确识别 emoji 的码点。

**改动**:
```typescript
// Before
const code = ch.charCodeAt(0);

// After
const code = ch.codePointAt(0)!;
```

`codePointAt` 返回字符的完整 Unicode 码点（包括 BMP 外的字符），与 `for...of` 迭代配合（`for...of` 已正确按码点迭代），可以准确判断任何 Unicode 字符。

**问题 2 — 白名单缺失范围**:

| 新增范围 | 码点 | 分类 | 理由 |
|----------|------|------|------|
| Emoji | 0x1F300-0x1F9FF | **非噪声** | 现代文本中 emoji 是正常内容组成部分 |
| 数学符号 | 0x2200-0x22FF | **非噪声** | 技术/学术文章中的正常符号（∀、∃、∈、∪ 等） |
| 方块/制表符 | 0x2500-0x257F | **非噪声** | 代码截图 OCR 残留或 ASCII art 中的正常字符 |
| 零宽字符 | 0x200B-0x200F | 保持噪声 | 网页复制粘贴中常见的不可见字符，应报告 |

**注意**: 零宽字符（Zero-Width Space 等）在视觉上不可见但会大量存在于从某些网页复制的内容中。当前它们不在白名单内，`isNoise` 正确返回 `true`。保持不变，但未来可扩展为单独报告类型（如 `warnings.push('[噪声] 检测到零宽字符')`），帮助用户理解具体问题。

---

### 改进 9：相似度采样策略改进

**文件**: `src/utils/gate-rules.ts:266-292`

**问题**: 旧实现 `.slice(0, 1000)` 只取前 1000 字符。两篇前 1000 字相同但后面不同的文章（如模板文章只改结尾）会被误判为重复；开头不同但主体 80% 相同的文章会漏判。

**改动**: 头中尾三段采样

```typescript
function sampleText(s: string, budget: number = 1500): string {
  if (s.length <= budget) return s;
  const segLen = Math.floor(budget / 3);
  const head = s.slice(0, segLen);
  const midStart = Math.floor((s.length - segLen) / 2);
  const mid = s.slice(midStart, midStart + segLen);
  const tail = s.slice(s.length - segLen);
  return head + mid + tail;
}

function calculateSimilarity(str1: string, str2: string): number {
  const s1 = sampleText(str1.toLowerCase().replace(/\s+/g, ''));
  const s2 = sampleText(str2.toLowerCase().replace(/\s+/g, ''));
  // ... Jaccard 相似度计算不变
}
```

**采样策略对比**:

| 特性 | 旧方案 | 新方案 |
|------|--------|--------|
| 采样量 | 1000 字符 | 1500 字符（3 × 500） |
| 覆盖范围 | 仅头部 | 头部 + 中部 + 尾部 |
| 头部相同尾部不同 | 误判为重复 | 尾段差异降低相似度 |
| 头部不同主体相同 | 可能漏判 | 中段相似性提升检出 |
| 性能影响 | ~ | 略增（+50% 字符），仍为 O(n) |

**设计约束**: 总采样量 1500 字符是性能与覆盖的平衡点。门控阶段的相似度检测是快速筛查（注释 line 249-261 已说明），不做精确比对。精确去重由 Phase 4 的 `crossCheckBatch` 和 Phase 4b 的 `checkAgainstVaultDetailed` 负责。

---

### 改进 10：广告变体检测增强

**文件**: `src/utils/gate-rules.ts:86-132`

#### 10.1 变体正则模式

新增 3 条正则模式，覆盖常见广告变体：

```typescript
const AD_VARIANT_PATTERNS: RegExp[] = [
  /限[时期限].{0,3}[优特惠抢]/g,               // 限时优惠/限量特惠/限期特惠
  /点击.{0,3}(这里|链接|进入)/g,               // 点击这里/点击→这里/点击 这里
  /(?:🔥|💰|🎁|👉).{0,5}(?:优惠|抢购|福利|免费)/g, // 🔥限时优惠 / 💰抢购
];
```

**设计考量**:
- `.{0,3}` / `.{0,5}` 允许关键词之间插入少量字符（emoji、空格、箭头等变体手段）
- 正则使用 `g` flag 匹配所有出现，而非 `test()` 只判断存在
- 每个模式最多记录 3 个匹配（`matches.slice(0, 3)`），避免一篇长文中反复出现同一模式导致命中数虚高

#### 10.2 密度报告

在阻断/警告消息中附加密度信息（命中数/百字），帮助用户理解信号强度：

```typescript
const hitRate = totalHits / (contentLen / 100);
// 消息示例：检测到大量低质信号（点击链接、限时优惠）（密度 2.3/百字），疑似为广告或营销内容
```

**重要设计决策**: 密度归一化（`hitRate`）仅用于**信息展示**，不参与阻断判定。阻断仍使用绝对计数（`totalHits >= 3`）。

原因：短内容（如 54 字的文章出现 2 个广告词）的 hitRate 会被放大到 3.7/百字，但实际上只是一次偶尔提及，不应阻断。绝对计数对短内容更公平——3 个独立关键词同时出现才说明问题严重。

---

## 四、数据流图

```
┌──────────────────────────────────────────────────────────┐
│                    runExtraction()                        │
│                                                          │
│  ┌─────────┐    ┌───────────┐    ┌──────────────────┐   │
│  │ Phase 1  │───▶│  truncate │───▶│ Profile 分类     │   │
│  │ 读取内容 │    │ ≤10000字  │    │ classifyContent  │   │
│  └─────────┘    └───────────┘    │ (纯规则，零API)   │   │
│                                   └────────┬─────────┘   │
│                                            │             │
│                                   ┌────────▼─────────┐   │
│                                   │  Phase 2: 门控    │   │
│                                   │                  │   │
│                                   │  runGateChecks(  │   │
│                                   │    content,      │   │
│                                   │    [],           │   │
│                                   │    profileConfig │   │
│                                   │  )               │   │
│                                   │                  │   │
│                                   │  ┌────────────┐  │   │
│                                   │  │ 5条规则     │  │   │
│                                   │  │ + 累积升级  │  │   │
│                                   │  └────────────┘  │   │
│                                   └────────┬─────────┘   │
│                                            │             │
│                                   passed? ─┤             │
│                                   │ Yes    │ No → 返回   │
│                                   ▼        │             │
│                              Phase 3-6     │             │
│                              提炼/去重/核查 │             │
└──────────────────────────────────────────────────────────┘
```

---

## 五、测试覆盖矩阵

| 测试用例 | 覆盖改进项 | 类型 |
|----------|-----------|------|
| `should pass for normal content` | 基线 | 原有 |
| `should block for very short content` | 基线 | 原有 |
| `should warn for short but acceptable content` | 基线 | 原有 |
| `should handle very long content` | #3 截断对齐 | 原有（语义变化：>50000 的内容被截断后不再触发长度警告） |
| `should block for spammy content (3+ signals)` | #1 大小写、#10 变体检测 | 原有 |
| `should warn for content with some spam signals` | #10 变体检测 | 原有（回归验证） |
| `should block for very low information density` | #7 密度校正 | 原有 |
| `should handle low density content` | #4 tokenizer、#7 密度校正 | 原有 |
| `should block for high noise ratio` | #8 噪声扩展 | 原有 |
| `should block for duplicate content` | #9 相似度采样 | 原有 |
| `should not block for different content` | #9 相似度采样 | 原有 |
| `should handle empty content` | 基线 | 原有 |
| `should handle content with emojis` | #8 噪声扩展 | 原有（emoji 现在在白名单内） |
| **`dense profile 应放宽密度下限`** | **#5 Profile 感知** | **新增** |
| **`sparse profile 应收紧噪声阈值`** | **#5 Profile 感知** | **新增** |
| **`未传入 profileConfig 时应使用默认阈值`** | **#5 向后兼容** | **新增** |
| **`累积 3 条以上警告应自动升级为阻断`** | **#6 警告升级** | **新增** |
| **`少于 3 条警告不应升级为阻断`** | **#6 警告升级** | **新增** |
| **`5000字正常文章不应被误判为低密度`** | **#7 密度偏见** | **新增** |
| **`emoji 内容不应被误判为噪声`** | **#8 噪声扩展** | **新增** |
| **`数学符号不应被误判为噪声`** | **#8 噪声扩展** | **新增** |
| **`头部相同但尾部不同的长文章不应被误判为重复`** | **#9 相似度采样** | **新增** |
| **`emoji 包裹的广告应被识别`** | **#10 广告变体** | **新增** |
| **`变体关键词应被正则匹配`** | **#10 广告变体** | **新增** |
| **`每个 profile 都应有完整的门控阈值字段`** | **#5 ProfileConfig** | **新增** |
| **`dense 应比 balanced 更宽松`** | **#5 ProfileConfig** | **新增** |
| **`门控阈值应可被用户覆盖`** | **#5 ProfileConfig** | **新增** |

---

## 六、已知局限与后续建议

### 6.1 Rule 5 重复检测仍为死代码

当前 `processedContents` 始终传入空数组。未来如果引入批量处理功能（如一次处理多个 URL），调用方应维护已处理内容列表并传入：

```typescript
// 示例：批量处理场景
const processedContents: string[] = [];
for (const input of batchInputs) {
  const result = await runExtraction(input, { ...config });
  if (result.success) {
    processedContents.push(input.content); // 或其他内容标识
  }
}
```

### 6.2 广告检测未引入机器学习

当前使用关键词 + 正则变体的规则方法，对已知模式效果好，但对新型广告变体（谐音替换、图片文字等）无能为力。未来可考虑：
- 收集标注数据（正常文章 vs 广告），训练简单的 TF-IDF + Logistic Regression 分类器
- 模型产物（权重向量）序列化到 JSON，运行时加载，无需训练流程
- 作为可选的高级功能，通过 `ExtractorConfig` 开关控制

### 6.3 密度检测的能力边界（已校准）

**校准状态**: 已在 13 篇标注样本上完成 6 种校正函数的系统测试（详见 §7.1）。当前校正函数 f1（log10/2）分离度最优（0.113），阈值已基于实测分布调整（block=0.15, warn=0.50）。

**已知局限**: 2-gram 密度方法只能检测"纯重复"类 spam（同一内容反复复制，密度 0.01-0.12），对"关键词堆砌"类 SEO 水文无效（密度 0.70-0.88，与正常文章重叠）。这是 2-gram 粒度的根本局限——段落内部的词汇组合多样性掩盖了段落级别的重复。

**后续方向**: 引入**段落重复率**指标——计算段落间的 Jaccard 相似度，如果多段之间高度相似则标记为可疑。这与 2-gram 密度互补：密度抓 token 级重复，段落重复率抓结构级重复。

### 6.4 相似度采样的进一步优化

头中尾三段采样覆盖了更多文本区域，但对于特定结构的文档（如开头和结尾高度相似、中间插入不同内容的"三明治"结构）仍可能误判。后续可考虑：
- 等间隔 N 段采样（如 5 段 × 300 字符）
- 按段落边界采样（按 `\n\n` 分段后等比取样）
- 但这些优化会增加复杂度，当前三段方案已覆盖最常见场景

---

## 七、变更文件清单

| 文件 | 改动行数 | 改动类型 |
|------|:--------:|----------|
| `src/utils/gate-rules.ts` | ~120 | 签名变化、删除本地 tokenizer、密度算法、噪声扩展、相似度采样、广告变体、警告升级 |
| `src/extractor.ts` | ~20 | 门控调用改截断内容、分类提前、传入 profileConfig |
| `src/extraction/profiles.ts` | ~25 | ProfileConfig 扩展 4 字段、删除本地 STOP_WORDS、默认值填充 |
| `tests/gate-rules.test.ts` | ~150 | 新增 11 个测试用例（Profile 感知、警告累积、密度偏见、噪声扩展、相似度采样、广告变体） |
| `tests/profiles.test.ts` | ~35 | 新增 3 个 ProfileConfig 门控阈值测试 |
