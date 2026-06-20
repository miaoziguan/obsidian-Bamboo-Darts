/**
 * 内容分类 & 提炼策略（Profile）
 *
 * 根据文章特征自动判断类型，为后续过滤阶段（去重、质量审查）提供差异化阈值。
 * 分类器纯规则实现，零 API 调用。
 */

// ─── 类型定义 ───

export type ContentProfile = 'dense' | 'balanced' | 'sparse';

export interface ProfileConfig {
  /** Phase 4: 批内交叉去重余弦相似度阈值 */
  crossBatchThreshold: number;
  /** Phase 4b: 库内去重 — 高于此值自动丢弃 */
  vaultHighThreshold: number;
  /** Phase 4b: 库内去重 — 高于此值标记待确认 */
  vaultMidThreshold: number;
  /** Phase 6: 质量审查最低分（低于此分丢弃） */
  reviewMinScore: number;
}

// ─── 默认策略参数 ───

export const PROFILE_CONFIGS: Record<ContentProfile, ProfileConfig> = {
  dense: {
    crossBatchThreshold: 0.75,
    vaultHighThreshold: 0.80,
    vaultMidThreshold: 0.65,
    reviewMinScore: 2,
  },
  balanced: {
    crossBatchThreshold: 0.65,
    vaultHighThreshold: 0.70,
    vaultMidThreshold: 0.55,
    reviewMinScore: 3,
  },
  sparse: {
    crossBatchThreshold: 0.55,
    vaultHighThreshold: 0.60,
    vaultMidThreshold: 0.45,
    reviewMinScore: 4,
  },
};

// ─── 策略中文名称 ───

export const PROFILE_LABELS: Record<ContentProfile, string> = {
  dense: '技术文献',
  balanced: '通用文章',
  sparse: '观点评论',
};

// ─── 噪声隔离：分类前剥离非正文内容 ───

/**
 * 剥离 HTML 标签、URL、代码围栏、图片/链接 markdown 等非正文内容，
 * 确保 classifyContent 的密度信号只来自真正的正文数据点。
 */
