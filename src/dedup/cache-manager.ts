/**
 * 去重缓存管理器
 * 从 deduplicator.ts 拆分，职责单一：按文件夹缓存笔记特征 + 持久化
 */

import { Vault, TFile, DataAdapter } from 'obsidian';
import { DedupFeatureCache, DedupFeatureFolderData } from './feature-cache';
import { computeIdfTable, computeTfIdfVector, IdfTable, TfIdfVector } from './idf';
import {
  DEDUP_CACHE_TTL,
  MAX_CACHED_FOLDERS,
  MIN_TOKENS_THRESHOLD,
  IDF_SMOOTH,
} from '../constants';
import { isPathInFolder } from '../deduplicator';

// ─── 内部类型 ───

/** 缓存的单篇笔记元数据 + 向量 */
export interface CachedNote {
  path: string;
  content: string;
  contentHash: string;
  contentLength: number;
  contentPreview: string;
  tokens: Map<string, number>; // token → 频次
  titleTokens: Map<string, number>; // 标题 token → 频次（可选）
  vector: TfIdfVector; // 基于知识库语料的 tf-idf 向量
  titleVector: TfIdfVector | null; // 标题向量
  simhashFp: bigint; // SimHash 64-bit 指纹
  mtime: number;
}

/** 按文件夹隔离的去重缓存 */
interface DedupCache {
  notes: CachedNote[];
  idfTable: IdfTable;
  /** token → 原始文档频率（用于增量 IDF 更新） */
  dfCounts: Map<string, number>;
  targetFolder: string; // 按文件夹隔离缓存
  timestamp: number;
}

// ─── 管理器 ───

/**
 * 去重缓存管理器
 * 按 targetFolder 独立缓存，避免跨文件夹污染
 */
export class DedupCacheManager {
  private caches = new Map<string, DedupCache>(); // folder → cache
  private featureCache = new DedupFeatureCache();
  private savePending = false;
  /** LRU 访问顺序（最近使用的在末尾） */
  private _accessOrder: string[] = [];

  async initialize(adapter: DataAdapter, pluginDir: string): Promise<void> {
    this.featureCache.initialize(adapter, pluginDir);
    await this.featureCache.load();
    // 将持久化缓存恢复到内存（不做文件读取验证，由 get 在首次使用时处理）
    for (const [folder, folderData] of Object.entries(this.featureCache.getAllFolders())) {
      try {
        const cache = this.buildCacheFromFeatureData(folder, folderData);
        if (cache) this._cacheSet(folder, cache);
      } catch (e) {
        console.warn('[Bamboo Darts] 恢复去重缓存失败:', folder, e);
      }
    }
  }

  invalidate(): void {
    this.caches.clear();
    this._accessOrder = [];
    this.featureCache.invalidate();
  }

  /** 缓存写入（含 LRU 淘汰） */
  private _cacheSet(folder: string, cache: DedupCache): void {
    if (!this._accessOrder.includes(folder)) {
      this._accessOrder.push(folder);
      // 超出上限 → 淘汰最久未用的文件夹
      while (this._accessOrder.length > MAX_CACHED_FOLDERS) {
        const evicted = this._accessOrder.shift()!;
        this.caches.delete(evicted);
        this.featureCache.deleteFolder(evicted);
      }
    }
    this.caches.set(folder, cache);
  }

  /** 缓存删除（同步清理 LRU 顺序） */
  private _cacheDelete(folder: string): void {
    this.caches.delete(folder);
    this._accessOrder = this._accessOrder.filter((f) => f !== folder);
  }

  /** 获取某文件夹的缓存，自动增量更新变动文件 */
  get(targetFolder: string, vault: Vault): DedupCache | null {
    const cached = this.caches.get(targetFolder);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > DEDUP_CACHE_TTL) {
      this._cacheDelete(targetFolder);
      return null;
    }

    // 更新 LRU 访问顺序
    this._accessOrder = this._accessOrder.filter((f) => f !== targetFolder);
    this._accessOrder.push(targetFolder);

    // 索引缓存笔记路径
    const cacheByPath = new Map(cached.notes.map((n) => [n.path, n]));

    // 当前 vault 中的文件
    const allFiles = vault.getMarkdownFiles();
    const folderFiles = allFiles.filter((f) => isPathInFolder(f.path, targetFolder));

    // 删除/变动的文件：移除 DF 贡献并剔除
    for (const note of cached.notes) {
      const file = vault.getAbstractFileByPath(note.path);
      if (!(file instanceof TFile) || file.stat.mtime !== note.mtime) {
        for (const token of note.tokens.keys()) {
          const count = cached.dfCounts.get(token) || 0;
          if (count <= 1) cached.dfCounts.delete(token);
          else cached.dfCounts.set(token, count - 1);
        }
        cacheByPath.delete(note.path);
      }
    }

