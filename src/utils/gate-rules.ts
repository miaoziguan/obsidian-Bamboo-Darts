/**
 * 质量门控规则
 * 双层逻辑：硬阻断（直接拒绝） + 软警告（提醒用户但允许继续）
 *
 * 规则清单：
 *   1. 长度检查   — <50 字硬拦，50-200 字警告
 *   2. 广告/低质   — 高频命中硬拦，低频警告
 *   3. 信息密度   — <0.1 硬拦，<0.3 警告
 *   4. 噪声占比   — >70% 硬拦，>40% 警告
 *   5. 重复检测   — 硬拦（已有逻辑保留）
 */

import {
  GATE_MIN_CONTENT_LENGTH,
  GATE_WARN_CONTENT_LENGTH,
  MAX_CONTENT_LENGTH,
  GATE_DUPLICATE_THRESHOLD,
  GATE_MIN_DENSITY,
  GATE_WARN_DENSITY,
  GATE_MAX_NOISE_RATIO,
  GATE_WARN_NOISE_RATIO,
} from '../constants';

// ─── 类型 ───

interface GateResult {
  passed: boolean;
  level: 'block' | 'warn';
  reason?: string;
}

export interface GateCheckResult {
  passed: boolean;
  reasons: string[];   // 硬阻断原因
  warnings: string[];  // 软警告原因
}

// ─── 广告/低质关键词 ───

const COMMERCIAL_SPAM = [
  '点击这里', '立即购买', '限时优惠', '抢购',
  '广告', '推广', '赞助', '点击链接',
  'buy now', 'click here', 'limited offer',
];

const LOW_QUALITY_SIGNALS = [
  '你绝对想不到', '惊呆了', '炸裂',
];

// ─── 规则 1: 长度检查 ───

function checkLength(content: string): GateResult {
  const len = content.length;

  if (len < GATE_MIN_CONTENT_LENGTH) {
    return {
      passed: false,
      level: 'block',
      reason: `内容过短（${len} 字），可能信息不足`,
    };
  }

  if (len < GATE_WARN_CONTENT_LENGTH) {
    return {
      passed: true,
      level: 'warn',
      reason: `内容偏短（${len} 字），提炼结果可能有限`,
    };
  }

  if (len > MAX_CONTENT_LENGTH) {
    return {
      passed: true,
      level: 'warn',
      reason: `内容较长（${len} 字），建议分段处理`,
    };
  }

  return { passed: true, level: 'block' };
}

// ─── 规则 2: 广告/低质检测 ───

function checkQuality(content: string): GateResult {
  const lower = content.toLowerCase();

  const matchedAds = COMMERCIAL_SPAM.filter(kw => lower.includes(kw.toLowerCase()));
  const matchedLowQ = LOW_QUALITY_SIGNALS.filter(kw => content.includes(kw));

  const totalHits = matchedAds.length + matchedLowQ.length;

  if (totalHits >= 3) {
    const allMatches = [...matchedAds, ...matchedLowQ];
    return {
      passed: false,
      level: 'block',
      reason: `检测到大量低质信号（${allMatches.join('、')}），疑似为广告或营销内容`,
    };
  }

  if (totalHits >= 1) {
    const allMatches = [...matchedAds, ...matchedLowQ];
    return {
      passed: true,
      level: 'warn',
      reason: `检测到少量低质信号（${allMatches.join('、')}），建议人工确认`,
    };
  }

  return { passed: true, level: 'block' };
}

// ─── 规则 3: 信息密度 ───

function checkDensity(content: string): GateResult {
  const tokens = extractTokens(content);
  if (tokens.length < 20) return { passed: true, level: 'block' }; // 太短不判

  const unique = new Set(tokens.map(t => t.toLowerCase()));
  const density = unique.size / tokens.length;

  if (density < GATE_MIN_DENSITY) {
    return {
      passed: false,
      level: 'block',
      reason: `信息密度极低（${(density * 100).toFixed(0)}%），大量重复内容，疑似SEO水文`,
    };
  }

  if (density < GATE_WARN_DENSITY) {
    return {
      passed: true,
      level: 'warn',
      reason: `信息密度偏低（${(density * 100).toFixed(0)}%），可能存在重复内容`,
    };
  }

  return { passed: true, level: 'block' };
}

/** 提取 CJK + 拉丁连续词作为 token */
function extractTokens(text: string): string[] {
  // 先做基础清洗
  const cleaned = text
    .replace(/[\s\n\r\t]+/g, ' ')           // 空白归一
    .replace(/[^\u4e00-\u9fff\w\s]/g, '')   // 只保留汉字、字母数字、空白
    .trim();

  if (!cleaned) return [];

  // 用 2-gram 处理中文，用词边界处理英文
  const tokens: string[] = [];
  const cjkRe = /([\u4e00-\u9fff])/g;
  const parts = cleaned.split(cjkRe).filter(Boolean);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (/^[\u4e00-\u9fff]$/.test(part)) {
      // 单字，与后面的汉字组成 2-gram
      if (i + 1 < parts.length && /^[\u4e00-\u9fff]$/.test(parts[i + 1])) {
        tokens.push(part + parts[i + 1]);
      } else if (i > 0 && /^[\u4e00-\u9fff]$/.test(parts[i - 1])) {
        // 已在前一个 2-gram 中，跳过
      } else {
        tokens.push(part);
      }
    } else {
      // 非 CJK —— 按空格分词
      const words = part.split(/\s+/).filter(w => w.length > 0);
      tokens.push(...words);
    }
  }

  return tokens;
}

