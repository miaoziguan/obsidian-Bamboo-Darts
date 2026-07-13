import { MAX_CLAIMS_PER_CHECK } from '../constants';

// ─── 可验证元素提取 ───

/** 数值型模式：百分比、数量、日期、排名 */
const DATA_PATTERNS: { regex: RegExp; type: string }[] = [
  { regex: /(?:约|近|超|达|不足)?百分之[\d一二三四五六七八九十百千]+/g, type: 'percent' },
  { regex: /(?:约|近|超|达|不足)?\d+(?:\.\d+)?%/g, type: 'percent' },
  {
    regex:
      /\d+(?:\.\d+)?\s*(?:万亿|万|亿|千|百)?(?:美元|欧元|日元|英镑|人民币|元|美元|人|个|年|月|天|小时|kg|km|m|cm|mm)/g,
    type: 'quantity',
  },
  { regex: /\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/g, type: 'date' },
  { regex: /\d{4}年\d{1,2}月\d{1,2}日/g, type: 'date' },
  { regex: /\d{1,2}月\d{1,2}日/g, type: 'date' },
  { regex: /\d{4}[-/年]\d{1,2}/g, type: 'date' },
  { regex: /(?:第[一二三四五六七八九十\d]+|[一二三四五六七八九十]+倍|\d+倍|\d+番)/g, type: 'rank' },
];

/** 命名实体模式：中文机构名、英文连续大写词组 */
const ENTITY_PATTERNS: { regex: RegExp; type: string }[] = [
  {
    regex:
      /[\u4e00-\u9fff]{2,6}(?:公司|机构|大学|学院|集团|基金|协会|部门|委员会|平台|系统|框架|协议|标准|组织|银行|医院|研究所|实验室)/g,
    type: 'org_cn',
  },
  { regex: /[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})+/g, type: 'org_en' },
];

/** 因果/证据声明关键词 */
const CAUSAL_KEYWORDS = [
  '导致',
  '使得',
  '造成',
  '引起',
  '证明',
  '发现',
  '表明',
  '显示',
  '研究结果',
  '数据表明',
  '统计显示',
  '调查指出',
  '报告指出',
  '因此',
  '所以',
  '由此可见',
  '这说明了',
  '这意味着',
];

export interface VerifiableClaim {
  /** 包含该声明的句子（截断至 80 字） */
  claim: string;
  /** 提取到的数值/实体/关键词锚点 */
  anchor: string;
  /** 声明类型 */
  type: 'numeric' | 'entity' | 'causal';
}

/**
 * 从笔记内容中提取所有可验证声明
 * 涵盖：数值数据、命名实体、因果/证据声明
 */
export function extractVerifiableClaims(content: string): VerifiableClaim[] {
  const claims: VerifiableClaim[] = [];
  const seen = new Set<string>();

  const sentences = content.split(/[。！？\n.!?]+/);

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed || trimmed.length < 3) continue;

    const truncated = trimmed.length <= 80 ? trimmed : trimmed.slice(0, 80) + '...';

    // 1. 数值型声明
    for (const pattern of DATA_PATTERNS) {
      const matches = trimmed.match(pattern.regex);
      if (!matches) continue;
      for (const anchor of matches) {
        if (seen.has(anchor)) continue;
        seen.add(anchor);
        claims.push({ claim: truncated, anchor, type: 'numeric' });
      }
    }

    // 2. 命名实体声明
    for (const pattern of ENTITY_PATTERNS) {
      const matches = trimmed.match(pattern.regex);
      if (!matches) continue;
      for (const anchor of matches) {
        if (seen.has(anchor)) continue;
        seen.add(anchor);
        claims.push({ claim: truncated, anchor, type: 'entity' });
      }
    }

    // 3. 因果/证据声明
    for (const keyword of CAUSAL_KEYWORDS) {
      if (trimmed.includes(keyword) && trimmed.length >= 8) {
        const anchor = keyword;
        const key = `causal:${trimmed.slice(0, 30)}`;
        if (seen.has(key)) break;
        seen.add(key);

        claims.push({ claim: truncated, anchor, type: 'causal' });
        break; // 一个句子只记一次因果声明
      }
    }
  }

  const limited = claims.slice(0, MAX_CLAIMS_PER_CHECK);
  if (claims.length > MAX_CLAIMS_PER_CHECK) {
    console.warn(
      `[核查] 可验证声明 ${claims.length} 条，超出上限 ${MAX_CLAIMS_PER_CHECK}，已截断，剩余 ${claims.length - MAX_CLAIMS_PER_CHECK} 条未核查`,
    );
  }
  return limited;
}

