/**
 * 发现索引管理器
 *
 * 在笔记入库/保存/编辑/删除时缓存轻量特征（标题、关键词、内容哈希、更新时间），
 * 供发现 Tab 快速构建相似度矩阵，避免重复读取全库文件。
 *
 * 设计原则：
 * - 索引是性能优化，不是数据源。索引缺失或损坏时，发现 Tab 会自动回退到读文件。
 * - 只缓存发现 Tab 真正需要的特征：path、title、keywords、contentHash、updatedAt。
 * - 不缓存完整正文，避免索引文件膨胀；也不缓存向量（向量由 vector-cache.json 单独管理）。
 */

import type { DataAdapter } from 'obsidian';
import { Notice } from 'obsidian';
import { extractKeywordSet } from '../utils/tokenizer';
import { fnv1aHash } from '../utils/hash';

/** 索引文件版本号，格式变化时递增以触发重建 */
const INDEX_VERSION = 1;

/** 索引文件名（放在插件目录下） */
const INDEX_FILE_NAME = 'discovery-index.json';

/** 单篇笔记的缓存特征 */
export interface NoteFeature {
  /** 笔记路径 */
  path: string;
  /** 笔记标题（从文件名或 frontmatter 提取） */
  title: string;
  /** 正文内容指纹（FNV-1a） */
  contentHash: string;
  /** 关键词集合（2-gram + 分词，已数组化） */
  keywords: string[];
  /** 最后更新时间（文件 mtime 或缓存写入时间） */
  updatedAt: number;
}

/** 发现索引数据 */
export interface DiscoveryIndexData {
  version: number;
  updatedAt: number;
  notes: Record<string, NoteFeature>;
}

/** 索引初始化选项 */
export interface DiscoveryIndexOptions {
  /** 关键词提取后保留的最大数量，0 表示保留全部 */
  maxKeywords?: number;
}

export class DiscoveryIndex {
  private adapter: DataAdapter;
  private cacheFile: string;
  private data: DiscoveryIndexData;
  private options: DiscoveryIndexOptions;
  private loadPromise: Promise<void> | null = null;

  /** 保存防抖定时器 */
  private _saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** 保存防抖窗口（毫秒），单笔记变更走防抖；批量更新立即落盘 */
  private readonly SAVE_DEBOUNCE_MS = 1000;

  constructor(adapter: DataAdapter, pluginDir: string, options: DiscoveryIndexOptions = {}) {
    this.adapter = adapter;
    this.cacheFile = `${pluginDir}/${INDEX_FILE_NAME}`;
    this.options = { maxKeywords: 0, ...options };
    this.data = {
      version: INDEX_VERSION,
      updatedAt: 0,
      notes: {},
    };
  }

  // ─── 生命周期 ───

  /**
   * 加载索引（并发安全：多次调用只加载一次）
   */
  async load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this._doLoad().finally(() => {
      // 加载完成后清除 Promise，允许后续显式 reload
      this.loadPromise = null;
    });

