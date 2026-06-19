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
import { SIMILARITY_THRESHOLD, DEDUP_BATCH_SIZE } from './constants';

// ─── 常量定义 ───

const STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人',
  '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你',
  '会', '着', '没有', '看', '好', '自己', '这',
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
]);

// 最小 token 数：低于此值的笔记不参与重复判定
const MIN_TOKENS_THRESHOLD = 3;

// 同批去重相似度阈值（与旧 SIMILARITY_THRESHOLD 保持一致语义）
// 注意：余弦相似度通常比 Jaccard 更"宽容"，阈值需略调低
const CROSS_BATCH_THRESHOLD = 0.65;
const HIGH_SIM_THRESHOLD = 0.7;
const MID_SIM_THRESHOLD = 0.55;

// IDF 平滑常量
const IDF_SMOOTH = 1.0;

// ─── Token 化 ───

/**
 * 从文本中提取 token：
 * - 中文：字符 3-gram
 * - 英文：完整单词（≥2 字符）
 * 返回 token → 频次 的 Map
 */
function tokenize(text: string): Map<string, number> {
  if (!text) return new Map();

  const normalized = text.toLowerCase();
  const tokens = new Map<string, number>();

  // 按空格分割成"词块"（中文词块是连续汉字串）
  const chunks = normalized
    .replace(/[^\w\s\u4e00-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 1);

  for (const chunk of chunks) {
    if (/[\u4e00-\u9fff]/.test(chunk)) {
      // 中文：字符 3-gram（长度不足 3 则退化）
      if (chunk.length >= 3) {
        for (let i = 0; i <= chunk.length - 3; i++) {
          const gram = chunk.slice(i, i + 3);
          if (!STOP_WORDS.has(gram)) {
            tokens.set(gram, (tokens.get(gram) || 0) + 1);
          }
        }
      } else if (chunk.length >= 2) {
        // 短中文：退回 2-gram
        for (let i = 0; i <= chunk.length - 2; i++) {
          const gram = chunk.slice(i, i + 2);
          if (!STOP_WORDS.has(gram)) {
            tokens.set(gram, (tokens.get(gram) || 0) + 1);
          }
        }
      }
    } else {
      // 英文：完整词
      if (chunk.length >= 2 && !STOP_WORDS.has(chunk)) {
        tokens.set(chunk, (tokens.get(chunk) || 0) + 1);
      }
    }
  }

  return tokens;
}

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
}

