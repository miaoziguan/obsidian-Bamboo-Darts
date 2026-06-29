/**
 * 腾讯混元 Embedding 工具模块
 * - 封装 hunyuan-embedding API 调用（含重试）
 * - 本地向量缓存（按笔记 path + mtime 隔离）
 * - 余弦相似度计算
 * - 失效缓存清理
 *
 * 缓存持久化通过回调注入，由调用方（main.ts）负责：
 *   loadCache(): 从插件存储读取缓存数据
 *   saveCache(data): 将缓存数据写入插件存储
 *
 * 缓存结构：{ version, embeddings: { [key: string]: { v: number[]; m: number } } }
 * key = `${path}::${mtime}`，v 存原始 number[]（JSON 序列化友好）
 */

import { requestUrl } from 'obsidian';
import { HUNYUAN_EMBEDDING_URL, EMBEDDING_DIM, EMBEDDING_BATCH_SIZE } from '../constants';

// ─── 常量 ───

/** 缓存版本号（升级格式时递增） */
const CACHE_VERSION = 1;

/** API 调用失败时向量的标记值（放在 vec[0]）*/
const FAILED_VECTOR_MARKER = -99999;

/** 最大重试次数 */
const MAX_RETRY = 2;

/** 重试基础延迟（毫秒） */
const RETRY_BASE_DELAY = 500;

/** 休眠（毫秒） */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── 类型 ───

export interface EmbeddingCacheEntry {
  /** 向量原始数组（JSON 序列化友好） */
  v: number[];
  /** 文件 mtime，用于判断缓存失效 */
  m: number;
}

export interface EmbeddingCacheData {
  version: number;
  embeddings: Record<string, EmbeddingCacheEntry>;
}

export interface EmbeddingConfig {
  apiKey: string;
  apiUrl?: string;
  /** 语义相似度阈值（0~1），默认 0.82 */
  similarityThreshold?: number;
  /** 取消信号，传递给 requestUrl */
  signal?: AbortSignal;
}

/** 缓存持久化回调 */
export interface CachePersistence {
  load: () => Promise<EmbeddingCacheData>;
  save: (data: EmbeddingCacheData) => Promise<void>;
}

// ─── 工具函数 ───

/**
 * 生成缓存 key
 */
function cacheKey(path: string, mtime: number): string {
  return `${path}::${mtime}`;
}

/**
 * 判断 API 错误是否可重试
 */
function isRetriable(status: number): boolean {
  return status === 0 || status >= 500 || status === 429;
}

/**
 * 带重试的批次 API 调用
 * @returns 向量数组，失败时返回标记向量（vec[0] === FAILED_VECTOR_MARKER）
 */
async function fetchBatchWithRetry(batch: string[], config: EmbeddingConfig): Promise<number[][]> {
  const url = config.apiUrl || HUNYUAN_EMBEDDING_URL;

  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    // 每次重试前检查取消信号
    if (config.signal?.aborted) {
      throw new Error('用户取消了提炼');
    }

    const response = await requestUrl({
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: 'hunyuan-embedding',
        input: batch,
      }),
      throw: false,
      signal: config.signal,
    });

    if (response.status === 200) {
      const data = response.json;
      return data.data
        .sort((a: any, b: any) => a.index - b.index)
        .map((item: any) => {
          const emb = item.embedding;
          const vec = new Array(EMBEDDING_DIM).fill(0);
          for (let j = 0; j < Math.min(emb.length, EMBEDDING_DIM); j++) {
            vec[j] = emb[j];
          }
          return vec;
        });
    }

    // 不可重试的错误：直接返回标记向量
    if (!isRetriable(response.status)) {
      const errMsg = response.json?.error?.message || response.text || `HTTP ${response.status}`;
      console.error(`[Embedding] API 错误（不可重试）：`, errMsg);
      break;
    }

    // 可重试的错误：等待后重试
    if (attempt < MAX_RETRY) {
      const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
      console.warn(
        `[Embedding] API 调用失败（${response.status}），${delay}ms 后重试（${attempt + 1}/${MAX_RETRY}）`,
      );
      await sleep(delay);
      continue;
    } else {
      console.error(`[Embedding] API 调用失败（${response.status}），已达最大重试次数`);
      break;
    }
  }

  // 所有重试均失败：返回标记向量
  const failedVec = new Array(EMBEDDING_DIM).fill(0);
  failedVec[0] = FAILED_VECTOR_MARKER;
  return batch.map(() => failedVec);
}

