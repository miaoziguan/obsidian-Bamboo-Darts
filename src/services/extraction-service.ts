/**
 * 提炼服务：封装完整的原子笔记提炼编排
 *
 * 职责：
 * - 管理提炼互斥锁（_isExtracting / _isBuildingIndex）
 * - 创建 AbortController 和 SemanticDedupManager
 * - 将 PluginSettings 快照转换为 ExtractorConfig
 * - 调用 extractor.ts 的管线函数
 * - 不含任何 UI 逻辑（无 Modal / Notice）
 */

import type { Vault, DataAdapter, TFile } from 'obsidian';
import {
  runExtraction,
  ExtractorConfig,
  ExtractionResult,
} from '../extractor';
import {
  SemanticDedupManager,
  EmbeddingCacheData,
  CachePersistence,
} from '../utils/embedding';
import { computeSourceHash, findPreviousExtraction } from './history-service';
import type { ProgressCallback } from '../extraction/progress';
import type { ContentProfile, ProfileConfig } from '../extraction/profiles';

// ─── 接口定义 ───

/** 构造参数：稳定的运行时引用（不随设置变化） */
export interface ExtractionServiceConfig {
  vault: Vault;
  pluginDir: string;
  adapter: DataAdapter;
}

/** 每次调用时传入的设置快照（避免固化过期设置） */
export interface ExtractionSettingsSnapshot {
  // DeepSeek API
  deepseekApiKey: string;
  deepseekApiUrl: string;
  model: string;
  maxTokens: number;

  // 标签偏好
  tagPreferences: string[];
  tagMode: 'lenient' | 'strict';

  // 核查 & 复查
  factCheck: boolean;
  verifiedOnly: boolean;
  enableReview: boolean;
  reviewModel: string;
  reviewApiUrl: string;
  reviewApiKey: string;

  // 存储
  targetFolder: string;
  dedupTargetFolder: string;

  // Profile 策略
  autoClassify: boolean;
  contentProfile: ContentProfile;
  profileDense: ProfileConfig;
  profileBalanced: ProfileConfig;
  profileSparse: ProfileConfig;

  // 深度提炼
  enableDeepMode: boolean;

  // 截断长度
  inputTruncateLength: number;

  // 语义去重
  enableSemanticDedup: boolean;
  hunyuanApiKey: string;
  hunyuanApiUrl: string;
  semanticSimilarityThreshold: number;
}

/** extract() 的可选参数 */
export interface ExtractOptions {
  onProgress?: ProgressCallback;
  skipGate?: boolean;
}

/** rebuildVectorIndex() 的返回结果 */
export interface RebuildResult {
  total: number;
  fromCache: number;
  fetched: number;
  cleaned: number;
}

// ─── ExtractionService 类 ───

export class ExtractionService {
  private _config: ExtractionServiceConfig;
  private _isExtracting = false;
  private _isBuildingIndex = false;
  private _abortController: AbortController | null = null;
  private _semanticManager: SemanticDedupManager | null = null;

  constructor(config: ExtractionServiceConfig) {
    this._config = config;
  }

  // ── 只读状态 ──

  get isExtracting(): boolean {
    return this._isExtracting;
  }

  get isBuildingIndex(): boolean {
    return this._isBuildingIndex;
  }

  // ── 核心方法 ──