function computeTfIdfVector(tokens: Map<string, number>, idfTable: IdfTable): TfIdfVector {
  const weights = new Map<string, number>();
  let sumSq = 0;

  for (const [token, freq] of tokens) {
    const tf = freq; // 使用频次而非归一化比例（与 idf 配合效果一致，避免短文档被过度放大）
    const idf = idfTable.idf.get(token) || Math.log((idfTable.docCount + IDF_SMOOTH) / (0 + IDF_SMOOTH)) + 1;
    const weight = tf * idf;
    weights.set(token, weight);
    sumSq += weight * weight;
  }

  return {
    weights,
    norm: Math.sqrt(sumSq),
    tokenCount: tokens.size,
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

interface DuplicateInfo {
  isDuplicate: boolean;
  similarity: number;
  matchedNote?: string;
  matchedContent?: string;
}

interface DedupResult {
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

const DEDUP_CACHE_TTL = 5 * 60 * 1000;

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

// ─── Phase 5: 同批交叉去重 ───

/**
 * 同批笔记交叉去重（基于 TF-IDF + 余弦相似度）
 * 新笔记之间互为语料，动态计算 IDF
 */
export function crossCheckBatch(notes: AtomicNote[]): DedupResult {
  const uniqueNotes: AtomicNote[] = [];
  const uniqueIndices: number[] = [];
  const duplicates: DuplicateInfo[] = [];

  // 1. Token 化所有笔记
  const docTokens = notes.map(n => tokenize(n.content));

  // 2. 以当前 batch 为语料计算 IDF（小语料，但足以区分相对重要性）
  const idfTable = computeIdfTable(docTokens);

  // 3. 预计算所有笔记的 TF-IDF 向量
  const vectors = docTokens.map(tokens => computeTfIdfVector(tokens, idfTable));

  // 4. 交叉比对
  const LENGTH_RATIO_THRESHOLD = 0.3;

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    const vec = vectors[i];
    const length = note.content.length;
    let isDuplicate = false;
    let bestMatch: DuplicateInfo | null = null;

    for (let j = 0; j < uniqueIndices.length; j++) {
      const uniqueIdx = uniqueIndices[j];
      const uniqueVec = vectors[uniqueIdx];

      // 长度预过滤
      const otherLen = notes[uniqueIdx].content.length;
      if (Math.abs(length - otherLen) / Math.max(length, otherLen) > LENGTH_RATIO_THRESHOLD) {
        continue;
      }

      const similarity = cosineSimilarity(vec, uniqueVec);
      if (similarity > CROSS_BATCH_THRESHOLD) {
        isDuplicate = true;
        bestMatch = {
          isDuplicate: true,
          similarity,
          matchedNote: `同批笔记 #${j + 1}: ${uniqueNotes[j].title}`,
          matchedContent: uniqueNotes[j].content.slice(0, 200),
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
      // 提取标题
      const titleMatch = content.match(/^#\s+(.+)$/m) || content.match(/^(.+)$/);
      const title = titleMatch ? titleMatch[1].trim() : '';
      rawNotes.push({ path: file.path, content, title, mtime: file.stat.mtime });
      allTokens.push(tokenize(content));
    }
  }

  // 计算 IDF（基于整个目标文件夹的语料）
  const idfTable = computeIdfTable(allTokens, allTokens.length || 1);

  // 计算每篇文档的 TF-IDF 向量
  const notes: CachedNote[] = rawNotes.map((rn, idx) => {
    const tokens = allTokens[idx];
    const vector = computeTfIdfVector(tokens, idfTable);
    const titleTokens = tokenize(rn.title);
    const titleVector = titleTokens.size >= MIN_TOKENS_THRESHOLD
      ? computeTfIdfVector(titleTokens, idfTable)
      : null;
    return {
      path: rn.path,
      content: rn.content,
      tokens,
      titleTokens,
      vector,
      titleVector,
      mtime: rn.mtime,
    };
  });

  return { notes, idfTable };
}

/**
 * 知识库去重（简化版：找到重复就标记）
 */
export async function checkAgainstVault(
  vault: Vault,
  notes: AtomicNote[],
  targetFolder: string,
  cacheManager: DedupCacheManager = defaultDedupCache,
): Promise<DedupResult> {
  const uniqueNotes: AtomicNote[] = [];
  const duplicates: DuplicateInfo[] = [];

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

  // 将新笔记 token 化（使用同一个 IDF 表，保持语义空间一致）
  const newNoteTokens = notes.map(n => tokenize(n.content));
  const newNoteVectors = newNoteTokens.map(tokens => computeTfIdfVector(tokens, idfTable));

  const LENGTH_RATIO_THRESHOLD = 0.3;

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    const vec = newNoteVectors[i];
    const length = note.content.length;
    let isDuplicate = false;
    let bestMatch: DuplicateInfo | null = null;

    for (const existing of existingNotes) {
      // 长度预过滤
      if (Math.abs(length - existing.content.length) / Math.max(length, existing.content.length) > LENGTH_RATIO_THRESHOLD) {
        continue;
      }

      const similarity = cosineSimilarity(vec, existing.vector);
      if (similarity > SIMILARITY_THRESHOLD) {
        isDuplicate = true;
        bestMatch = {
          isDuplicate: true,
          similarity,
          matchedNote: existing.path,
          matchedContent: existing.content.slice(0, 200) + '...',
        };
        break;
      }
    }

    if (isDuplicate && bestMatch) {
      duplicates.push(bestMatch);
    } else {
      uniqueNotes.push(note);
    }
  }

  return {
    uniqueNotes,
    removedCount: notes.length - uniqueNotes.length,
    duplicates,
  };
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

  // 新笔记预处理
  const newNoteVectors: Array<{ vec: TfIdfVector; titleVec: TfIdfVector | null; length: number }> = [];
  for (const note of notes) {
    const contentTokens = tokenize(note.content);
    const titleTokens = tokenize(note.title);
    const vec = computeTfIdfVector(contentTokens, idfTable);
    const titleVec = titleTokens.size >= MIN_TOKENS_THRESHOLD
      ? computeTfIdfVector(titleTokens, idfTable)
      : null;
    newNoteVectors.push({ vec, titleVec, length: note.content.length });
  }

  const LENGTH_RATIO_THRESHOLD = 0.3;
  const TITLE_WEIGHT = 0.25;
  const CONTENT_WEIGHT = 0.75;
  const SHORT_NOTE_LENGTH = 100;
  const results: VaultMatchInfo[] = [];

  for (let idx = 0; idx < notes.length; idx++) {
    const note = notes[idx];
    const { vec: contentVec, titleVec: newTitleVec, length } = newNoteVectors[idx];
    let bestMatch: VaultMatchInfo['bestMatch'] = null;

    for (const existing of existingNotes) {
      // 长度预过滤
      if (Math.abs(length - existing.content.length) / Math.max(length, existing.content.length) > LENGTH_RATIO_THRESHOLD) {
        continue;
      }

      // 内容相似度
      const contentSim = cosineSimilarity(contentVec, existing.vector);

      // 标题相似度（如果双方都有有效标题向量）
      let titleSim = 0;
      let hasTitleMatch = false;
      if (newTitleVec && existing.titleVector) {
        titleSim = cosineSimilarity(newTitleVec, existing.titleVector);
        hasTitleMatch = true;
      }

      // 综合相似度：有标题匹配则加权，否则退化为纯内容
      const combinedSim = hasTitleMatch
        ? titleSim * TITLE_WEIGHT + contentSim * CONTENT_WEIGHT
        : contentSim;

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
      bestMatch.similarity = Math.min(bestMatch.similarity * 1.15, 1.0);
    }

    results.push({ note, noteIndex: idx, bestMatch });
  }

  return results;
}
