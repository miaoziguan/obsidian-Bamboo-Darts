/**
 * 去重模块（Phase 5-6）
 * - Phase 5: 同批交叉去重
 * - Phase 6: 知识库去重比对（使用全文匹配）
 *
 * 【相似度算法说明】
 * 本模块使用「关键词 Jaccard 相似度」：
 *   - 提取文本的关键词集合（中文 2-gram + 英文单词，去停用词）
 *   - 计算两个集合的 Jaccard 相似度
 *   - 适用场景：提炼后的原子笔记（已去噪、长度适中）
 *
 * 与 gate-rules.ts 的「字符 bigram Jaccard」区别：
 *   - gate-rules：原始文本质量门控，对噪声鲁棒，长度归一化
 *   - 本模块：提炼后笔记比对，语义聚焦，但关键词集合过小时易误判
 *
 * 【最小关键词门槛】
 * 当关键词集合 < DEDUP_MIN_KEYWORDS 时，不判定为重复。
 * 原因：集合太小时，一个重叠词就能达到高相似度（如"AI"与"AI模型"）
 */

import { Vault, TFile } from 'obsidian';
import { AtomicNote } from './utils/notes-standards';
import { SIMILARITY_THRESHOLD, DEDUP_BATCH_SIZE, DEDUP_MIN_KEYWORDS } from './constants';
import { extractKeywords } from './discovery/keywords';

interface DuplicateInfo {
  isDuplicate: boolean;
  similarity: number;
  matchedNote?: string; // 匹配的笔记路径
  matchedContent?: string; // 匹配的内容片段
}

interface DedupResult {
  uniqueNotes: AtomicNote[];
  removedCount: number;
  duplicates: DuplicateInfo[];
}

// ─── Dedup Cache ───

const DEDUP_CACHE_TTL = 5 * 60 * 1000; // 5 minutes, same as similarity-matrix

interface CachedNote {
  path: string;
  content: string;
  keywords: Set<string>;
  mtime: number;
}

interface DedupCache {
  notes: CachedNote[];
  timestamp: number;
}

/**
 * 去重缓存管理器
 * 缓存目标文件夹下已有笔记的内容和关键词，避免每次全量读取
 */
class DedupCacheManager {
  private cache: DedupCache = { notes: [], timestamp: 0 };

  /** 标记缓存失效 */
  invalidate(): void {
    this.cache = { notes: [], timestamp: 0 };
  }

  /** 获取缓存（若未过期） */
  get(targetFolder: string, vault: Vault): CachedNote[] | null {
    if (Date.now() - this.cache.timestamp > DEDUP_CACHE_TTL) {
      return null;
    }
    // 验证文件未变动（简单检查 mtime）
    for (const cached of this.cache.notes) {
      const file = vault.getAbstractFileByPath(cached.path);
      if (!(file instanceof TFile) || file.stat.mtime !== cached.mtime) {
        return null; // 有文件变动，重新读取
      }
    }
    return this.cache.notes;
  }

  /** 更新缓存 */
  set(notes: CachedNote[]): void {
    this.cache = { notes, timestamp: Date.now() };
  }
}

/** 全局默认单例 */
const defaultDedupCache = new DedupCacheManager();

/**
 * Phase 5: 同批交叉去重（优化版）
 * 检查当前批次的笔记之间是否有重复
 * 
 * 优化策略：
 * - 预计算所有笔记的关键词集合，避免重复计算
 * - 使用长度预过滤快速跳过明显不同的笔记
 * - 用索引映射替代 find 查找
 */
export function crossCheckBatch(notes: AtomicNote[]): DedupResult {
  const uniqueNotes: AtomicNote[] = [];
  const uniqueIndices: number[] = []; // 存储 uniqueNotes 对应的原始索引
  const duplicates: DuplicateInfo[] = [];

  // 预计算所有笔记的关键词和长度
  const noteMeta = notes.map(note => ({
    note,
    keywords: extractKeywords(note.content),
    length: note.content.length,
  }));

  // 长度预过滤阈值
  const LENGTH_RATIO_THRESHOLD = 0.3;

  for (let i = 0; i < noteMeta.length; i++) {
    const { note, keywords, length } = noteMeta[i];
    let isDuplicate = false;
    let bestMatch: DuplicateInfo | null = null;

    for (let j = 0; j < uniqueIndices.length; j++) {
      const uniqueIdx = uniqueIndices[j];
      const uniqueMeta = noteMeta[uniqueIdx];

      // 快速预过滤：长度差异过大则跳过
      if (Math.abs(length - uniqueMeta.length) / Math.max(length, uniqueMeta.length) > LENGTH_RATIO_THRESHOLD) {
        continue;
      }

      const similarity = jaccardSimilarity(keywords, uniqueMeta.keywords);
      if (similarity > SIMILARITY_THRESHOLD) {
        isDuplicate = true;
        bestMatch = {
          isDuplicate: true,
          similarity,
          matchedNote: `同批笔记 #${j + 1}: ${uniqueNotes[j].title}`,
          matchedContent: uniqueNotes[j].content.slice(0, 200),
        };
        break;
      }
    }

    if (isDuplicate && bestMatch) {
      duplicates.push(bestMatch);
    } else {
      uniqueNotes.push(note);
      uniqueIndices.push(i);
    }
  }

  return {
    uniqueNotes,
    removedCount: notes.length - uniqueNotes.length,
    duplicates,
  };
}

