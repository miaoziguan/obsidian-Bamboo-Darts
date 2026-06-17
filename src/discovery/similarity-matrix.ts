/**
 * 相似度矩阵构建
 */

import { Vault } from 'obsidian';
import { extractKeywords } from './keywords';
import { DEDUP_BATCH_SIZE } from '../constants';

// ─── Types ───

interface DiscoveryCache {
  matrix: number[][] | null;
  notes: NoteMeta[] | null;
  timestamp: number;
}

export interface NoteMeta {
  path: string;
  title: string;
  content: string;
}

// ─── Cache Manager ───

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * 发现缓存管理器
 */
class DiscoveryCacheManager {
  private discoveryCache: DiscoveryCache = { matrix: null, notes: null, timestamp: 0 };

  /** 清除所有缓存 */
  invalidate(): void {
    this.discoveryCache = { matrix: null, notes: null, timestamp: 0 };
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
