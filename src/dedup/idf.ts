/**
 * IDF 计算与 TF-IDF 向量构建
 * 从 deduplicator.ts 拆分，职责单一：语料库统计 + 向量计算
 */

import {
  IDF_SMOOTH,
  MIN_TOKENS_THRESHOLD,
  BM25_K1,
  BM25_B,
} from '../constants';

// ─── 类型 ───

/** 语料库级 IDF 表 */
export interface IdfTable {
  docCount: number;
  idf: Map<string, number>; // token → idf 值
}

/** 用于持久化缓存的文档频率表 */
export interface DfCounts {
  [token: string]: number;
}

/** 文档 TF-IDF 向量 */
export interface TfIdfVector {
  weights: Map<string, number>; // token → tf-idf 权重
  norm: number; // L2 范数
  tokenCount: number; // 原始 token 数（用于最小门槛判断）
  topTokens: string[]; // 权重最高的 topN 个 token（用于 Jaccard 关键词比对）
}

// ─── IDF 计算 ───

/**
 * 计算语料库的 IDF 表
 * @param docTokens 每篇文档的 token 频次表
 * @param docCount 文档总数（用于平滑，docTokens 可能只是已有笔记）
 */
export function computeIdfTable(
  docTokens: Array<Map<string, number>>,
  docCount?: number,
): IdfTable & { dfCounts: Map<string, number> } {
  const N = docCount || docTokens.length || 1;
  const docFreq = new Map<string, number>();

  for (const tokens of docTokens) {
    for (const token of tokens.keys()) {
      docFreq.set(token, (docFreq.get(token) || 0) + 1);
    }
  }

  const idf = new Map<string, number>();
  for (const [token, df] of docFreq) {
    idf.set(token, Math.log((N + IDF_SMOOTH) / (df + IDF_SMOOTH)) + 1);
  }

  return { docCount: N, idf, dfCounts: docFreq };
}

// ─── TF-IDF 向量 ───

/**
 * 计算文档向量的 TF-IDF 权重和 L2 范数
 * 注：不存完整向量，存 (token → tf-idf) + 范数用于快速点积
 */
export function computeTfIdfVector(
  tokens: Map<string, number>,
  idfTable: IdfTable,
  docLen: number = 0,
  avgDocLen: number = 0,
): TfIdfVector {
  const weights = new Map<string, number>();
  let sumSq = 0;
  const k1 = BM25_K1;
  const b = BM25_B;
  // BM25 长度归一化系数（avgDocLen=0 时退化为标准 TF）
  const lenNorm = avgDocLen > 0 ? 1 - b + (b * docLen) / avgDocLen : 1;

  for (const [token, freq] of tokens) {
    // BM25 饱和词频
    const tf = freq / (freq + k1 * lenNorm);
    const idf =
      idfTable.idf.get(token) || Math.log((idfTable.docCount + IDF_SMOOTH) / (0 + IDF_SMOOTH)) + 1;
    const weight = tf * idf;
    weights.set(token, weight);
    sumSq += weight * weight;
  }

  return {
    weights,
    norm: Math.sqrt(sumSq),
    tokenCount: tokens.size,
    // 取权重最高的 5 个 token 作为关键词指纹
    topTokens: [...weights.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k]) => k),
  };
}

// ─── 相似度 ───

/**
 * 计算两个 TF-IDF 向量的余弦相似度
 * 优化：遍历较小的向量，避免全量扫描
 */
export function cosineSimilarity(v1: TfIdfVector, v2: TfIdfVector): number {
  if (v1.norm === 0 || v2.norm === 0) return 0;
  if (v1.tokenCount < MIN_TOKENS_THRESHOLD || v2.tokenCount < MIN_TOKENS_THRESHOLD) return 0;

  // 遍历较小的向量
  const [small, large] =
    v1.weights.size <= v2.weights.size ? [v1.weights, v2.weights] : [v2.weights, v1.weights];

  let dot = 0;
  for (const [token, weight] of small) {
    const otherWeight = large.get(token);
    if (otherWeight !== undefined) {
      dot += weight * otherWeight;
    }
  }

  const sim = dot / (v1.norm * v2.norm);
  // 浮点误差钳制
  return sim > 1.0 ? 1.0 : sim < 0.0 ? 0.0 : sim;
}

/** 字符级编辑距离（Levenshtein），归一化为相似度 */
export function editSimilarity(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  if (m === 0 || n === 0) return 0;

  // Uint32Array: 最大 4294967295，远大于 Obsidian 笔记合理长度，避免溢出
  let prev = new Uint32Array(n + 1);
  let curr = new Uint32Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }

  const maxLen = Math.max(m, n);
  return 1 - prev[n] / maxLen;
}
