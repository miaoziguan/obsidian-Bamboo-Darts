/**
 * 去重模块（Phase 4 / 4b）
 * - Phase 4: 同批交叉去重
 * - Phase 4b: 知识库去重比对（TF-IDF + 余弦相似度）
 *
 * 【相似度算法说明】
 * 本模块使用「TF-IDF + 余弦相似度」：
 *   - Token 化：中文字符 3-gram + 英文完整词（去停用词）
 *   - TF: 词频归一化（token 频次 / 文档总 token 数）
 *   - IDF: 逆文档频率 log((N+1)/(df+1)) + 1
 *   - 相似度: 两向量余弦 cos(v1, v2) = v1 · v2 / (||v1|| * ||v2||)
 *   - 适用场景：短文本笔记去重，对同义词有鲁棒性
 *
 * 【最小 token 门槛】
 * 当 token 集合 < DEDUP_MIN_TOKENS 时，不判定为重复。
 */

import { Vault, TFile, DataAdapter } from 'obsidian';
import { AtomicNote } from './utils/notes-standards';
import { DedupFeatureCache, DedupFeatureEntry, DedupFeatureFolderData } from './dedup/feature-cache';
import { fnv1aHash } from './utils/hash';
import {
  DEDUP_BATCH_SIZE,
  DEDUP_CACHE_TTL,
  MAX_CACHED_FOLDERS,
  MIN_TOKENS_THRESHOLD,
  CROSS_BATCH_THRESHOLD,
  IDF_SMOOTH,
  LENGTH_RATIO_THRESHOLD,
  SHORT_NOTE_LENGTH,
  SHORT_NOTE_BOOST_FACTOR,
  BM25_K1,
  BM25_B,
  SIMHASH_HAMMING_THRESHOLD,
} from './constants';
import { simhash, hammingDistance } from './utils/simhash';
import { SemanticDedupManager } from './utils/embedding';
import { jaccardSimilarity } from './utils/jaccard';

// ─── Token 化 ───

import { tokenize } from './utils/tokenizer';
// 重导出供测试使用
export { tokenize };

// ─── TF-IDF 核心 ───

/**
 * 语料库级 IDF 表
 */
interface IdfTable {
  docCount: number;
  idf: Map<string, number>; // token → idf 值
}

/**
 * 计算语料库的 IDF 表
 * @param docTokens 每篇文档的 token 频次表
 * @param docCount 文档总数（用于平滑，docTokens 可能只是已有笔记）
 */
function computeIdfTable(
  docTokens: Array<Map<string, number>>,
  docCount?: number,
): IdfTable & { dfCounts: Map<string, number> } {
  const N = docCount || docTokens.length || 1;
  const docFreq = new Map<string, number>();

  for (const tokens of docTokens) {
    for (const token of tokens.keys()) {
      docFreq.set(token, (docFreq.get(token) || 0) + 1);
    }
  }

  const idf = new Map<string, number>();
  for (const [token, df] of docFreq) {
    idf.set(token, Math.log((N + IDF_SMOOTH) / (df + IDF_SMOOTH)) + 1);
  }

  return { docCount: N, idf, dfCounts: docFreq };
}

/**
 * 计算文档向量的 TF-IDF 权重和 L2 范数
 * 注：我们不存完整向量，而是存 (token → tf-idf) 和范数，用于快速点积
 */
interface TfIdfVector {
  weights: Map<string, number>; // token → tf-idf 权重
  norm: number; // L2 范数
  tokenCount: number; // 原始 token 数（用于最小门槛判断）
  /** 提取权重最高的 topN 个 token（用于 Jaccard 关键词比对） */
  topTokens: string[];
}