    // 无变动 → 直接返回
    const allValid =
      cacheByPath.size === cached.notes.length && folderFiles.length === cached.notes.length;
    if (allValid) return cached;

    // 有变动 → 重建仅变动部分
    cached.notes = [...cacheByPath.values()];

    // 如果变动超过一半，全量重建更划算
    if (cacheByPath.size < folderFiles.length * 0.5) {
      this._cacheDelete(targetFolder);
      return null;
    }

    // 有新增文件 → 放弃（需要异步读文件），走全量重建
    if (folderFiles.length !== cacheByPath.size) {
      this._cacheDelete(targetFolder);
      return null;
    }

    // 仅编辑/删除 → 增量更新 IDF
    const idfTable = cached.idfTable;
    idfTable.docCount = cached.notes.length;
    idfTable.idf.clear();
    for (const [token, df] of cached.dfCounts) {
      idfTable.idf.set(token, Math.log((idfTable.docCount + IDF_SMOOTH) / (df + IDF_SMOOTH)) + 1);
    }

    return cached;
  }

  /** 将持久化特征数据恢复为内存缓存结构 */
  private buildCacheFromFeatureData(folder: string, data: DedupFeatureFolderData): DedupCache | null {
    if (data.entries.length === 0) return null;

    const docTokens = data.entries.map((e) => new Map(e.tokens));
    const idfTable = computeIdfTable(docTokens, data.entries.length || 1);

    const notes: CachedNote[] = data.entries.map((e) => {
      const tokens = new Map(e.tokens);
      const titleTokens = new Map(e.titleTokens);
      // 恢复时重建向量（IDF 已重新计算）
      const vector = computeTfIdfVector(tokens, idfTable, e.contentLength, 0);
      const titleVector =
        titleTokens.size >= MIN_TOKENS_THRESHOLD
          ? computeTfIdfVector(titleTokens, idfTable, 0, 0)
          : null;
      return {
        path: e.path,
        content: e.contentPreview,
        contentHash: e.contentHash,
        contentLength: e.contentLength,
        contentPreview: e.contentPreview,
        tokens,
        titleTokens,
        vector,
        titleVector,
        simhashFp: BigInt('0x' + e.simhashFp),
        mtime: e.mtime,
      };
    });

    return {
      notes,
      idfTable,
      dfCounts: new Map(data.dfCounts),
      targetFolder: folder,
      timestamp: data.timestamp,
    };
  }

  /** 更新某文件夹的缓存，并持久化 */
  set(
    targetFolder: string,
    notes: CachedNote[],
    idfTable: IdfTable,
    dfCounts: Map<string, number>,
  ): void {
    const cache: DedupCache = {
      notes,
      idfTable,
      dfCounts,
      targetFolder,
      timestamp: Date.now(),
    };
    this._cacheSet(targetFolder, cache);
    this.persist(cache);
  }

  /** 获取某文件夹的持久化特征数据（供重建时复用未变动文件） */
  getFeatureFolderData(targetFolder: string): DedupFeatureFolderData | null {
    return this.featureCache.getFolder(targetFolder);
  }

  /** 立即将内存缓存写入磁盘 */
  async flush(): Promise<void> {
    await this.featureCache.save();
  }

  private persist(cache: DedupCache): void {
    const folderData = this.serializeCache(cache);
    this.featureCache.setFolder(cache.targetFolder, folderData);
    this.scheduleSave();
  }

  private serializeCache(cache: DedupCache): DedupFeatureFolderData {
    return {
      timestamp: cache.timestamp,
      entries: cache.notes.map((n) => ({
        path: n.path,
        contentHash: n.contentHash,
        mtime: n.mtime,
        contentLength: n.contentLength,
        contentPreview: n.contentPreview,
        tokens: [...n.tokens.entries()],
        titleTokens: [...n.titleTokens.entries()],
        topTokens: n.vector.topTokens,
        simhashFp: n.simhashFp.toString(16),
      })),
      dfCounts: [...cache.dfCounts.entries()],
    };
  }

  private scheduleSave(): void {
    if (this.savePending) return;
    this.savePending = true;
    setTimeout(() => {
      this.featureCache
        .save()
        .catch((e) => {
          console.error('[Bamboo Darts] 延迟保存去重缓存失败:', e);
        })
        .finally(() => {
          // 无论成功失败都重置，避免死锁导致后续持久化被静默丢弃
          this.savePending = false;
        });
    }, 500);
  }
}

// ─── 全局单例 ───

let _defaultDedupCache: DedupCacheManager | null = null;

export function getDefaultDedupCache(): DedupCacheManager {
  if (!_defaultDedupCache) {
    _defaultDedupCache = new DedupCacheManager();
  }
  return _defaultDedupCache;
}

export function clearDedupCache(): void {
  _defaultDedupCache?.invalidate();
}
