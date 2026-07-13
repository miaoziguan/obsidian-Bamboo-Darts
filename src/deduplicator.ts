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

import { Vault, TFile } from 'obsidian';
import { AtomicNote } from './utils/notes-standards';
import { DedupFeatureEntry } from './dedup/feature-cache';
import { fnv1aHash } from './utils/hash';
import {
  DEDUP_BATCH_SIZE,
  MIN_TOKENS_THRESHOLD,
  CROSS_BATCH_THRESHOLD,
  LENGTH_RATIO_THRESHOLD,
  SHORT_NOTE_LENGTH,
  SHORT_NOTE_BOOST_FACTOR,
  SIMHASH_HAMMING_THRESHOLD,
} from './constants';
import { simhash, hammingDistance } from './utils/simhash';
import { SemanticDedupManager } from './utils/embedding';
import { jaccardSimilarity } from './utils/jaccard';

// ─── Token 化 ───

import { tokenize } from './utils/tokenizer';
export { tokenize };

// ─── TF-IDF / 向量（抽至 dedup/idf.ts） ───

import {
  computeIdfTable,
  computeTfIdfVector,
  cosineSimilarity,
  editSimilarity,
  IdfTable,
  TfIdfVector,
} from './dedup/idf';

// ─── 缓存管理（抽至 dedup/cache-manager.ts） ───

export { getDefaultDedupCache, clearDedupCache } from './dedup/cache-manager';
import { CachedNote, DedupCacheManager, getDefaultDedupCache } from './dedup/cache-manager';

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

// ─── 辅助：路径边界检查 ───

export function isPathInFolder(filePath: string, targetFolder: string): boolean {
  if (!targetFolder) return false;
  const normalized = targetFolder.endsWith('/') ? targetFolder.slice(0, -1) : targetFolder;
  if (filePath === normalized) return true;
  if (filePath.startsWith(normalized + '/')) return true;
  return false;
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