    return this.loadPromise;
  }

  private async _doLoad(): Promise<void> {
    try {
      if (await this.adapter.exists(this.cacheFile)) {
        const raw = await this.adapter.read(this.cacheFile);
        const parsed: DiscoveryIndexData = JSON.parse(raw);
        if (parsed.version === INDEX_VERSION && typeof parsed.notes === 'object') {
          this.data = parsed;
          return;
        }
      }
    } catch (e) {
      console.warn('[Bamboo Darts] 发现索引加载失败，将重建:', e);
    }

    // 首次使用或格式不兼容：重置为空索引
    this.data = {
      version: INDEX_VERSION,
      updatedAt: 0,
      notes: {},
    };
  }

  /**
   * 持久化索引到磁盘（防抖：多次调用在 SAVE_DEBOUNCE_MS 窗口内只执行一次写盘）
   */
  async save(): Promise<void> {
    if (this._saveTimer !== null) {
      clearTimeout(this._saveTimer);
    }

    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._persist();
    }, this.SAVE_DEBOUNCE_MS);
  }

  /**
   * 立即刷新待保存内容到磁盘（插件卸载前调用）
   */
  async flushSave(): Promise<void> {
    if (this._saveTimer !== null) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    await this._persist();
  }

  /**
   * 实际执行持久化（内部方法）
   */
  private async _persist(): Promise<void> {
    this.data.updatedAt = Date.now();
    try {
      await this.adapter.write(this.cacheFile, JSON.stringify(this.data));
    } catch (e) {
      // 重试一次（延迟 1s，可能临时磁盘繁忙）
      await new Promise((r) => setTimeout(r, 1000));
      try {
        await this.adapter.write(this.cacheFile, JSON.stringify(this.data));
        console.warn('[Bamboo Darts] 发现索引保存重试成功');
      } catch (e2) {
        console.error('[Bamboo Darts] 发现索引保存失败（已重试）:', e2);
        new Notice('竹叶飞刃：发现索引保存失败，请检查磁盘空间');
      }
    }
  }

  /**
   * 强制重新加载（用于外部重建索引后刷新内存）
   */
  async reload(): Promise<void> {
    this.loadPromise = null;
    await this.load();
  }

  // ─── 更新接口 ───

  /**
   * 更新单篇笔记的特征
   * @param path 笔记路径
   * @param content 笔记完整内容（含 frontmatter）
   * @param title 可选标题，未提供时尝试从 frontmatter 或文件名提取
   * @param mtime 可选文件修改时间，未提供时使用当前时间
   */
  async update(path: string, content: string, title?: string, mtime?: number): Promise<void> {
    await this.load();

    const resolvedTitle = title || this.extractTitle(path, content);
    const strippedContent = this.stripFrontmatter(content);

    this.data.notes[path] = {
      path,
      title: resolvedTitle,
      contentHash: fnv1aHash(strippedContent),
      keywords: this.extractKeywords(strippedContent),
      updatedAt: mtime || Date.now(),
    };

    await this.save();
  }

  /**
   * 批量更新笔记特征
   */
  async updateBatch(
    entries: Array<{ path: string; content: string; title?: string; mtime?: number }>,
  ): Promise<void> {
    if (entries.length === 0) return;
    await this.load();

    for (const entry of entries) {
      const resolvedTitle = entry.title || this.extractTitle(entry.path, entry.content);
      const strippedContent = this.stripFrontmatter(entry.content);
      this.data.notes[entry.path] = {
        path: entry.path,
        title: resolvedTitle,
        contentHash: fnv1aHash(strippedContent),
        keywords: this.extractKeywords(strippedContent),
        updatedAt: entry.mtime || Date.now(),
      };
    }

    // 批量更新立即落盘，不走防抖（数据量大，应保证持久化）
    await this._persist();
  }

  /**
   * 从索引中移除单篇笔记
   */
  async remove(path: string): Promise<void> {
    await this.load();
    if (path in this.data.notes) {
      delete this.data.notes[path];
      await this.save();
    }
  }

  /**
   * 清空全部索引（重建前使用）
   */
  async clear(): Promise<void> {
    this.data.notes = {};
    this.data.updatedAt = Date.now();
    await this.save();
  }

  // ─── 查询接口 ───

  /**
   * 获取单篇笔记特征
   */
  getFeature(path: string): NoteFeature | null {
    return this.data.notes[path] || null;
  }

  /**
   * 获取所有特征（数组形式）
   */
  getAllFeatures(): NoteFeature[] {
    return Object.values(this.data.notes);
  }

  /**
   * 获取索引中笔记数量
   */
  get size(): number {
    return Object.keys(this.data.notes).length;
  }

  /**
   * 判断索引是否已加载
   */
  get loaded(): boolean {
    return this.data.version === INDEX_VERSION;
  }

  /**
   * 按目标文件夹过滤特征
   */
  filterByFolder(targetFolder?: string): NoteFeature[] {
    const all = this.getAllFeatures();
    if (!targetFolder) return all;
    const normalized = targetFolder.endsWith('/') ? targetFolder.slice(0, -1) : targetFolder;
    return all.filter(
      (f) => f.path === normalized || f.path.startsWith(normalized + '/'),
    );
  }

  /**
   * 构建关键词倒排索引（按需生成，不持久化）
   * 返回：关键词 -> 包含它的笔记路径列表
   */
  buildInvertedIndex(targetFolder?: string): Map<string, string[]> {
    const index = new Map<string, string[]>();
    const features = this.filterByFolder(targetFolder);

    for (const feature of features) {
      for (const keyword of feature.keywords) {
        const list = index.get(keyword) || [];
        list.push(feature.path);
        index.set(keyword, list);
      }
    }

    return index;
  }

  // ─── 内部工具 ───

  private stripFrontmatter(content: string): string {
    return content.replace(/^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/, '').trim();
  }

  private extractTitle(path: string, content: string): string {
    const normalized = content.replace(/^\uFEFF/, '').trimStart();

    // 1. 尝试 YAML frontmatter
    const fmMatch = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
    if (fmMatch) {
      const titleLine = fmMatch[1].match(/^title:\s*(.+)$/m);
      if (titleLine) {
        return titleLine[1].trim().replace(/^["']|["']$/g, '');
      }
    }

    // 2. 尝试一级标题
    const headingMatch = normalized.match(/^#\s+(.+)$/m);
    if (headingMatch) return headingMatch[1].trim();

    // 3. 第一行非空内容
    const firstLine = normalized.split('\n').find((l) => l.trim())?.trim();
    if (firstLine) return firstLine;

    // 4. 文件名兜底
    return path.split('/').pop()?.replace(/\.md$/, '') || path;
  }

  private extractKeywords(content: string): string[] {
    const keywordSet = extractKeywordSet(content);
    const keywords = Array.from(keywordSet);
    if (this.options.maxKeywords && this.options.maxKeywords > 0) {
      return keywords.slice(0, this.options.maxKeywords);
    }
    return keywords;
  }
}