// ─── 规则 4: 噪声占比 ───

function checkNoiseRatio(content: string): GateResult {
  if (content.length < GATE_MIN_CONTENT_LENGTH) {
    // 太短让长度规则处理
    return { passed: true, level: 'block' };
  }

  let noiseChars = 0;
  for (const ch of content) {
    if (isNoise(ch)) noiseChars++;
  }

  const ratio = noiseChars / content.length;

  if (ratio > GATE_MAX_NOISE_RATIO) {
    return {
      passed: false,
      level: 'block',
      reason: `噪声占比过高（${(ratio * 100).toFixed(0)}%），内容可能为图片残留或乱码`,
    };
  }

  if (ratio > GATE_WARN_NOISE_RATIO) {
    return {
      passed: true,
      level: 'warn',
      reason: `噪声占比较高（${(ratio * 100).toFixed(0)}%），建议检查内容完整性`,
    };
  }

  return { passed: true, level: 'block' };
}

/** 判断单字符是否为噪声 */
function isNoise(ch: string): boolean {
  const code = ch.charCodeAt(0);
  // 允许：CJK 统一表意文字, 拉丁字母, 数字, 常见标点, 空白, 换行
  if (
    (code >= 0x4E00 && code <= 0x9FFF) ||  // CJK
    (code >= 0x3400 && code <= 0x4DBF) ||  // CJK Ext-A
    (code >= 0x20000 && code <= 0x2A6DF) || // CJK Ext-B
    (code >= 0x30A0 && code <= 0x30FF) ||  // 片假名
    (code >= 0x3040 && code <= 0x309F) ||  // 平假名
    (code >= 0xAC00 && code <= 0xD7AF) ||  // 韩文
    (code >= 0x0020 && code <= 0x007E) ||  // ASCII 可打印
    (code >= 0x00A0 && code <= 0x00FF) ||  // Latin-1 Supplement
    (code >= 0x2000 && code <= 0x206F) ||  // 通用标点
    (code >= 0x3000 && code <= 0x303F) ||  // CJK 符号和标点
    (code >= 0xFF00 && code <= 0xFFEF) ||  // 半角/全角形式
    (code === 0x0009 || code === 0x000A || code === 0x000D) // tab, LF, CR
  ) {
    return false;
  }
  return true;
}

// ─── 规则 5: 重复检测 ───

function checkDuplicate(
  content: string,
  processedContents: string[]
): GateResult {
  for (const existing of processedContents) {
    const similarity = calculateSimilarity(content, existing);
    if (similarity > GATE_DUPLICATE_THRESHOLD) {
      return {
        passed: false,
        level: 'block',
        reason: `与已处理内容高度相似（相似度：${(similarity * 100).toFixed(1)}%）`,
      };
    }
  }

  return { passed: true, level: 'block' };
}

// ─── 相似度计算（保留原逻辑） ───

function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().replace(/\s+/g, '').slice(0, 1000);
  const s2 = str2.toLowerCase().replace(/\s+/g, '').slice(0, 1000);

  if (s1.length === 0 || s2.length === 0) return 0;

  const lenRatio = Math.min(s1.length, s2.length) / Math.max(s1.length, s2.length);
  if (lenRatio < 0.5) return 0;

  const distance = levenshteinDistance(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  return 1 - distance / maxLen;
}

function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;

  const matrix = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[len1][len2];
}

// ─── 综合门控 ───

/**
 * 执行所有门控规则
 * - 硬阻断 → passed=false，reason 进 reasons
 * - 软警告 → passed 不受影响，reason 进 warnings
 */
export function runGateChecks(
  content: string,
  processedContents: string[] = []
): GateCheckResult {
  const reasons: string[] = [];
  const warnings: string[] = [];

  const rules: Array<{ name: string; check: GateResult }> = [
    { name: '长度', check: checkLength(content) },
    { name: '质量', check: checkQuality(content) },
    { name: '密度', check: checkDensity(content) },
    { name: '噪声', check: checkNoiseRatio(content) },
    { name: '重复', check: checkDuplicate(content, processedContents) },
  ];

  for (const { name, check } of rules) {
    if (!check.passed) {
      reasons.push(`[${name}] ${check.reason}`);
    } else if (check.level === 'warn' && check.reason) {
      warnings.push(`[${name}] ${check.reason}`);
    }
  }

  return {
    passed: reasons.length === 0,
    reasons,
    warnings,
  };
}
