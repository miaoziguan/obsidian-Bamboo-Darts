/**
 * 相似度矩阵与笔记发现
 * 从 main.js 中反混淆而来：_buildSimMatrix, _findOrphans, _findClusters, _genMocTitle, _jsim
 */

import { Vault, TFile } from 'obsidian';
import { extractKeywords } from './keywords';
import { DEDUP_BATCH_SIZE } from '../constants';

// ─── Types ───

interface DiscoveryCache {
  matrix: number[][] | null;
  notes: NoteMeta[] | null;
  timestamp: number;
}

interface OrphanCache {
  orphans: OrphanNote[] | null;
  timestamp: number;
}

export interface NoteMeta {
  path: string;
  title: string;
  content: string;
}

interface OrphanNote {
  path: string;
  title: string;
  stat: any;
}

// ─── Cache Manager ───

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * 发现缓存管理器
 * 封装 _dscache 和 _orphcache 模块级变量，由插件实例管理生命周期
 */
class DiscoveryCacheManager {
  private discoveryCache: DiscoveryCache = { matrix: null, notes: null, timestamp: 0 };
  private orphanCache: OrphanCache = { orphans: null, timestamp: 0 };

  /** 清除所有缓存 */
  invalidate(): void {
    this.discoveryCache = { matrix: null, notes: null, timestamp: 0 };
    this.orphanCache = { orphans: null, timestamp: 0 };
  }

  /** 获取相似度矩阵缓存（若未过期） */
  getDiscovery(): { notes: NoteMeta[]; matrix: number[][] } | null {
    if (this.discoveryCache.matrix && this.discoveryCache.timestamp > Date.now() - CACHE_TTL) {
      return { notes: this.discoveryCache.notes!, matrix: this.discoveryCache.matrix };
    }
    return null;
  }

  /** 更新相似度矩阵缓存 */
  setDiscovery(notes: NoteMeta[], matrix: number[][]): void {
    this.discoveryCache = { matrix, notes, timestamp: Date.now() };
  }

  /** 获取孤立笔记缓存（若未过期） */
  getOrphans(): OrphanNote[] | null {
    if (this.orphanCache.orphans && this.orphanCache.timestamp > Date.now() - CACHE_TTL) {
      return this.orphanCache.orphans;
    }
    return null;
  }

  /** 更新孤立笔记缓存 */
  setOrphans(orphans: OrphanNote[]): void {
    this.orphanCache = { orphans, timestamp: Date.now() };
  }
}

/** 全局默认单例，供无插件实例的场景使用 */
const defaultCacheManager = new DiscoveryCacheManager();

// ─── Utility ───

