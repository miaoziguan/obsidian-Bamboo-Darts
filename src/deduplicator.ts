/**
 * 去重模块（Phase 5-6）
 * - Phase 5: 同批交叉去重
 * - Phase 6: 知识库去重比对（TF-IDF + 余弦相似度）
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
import {
  DEDUP_BATCH_SIZE, DEDUP_CACHE_TTL,
  MIN_TOKENS_THRESHOLD, CROSS_BATCH_THRESHOLD, IDF_SMOOTH,
  LENGTH_RATIO_THRESHOLD, SHORT_NOTE_LENGTH, SHORT_NOTE_BOOST_FACTOR,
  BM25_K1, BM25_B, SIMHASH_HAMMING_THRESHOLD,
} from './constants';
import { simhash, hammingDistance } from './utils/simhash';

// ─── Token 化 ───

import { tokenize } from './utils/tokenizer';
// 重导出供测试使用
export { tokenize };

// ─── TF-IDF 核心 ───

/**
 * 单篇文档的预处理结果
 */
interface DocVector {
  tokenCount: number;        // 文档总 token 数
  tf: Map<string, number>;   // token → 词频（未归一化）
  norm: number;              // L2 范数（基于最终 tf-idf 计算）
}

/**
 * 语料库级 IDF 表
 */
interface IdfTable {
  docCount: number;
  idf: Map<string, number>;  // token → idf 值
}

/**
 * 计算语料库的 IDF 表
 * @param docTokens 每篇文档的 token 频次表
 * @param docCount 文档总数（用于平滑，docTokens 可能只是已有笔记）
 */
function computeIdfTable(docTokens: Array<Map<string, number>>, docCount?: number): IdfTable {
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

  return { docCount: N, idf };
}

/**
 * 计算文档向量的 TF-IDF 权重和 L2 范数
 * 注：我们不存完整向量，而是存 (token → tf-idf) 和范数，用于快速点积
 */
interface TfIdfVector {
  weights: Map<string, number>;  // token → tf-idf 权重
  norm: number;                   // L2 范数
  tokenCount: number;             // 原始 token 数（用于最小门槛判断）
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
  const lenNorm = avgDocLen > 0 ? (1 - b + b * docLen / avgDocLen) : 1;

  for (const [token, freq] of tokens) {
    // BM25 饱和词频
    const tf = freq / (freq + k1 * lenNorm);
    const idf = idfTable.idf.get(token) || Math.log((idfTable.docCount + IDF_SMOOTH) / (0 + IDF_SMOOTH)) + 1;
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
  const [small, large] = v1.weights.size <= v2.weights.size
    ? [v1.weights, v2.weights]
    : [v2.weights, v1.weights];

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
}

// ─── 缓存 ───

/**
 * 单篇已有笔记的预处理缓存
 */
interface CachedNote {
  path: string;
  content: string;
  tokens: Map<string, number>;         // token → 频次
  titleTokens: Map<string, number>;     // 标题 token → 频次（可选）
  vector: TfIdfVector;                  // 基于知识库语料的 tf-idf 向量
  titleVector: TfIdfVector | null;      // 标题向量
  simhashFp: bigint;                    // SimHash 64-bit 指纹
  mtime: number;
}

interface DedupCache {
  notes: CachedNote[];
  idfTable: IdfTable;
  targetFolder: string;  // 按文件夹隔离缓存
  timestamp: number;
}

/**
 * 去重缓存管理器
 * 按 targetFolder 独立缓存，避免跨文件夹污染
 */
class DedupCacheManager {
  private caches = new Map<string, DedupCache>();  // folder → cache

  invalidate(): void {
    this.caches.clear();
  }

  /** 获取某文件夹的缓存（若未过期且文件未变动） */
  get(targetFolder: string, vault: Vault): DedupCache | null {
    const cached = this.caches.get(targetFolder);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > DEDUP_CACHE_TTL) return null;

    // 验证文件未变动
    for (const note of cached.notes) {
      const file = vault.getAbstractFileByPath(note.path);
      if (!(file instanceof TFile) || file.stat.mtime !== note.mtime) {
        return null;
      }
    }
    return cached;
  }

  /** 更新某文件夹的缓存 */
  set(targetFolder: string, notes: CachedNote[], idfTable: IdfTable): void {
    this.caches.set(targetFolder, { notes, idfTable, targetFolder, timestamp: Date.now() });
  }
}

const defaultDedupCache = new DedupCacheManager();

// ─── 辅助：路径边界检查 ───

function isPathInFolder(filePath: string, targetFolder: string): boolean {
  if (!targetFolder) return false;
  const normalized = targetFolder.endsWith('/') ? targetFolder.slice(0, -1) : targetFolder;
  if (filePath === normalized) return true;
  if (filePath.startsWith(normalized + '/')) return true;
  return false;
}

