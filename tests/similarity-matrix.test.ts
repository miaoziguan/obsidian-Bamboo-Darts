import { describe, it, expect } from 'vitest';
import { SimilarityIndex, mmrRerank, buildSimilarityMatrix } from '../src/discovery/similarity-matrix';
import type { NoteMeta } from '../src/discovery/similarity-matrix';

function note(path: string, title: string, keywords: string[]): NoteMeta {
  return { path, title, content: '', keywords };
}

describe('SimilarityIndex', () => {
  it('builds inverted index and computes Jaccard similarity on demand', () => {
    const notes = [
      note('a.md', 'A', ['苹果', '香蕉', '水果']),
      note('b.md', 'B', ['苹果', '橙子', '水果']),
      note('c.md', 'C', ['汽车', '轮胎']),
    ];
    const index = new SimilarityIndex(notes, notes.map((n) => n.keywords!));

    expect(index.getSimilarity(0, 0)).toBe(1);
    expect(index.getSimilarity(0, 1)).toBeCloseTo(2 / 4, 5); // 交集 2，并集 4
    expect(index.getSimilarity(0, 2)).toBe(0);
    expect(index.getSimilarity(1, 2)).toBe(0);
  });

  it('returns cached value for repeated queries', () => {
    const notes = [
      note('a.md', 'A', ['x', 'y']),
      note('b.md', 'B', ['x', 'z']),
    ];
    const index = new SimilarityIndex(notes, notes.map((n) => n.keywords!));
    const first = index.getSimilarity(0, 1);
    const second = index.getSimilarity(0, 1);
    expect(first).toBe(second);
    expect(index.computedPairs).toBe(1);
  });

  it('returns zero for out-of-range indices', () => {
    const notes = [note('a.md', 'A', ['x'])];
    const index = new SimilarityIndex(notes, notes.map((n) => n.keywords!));
    expect(index.getSimilarity(0, 5)).toBe(0);
    expect(index.getSimilarity(-1, 0)).toBe(0);
  });

  it('getSimilarityRow only computes non-zero entries', () => {
    const notes = [
      note('a.md', 'A', ['苹果', '香蕉']),
      note('b.md', 'B', ['苹果', '橙子']),
      note('c.md', 'C', ['汽车']),
      note('d.md', 'D', ['香蕉']),
    ];
    const index = new SimilarityIndex(notes, notes.map((n) => n.keywords!));
    const row = index.getSimilarityRow(0);

    expect(row).toHaveLength(4);
    expect(row[0]).toBe(1);
    expect(row[1]).toBeCloseTo(1 / 3, 5);
    expect(row[2]).toBe(0);
    expect(row[3]).toBeCloseTo(1 / 2, 5);
    // 只有两对相似度被计算（0-1 和 0-3）
    expect(index.computedPairs).toBe(2);
  });
});

describe('mmrRerank', () => {
  it('reranks with similarity provider', () => {
    const notes = [
      note('a.md', 'A', ['苹果', '香蕉']),
      note('b.md', 'B', ['苹果', '橙子']),
      note('c.md', 'C', ['汽车', '轮胎']),
    ];
    const index = new SimilarityIndex(notes, notes.map((n) => n.keywords!));
    const simToQuery = index.getSimilarityRow(0);
    const ranked = mmrRerank(simToQuery, index, 0, 2, 0.6);

    // b 与 a 相似度更高，应排在第一位；c 与 a 相似度为 0
    expect(ranked.length).toBeLessThanOrEqual(2);
    expect(ranked[0].idx).toBe(1);
  });

  it('respects topK limit', () => {
    const notes = Array.from({ length: 10 }, (_, i) =>
      note(`${i}.md`, `Note ${i}`, [`kw${i % 3}`]),
    );
    const index = new SimilarityIndex(notes, notes.map((n) => n.keywords!));
    const simToQuery = index.getSimilarityRow(0);
    const ranked = mmrRerank(simToQuery, index, 0, 3, 0.6);
    expect(ranked.length).toBe(3);
  });
});

describe('buildSimilarityMatrix', () => {
  it('returns sparse index instead of dense matrix', async () => {
    const vault = {
      getMarkdownFiles: () => [],
    } as unknown as import('obsidian').Vault;

    const { notes, index } = await buildSimilarityMatrix(vault, undefined, undefined, undefined, {
      maxNotes: 500,
      useIndex: false,
    });

    expect(notes).toEqual([]);
    expect(index).toBeInstanceOf(SimilarityIndex);
    expect(index.size).toBe(0);
  });
});