function stripNoise(text: string): string {
  let s = text;
  // 剥离代码围栏（保留围栏数量供 countCodeBlocks 使用，这里只影响密度计算）
  s = s.replace(/```[\s\S]*?```/g, ' ');
  // 剥离行内代码
  s = s.replace(/`[^`]+`/g, ' ');
  // 剥离 HTML 标签
  s = s.replace(/<[^>]+>/g, ' ');
  // 剥离 URL（http/https 链接）
  s = s.replace(/https?:\/\/\S+/g, ' ');
  // 剥离 markdown 图片和链接：![alt](url)、[text](url)
  s = s.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1 ');
  s = s.replace(/\[([^\]]*)\]\([^)]+\)/g, '$1 ');
  // 剥离 HTML 实体
  s = s.replace(/&\w+;/g, ' ');
  // 剥离微信常见元数据标记："阅读 1234"、"赞 56"、"🎧 X人"
  s = s.replace(/(?:阅读|阅读数|点赞|在看|转发|收藏)\s*\d+/g, ' ');
  s = s.replace(/🎧\s*\d+人/g, ' ');
  return s;
}

// ─── 内容分类器 ───

/** 代码块数量 */
function countCodeBlocks(text: string): number {
  const matches = text.match(/```[\s\S]*?```/g);
  return matches ? matches.length : 0;
}

/** 技术术语密度：英文词 + 斜杠分隔术语，每千字 */
function technicalTermDensity(text: string): number {
  const charCount = text.length || 1;
  // 连续英文字母词（≥3 字母，排除常见停用词）
  const STOP_WORDS = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
    'her', 'was', 'one', 'our', 'out', 'has', 'have', 'this', 'that', 'with',
    'from', 'they', 'been', 'said', 'each', 'which', 'their', 'will', 'other',
    'about', 'many', 'then', 'them', 'these', 'some', 'would', 'into', 'more',
  ]);
  const englishWords = text.match(/\b[a-zA-Z]{3,}\b/g) || [];
  const filteredEnglish = englishWords.filter(w => !STOP_WORDS.has(w.toLowerCase()));

  // 斜杠分隔术语，如 client/server、TCP/IP
  const slashTerms = text.match(/[a-zA-Z]+\/[a-zA-Z]+/g) || [];

  // 带连字符的技术复合词，如 event-driven、real-time
  const hyphenTerms = text.match(/[a-zA-Z]+-[a-zA-Z]+/g) || [];

  const totalTerms = filteredEnglish.length + slashTerms.length + hyphenTerms.length;
  return (totalTerms / charCount) * 1000;
}

/** 数据密度：数值型数据点，每千字 */
function dataDensity(text: string): number {
  const charCount = text.length || 1;
  const seen = new Set<string>();
  let count = 0;

  // 百分比：12.5%、约 30%
  for (const m of text.matchAll(/(?:约|近|超|达)?\d+(?:\.\d+)?%/g)) {
    if (!seen.has(m[0])) { seen.add(m[0]); count++; }
  }

  // 数值 + 工程单位：2300V、1500V DC、3.3kV、100kW、50kWh、0.3Ω
  for (const m of text.matchAll(/\d+(?:\.\d+)?\s*(?:mV|kV|V|mW|kW|MW|GW|TW|W|mWh|kWh|MWh|GWh|mA|kA|A|Ω|mΩ|Hz|kHz|MHz|GHz|μF|mF|nF|pF|°C|°F|mm|cm|m|km|kg|t|Pa|kPa|MPa|bar|ppm|ppb|dB|dBm)/gi)) {
    if (!seen.has(m[0])) { seen.add(m[0]); count++; }
  }

  // 年份和日期：2024年、2025-03、2024/06/15（排除更长数字的子串）
  for (const m of text.matchAll(/(?<!\d)\d{4}(?:[-\/年]\d{1,2}(?:[-\/月]\d{1,2})?)?(?!\d)/g)) {
    const year = parseInt(m[0]);
    if (year >= 1900 && year <= 2100 && !seen.has(m[0])) {
      seen.add(m[0]); count++;
    }
  }

  // 中文量级单位：亿元、万人、GW 级、百万台
  for (const m of text.matchAll(/\d+(?:\.\d+)?\s*(?:万亿|亿|千万|百万|万|千)\s*(?:元|美元|欧元|人|台|套|条|座|个|辆|次)?/g)) {
    if (!seen.has(m[0])) { seen.add(m[0]); count++; }
  }

  return (count / charCount) * 1000;
}

/** 段落平均长度（字） */
function avgParagraphLength(text: string): number {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  if (paragraphs.length === 0) return 0;
  const totalChars = paragraphs.reduce((sum, p) => sum + p.trim().length, 0);
  return totalChars / paragraphs.length;
}

/** 叙事性词汇比例（每千字） */
function narrativeWordDensity(text: string): number {
  const charCount = text.length || 1;
  // 常见叙事/情感/过渡词汇
  const NARRATIVE_PATTERNS = [
    /然而/g, /但是/g, /却/g, /不禁/g, /渐渐/g, /终于/g,
    /忽然/g, /突然/g, /似乎/g, /仿佛/g, /依然/g, /仍然/g,
    /默默/g, /悄悄/g, /缓缓/g, /淡淡/g, /深深/g, /轻轻/g,
    /回忆/g, /想起/g, /记得/g, /故事/g, /情感/g, /感受/g,
    /心情/g, /思绪/g, /目光/g, /微笑/g, /沉默/g, /叹息/g,
  ];
  let count = 0;
  for (const pattern of NARRATIVE_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return (count / charCount) * 1000;
}

/**
 * 自动判断文章类型
 *
 * 判断逻辑（按优先级）：
 * 1. 有代码块 或 技术术语密度 ≥ 5/千字 或 数据密度 ≥ 4/千字 → dense
 * 2. 段落平均长度 > 300 字 且 叙事性词汇密度 ≥ 2/千字 → sparse
 * 3. 其余 → balanced
 */
export function classifyContent(text: string): ContentProfile {
  if (!text || text.length < 100) return 'balanced';

  // 代码块数量使用原始文本（围栏本身就是技术特征）
  const codeBlocks = countCodeBlocks(text);

  // 密度计算使用去噪后的正文，避免 HTML/URL/元数据噪声
  const clean = stripNoise(text);
  const termDensity = technicalTermDensity(clean);
  const dDensity = dataDensity(clean);

  // 技术文章特征：代码块、技术术语密集、或数据密集
  if (codeBlocks >= 1 || termDensity >= 5 || dDensity >= 4) {
    return 'dense';
  }

  const avgLen = avgParagraphLength(clean);
  const narrativeDensity = narrativeWordDensity(clean);

  // 散文/叙事特征
  if (avgLen > 300 && narrativeDensity >= 2) {
    return 'sparse';
  }

  return 'balanced';
}

/**
 * 解析实际生效的 profile 配置
 * 用户自定义覆盖 > profile 默认值
 */
export function resolveProfileConfig(
  profile: ContentProfile,
  overrides?: Partial<Record<ContentProfile, Partial<ProfileConfig>>>,
): ProfileConfig {
  const base = { ...PROFILE_CONFIGS[profile] };
  if (overrides && overrides[profile]) {
    return { ...base, ...overrides[profile] };
  }
  return base;
}