// ─── 辅助函数 ───

/** Jaccard 系数：两集合交集大小 / 并集大小 */
function jaccardSimilarity(a: Set<string> | string[], b: Set<string> | string[]): number {
  const setA = a instanceof Set ? a : new Set(a);
  const setB = b instanceof Set ? b : new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  return intersection / (setA.size + setB.size - intersection);
}

/** 字符级编辑距离（Levenshtein），归一化为相似度 */
function editSimilarity(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0 || n === 0) return 0;
  const prev = new Uint16Array(n + 1);
  const curr = new Uint16Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return 1 - curr[n] / Math.max(m, n);
}

// ─── Phase 5: 同批交叉去重 ───

/**
 * 同批笔记交叉去重（基于 TF-IDF + 余弦相似度）
 * 新笔记之间互为语料，动态计算 IDF
 */
export function crossCheckBatch(notes: AtomicNote[], threshold?: number): DedupResult {
  const effectiveThreshold = threshold ?? CROSS_BATCH_THRESHOLD;
  const uniqueNotes: AtomicNote[] = [];
  const uniqueIndices: number[] = [];
  const duplicates: DuplicateInfo[] = [];

  // 1. Token 化所有笔记
  const docTokens = notes.map(n => tokenize(n.content));

  // 2. 以当前 batch 为语料计算 IDF（小语料，但足以区分相对重要性）
  const idfTable = computeIdfTable(docTokens);
  const avgLen = notes.reduce((s, n) => s + n.content.length, 0) / Math.max(notes.length, 1);

  // 3. 预计算所有笔记的 TF-IDF 向量
  const vectors = docTokens.map((tokens, i) => computeTfIdfVector(tokens, idfTable, notes[i].content.length, avgLen));

  // 4. 交叉比对
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    const vec = vectors[i];
      const length = note.content.length;
    let isDuplicate = false;
    let bestMatch: DuplicateInfo | null = null;
    const isShortNote = length < SHORT_NOTE_LENGTH;

    for (let j = 0; j < uniqueIndices.length; j++) {
      const uniqueIdx = uniqueIndices[j];
      const uniqueVec = vectors[uniqueIdx];
      const uniqueNote = uniqueNotes[j];

      // 长度预过滤
      const otherLen = notes[uniqueIdx].content.length;
      if (Math.abs(length - otherLen) / Math.max(length, otherLen) > LENGTH_RATIO_THRESHOLD) {
        continue;
      }

      // 关键词预过滤：Top-5 零交集 → 跳过余弦
      const keywordOverlap = jaccardSimilarity(vec.topTokens, uniqueVec.topTokens);
      if (keywordOverlap === 0 && Math.min(length, otherLen) > 30) continue;

      // 极短笔记：编辑距离兜底
      let similarity: number;
      if (isShortNote && otherLen < SHORT_NOTE_LENGTH) {
        similarity = editSimilarity(note.content, notes[uniqueIdx].content);
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

// ─── Phase 6: 知识库去重 ───

/**
 * 从知识库读取并预处理目标文件夹下的所有笔记
 */
async function loadAndPreprocessExistingNotes(
  vault: Vault,
  targetFolder: string,
): Promise<{ notes: CachedNote[]; idfTable: IdfTable }> {
  const allFiles = vault.getMarkdownFiles();
  const existingFiles = allFiles.filter(file => isPathInFolder(file.path, targetFolder));

  // 分批读取
  const allTokens: Array<Map<string, number>> = [];
  const rawNotes: Array<{ path: string; content: string; title: string; mtime: number }> = [];

  for (let i = 0; i < existingFiles.length; i += DEDUP_BATCH_SIZE) {
    const batch = existingFiles.slice(i, i + DEDUP_BATCH_SIZE);
    const contents = await Promise.all(batch.map(f => vault.read(f)));
    for (let j = 0; j < batch.length; j++) {
      const file = batch[j] as TFile;
      const content = contents[j];
      // 从 YAML frontmatter 提取标题（插件保存的笔记格式首行是 ---）
      let title = '';
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
      if (fmMatch) {
        const titleLine = fmMatch[1].match(/^title:\s*(.+)$/m);
        if (titleLine) title = titleLine[1].trim();
      }
      if (!title) {
        const headingMatch = content.match(/^#\s+(.+)$/m);
        title = headingMatch ? headingMatch[1].trim() : (content.split('\n')[0]?.trim() || '');
      }
      rawNotes.push({ path: file.path, content, title, mtime: file.stat.mtime });
      allTokens.push(tokenize(content));
    }
  }

  // 计算 IDF（基于整个目标文件夹的语料）
  const idfTable = computeIdfTable(allTokens, allTokens.length || 1);
  const avgLen = rawNotes.reduce((s, rn) => s + rn.content.length, 0) / Math.max(rawNotes.length, 1);

  // 计算每篇文档的 TF-IDF 向量
  const notes: CachedNote[] = rawNotes.map((rn, idx) => {
    const tokens = allTokens[idx];
    const vector = computeTfIdfVector(tokens, idfTable, rn.content.length, avgLen);
    const titleTokens = tokenize(rn.title);
    const titleVector = titleTokens.size >= MIN_TOKENS_THRESHOLD
      ? computeTfIdfVector(titleTokens, idfTable, rn.title.length, avgLen)
      : null;
    return {
      path: rn.path,
      content: rn.content,
      tokens,
      titleTokens,
      vector,
      titleVector,
      simhashFp: simhash(vector.weights),
      mtime: rn.mtime,
    };
  });

  return { notes, idfTable };
}

/**
 * 知识库去重（详细版：返回每条笔记的最佳匹配，支持标题加权）
 *
 * 综合相似度 = 标题余弦 * 0.25 + 内容余弦 * 0.75
 * - 内容为主：笔记的语义核心在正文
 * - 标题为辅：标题短但信息密度高，作为辅助信号
 * - 标题缺失或 token 不足：退化为纯内容相似度
 */
export async function checkAgainstVaultDetailed(
  vault: Vault,
  notes: AtomicNote[],
  targetFolder: string,
  cacheManager: DedupCacheManager = defaultDedupCache,
): Promise<VaultMatchInfo[]> {
  // 获取或构建知识库语料
  let existingNotes: CachedNote[];
  let idfTable: IdfTable;
  const cached = cacheManager.get(targetFolder, vault);

  if (cached) {
    existingNotes = cached.notes;
    idfTable = cached.idfTable;
  } else {
    const result = await loadAndPreprocessExistingNotes(vault, targetFolder);
    existingNotes = result.notes;
    idfTable = result.idfTable;
    cacheManager.set(targetFolder, existingNotes, idfTable);
  }

  // 计算整体平均文档长度（BM25 用）
  const vaultTotalLen = existingNotes.reduce((s, n) => s + n.content.length, 0);
  const newTotalLen = notes.reduce((s, n) => s + n.content.length, 0);
  const avgDocLen = (vaultTotalLen + newTotalLen) /
    Math.max(existingNotes.length + notes.length, 1);

  // 新笔记预处理
  const newNoteVectors: Array<{ vec: TfIdfVector; titleVec: TfIdfVector | null; length: number; simhashFp: bigint; topTokens: string[] }> = [];
  for (const note of notes) {
    const contentTokens = tokenize(note.content);
    const titleTokens = tokenize(note.title);
    const vec = computeTfIdfVector(contentTokens, idfTable, note.content.length, avgDocLen);
    const titleVec = titleTokens.size >= MIN_TOKENS_THRESHOLD
      ? computeTfIdfVector(titleTokens, idfTable, note.title.length, avgDocLen)
      : null;
    newNoteVectors.push({ vec, titleVec, length: note.content.length, simhashFp: simhash(vec.weights), topTokens: vec.topTokens });
  }

  const results: VaultMatchInfo[] = [];

  for (let idx = 0; idx < notes.length; idx++) {
    const note = notes[idx];
    const { vec: contentVec, titleVec: newTitleVec, length, simhashFp, topTokens } = newNoteVectors[idx];
    let bestMatch: VaultMatchInfo['bestMatch'] = null;

    // SimHash 预过滤：只比对汉明距离 < 3 的候选
    for (const existing of existingNotes) {
      if (hammingDistance(simhashFp, existing.simhashFp) >= SIMHASH_HAMMING_THRESHOLD) continue;

      // 长度预过滤
      if (Math.abs(length - existing.content.length) / Math.max(length, existing.content.length) > LENGTH_RATIO_THRESHOLD) {
        continue;
      }

      // 关键词预过滤
      const keywordOverlap = jaccardSimilarity(topTokens, existing.vector.topTokens);
      if (keywordOverlap === 0 && Math.min(length, existing.content.length) > 30) continue;

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
          content: existing.content.slice(0, 200) + (existing.content.length > 200 ? '...' : ''),
        };
      }
    }

    // 短笔记放大（短笔记 token 稀疏，相似度天然偏低）
    if (bestMatch && length < SHORT_NOTE_LENGTH) {
      bestMatch.similarity = Math.min(bestMatch.similarity * SHORT_NOTE_BOOST_FACTOR, 1.0);
    }

    results.push({ note, noteIndex: idx, bestMatch });
  }

  return results;
}
