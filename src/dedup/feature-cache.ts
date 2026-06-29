import type { DataAdapter } from 'obsidian';

/**
 * 单篇笔记的持久化去重特征
 *
 * 注意：不保存完整的 TF-IDF 向量（weights/norm），因为向量依赖全局 IDF，
 * 而 IDF 在文档集合变化后需要重新计算。我们只保存原始 token 频次和 SimHash，
 * 加载时重建 IDF 与向量即可。
 */
export interface DedupFeatureEntry {
  /** 笔记路径 */
  path: string;
  /** 正文内容指纹（去掉 frontmatter 后） */
  contentHash: string;
  /** 文件修改时间 */
  mtime: number;
  /** 正文长度（用于长度预过滤） */
  contentLength: number;
  /** 正文前 200 字符预览（用于 UI 展示） */
  contentPreview: string;
  /** 正文 token → 频次 */
  tokens: Array<[string, number]>;
  /** 标题 token → 频次 */
  titleTokens: Array<[string, number]>;
  /** 权重最高的关键词（预过滤用） */
  topTokens: string[];
  /** SimHash 64-bit 指纹，以十六进制字符串保存 */
  simhashFp: string;
}

export interface DedupFeatureFolderData {
  /** 缓存创建/更新时间 */
  timestamp: number;
  /** 该文件夹下的笔记特征 */
  entries: DedupFeatureEntry[];
  /** 全局文档频率（token → 出现该 token 的文档数） */
  dfCounts: Array<[string, number]>;
}

export interface DedupFeatureCacheData {
  version: number;
  updatedAt: number;
  folders: Record<string, DedupFeatureFolderData>;
}

const DEDUP_FEATURE_CACHE_VERSION = 1;
const DEDUP_FEATURE_CACHE_FILE = 'dedup-features.json';

/**
 * 去重特征持久化缓存
 *
 * 将知识库去重所需的原始特征（token、SimHash、DF 表）写入插件目录，
 * 避免插件每次启动/窗口刷新后都重新读取全库文件。
 */
export class DedupFeatureCache {
  private adapter: DataAdapter | null = null;
  private cacheFile: string | null = null;
  private data: DedupFeatureCacheData = {
    version: DEDUP_FEATURE_CACHE_VERSION,
    updatedAt: 0,
    folders: {},
  };

  initialize(adapter: DataAdapter, pluginDir: string): void {
    this.adapter = adapter;
    this.cacheFile = `${pluginDir}/${DEDUP_FEATURE_CACHE_FILE}`;
  }

  async load(): Promise<void> {
    if (!this.adapter || !this.cacheFile) return;
    try {
      if (await this.adapter.exists(this.cacheFile)) {
        const raw = await this.adapter.read(this.cacheFile);
        const parsed: Partial<DedupFeatureCacheData> = JSON.parse(raw);
        if (
          parsed.version === DEDUP_FEATURE_CACHE_VERSION &&
          parsed.folders &&
          typeof parsed.folders === 'object'
        ) {
          this.data = parsed as DedupFeatureCacheData;
          return;
        }
      }
    } catch (e) {
      console.warn('[Bamboo Darts] 去重特征缓存加载失败，将重建:', e);
    }
    this.reset();
  }

  async save(): Promise<void> {
    if (!this.adapter || !this.cacheFile) return;
    try {
      this.data.updatedAt = Date.now();
      await this.adapter.write(this.cacheFile, JSON.stringify(this.data));
    } catch (e) {
      console.error('[Bamboo Darts] 去重特征缓存保存失败:', e);
    }
  }

  getFolder(targetFolder: string): DedupFeatureFolderData | null {
    return this.data.folders[targetFolder] || null;
  }

  setFolder(targetFolder: string, folderData: DedupFeatureFolderData): void {
    this.data.folders[targetFolder] = folderData;
  }

  deleteFolder(targetFolder: string): void {
    delete this.data.folders[targetFolder];
  }

  invalidate(): void {
    this.reset();
  }

  getAllFolders(): Record<string, DedupFeatureFolderData> {
    return this.data.folders;
  }

  private reset(): void {
    this.data = {
      version: DEDUP_FEATURE_CACHE_VERSION,
      updatedAt: 0,
      folders: {},
    };
  }
}
