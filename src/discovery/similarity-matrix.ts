/**
 * 相似度矩阵构建（倒排索引 + 惰性稀疏矩阵）
 */

import { Vault } from 'obsidian';
import { extractKeywordSet } from '../utils/tokenizer';
import { jaccardSimilarity } from '../utils/jaccard';
import { DEDUP_BATCH_SIZE } from '../constants';
import { DiscoveryIndex } from './index-manager';

// ─── Types ───

interface DiscoveryCache {
  index: SimilarityIndex | null;
  notes: NoteMeta[] | null;
  timestamp: number;
}

export interface NoteMeta {
  path: string;
  title: string;
  content: string;
  /** 来自发现索引的预提取关键词集合（索引模式下直接复用） */
  keywords?: string[];
}

/** 发现 Tab 构建相似度矩阵时的可配置参数 */
export interface DiscoveryOptions {
  /** 最大参与计算的笔记数量（默认 500） */
  maxNotes?: number;
  /** 候选笔记的 Jaccard 相似度最低门槛（默认 0.3） */
  jaccardThreshold?: number;
  /** 是否优先使用发现索引，避免重复读文件 */
  useIndex?: boolean;
}

/** 相似度访问接口，供 MMR 重排使用 */
export interface SimilarityProvider {
  get size(): number;
  getSimilarity(i: number, j: number): number;
}

/**
 * 基于关键词倒排索引的稀疏相似度矩阵
 *
 * 不预先生成完整的 O(n²) 矩阵，而是：
 * 1. 构建关键词 -> 笔记索引的倒排索引
 * 2. 只计算有共同关键词的笔记对的 Jaccard 相似度
 * 3. 已计算的相似度会缓存，避免重复计算
 */
export class SimilarityIndex implements SimilarityProvider {
  private notes: NoteMeta[];
  private keywordSets: string[][];
  private invertedIndex: Map<string, Set<number>>;
  private cache: Map<string, number>;

  constructor(notes: NoteMeta[], keywordSets: string[][]) {
    this.notes = notes;
    this.keywordSets = keywordSets;
    this.invertedIndex = this.buildInvertedIndex();
    this.cache = new Map();
  }

  private buildInvertedIndex(): Map<string, Set<number>> {
    const index = new Map<string, Set<number>>();
    for (let i = 0; i < this.keywordSets.length; i++) {
      for (const kw of this.keywordSets[i]) {
        let set = index.get(kw);
        if (!set) {
          set = new Set();
          index.set(kw, set);
        }
        set.add(i);
      }
    }
    return index;
  }

  get size(): number {
    return this.notes.length;
  }

  /** 获取笔记元数据数组 */
  getNotes(): NoteMeta[] {
    return this.notes;
  }

  /** 获取某笔记与所有其他笔记的相似度数组（按需惰性计算） */
  getSimilarityRow(i: number): number[] {
    const row = new Array(this.notes.length).fill(0);
    row[i] = 1;

    const candidates = new Set<number>();
    for (const kw of this.keywordSets[i]) {
      const set = this.invertedIndex.get(kw);
      if (set) {
        for (const j of set) {
          if (j !== i) candidates.add(j);
        }
      }
    }

    for (const j of candidates) {
      row[j] = this.getSimilarity(i, j);
    }

    return row;
  }