function computeTfIdfVector(
  tokens: Map<string, number>,
  idfTable: IdfTable,
  docLen: number = 0,
  avgDocLen: number = 0,
): TfIdfVector {
  const weights = new Map<string, number>();
  let sumSq = 0;
  const k1 = BM25_K1;
  const b = BM25_B;
  // BM25 长度归一化系数（avgDocLen=0 时退化为标准 TF）
  const lenNorm = avgDocLen > 0 ? 1 - b + (b * docLen) / avgDocLen : 1;

  for (const [token, freq] of tokens) {
    // BM25 饱和词频
    const tf = freq / (freq + k1 * lenNorm);
    const idf =
      idfTable.idf.get(token) || Math.log((idfTable.docCount + IDF_SMOOTH) / (0 + IDF_SMOOTH)) + 1;
    const weight = tf * idf;
    weights.set(token, weight);
    sumSq += weight * weight;
  }

  return {
    weights,
    norm: Math.sqrt(sumSq),
    tokenCount: tokens.size,
    // 取权重最高的 5 个 token 作为关键词指纹
    topTokens: [...weights.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k]) => k),
  };
}

/**
 * 计算两个 TF-IDF 向量的余弦相似度
 * 优化：遍历较小的向量，避免全量扫描
 */
function cosineSimilarity(v1: TfIdfVector, v2: TfIdfVector): number {
  if (v1.norm === 0 || v2.norm === 0) return 0;
  if (v1.tokenCount < MIN_TOKENS_THRESHOLD || v2.tokenCount < MIN_TOKENS_THRESHOLD) return 0;

  // 遍历较小的向量
  const [small, large] =
    v1.weights.size <= v2.weights.size ? [v1.weights, v2.weights] : [v2.weights, v1.weights];

  let dot = 0;
  for (const [token, weight] of small) {
    const otherWeight = large.get(token);
    if (otherWeight !== undefined) {
      dot += weight * otherWeight;
    }
  }

  const sim = dot / (v1.norm * v2.norm);
  // 浮点误差钳制
  return sim > 1.0 ? 1.0 : sim < 0.0 ? 0.0 : sim;
}

// ─── 类型与数据结构 ───

export interface DuplicateInfo {
  isDuplicate: boolean;
  similarity: number;
  matchedNote?: string;
  matchedContent?: string;
  removedTitle: string;
  removedContent: string;
  /** 语义相似度（启用语义去重时才有值） */
  semanticSimilarity?: number;
  /** 本地算法相似度（BM25 + SimHash），合并前 */
  localSimilarity?: number;
}

export interface DedupResult {
  uniqueNotes: AtomicNote[];
  removedCount: number;
  duplicates: DuplicateInfo[];
}

export interface VaultMatchInfo {
  note: AtomicNote;
  noteIndex: number;
  bestMatch: {
    similarity: number;
    path: string;
    content: string;
  } | null;
  /** 语义相似度（启用语义去重时才有值） */
  semanticSimilarity?: number;
  /** 本地算法相似度（BM25 + SimHash），合并前 */
  localSimilarity?: number;
  /** 语义匹配路径（本地无匹配、语义超阈值时填入 bestMatch） */
  semanticMatchPath?: string;
}

// ─── 缓存 ───

/**
 * 单篇已有笔记的预处理缓存
 */
interface CachedNote {
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

interface DedupCache {
  notes: CachedNote[];
  idfTable: IdfTable;
  /** token → 原始文档频率（用于增量 IDF 更新） */
  dfCounts: Map<string, number>;
  targetFolder: string; // 按文件夹隔离缓存
  timestamp: number;
}

/**
 * 去重缓存管理器
 * 按 targetFolder 独立缓存，避免跨文件夹污染
 */
class DedupCacheManager {
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
      let succeeded = true;
      this.featureCache
        .save()
        .catch((e) => {
          console.error('[Bamboo Darts] 延迟保存去重缓存失败:', e);
          succeeded = false;
        })
        .finally(() => {
          if (succeeded) {
            this.savePending = false;
          }
        });
    }, 500);
  }
}

let _defaultDedupCache: DedupCacheManager | null = null;

export function getDefaultDedupCache(): DedupCacheManager {
  if (!_defaultDedupCache) {
    _defaultDedupCache = new DedupCacheManager();
  }
  return _defaultDedupCache;
}

export function clearDedupCache(): void {
  _defaultDedupCache?.invalidate();
  _defaultDedupCache = null;
}

// ─── 辅助：路径边界检查 ───