/**
 * Phase 6: 知识库去重比对（全文匹配版 + 缓存优化）
 * 将新笔记与已有笔记比对，检测语义重复
 */
export async function checkAgainstVault(
  vault: Vault,
  notes: AtomicNote[],
  targetFolder: string,
  cacheManager: DedupCacheManager = defaultDedupCache
): Promise<DedupResult> {
  const uniqueNotes: AtomicNote[] = [];
  const duplicates: DuplicateInfo[] = [];

  // 读取目标文件夹中的所有笔记（优先使用缓存）
  let existingNotes: CachedNote[];
  const cached = cacheManager.get(targetFolder, vault);

  if (cached) {
    existingNotes = cached;
  } else {
    const allFiles = vault.getMarkdownFiles();
    const existingFiles = targetFolder
      ? allFiles.filter(file => file.path.startsWith(targetFolder))
      : allFiles;

    existingNotes = [];
    for (let i = 0; i < existingFiles.length; i += DEDUP_BATCH_SIZE) {
      const batch = existingFiles.slice(i, i + DEDUP_BATCH_SIZE);
      const contents = await Promise.all(batch.map(f => vault.read(f)));
      for (let j = 0; j < batch.length; j++) {
        const file = batch[j] as TFile;
        existingNotes.push({
          path: file.path,
          content: contents[j],
          keywords: extractKeywords(contents[j]), // 预提取关键词
          mtime: file.stat.mtime,
        });
      }
    }
    cacheManager.set(existingNotes);
  }

  // 预提取新笔记的关键词和长度
  const newNoteMeta = notes.map(note => ({
    note,
    keywords: extractKeywords(note.content),
    length: note.content.length,
  }));

  // 长度预过滤阈值：长度差异超过 70% 的直接跳过
  const LENGTH_RATIO_THRESHOLD = 0.3;

  // 对每个新笔记，与已有笔记比对
  for (const { note, keywords, length } of newNoteMeta) {
    let isDuplicate = false;
    let bestMatch: DuplicateInfo | null = null;

    for (const existing of existingNotes) {
      // 快速预过滤：长度差异过大则跳过
      if (Math.abs(length - existing.content.length) / Math.max(length, existing.content.length) > LENGTH_RATIO_THRESHOLD) {
        continue;
      }

      const similarity = jaccardSimilarity(keywords, existing.keywords);

      if (similarity > SIMILARITY_THRESHOLD) {
        isDuplicate = true;
        bestMatch = {
          isDuplicate: true,
          similarity,
          matchedNote: existing.path,
          matchedContent: existing.content.slice(0, 200) + '...',
        };
        break;
      }
    }

    if (isDuplicate && bestMatch) {
      duplicates.push(bestMatch);
    } else {
      uniqueNotes.push(note);
    }
  }

  return {
    uniqueNotes,
    removedCount: notes.length - uniqueNotes.length,
    duplicates,
  };
}

/**
 * 计算两段文本的相似度（基于关键词 Jaccard 相似度）
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = extractKeywords(text1);
  const words2 = extractKeywords(text2);
  return jaccardSimilarity(words1, words2);
}

/**
 * Jaccard 相似度计算（基于预提取的关键词）
 * 最小关键词门槛：当任一集合 < DEDUP_MIN_KEYWORDS 时，不判定为重复
 */
function jaccardSimilarity(words1: Set<string>, words2: Set<string>): number {
  if (words1.size < DEDUP_MIN_KEYWORDS || words2.size < DEDUP_MIN_KEYWORDS) return 0;
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  return intersection.size / union.size;
}