/** Jaccard similarity between two keyword sets */
function jaccardSim(setA: Set<string>, setB: Set<string>): number {
  if (!setA || !setB || setA.size === 0 || setB.size === 0) return 0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

/** Strip YAML frontmatter from markdown content */
function stripFrontmatter(content: string): string {
  return content.replace(/^---[\s\S]*?---\n*/, '').trim();
}

// ─── Core Functions ───


/** Build similarity matrix for all notes in the vault */
export async function buildSimilarityMatrix(
  vault: Vault,
  targetFolder?: string,
  cacheManager: DiscoveryCacheManager = defaultCacheManager
): Promise<{ notes: NoteMeta[]; matrix: number[][] }> {
  // Return cached if valid
  const cached = cacheManager.getDiscovery();
  if (cached) {
    return cached;
  }

  const notes: NoteMeta[] = [];
  const allFiles = vault.getMarkdownFiles();
  const files = targetFolder
    ? allFiles.filter(f => f.path.startsWith(targetFolder))
    : allFiles;

  // Bug #18 修复：分批读取文件，避免内存飙升
  const limit = Math.min(files.length, 500);
  for (let i = 0; i < limit; i += DEDUP_BATCH_SIZE) {
    const batch = files.slice(i, i + DEDUP_BATCH_SIZE);
    const batchNotes = await Promise.all(
      batch.map(async file => {
        const raw = await vault.read(file);
        const content = stripFrontmatter(raw);
        const title = file.path.split('/').pop()!.replace(/\.md$/, '');
        return { path: file.path, title, content };
      })
    );
    notes.push(...batchNotes);
  }

  // Build keyword sets
  const keywordSets = notes.map(n => extractKeywords(n.content));

  // Build similarity matrix (symmetric)
  const matrix: number[][] = [];
  for (let i = 0; i < notes.length; i++) {
    matrix[i] = [];
    for (let j = 0; j < notes.length; j++) {
      matrix[i][j] = i === j ? 1 : jaccardSim(keywordSets[i], keywordSets[j]);
    }
  }

  // Update cache
  cacheManager.setDiscovery(notes, matrix);
  return { notes, matrix };
}

/** Find orphan notes (no incoming or outgoing links) */
async function findOrphanNotes(
  vault: Vault,
  targetFolder?: string,
  cacheManager: DiscoveryCacheManager = defaultCacheManager
): Promise<OrphanNote[]> {
  // Return cached if valid
  const cached = cacheManager.getOrphans();
  if (cached) {
    return cached;
  }

  const allFiles = vault.getMarkdownFiles();
  const files = targetFolder
    ? allFiles.filter(f => f.path.startsWith(targetFolder))
    : allFiles;

  const limit = Math.min(files.length, 500);

  // Bug #12 修复：正确检测入链和出链
  // 第一遍：读取所有文件，收集每个文件的出链目标
  const fileOutgoingLinks: Map<string, string[]> = new Map();
  // 全局入链计数：标题 -> 被引用次数
  const incomingLinkCounts: Map<string, number> = new Map();

  for (let i = 0; i < limit; i += DEDUP_BATCH_SIZE) {
    const batch = files.slice(i, i + DEDUP_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async file => {
        try {
          const content = await vault.read(file);
          const outgoingMatches = content.match(/\[\[(.+?)\]\]/g);
          const outgoingTitles = outgoingMatches
            ? outgoingMatches.map(m => m.replace(/\[\[|\]\]/g, '').split('|')[0].trim())
            : [];
          return { path: file.path, outgoingTitles };
        } catch {
          return { path: file.path, outgoingTitles: [] as string[] };
        }
      })
    );

    for (const result of batchResults) {
      fileOutgoingLinks.set(result.path, result.outgoingTitles);
      // 统计入链
      for (const targetTitle of result.outgoingTitles) {
        const normalized = targetTitle.toLowerCase();
        incomingLinkCounts.set(normalized, (incomingLinkCounts.get(normalized) || 0) + 1);
      }
    }
  }

  // 第二遍：判断每个文件是否为孤立笔记
  const orphans: OrphanNote[] = [];
  for (const file of files.slice(0, limit)) {
    const title = file.path.split('/').pop()!.replace(/\.md$/, '');
    const outgoing = fileOutgoingLinks.get(file.path) || [];
    const outgoingCount = outgoing.length;

    // 入链：其他文件引用了这个文件的标题（排除自引用）
    const normalizedTitle = title.toLowerCase();
    let incomingCount = incomingLinkCounts.get(normalizedTitle) || 0;
    // 减去自引用（当前文件自己引用自己的情况）
    const selfRefs = outgoing.filter(t => t.toLowerCase() === normalizedTitle).length;
    incomingCount -= selfRefs;

    if (incomingCount === 0 && outgoingCount === 0) {
      orphans.push({ path: file.path, title, stat: (file as any).stat });
    }
  }

  // Sort by creation time ascending (safe null check)
  orphans.sort((a, b) => {
    const aTime = a.stat?.ctime ?? 0;
    const bTime = b.stat?.ctime ?? 0;
    return aTime - bTime;
  });

  // Update cache
  cacheManager.setOrphans(orphans);
  return orphans;
}

/** Find related notes (for auto recommendation) */
async function findRelatedNotes(
  vault: Vault,
  content: string,
  targetFolder?: string
): Promise<{ title: string; similarity: number; path: string }[]> {
  const results: { title: string; similarity: number; path: string }[] = [];
  const allFiles = vault.getMarkdownFiles();
  const files = targetFolder
    ? allFiles.filter(f => f.path.startsWith(targetFolder))
    : allFiles;

  const contentKeyWords = extractKeywords(content);

  for (const file of files.slice(0, 200)) {
    const raw = await vault.read(file);
    const noteContent = stripFrontmatter(raw);
    const sim = jaccardSim(contentKeyWords, extractKeywords(noteContent));
    // Only include notes with moderate similarity (not too similar, not too different)
    if (sim > 0.5 && sim < 0.7) {
      const title = file.path.split('/').pop()!.replace(/\.md$/, '');
      results.push({ title, similarity: sim, path: file.path });
    }
  }

  return results.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
}

/** Convenience export for invalidating caches without a DiscoveryCacheManager instance */
function invalidateCaches(): void {
    defaultCacheManager.invalidate();
}
