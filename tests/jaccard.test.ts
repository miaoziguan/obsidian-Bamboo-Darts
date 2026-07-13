import { describe, it, expect } from 'vitest';
import { jaccardSimilarity } from '../src/utils/jaccard';

describe('jaccardSimilarity', () => {
  it('两空集合应返回 0（避免除零）', () => {
    expect(jaccardSimilarity(new Set<string>(), new Set<string>())).toBe(0);
    expect(jaccardSimilarity([], [])).toBe(0);
  });

  it('接受 Set 与数组混合输入', () => {
    expect(jaccardSimilarity(new Set(['a', 'b']), ['a', 'b'])).toBe(1);
    expect(jaccardSimilarity(['a', 'b'], new Set(['a', 'b']))).toBe(1);
    expect(jaccardSimilarity(new Set(['a']), new Set(['b']))).toBe(0);
  });

  it('完全相同集合相似度为 1', () => {
    expect(jaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
  });

  it('部分重叠应计算交集/并集', () => {
    // 交集 1，并集 3 → 1/3
    expect(jaccardSimilarity(['a', 'b'], ['a', 'c'])).toBeCloseTo(1 / 3, 6);
  });

  it('完全不相交应返回 0', () => {
    expect(jaccardSimilarity(['a', 'b'], ['c', 'd'])).toBe(0);
  });

  it('重复元素不应影响集合语义', () => {
    const r = jaccardSimilarity(['a', 'a', 'b'], ['a', 'b', 'b']);
    expect(r).toBe(1);
  });
});