  /**
   * 执行提炼：mutex 守卫 → API key 检查 → 创建 AbortController →
   * 构建 SemanticDedupManager → 调用管线 → 返回结果。
   * 不含任何 UI 逻辑。
   */
  async extract(
    input: { type: 'url' | 'text' | 'selection'; content: string },
    settings: ExtractionSettingsSnapshot,
    opts: ExtractOptions = {},
  ): Promise<ExtractionResult> {
    if (this._isExtracting) {
      return { success: false, steps: [], error: '已有提取任务正在进行中' };
    }
    if (!settings.deepseekApiKey) {
      return { success: false, steps: [], error: '请先在设置中填写 DeepSeek API Key' };
    }

    // 先创建 AbortController，再设标志（防止取消调用时 controller 还是 null）
    this._abortController = new AbortController();
    this._isExtracting = true;

    try {
      // 语义去重管理器
      let semanticManager: SemanticDedupManager | undefined;
      let semanticDedupSkipped = false;

      if (this._isBuildingIndex) {
        semanticDedupSkipped = true;
      } else if (settings.enableSemanticDedup && settings.hunyuanApiKey) {
        semanticManager = this._buildSemanticManager(settings);
        this._semanticManager = semanticManager;
      }

      // 构建 ExtractorConfig
      const extractorConfig = this._buildExtractorConfig(
        settings,
        this._abortController.signal,
        opts.onProgress,
        semanticManager,
        opts.skipGate,
      );

      const result = await runExtraction(input, extractorConfig);

      // 附加语义去重跳过标记
      if (semanticDedupSkipped) {
        result.semanticDedupSkipped = true;
      }

      return result;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, steps: [], error: '提炼已取消' };
      }
      return {
        success: false,
        steps: [],
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this._isExtracting = false;
      this._abortController = null;
    }
  }

  /**
   * 取消当前提炼任务
   */
  cancel(): void {
    if (this._abortController) {
      this._abortController.abort();
    }
  }

  /**
   * 预检重复：根据内容哈希查找历史提炼记录
   */
  checkDuplicate(
    content: string,
    history: Array<{ sourceHash: string; timestamp: number; noteCount: number; sourceTitle: string }>,
  ) {
    const sourceHash = computeSourceHash(content);
    return findPreviousExtraction(history, sourceHash);
  }

  /**
   * 重建向量索引
   */
  async rebuildVectorIndex(
    files: TFile[],
    settings: ExtractionSettingsSnapshot,
    onProgress?: (processed: number, total: number, fromCache: number, fetched: number) => void,
  ): Promise<RebuildResult> {
    if (this._isBuildingIndex) {
      throw new Error('向量索引构建正在进行中');
    }
    if (!settings.enableSemanticDedup || !settings.hunyuanApiKey) {
      throw new Error('请先在设置中启用语义去重并填写混元 API Key');
    }
    if (files.length === 0) {
      throw new Error('没有可索引的文件');
    }

    this._isBuildingIndex = true;

    try {
      const semanticManager = this._buildSemanticManager(settings);
      this._semanticManager = semanticManager;

      const preloadItems = files.map((f) => ({
        path: f.path,
        mtime: f.stat.mtime,
        getContent: async () => await this._config.vault.read(f),
      }));

      let lastFromCache = 0;
      let lastFetched = 0;

      await semanticManager.preloadVaultVectors(
        preloadItems,
        (processed, total, fromCache, fetched) => {
          lastFromCache = fromCache;
          lastFetched = fetched;
          onProgress?.(processed, total, fromCache, fetched);
        },
      );

      // 清理失效缓存
      const validFiles = files.map((f) => ({ path: f.path, mtime: f.stat.mtime }));
      const cleaned = await semanticManager.cleanStaleCache(validFiles);

      return {
        total: files.length,
        fromCache: lastFromCache,
        fetched: lastFetched,
        cleaned,
      };
    } finally {
      this._isBuildingIndex = false;
    }
  }

  /**
   * 清理：中止在途任务，重置状态
   */
  dispose(): void {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    this._semanticManager = null;
  }

  // ── 私有方法 ──

  /**
   * 构建 SemanticDedupManager（集中管理，消除 main.ts 中的重复代码）
   */
  private _buildSemanticManager(settings: ExtractionSettingsSnapshot): SemanticDedupManager {
    const cacheFile = `${this._config.pluginDir}/vector-cache.json`;
    const adapter = this._config.adapter;

    const cachePersistence: CachePersistence = {
      load: async (): Promise<EmbeddingCacheData> => {
        try {
          if (await adapter.exists(cacheFile)) {
            const raw = await adapter.read(cacheFile);
            return JSON.parse(raw);
          }
        } catch {
          /* ignore */
        }
        return { version: 1, embeddings: {} };
      },
      save: async (data: EmbeddingCacheData): Promise<void> => {
        await adapter.write(cacheFile, JSON.stringify(data));
      },
    };

    return new SemanticDedupManager(
      {
        apiKey: settings.hunyuanApiKey,
        apiUrl: settings.hunyuanApiUrl || undefined,
        similarityThreshold: settings.semanticSimilarityThreshold,
        signal: this._abortController?.signal,
      },
      cachePersistence,
    );
  }

  /**
   * 将设置快照 + 运行时参数组装为 ExtractorConfig
   */
  private _buildExtractorConfig(
    settings: ExtractionSettingsSnapshot,
    signal: AbortSignal,
    onProgress: ProgressCallback | undefined,
    semanticManager: SemanticDedupManager | undefined,
    skipGate?: boolean,
  ): Partial<ExtractorConfig> {
    return {
      deepseekApiKey: settings.deepseekApiKey,
      deepseekApiUrl: settings.deepseekApiUrl,
      model: settings.model,
      maxTokens: settings.maxTokens,
      tagPreferences: settings.tagPreferences,
      tagMode: settings.tagMode,
      factCheck: settings.factCheck,
      verifiedOnly: settings.verifiedOnly,
      enableReview: settings.enableReview,
      reviewModel: settings.reviewModel,
      reviewApiUrl: settings.reviewApiUrl,
      reviewApiKey: settings.reviewApiKey,
      signal,
      abortController: this._abortController ?? undefined,
      vault: this._config.vault,
      targetFolder: settings.targetFolder,
      dedupTargetFolder: settings.dedupTargetFolder,
      enableVaultDedup: true,
      onProgress,
      autoClassify: settings.autoClassify,
      profile: settings.autoClassify ? undefined : settings.contentProfile,
      profileConfigs: {
        dense: settings.profileDense,
        balanced: settings.profileBalanced,
        sparse: settings.profileSparse,
      },
      enableDeepMode: settings.enableDeepMode,
      inputTruncateLength: settings.inputTruncateLength,
      skipGate,
      semanticManager,
    };
  }
}