// ─── 混元 API 调用 ───

/**
 * 调用混元 embedding API，获取一批文本的向量
 * 内建重试逻辑（最多 2 次，指数退避）
 * @param texts 文本数组
 * @param config API 配置
 * @returns number[][] 向量数组，与输入顺序一一对应；失败时对应位置为标记向量
 */
export async function fetchEmbeddings(
  texts: string[],
  config: EmbeddingConfig,
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const results: number[][] = [];

  // 分批调用（API 有 batch 大小限制）
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    const vectors = await fetchBatchWithRetry(batch, config);
    for (const vec of vectors) {
      results.push(vec);
    }
  }

  return results;
}

/**
 * 计算两个向量的余弦相似度
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  const sim = dot / denom;
  return sim > 1.0 ? 1.0 : sim < 0.0 ? 0.0 : sim;
}

// ─── 语义去重管理器 ───

/**
 * 语义去重管理器
 * 负责：缓存查找 → API 调用（含重试） → 缓存写入 → 相似度计算
 * 文件持久化通过 cachePersistence 回调注入
 */
export class SemanticDedupManager {
  private config: EmbeddingConfig;
  private cachePersistence: CachePersistence;
  private cache: EmbeddingCacheData | null = null;
  private cacheLoaded = false;
  /** 正在进行的缓存加载 Promise，防止并发重复加载 */
  private cacheLoadPromise: Promise<EmbeddingCacheData> | null = null;

  constructor(config: EmbeddingConfig, cachePersistence: CachePersistence) {
    this.config = config;
    this.cachePersistence = cachePersistence;
  }

  /**
   * 懒加载缓存（线程安全：并发调用只加载一次）
   */
  private async ensureCache(): Promise<EmbeddingCacheData> {
    // 已加载完成，直接返回
    if (this.cacheLoaded && this.cache) {
      return this.cache;
    }
    // 正在加载中，复用同一个 Promise
    if (this.cacheLoadPromise) {
      return await this.cacheLoadPromise;
    }
    // 首次加载
    this.cacheLoadPromise = this._loadCache();
    try {
      return await this.cacheLoadPromise;
    } finally {
      // 加载完成后清除 Promise，允许后续重新加载（如缓存失效后）
      this.cacheLoadPromise = null;
    }
  }

  /**
   * 实际执行缓存加载（内部方法）
   */
  private async _loadCache(): Promise<EmbeddingCacheData> {
    try {
      this.cache = await this.cachePersistence.load();
      if (this.cache?.version !== CACHE_VERSION) {
        this.cache = { version: CACHE_VERSION, embeddings: {} };
      }
    } catch {
      this.cache = { version: CACHE_VERSION, embeddings: {} };
    }
    this.cacheLoaded = true;
    return this.cache;
  }

  /**
   * 将内存缓存持久化到磁盘
   */
  private async persistCache(): Promise<void> {
    if (!this.cache) return;
    try {
      await this.cachePersistence.save(this.cache);
    } catch (e) {
      console.error('[Embedding] 缓存保存失败：', e);
    }
  }

  /**
   * 清理失效缓存条目
   * 扫描缓存，删除对应文件已不存在或 mtime 不匹配的条目
   * @param validFiles 当前知识库中有效文件列表 { path, mtime }
   * @returns 清理的条目数
   */
  async cleanStaleCache(validFiles: Array<{ path: string; mtime: number }>): Promise<number> {
    const cache = await this.ensureCache();
    const validSet = new Set(validFiles.map((f) => cacheKey(f.path, f.mtime)));
    const keys = Object.keys(cache.embeddings);
    let removed = 0;
    for (const key of keys) {
      if (!validSet.has(key)) {
        delete cache.embeddings[key];
        removed++;
      }
    }
    if (removed > 0) {
      await this.persistCache();
    }
    return removed;
  }