export function isPathInFolder(filePath: string, targetFolder: string): boolean {
  if (!targetFolder) return false;
  const normalized = targetFolder.endsWith('/') ? targetFolder.slice(0, -1) : targetFolder;
  if (filePath === normalized) return true;
  if (filePath.startsWith(normalized + '/')) return true;
  return false;
}

// ─── 辅助函数 ───

/** 字符级编辑距离（Levenshtein），归一化为相似度 */
function editSimilarity(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  if (m === 0 || n === 0) return 0;

  let prev = new Uint16Array(n + 1);
  let curr = new Uint16Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }

  return 1 - prev[n] / Math.max(m, n);
}

// ─── Phase 4: 同批交叉去重 ───

/** 分片大小：每处理 N 条笔记 yield 一次主线程 */
const CROSS_CHECK_CHUNK = 8;

/**
 * 同批笔记交叉去重（基于 TF-IDF + 余弦相似度）
 * 新笔记之间互为语料，动态计算 IDF
 * 改为异步分片执行：大批量笔记时周期性 yield 主线程，避免 UI 卡顿。
 */
export async function crossCheckBatch(notes: AtomicNote[], threshold?: number): Promise<DedupResult> {
  const effectiveThreshold = threshold ?? CROSS_BATCH_THRESHOLD;
  const uniqueNotes: AtomicNote[] = [];
  const uniqueIndices: number[] = [];
  const duplicates: DuplicateInfo[] = [];

  // 1. Token 化所有笔记
  const docTokens = notes.map((n) => tokenize(n.content));

  // 2. 以当前 batch 为语料计算 IDF（小语料，但足以区分相对重要性）
  const idfTable = computeIdfTable(docTokens);
  const avgLen = notes.reduce((s, n) => s + n.content.length, 0) / Math.max(notes.length, 1);

  // 3. 预计算所有笔记的 TF-IDF 向量
  const vectors = docTokens.map((tokens, i) =>
    computeTfIdfVector(tokens, idfTable, notes[i].content.length, avgLen),
  );

  // 4. 交叉比对（大于 CHUNK_SIZE 时分片 yield 主线程）
  for (let i = 0; i < notes.length; i++) {
    if (i > 0 && i % CROSS_CHECK_CHUNK === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
    const note = notes[i];
    const vec = vectors[i];
    const length = note.content.length;
    let isDuplicate = false;
    let bestMatch: DuplicateInfo | null = null;
    const isShortNote = length < SHORT_NOTE_LENGTH;

    for (let j = 0; j < uniqueIndices.length; j++) {
      const uniqueVec = vectors[uniqueIndices[j]];
      const uniqueNote = uniqueNotes[j];

      // 长度预过滤
      const otherLen = uniqueNote.content.length;
      if (Math.abs(length - otherLen) / Math.max(length, otherLen) > LENGTH_RATIO_THRESHOLD) {
        continue;
      }

      // 关键词预过滤：Top-5 零交集 → 跳过余弦
      const keywordOverlap = jaccardSimilarity(vec.topTokens, uniqueVec.topTokens);
      if (keywordOverlap === 0 && Math.min(length, otherLen) > 30) continue;

      // 极短笔记：编辑距离兜底
      let similarity: number;
      if (isShortNote && otherLen < SHORT_NOTE_LENGTH) {
        similarity = editSimilarity(note.content, uniqueNote.content);
        if (similarity < 0.7) continue;
      } else {
        const cosSim = cosineSimilarity(vec, uniqueVec);
        const titleSim = jaccardSimilarity(
          tokenize(note.title, { ngramSize: 2 }),
          tokenize(uniqueNote.title, { ngramSize: 2 }),
        );
        // 综合评分
        similarity = cosSim * 0.5 + keywordOverlap * 0.3 + titleSim * 0.2;
      }

      if (similarity > effectiveThreshold) {
        isDuplicate = true;
        bestMatch = {
          isDuplicate: true,
          similarity,
          matchedNote: `同批笔记 #${j + 1}: ${uniqueNote.title}`,
          matchedContent: uniqueNote.content.slice(0, 200),
          removedTitle: note.title,
          removedContent: note.content,
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

// ─── Phase 4b: 知识库去重 ───

/**
 * 从知识库读取并预处理目标文件夹下的所有笔记
 */
async function loadAndPreprocessExistingNotes(
  vault: Vault,
  targetFolder: string,
  cacheManager: DedupCacheManager,
): Promise<{ notes: CachedNote[]; idfTable: IdfTable; dfCounts: Map<string, number> }> {
  const allFiles = vault.getMarkdownFiles();
  const existingFiles = allFiles.filter((file) => isPathInFolder(file.path, targetFolder));

  // 获取持久化特征缓存，用于跳过未变动文件
  const featureFolderData = cacheManager.getFeatureFolderData(targetFolder);
  const featureByPath = new Map<string, DedupFeatureEntry>();
  if (featureFolderData) {
    for (const entry of featureFolderData.entries) {
      featureByPath.set(entry.path, entry);
    }
  }

  // 分批读取，优先复用缓存
  const allTokens: Array<Map<string, number>> = [];
  const rawNotes: Array<{
    path: string;
    content: string;
    contentHash: string;
    contentLength: number;
    contentPreview: string;
    title: string;
    mtime: number;
    tokens: Map<string, number>;
    titleTokens: Map<string, number>;
  }> = [];

  for (let i = 0; i < existingFiles.length; i += DEDUP_BATCH_SIZE) {
    const batch = existingFiles.slice(i, i + DEDUP_BATCH_SIZE);
    const contents = await Promise.all(batch.map((f) => vault.read(f)));
    for (let j = 0; j < batch.length; j++) {
      const file = batch[j] as TFile;
      const content = contents[j];
      const normalized = content.replace(/^\uFEFF/, '').trimStart();
      const stripped = normalized.replace(/^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/, '').trim();
      const contentHash = fnv1aHash(stripped);
      const mtime = file.stat.mtime;

      // 尝试复用缓存：mtime 相同且 contentHash 一致
      const cachedFeature = featureByPath.get(file.path);
      if (cachedFeature && cachedFeature.mtime === mtime && cachedFeature.contentHash === contentHash) {
        const title = cachedFeature.titleTokens.length > 0
          ? extractTitleFromContent(content, file.path)
          : extractTitleFromContent(content, file.path);
        const titleTokens = new Map(cachedFeature.titleTokens);
        rawNotes.push({
          path: file.path,
          content,
          contentHash,
          contentLength: cachedFeature.contentLength,
          contentPreview: cachedFeature.contentPreview,
          title,
          mtime,
          tokens: new Map(cachedFeature.tokens),
          titleTokens,
        });
        allTokens.push(new Map(cachedFeature.tokens));
        continue;
      }

      // 缓存未命中或已变动：重新提取
      const title = extractTitleFromContent(content, file.path);
      const tokens = tokenize(content);
      rawNotes.push({
        path: file.path,
        content,
        contentHash,
        contentLength: stripped.length,
        contentPreview: content.slice(0, 200),
        title,
        mtime,
        tokens,
        titleTokens: tokenize(title),
      });
      allTokens.push(tokens);
    }
  }

  // 计算 IDF（基于整个目标文件夹的语料）
  const idfTable = computeIdfTable(allTokens, allTokens.length || 1);
  const avgLen =
    rawNotes.reduce((s, rn) => s + rn.contentLength, 0) / Math.max(rawNotes.length, 1);

  // 计算每篇文档的 TF-IDF 向量
  const notes: CachedNote[] = rawNotes.map((rn) => {
    const vector = computeTfIdfVector(rn.tokens, idfTable, rn.contentLength, avgLen);
    const titleVector =
      rn.titleTokens.size >= MIN_TOKENS_THRESHOLD
        ? computeTfIdfVector(rn.titleTokens, idfTable, rn.title.length, avgLen)
        : null;
    return {
      path: rn.path,
      content: rn.content,
      contentHash: rn.contentHash,
      contentLength: rn.contentLength,
      contentPreview: rn.contentPreview,
      tokens: rn.tokens,
      titleTokens: rn.titleTokens,
      vector,
      titleVector,
      simhashFp: simhash(vector.weights),
      mtime: rn.mtime,
    };
  });

  return { notes, idfTable, dfCounts: idfTable.dfCounts };
}

/** 从正文或路径提取标题 */
function extractTitleFromContent(content: string, path: string): string {
  let title = '';
  const normalized = content.replace(/^\uFEFF/, '').trimStart();
  const fmMatch = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (fmMatch) {
    const titleLine = fmMatch[1].match(/^title:\s*(.+)$/m);
    if (titleLine) {
      title = titleLine[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  if (!title) {
    const headingMatch = content.match(/^#\s+(.+)$/m);
    title = headingMatch ? headingMatch[1].trim() : content.split('\n').find(l => l.trim())?.trim() || '';
  }
  if (!title) {
    title = path.split('/').pop()?.replace(/\.md$/, '') || path;
  }
  return title;
}

/**
 * 知识库去重（详细版：返回每条笔记的最佳匹配，支持标题加权）
 *
 * 综合相似度 = 标题余弦 * 0.25 + 内容余弦 * 0.75
 * - 内容为主：笔记的语义核心在正文
 * - 标题为辅：标题短但信息密度高，作为辅助信号
 * - 标题缺失或 token 不足：退化为纯内容相似度
 */
/** 语义向量预加载进度回调 */
type SemanticProgressCallback = (
  processed: number,
  total: number,
  fromCache: number,
  fetched: number,
) => void;

export async function checkAgainstVaultDetailed(
  vault: Vault,
  notes: AtomicNote[],
  targetFolder: string,
  cacheManager: DedupCacheManager = getDefaultDedupCache(),
  semanticManager?: SemanticDedupManager,
  onSemanticProgress?: SemanticProgressCallback,
): Promise<VaultMatchInfo[]> {
  // 获取或构建知识库语料
  let existingNotes: CachedNote[];
  let idfTable: IdfTable;
  const cached = cacheManager.get(targetFolder, vault);

  if (cached) {
    existingNotes = cached.notes;
    idfTable = cached.idfTable;
  } else {
    const result = await loadAndPreprocessExistingNotes(vault, targetFolder, cacheManager);
    existingNotes = result.notes;
    idfTable = result.idfTable;
    cacheManager.set(targetFolder, existingNotes, idfTable, result.dfCounts);
  }

  // 计算整体平均文档长度（BM25 用）
  const vaultTotalLen = existingNotes.reduce((s, n) => s + (n.contentLength || n.content.length), 0);
  const newTotalLen = notes.reduce((s, n) => s + n.content.length, 0);
  const avgDocLen =
    (vaultTotalLen + newTotalLen) / Math.max(existingNotes.length + notes.length, 1);

  // 新笔记预处理
  const newNoteVectors: Array<{
    vec: TfIdfVector;
    titleVec: TfIdfVector | null;
    length: number;
    simhashFp: bigint;
    topTokens: string[];
  }> = [];
  for (const note of notes) {
    const contentTokens = tokenize(note.content);
    const titleTokens = tokenize(note.title);
    const vec = computeTfIdfVector(contentTokens, idfTable, note.content.length, avgDocLen);
    const titleVec =
      titleTokens.size >= MIN_TOKENS_THRESHOLD
        ? computeTfIdfVector(titleTokens, idfTable, note.title.length, avgDocLen)
        : null;
    newNoteVectors.push({
      vec,
      titleVec,
      length: note.content.length,
      simhashFp: simhash(vec.weights),
      topTokens: vec.topTokens,
    });
  }

  const results: VaultMatchInfo[] = [];

  for (let idx = 0; idx < notes.length; idx++) {
    const note = notes[idx];
    const {
      vec: contentVec,
      titleVec: newTitleVec,
      length,
      simhashFp,
      topTokens,
    } = newNoteVectors[idx];
    let bestMatch: VaultMatchInfo['bestMatch'] = null;

    // SimHash 预过滤：只比对汉明距离 < 3 的候选
    for (const existing of existingNotes) {
      if (hammingDistance(simhashFp, existing.simhashFp) >= SIMHASH_HAMMING_THRESHOLD) continue;

      // 长度预过滤
      const existingLen = existing.contentLength || existing.content.length;
      if (
        Math.abs(length - existingLen) / Math.max(length, existingLen) >
        LENGTH_RATIO_THRESHOLD
      ) {
        continue;
      }

      // 关键词预过滤
      const keywordOverlap = jaccardSimilarity(topTokens, existing.vector.topTokens);
      if (keywordOverlap === 0 && Math.min(length, existingLen) > 30) continue;

      // 内容相似度
      const contentSim = cosineSimilarity(contentVec, existing.vector);

      // 标题相似度（如果双方都有有效标题向量）
      let titleSim = 0;
      let hasTitleMatch = false;
      if (newTitleVec && existing.titleVector) {
        titleSim = cosineSimilarity(newTitleVec, existing.titleVector);
        hasTitleMatch = true;
      }

      // 综合评分
      const combinedSim = hasTitleMatch
        ? contentSim * 0.5 + keywordOverlap * 0.3 + titleSim * 0.2
        : contentSim * 0.6 + keywordOverlap * 0.4;

      if (!bestMatch || combinedSim > bestMatch.similarity) {
        bestMatch = {
          similarity: combinedSim,
          path: existing.path,
          content: existing.contentPreview || existing.content.slice(0, 200) + (existing.content.length > 200 ? '...' : ''),
        };
      }
    }

    // 短笔记放大（短笔记 token 稀疏，相似度天然偏低）
    if (bestMatch && length < SHORT_NOTE_LENGTH) {
      bestMatch.similarity = Math.min(bestMatch.similarity * SHORT_NOTE_BOOST_FACTOR, 1.0);
    }

    results.push({ note, noteIndex: idx, bestMatch });
  }

  // 语义去重（Beta）：用混元向量模型精判
  if (semanticManager) {
    // 获取知识库文件列表
    const allFiles = vault.getMarkdownFiles();
    const vaultFiles = allFiles.filter((f) => isPathInFolder(f.path, targetFolder));

    // 构造预加载参数（含懒加载的内容读取回调）
    const preloadItems = vaultFiles.map((f) => ({
      path: f.path,
      mtime: f.stat.mtime,
      getContent: async () => await vault.read(f),
    }));

    // 预加载知识库向量（缓存，仅首次有 API 调用）
    const vaultVectors = await semanticManager.preloadVaultVectors(
      preloadItems,
      onSemanticProgress,
    );

    // 批量获取新笔记的语义最佳匹配
    const newContents = notes.map((n) => n.content);
    const semanticMatches = await semanticManager.findBestMatches(newContents, vaultVectors);

    // 用语义匹配结果增强本地结果
    // 核心逻辑：本地和语义独立计算，取最高相似度
    for (let idx = 0; idx < results.length; idx++) {
      const semMatch = semanticMatches[idx];

      // 记录语义相似度（始终记录，供 UI 展示「本地 X% / 语义 Y%」）
      results[idx].semanticSimilarity = semMatch?.similarity ?? 0;

      // ✅ 保存本地相似度（合并前），供 UI 展示分解
      results[idx].localSimilarity = results[idx].bestMatch?.similarity ?? 0;

      if (!semMatch) continue;

      // ✅ 关键修复：比较本地和语义，取最高相似度
      const localSim = results[idx].localSimilarity;
      const semSim = semMatch.similarity;

      if (semSim > localSim) {
        // 语义相似度更高，用语义结果覆盖 bestMatch
        const matchedFile = vault.getAbstractFileByPath(semMatch.path);
        let matchedContent = '';
        if (matchedFile instanceof TFile) {
          matchedContent = await vault.read(matchedFile);
        }
        results[idx].bestMatch = {
          similarity: semSim, // ✅ 用语义相似度（更高）
          path: semMatch.path,
          content: matchedContent.slice(0, 200) + (matchedContent.length > 200 ? '...' : ''),
        };
        results[idx].semanticMatchPath = semMatch.path;
      }
      // 如果本地相似度更高或相等，保留本地结果（不改动 bestMatch）
    }
  }

  return results;
}
