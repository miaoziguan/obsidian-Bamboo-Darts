import { describe, it, expect } from 'vitest';
import {
  computeIdfTable,
  computeTfIdfVector,
  cosineSimilarity,
  editSimilarity,
  IdfTable,
} from '../src/dedup/idf';
import { MIN_TOKENS_THRESHOLD } from '../src/constants';

function mapOf(entries: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(entries));
}

// ─── computeIdfTable ───

describe('computeIdfTable', () => {
  it('应统计每个 token 的文档频率', () => {
    const docs = [mapOf({ a: 1, b: 1 }), mapOf({ b: 1, c: 1 }), mapOf({ a: 1, c: 1 })];
    const { docCount, idf, dfCounts } = computeIdfTable(docs);
    expect(docCount).toBe(3);
    expect(dfCounts.get('a')).toBe(2);
    expect(dfCounts.get('b')).toBe(2);
    expect(dfCounts.get('c')).toBe(2);
    // idf = log((N+smooth)/(df+smooth)) + 1，相同 df 应相同
    expect(idf.get('a')).toBe(idf.get('b'));
  });

  it('docCount 参数应优先于 docTokens.length（更大语料使稀有 token 的 idf 更高）', () => {
    const docs = [mapOf({ a: 1 })];
    // docCount=100 → token 在 100 篇中仅现 1 次，更稀有 → idf 更高
    const big = computeIdfTable(docs, 100);
    // docCount 缺省=1 → token 在 1 篇中现 1 次，不稀有 → idf = 1
    const small = computeIdfTable(docs);
    expect(big.idf.get('a')!).toBeGreaterThan(small.idf.get('a')!);
  });

  it('docTokens 为空时 N 应回退为 1（避免除零）', () => {
    const { docCount, idf } = computeIdfTable([]);
    expect(docCount).toBe(1);
    expect(idf.size).toBe(0);
  });
});

// ─── computeTfIdfVector ───

describe('computeTfIdfVector', () => {
  const idfTable: IdfTable = { docCount: 2, idf: mapOf({ a: 2, b: 1, c: 3 }) as Map<string, number> };

  it('标准 TF 模式（avgDocLen=0）应正常计算权重与范数', () => {
    const v = computeTfIdfVector(mapOf({ a: 2, b: 1 }), idfTable);
    expect(v.weights.get('a')).toBeGreaterThan(0);
    expect(v.weights.get('b')).toBeGreaterThan(0);
    expect(v.norm).toBeCloseTo(Math.sqrt(v.weights.get('a')! ** 2 + v.weights.get('b')! ** 2), 6);
    expect(v.tokenCount).toBe(2);
    expect(v.topTokens.length).toBeLessThanOrEqual(5);
  });

  it('BM25 长度归一化（avgDocLen>0）应改变 tf 饱和值', () => {
    const short = computeTfIdfVector(mapOf({ a: 5 }), idfTable, 10, 100);
    const long = computeTfIdfVector(mapOf({ a: 5 }), idfTable, 500, 100);
    // 长文档 lenNorm 更大 → tf 更小 → 权重更小
    expect(short.weights.get('a')!).toBeGreaterThan(long.weights.get('a')!);
  });

  it('token 缺失于 idf 表时应回退到默认 idf 公式', () => {
    const v = computeTfIdfVector(mapOf({ z: 1 }), idfTable);
    // 默认 idf = log((docCount+smooth)/(0+smooth)) + 1
    expect(v.weights.get('z')).toBeGreaterThan(0);
  });

  it('topTokens 应按权重降序取最高的 5 个', () => {
    const tokens = mapOf({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 });
    const v = computeTfIdfVector(tokens, { docCount: 1, idf: mapOf({ a: 1, b: 1, c: 1, d: 1, e: 1, f: 1 }) });
    expect(v.topTokens).toHaveLength(5);
    expect(v.topTokens[0]).toBe('f'); // 权重最高
    expect(v.topTokens[4]).toBe('b');
  });
});

// ─── cosineSimilarity ───