  /**
   * 批量预加载知识库笔记向量
   * 返回 Map<path, number[]>
   * @param onProgress 可选，进度回调 (processed, total, fromCache, fetched)
   */
  async preloadVaultVectors(
    files: Array<{ path: string; mtime: number; getContent: () => Promise<string> }>,
    onProgress?: (processed: number, total: number, fromCache: number, fetched: number) => void,
  ): Promise<Map<string, number[]>> {
    const cache = await this.ensureCache();
    const result = new Map<string, number[]>();
    const toFetch: {
      index: number;
      path: string;
      mtime: number;
      getContent: () => Promise<string>;
    }[] = [];

    // 第一轮：收集缓存命中的，收集缓存未命中的
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const key = cacheKey(file.path, file.mtime);
      if (cache.embeddings[key] && cache.embeddings[key].m === file.mtime) {
        result.set(file.path, cache.embeddings[key].v);
      } else {
        toFetch.push({ index: i, path: file.path, mtime: file.mtime, getContent: file.getContent });
      }
    }

    const fromCache = result.size;
    if (onProgress) onProgress(fromCache, files.length, fromCache, 0);

    if (toFetch.length > 0) {
      // 并行读取未命中文件的内容（相比串行，大量文件时显著更快）
      // 使用 allSettled：单个文件读取失败不影响其他文件
      const readResults = await Promise.allSettled(toFetch.map((entry) => entry.getContent()));

      // 收集成功读取的内容和对应的 entry
      const validEntries: (typeof toFetch)[0][] = [];
      const validContents: string[] = [];
      const failedIndexes: number[] = [];

      for (let i = 0; i < toFetch.length; i++) {
        const result = readResults[i];
        if (result.status === 'fulfilled') {
          validEntries.push(toFetch[i]);
          validContents.push(result.value);
        } else {
          failedIndexes.push(i);
          console.warn(`[Embedding] 读取文件失败: ${toFetch[i].path}`, result.reason);
        }
      }

      if (validContents.length > 0) {
        // 批量调用 API（内建重试）
        const vectors = await fetchEmbeddings(validContents, this.config);

        let fetchedCount = 0;
        for (let i = 0; i < validEntries.length; i++) {
          const { path, mtime } = validEntries[i];
          const vec = vectors[i];
          const isFailed = vec[0] === FAILED_VECTOR_MARKER;
          if (!isFailed) {
            const key = cacheKey(path, mtime);
            cache.embeddings[key] = { v: vec, m: mtime };
            result.set(path, vec);
            fetchedCount++;
          }
        }

        // 保存缓存
        await this.persistCache();

        if (onProgress) onProgress(fromCache + fetchedCount, files.length, fromCache, fetchedCount);
      } else {
        if (onProgress) onProgress(fromCache, files.length, fromCache, 0);
      }
    }

    // 清理失效缓存（已删除/重命名的文件残留）
    await this.cleanStaleCache(files.map((f) => ({ path: f.path, mtime: f.mtime })));

    return result;
  }

  /**
   * 批量计算新笔记与已有笔记的语义相似度
   * @param newNoteContents 新笔记内容数组
   * @param existingVectors 已有笔记向量 Map
   * @returns 与输入顺序对应的结果数组
   */
  async findBestMatches(
    newNoteContents: string[],
    existingVectors: Map<string, number[]>,
  ): Promise<Array<{ similarity: number; path: string } | null>> {
    if (existingVectors.size === 0) {
      return new Array(newNoteContents.length).fill(null);
    }

    // 批量获取新笔记向量（一次 API 调用，内建重试）
    const newVecs = await fetchEmbeddings(newNoteContents, this.config);

    return newVecs.map((newVec) => {
      // 检查是否为失败标记向量（API 调用失败）
      const isFailed = newVec[0] === FAILED_VECTOR_MARKER;
      if (isFailed) return null;

      let bestSim = 0;
      let bestPath = '';
      for (const [path, vec] of existingVectors) {
        const sim = cosineSimilarity(newVec, vec);
        if (sim > bestSim) {
          bestSim = sim;
          bestPath = path;
        }
      }

      if (bestSim < (this.config.similarityThreshold || 0.82)) return null;
      return { similarity: bestSim, path: bestPath };
    });
  }

  /**
   * 清空向量缓存（内存 + 磁盘）
   */
  async clearCache(): Promise<void> {
    this.cache = { version: CACHE_VERSION, embeddings: {} };
    this.cacheLoaded = true;
    await this.persistCache();
  }

  /**
   * 获取缓存条目数（用于 UI 展示）
   */
  async getCacheSize(): Promise<number> {
    const cache = await this.ensureCache();
    return Object.keys(cache.embeddings).length;
  }
}