// ─── 原文溯源（Layer 1 核心） ───

interface SourceMatch {
  status: '已溯源' | '需对比';
  /** 原文中匹配到的上下文句子 */
  sourceText: string;
  /** 差异说明（需对比时） */
  diffNote?: string;
}

/**
 * 在原文中查找锚点并提取上下文句子
 * 返回匹配结果，或 null 表示未找到
 */
export function locateAnchorInSource(
  anchor: string,
  type: 'numeric' | 'entity' | 'causal',
  originalContent: string,
): SourceMatch | null {
  // 1. 精确匹配锚点
  const exactIndex = originalContent.indexOf(anchor);
  if (exactIndex >= 0) {
    const sourceText = extractContextSentence(originalContent, exactIndex, anchor.length);
    return { status: '已溯源', sourceText };
  }

  // 2. 数值近似匹配（仅对 numeric 类型）
  if (type === 'numeric') {
    const numMatch = anchor.match(/\d+(?:\.\d+)?/);
    if (numMatch) {
      const num = parseFloat(numMatch[0]);
      if (!isNaN(num)) {
        const allNumbers = originalContent.match(/\d+(?:\.\d+)?/g);
        if (allNumbers) {
          for (const candidate of allNumbers) {
            const candidateNum = parseFloat(candidate);
            if (isNaN(candidateNum)) continue;

            if (candidateNum === num) {
              const idx = originalContent.indexOf(candidate);
              const sourceText = extractContextSentence(originalContent, idx, candidate.length);
              return { status: '已溯源', sourceText };
            }

            const diff = Math.abs(candidateNum - num);
            const relDiff = num !== 0 ? diff / Math.abs(num) : diff;
            if (relDiff > 0 && relDiff < 0.05) {
              const idx = originalContent.indexOf(candidate);
              const sourceText = extractContextSentence(originalContent, idx, candidate.length);
              return {
                status: '已溯源',
                sourceText,
                diffNote: `原文为 ${candidate}，笔记为 ${anchor}`,
              };
            }
          }
        }
      }
    }
  }

  // 3. 部分匹配（关键词/实体片段命中）
  if (type === 'entity' || type === 'causal') {
    // 尝试用锚点的前半部分搜索
    const fragment = anchor.slice(0, Math.max(2, Math.ceil(anchor.length * 0.6)));
    const fragmentIndex = originalContent.indexOf(fragment);
    if (fragmentIndex >= 0) {
      const sourceText = extractContextSentence(originalContent, fragmentIndex, fragment.length);
      return {
        status: '需对比',
        sourceText,
        diffNote: `原文含相关表述"${fragment}"，但未找到完整匹配`,
      };
    }
  }

  return null;
}

/**
 * 从原文中提取包含指定位置的完整句子
 */
function extractContextSentence(content: string, index: number, matchLength: number): string {
  const sentenceDelimiters = /[。！？\n.!?]/;

  // 向前找句子开头
  let start = index;
  while (start > 0 && !sentenceDelimiters.test(content[start - 1])) {
    start--;
  }

  // 向后找句子结尾
  let end = index + matchLength;
  while (end < content.length && !sentenceDelimiters.test(content[end])) {
    end++;
  }
  // 包含结束标点
  if (end < content.length) end++;

  let sentence = content.slice(start, end).trim();
  // 限制长度
  if (sentence.length > 200) {
    sentence = sentence.slice(0, 200) + '...';
  }
  return sentence;
}