describe('cosineSimilarity', () => {
  const mk = (tokens: Record<string, number>, idf: Record<string, number> = { x: 1 }) => {
    const v = computeTfIdfVector(mapOf(tokens), { docCount: 1, idf: mapOf(idf) });
    return v;
  };

  it('token 数低于阈值应返回 0（覆盖 norm 与 tokenCount 前置分支）', () => {
    const shortTokens = mapOf({ a: 1 }); // 1 个 token < MIN_TOKENS_THRESHOLD(3)
    const v1 = computeTfIdfVector(shortTokens, { docCount: 1, idf: mapOf({ a: 1 }) });
    const v2 = computeTfIdfVector(mapOf({ a: 1, b: 1, c: 1 }), { docCount: 1, idf: mapOf({ a: 1, b: 1, c: 1 }) });
    expect(v1.tokenCount).toBe(1);
    expect(cosineSimilarity(v1, v2)).toBe(0);
    expect(cosineSimilarity(v2, v1)).toBe(0);
  });

  it('token 数低于阈值应返回 0', () => {
    const shortTokens = mapOf({ a: 1 }); // 1 个 token < MIN_TOKENS_THRESHOLD(3)
    const v1 = computeTfIdfVector(shortTokens, { docCount: 1, idf: mapOf({ a: 1 }) });
    const v2 = computeTfIdfVector(mapOf({ a: 1, b: 1, c: 1 }), { docCount: 1, idf: mapOf({ a: 1, b: 1, c: 1 }) });
    expect(v1.tokenCount).toBe(1);
    expect(cosineSimilarity(v1, v2)).toBe(0);
    expect(cosineSimilarity(v2, v1)).toBe(0);
  });

  it('相同向量相似度应为 1', () => {
    const v = mk({ a: 2, b: 1, c: 3 }, { a: 1, b: 1, c: 1 });
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 6);
  });

  it('仅部分重叠 token 时应按点积计算（遍历较小向量）', () => {
    // 每向量 ≥3 token 以越过 MIN_TOKENS_THRESHOLD
    const v1 = mk({ a: 1, b: 1, c: 1 }, { a: 1, b: 1, c: 1 });
    const v2 = mk({ a: 1, d: 1, e: 1 }, { a: 1, d: 1, e: 1 });
    // 仅 a 重叠
    const expected = (v1.weights.get('a')! * v2.weights.get('a')!) / (v1.norm * v2.norm);
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(expected, 6);
  });

  it('浮点误差应被钳制到 [0,1]', () => {
    // 构造近似 1 但不精确的情况，验证不会 >1
    const v = mk({ a: 1, b: 1, c: 1, d: 1, e: 1 }, { a: 1, b: 1, c: 1, d: 1, e: 1 });
    expect(cosineSimilarity(v, v)).toBeLessThanOrEqual(1);
    expect(cosineSimilarity(v, v)).toBeGreaterThanOrEqual(0);
  });

  it('MIN_TOKENS_THRESHOLD 应为 3', () => {
    expect(MIN_TOKENS_THRESHOLD).toBe(3);
  });
});

// ─── editSimilarity ───

describe('editSimilarity', () => {
  it('两空串/其一为空应返回 0', () => {
    expect(editSimilarity('', '')).toBe(0);
    expect(editSimilarity('abc', '')).toBe(0);
    expect(editSimilarity('', 'abc')).toBe(0);
  });

  it('完全相同字符串相似度为 1', () => {
    expect(editSimilarity('hello', 'hello')).toBe(1);
  });

  it('单字符差异应产生中间相似度', () => {
    const s = editSimilarity('kitten', 'sitten');
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
    // 1 处替换 / 6 长度 → 5/6
    expect(s).toBeCloseTo(5 / 6, 6);
  });

  it('完全不相关应接近 0', () => {
    expect(editSimilarity('abc', 'xyz')).toBeCloseTo(0, 6);
  });

  it('长度差异大时应正确归一化', () => {
    const s = editSimilarity('a', 'abcdef');
    expect(s).toBeCloseTo(1 - 5 / 6, 6);
  });
});