  /** 获取两笔记间的 Jaccard 相似度（带缓存） */
  getSimilarity(i: number, j: number): number {
    if (i === j) return 1;
    if (i < 0 || j < 0 || i >= this.notes.length || j >= this.notes.length) return 0;

    const key = i < j ? `${i}#${j}` : `${j}#${i}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    // 通过倒排索引快速判断是否有共同关键词
    const setA = this.keywordSets[i];
    const setB = this.keywordSets[j];
    const smaller = setA.length <= setB.length ? setA : setB;
    const otherIdx = setA.length <= setB.length ? j : i;
    let hasOverlap = false;
    for (const kw of smaller) {
      if (this.invertedIndex.get(kw)?.has(otherIdx)) {
        hasOverlap = true;
        break;
      }
    }

    if (!hasOverlap) {
      this.cache.set(key, 0);
      return 0;
    }

    const sim = jaccardSimilarity(setA, setB);
    this.cache.set(key, sim);
    return sim;
  }

  /** 估计当前缓存的相似度对数量 */
  get computedPairs(): number {
    return this.cache.size;
  }
}

// ─── Cache Manager ───

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * 发现缓存管理器
 */
class DiscoveryCacheManager {
  private discoveryCache: DiscoveryCache = { index: null, notes: null, timestamp: 0 };

  /** 清除所有缓存 */
  invalidate(): void {
    this.discoveryCache = { index: null, notes: null, timestamp: 0 };
  }

  /** 获取相似度索引缓存（若未过期） */
  getDiscovery(): { notes: NoteMeta[]; index: SimilarityIndex } | null {
    if (this.discoveryCache.index && this.discoveryCache.timestamp > Date.now() - CACHE_TTL) {
      return { notes: this.discoveryCache.notes!, index: this.discoveryCache.index };
    }
    return null;
  }

  /** 更新相似度索引缓存 */
  setDiscovery(notes: NoteMeta[], index: SimilarityIndex): void {
    this.discoveryCache = { index, notes, timestamp: Date.now() };
  }
}

/** 全局默认单例，供无插件实例的场景使用 */
const defaultCacheManager = new DiscoveryCacheManager();

/** 手动清除发现 Tab 的相似度矩阵缓存 */
export function invalidateDiscoveryCache(): void {
  defaultCacheManager.invalidate();
}

// ─── Utility ───

/** Strip YAML frontmatter from markdown content */
function stripFrontmatter(content: string): string {
  return content.replace(/^---[\s\S]*?---\n*/, '').trim();
}

// ─── Core Functions ───

/** Build similarity index for notes in the vault or target folder */
export async function buildSimilarityMatrix(
  vault: Vault,
  targetFolder?: string,
  cacheManager: DiscoveryCacheManager = defaultCacheManager,
  discoveryIndex?: DiscoveryIndex,
  options: DiscoveryOptions = {},
): Promise<{ notes: NoteMeta[]; index: SimilarityIndex }> {
  const { maxNotes = 500, useIndex = true } = options;

  // Return cached if valid
  const cached = cacheManager.getDiscovery();
  if (cached) {
    return cached;
  }

  let notes: NoteMeta[] = [];
  let keywordSets: string[][] = [];

  // 优先使用发现索引：避免读文件，支持更大规模
  if (useIndex && discoveryIndex) {
    await discoveryIndex.load();
    const features = discoveryIndex.filterByFolder(targetFolder);
    const sliced = features.slice(0, maxNotes);
    notes = sliced.map((f) => ({
      path: f.path,
      title: f.title,
      content: '', // 索引模式下不保存正文，仅用于占位
      keywords: f.keywords,
    }));
    keywordSets = sliced.map((f) => f.keywords);
  }

  // 索引未启用或为空时，回退到读文件
  if (notes.length === 0) {
    const allFiles = vault.getMarkdownFiles();
    const files = targetFolder
      ? allFiles.filter((f) => f.path === targetFolder || f.path.startsWith(targetFolder + '/'))
      : allFiles;

    const limit = Math.min(files.length, maxNotes);
    for (let i = 0; i < limit; i += DEDUP_BATCH_SIZE) {
      const batch = files.slice(i, i + DEDUP_BATCH_SIZE);
      const batchNotes = await Promise.all(
        batch.map(async (file) => {
          const raw = await vault.read(file);
          const content = stripFrontmatter(raw);
          const title = file.path.split('/').pop()!.replace(/\.md$/, '');
          return { path: file.path, title, content };
        }),
      );
      notes.push(...batchNotes);
    }
  }

  // 构建关键词集合（索引模式下已预生成，回退模式从正文提取）
  if (keywordSets.length === 0) {
    keywordSets = notes.map((n) => extractKeywordSet(n.content));
  }

  // 使用倒排索引构建稀疏相似度矩阵（不预生成完整 O(n²) 矩阵）
  const index = new SimilarityIndex(notes, keywordSets);
  cacheManager.setDiscovery(notes, index);
  return { notes, index };
}

/**
 * MMR (Maximal Marginal Relevance) 重排
 * 平衡「与查询笔记的相关度」和「与已选笔记的多样性」，避免推荐列表里扎堆相似笔记
 *
 * @param simToQuery       每条笔记与查询笔记的相似度数组（长度 = notes.length）
 * @param similarityProvider 相似度访问器（支持倒排索引惰性计算）
 * @param queryIdx         查询笔记在 notes 中的索引
 * @param topK             最终返回数量
 * @param lambda           相关度权重（0=full diversity, 1=full relevance）
 * @returns MMR 重排后的结果列表，每项含 idx 和原始相似度 sim
 */
export function mmrRerank(
  simToQuery: number[],
  similarityProvider: SimilarityProvider,
  queryIdx: number,
  topK: number,
  lambda = 0.6,
): { idx: number; sim: number }[] {
  const n = simToQuery.length;
  const selected: number[] = [];
  const candidates = new Set<number>();

  for (let i = 0; i < n; i++) {
    if (i !== queryIdx) candidates.add(i);
  }

  while (selected.length < topK && candidates.size > 0) {
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (const c of candidates) {
      const relevance = simToQuery[c];
      let diversityPenalty = 0;
      if (selected.length > 0) {
        let maxSimToSelected = 0;
        for (const s of selected) {
          maxSimToSelected = Math.max(maxSimToSelected, similarityProvider.getSimilarity(c, s));
        }
        diversityPenalty = maxSimToSelected;
      }
      const score = lambda * relevance - (1 - lambda) * diversityPenalty;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = c;
      }
    }

    if (bestIdx < 0) break;
    selected.push(bestIdx);
    candidates.delete(bestIdx);
  }

  return selected.map((idx) => ({ idx, sim: simToQuery[idx] }));
}
