/**
 * 核心提炼模块（Phase 1-6）
 * - Phase 1: 读取内容（URL/文本/文件）
 * - Phase 2: 质量门控
 * - Phase 3: 提炼原子笔记（AI 模式）
 * - Phase 4: 同批交叉去重
 * - Phase 5: 内容核查（可选，三层管线：原文溯源→语义比对→超源标记）
 * - Phase 6: 笔记复查（可选）
 */

import { requestUrl, Vault } from 'obsidian';
import { runGateChecks } from './gate';
import { AtomicNote } from './utils/notes-standards';
import { crossCheckBatch, checkAgainstVaultDetailed, VaultMatchInfo, DedupResult, DuplicateInfo } from './deduplicator';
import { classifyContent, resolveProfileConfig, ContentProfile, ProfileConfig } from './extraction/profiles';
import { verifyClaims } from './extraction/fact-checker';
import { reviewNotes, ReviewConfig, ReviewResult } from './review/note-reviewer';
import { extractUrlContent } from './extraction/url-extractor';
import { extractChunked } from './extraction/chunked-extractor';
import { extractAtomicNotes } from './extraction/ai-extractor';
import { INPUT_TRUNCATE_LENGTH, EXTRACTION_TIMEOUT_MS } from './constants';
import { ProgressCallback, ProgressEvent, createProgressTracker, ProgressTracker } from './extraction/progress';
import { fnv1aHash } from './utils/hash';

/** 笔记内容指纹（FNV-1a 哈希，防碰撞能力远强于 length:prefix） */
function noteFingerprint(note: AtomicNote): string {
  return `${note.content.length}:${fnv1aHash(note.content.slice(0, 200))}`;
}

/**
 * 重映射 vaultDedupPending 的 newNoteIndex
 * 过滤笔记后，pending 笔记在新数组中的位置可能变化，需要更新索引。
 * 使用内容指纹匹配，避免标题冲突。
 */
function remapPendingDuplicates(
  notes: AtomicNote[],
  pending: PendingDuplicate[],
): PendingDuplicate[] {
  const postIndexMap = new Map<string, number>();
  notes.forEach((note, idx) => postIndexMap.set(noteFingerprint(note), idx));

  return pending
    .filter(p => {
      // 构造临时 AtomicNote 以复用 noteFingerprint
      const key = `${p.newNoteContent.length}:${fnv1aHash(p.newNoteContent.slice(0, 200))}`;
      return postIndexMap.has(key);
    })
    .map(p => {
      const key = `${p.newNoteContent.length}:${fnv1aHash(p.newNoteContent.slice(0, 200))}`;
      return { ...p, newNoteIndex: postIndexMap.get(key)! };
    });
}

/** 取消检查：若已取消，标记 tracker 并返回结果；否则返回 null */
function checkAborted(
  signal: AbortSignal | undefined,
  tracker: ProgressTracker,
): ExtractionResult | null {
  if (signal?.aborted) {
    tracker.fail('已取消');
    return { success: false, steps: eventsToSteps(tracker.allEvents()), error: '用户取消了提炼' };
  }
  return null;
}

// ─── Phase 子函数 ───

/** Phase 4b: 知识库去重（可选） */
async function runVaultDedupPhase(
  notes: AtomicNote[],
  config: ExtractorConfig,
  profileConfig: ProfileConfig,
  tracker: ProgressTracker,
): Promise<{ notes: AtomicNote[]; vaultDedupResult?: DedupResult; vaultDedupPending: PendingDuplicate[] }> {
  if (!(config.enableVaultDedup && config.vault)) {
    tracker.start('Phase 4b', '知识库去重', '未启用或无 Vault');
    tracker.skip('未启用或无 Vault，跳过');
    return { notes, vaultDedupResult: undefined, vaultDedupPending: [] };
  }

  tracker.start('Phase 4b', '知识库去重', '正在与已有笔记比对...');

  const matchInfos: VaultMatchInfo[] = await checkAgainstVaultDetailed(
    config.vault,
    notes,
    config.dedupTargetFolder?.trim() || config.targetFolder || ''
  );

  const HIGH_SIM_THRESHOLD = profileConfig.vaultHighThreshold;
  const MID_SIM_THRESHOLD = profileConfig.vaultMidThreshold;

  const keptNotes: AtomicNote[] = [];
  const vaultDedupPending: PendingDuplicate[] = [];
  const highDupCount = matchInfos.filter(m => m.bestMatch && m.bestMatch.similarity >= HIGH_SIM_THRESHOLD).length;
  const midDupCount = matchInfos.filter(m => m.bestMatch && m.bestMatch.similarity >= MID_SIM_THRESHOLD && m.bestMatch.similarity < HIGH_SIM_THRESHOLD).length;

  for (const info of matchInfos) {
    if (!info.bestMatch) {
      keptNotes.push(info.note);
    } else if (info.bestMatch.similarity >= HIGH_SIM_THRESHOLD) {
      // 高相似度：保留笔记，但标记为待确认（红色提示），让用户决定
      keptNotes.push(info.note);
      vaultDedupPending.push({
        similarity: info.bestMatch.similarity,
        matchedNote: info.bestMatch.path,
        matchedContent: info.bestMatch.content,
        newNoteIndex: info.noteIndex,
        newNoteTitle: info.note.title,
        newNoteContent: info.note.content,
        highSimilarity: true,
      });
    } else if (info.bestMatch.similarity >= MID_SIM_THRESHOLD) {
      // 中相似度：保留笔记，但标记为待确认
      keptNotes.push(info.note);
      vaultDedupPending.push({
        similarity: info.bestMatch.similarity,
        matchedNote: info.bestMatch.path,
        matchedContent: info.bestMatch.content,
        newNoteIndex: info.noteIndex,
        newNoteTitle: info.note.title,
        newNoteContent: info.note.content,
      });
    } else {
      keptNotes.push(info.note);
    }
  }

  const vaultDedupResult: DedupResult = {
    uniqueNotes: keptNotes,
    removedCount: 0, // 不再自动丢弃，全部由用户确认
    duplicates: matchInfos
      .filter(m => m.bestMatch && m.bestMatch.similarity >= MID_SIM_THRESHOLD)
      .map(m => ({
        isDuplicate: true,
        similarity: m.bestMatch!.similarity,
        matchedNote: m.bestMatch!.path,
        matchedContent: m.bestMatch!.content,
      })),
  };

  tracker.complete(`知识库去重：${highDupCount} 条高相似度待确认，${midDupCount} 条中相似度待确认`);
  return { notes: keptNotes, vaultDedupResult, vaultDedupPending };
}

/** Phase 5: 内容核查（可选）—— 三层管线：原文溯源 → 语义比对 → 超源标记 */
async function runFactCheckPhase(
  notes: AtomicNote[],
  truncatedContent: string,
  config: ExtractorConfig,
  vaultDedupPending: PendingDuplicate[],
  tracker: ProgressTracker,
  fullContent?: string,
): Promise<{ notes: AtomicNote[]; verificationSummary?: { traced: number; needsCompare: number; outOfScope: number }; vaultDedupPending: PendingDuplicate[] }> {
  if (!config.factCheck) {
    tracker.start('Phase 5', '内容核查', '未启用');
    tracker.skip('未启用，跳过');
    return { notes, verificationSummary: undefined, vaultDedupPending };
  }

  tracker.start('Phase 5', '内容核查', '正在溯源和比对...');
  const verifyResult = await verifyClaims(truncatedContent, notes, {
    deepseekApiKey: config.deepseekApiKey,
    deepseekApiUrl: config.deepseekApiUrl,
    model: config.model,
    maxTokens: config.maxTokens,
    signal: config.signal,
  }, fullContent);

  const verificationSummary = { traced: verifyResult.traced, needsCompare: verifyResult.needsCompare, outOfScope: verifyResult.outOfScope };

  if (verifyResult.error) {
    tracker.fail(`核查出错: ${verifyResult.error}`);
    return { notes, verificationSummary, vaultDedupPending };
  }

  if (config.verifiedOnly) {
    const originalCount = notes.length;
    notes = notes.filter(note => {
      const v = note.verification;
      if (!v || v.length === 0) return true;
      return !v.some(r => r.status === '超源');
    });
    vaultDedupPending = remapPendingDuplicates(notes, vaultDedupPending);
    tracker.complete(`溯源 ${verifyResult.traced}，需对比 ${verifyResult.needsCompare}，超源 ${verifyResult.outOfScope}（过滤超源：${originalCount} → ${notes.length}）`);
  } else {
    tracker.complete(`溯源 ${verifyResult.traced}，需对比 ${verifyResult.needsCompare}，超源 ${verifyResult.outOfScope}`);
  }

  return { notes, verificationSummary, vaultDedupPending };
}

/** Phase 6: 笔记复查（可选，AI 双重保险） */
async function runReviewPhase(
  notes: AtomicNote[],
  config: ExtractorConfig,
  profileConfig: ProfileConfig,
  vaultDedupPending: PendingDuplicate[],
  tracker: ProgressTracker,
): Promise<{ notes: AtomicNote[]; vaultDedupPending: PendingDuplicate[]; reviewDetails?: ReviewResult[] }> {
  if (!config.enableReview) {
    tracker.start('Phase 6', '笔记复查', '未启用');
    tracker.skip('未启用，跳过');
    return { notes, vaultDedupPending, reviewDetails: undefined };
  }

  tracker.start('Phase 6', '笔记复查（AI 双重保险）', '正在对笔记进行价值评分...');

  const reviewConfig: ReviewConfig = {
    deepseekApiKey: config.reviewApiKey || config.deepseekApiKey,
    deepseekApiUrl: config.reviewApiUrl || config.deepseekApiUrl,
    model: config.reviewModel || config.model,
    maxTokens: config.maxTokens,
    signal: config.signal,
    minScore: profileConfig.reviewMinScore,
  };

  const reviewResult = await reviewNotes(notes, reviewConfig);

  // 使用复查后的笔记（若复查失败，reviewNotes 内部已降级返回原始笔记）
  const filteredCount = notes.length - reviewResult.reviewedNotes.length;

  // 使用内容指纹重映射 vaultDedupPending 的索引
  vaultDedupPending = remapPendingDuplicates(notes, vaultDedupPending);
  notes = reviewResult.reviewedNotes;

  // 以 reviewResult.success 为准，不再扫描 AI 输出的中文理由（避免"失败"二字误判）
  if (!reviewResult.success) {
    tracker.fail('复查失败，已降级使用原始笔记');
  } else if (filteredCount > 0) {
    tracker.complete(`复查完成，过滤 ${filteredCount} 条低质量笔记，保留 ${notes.length} 条`);
  } else {
    tracker.complete('复查完成，无低质量笔记需要过滤');
  }

  return { notes, vaultDedupPending, reviewDetails: reviewResult.reviewDetails };
}

export interface ExtractorConfig {
  deepseekApiKey: string;
  deepseekApiUrl: string;
  model: string;
  maxTokens: number;
  tagPreferences: string[];
  tagMode: 'lenient' | 'strict';
  factCheck: boolean;
  verifiedOnly: boolean;
  enableReview: boolean;
  reviewModel: string;
  reviewApiUrl: string;
  reviewApiKey: string;
  signal?: AbortSignal;
  // 知识库去重相关
  vault?: Vault;
  targetFolder?: string;
  /** 去重比对专用文件夹，留空则复用 targetFolder */
  dedupTargetFolder?: string;
  enableVaultDedup?: boolean;
  // 进度回调
  onProgress?: ProgressCallback;
  // Profile 策略
  profile?: ContentProfile;
  autoClassify?: boolean;
  profileConfigs?: Partial<Record<ContentProfile, Partial<ProfileConfig>>>;
  // 深度提炼
  enableDeepMode?: boolean;
  // 跳过了门控（强制提炼）
  skipGate?: boolean;
  /** 输入文本截断长度（覆盖默认常量） */
  inputTruncateLength?: number;
}

const DEFAULT_CONFIG: ExtractorConfig = {
  deepseekApiKey: '',
  deepseekApiUrl: 'https://api.deepseek.com/v1/chat/completions',
  model: 'deepseek-v4-flash',
  maxTokens: 6000,
  tagPreferences: [],
  tagMode: 'lenient',
  factCheck: false,
  verifiedOnly: false,
  enableReview: false,
  reviewModel: '',
  reviewApiUrl: '',
  reviewApiKey: '',
  enableVaultDedup: true,
};

// ─── Step 日志工具（向后兼容） ───

interface Step {
  step: string;
  status: 'success' | 'failed' | 'skipped' | 'running';
  message: string;
}

function eventsToSteps(events: ProgressEvent[]): Step[] {
  return events.map(e => ({
    step: `${e.phase} ${e.name}`.trim(),
    status: (e.status === 'pending' || e.status === 'running') ? 'running' : (e.status as Step['status']),
    message: e.detail || '',
  }));
}

// ─── Phase 1: 读取内容 ───

type ContentType = 'url' | 'text' | 'file';

interface ReadResult {
  success: boolean;
  content?: string;
  type?: ContentType;
  error?: string;
}

/**
 * Phase 1: 读取内容（URL/文本/文件）
 */

/** URL 提取结果内存缓存，同一个 URL 1 小时内复用 */
const URL_CACHE_TTL_MS = 60 * 60 * 1000;
const urlCache = new Map<string, { content: string; cachedAt: number }>();

function getFromUrlCache(url: string): string | null {
  const entry = urlCache.get(url);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > URL_CACHE_TTL_MS) {
    urlCache.delete(url);
    return null;
  }
  return entry.content;
}

function setUrlCache(url: string, content: string): void {
  urlCache.set(url, { content, cachedAt: Date.now() });
}

async function readContent(
  input: { type: 'url' | 'text' | 'selection'; content: string },
  signal?: AbortSignal
): Promise<ReadResult> {
  if (input.type === 'url') {
    // 先查缓存
    const cached = getFromUrlCache(input.content);
    if (cached) {
      return { success: true, content: cached, type: 'url' };
    }

    try {
      const response = await requestUrl({
        url: input.content,
        method: 'GET',
        signal,
      });

      if (!response.text) {
        return { success: false, error: '无法读取 URL 内容' };
      }

      const html = response.text;

      const extractResult = await extractUrlContent(html);

      if (!extractResult.success) {
        return { success: false, error: extractResult.error };
      }

      // 写入缓存
      setUrlCache(input.content, extractResult.content);

      return { success: true, content: extractResult.content, type: 'url' };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `读取 URL 失败: ${errorMsg}` };
    }
  } else if (input.type === 'selection') {
    // 选中文本
    const content = input.content;
    if (!content || content.trim().length === 0) {
      return { success: false, error: '未选中任何文本内容' };
    }
    return { success: true, content, type: 'text' };
  } else {
    // 纯文本
    const content = input.content;
    if (!content || content.trim().length === 0) {
      return { success: false, error: '未输入任何文本内容' };
    }
    return { success: true, content, type: 'text' };
  }
}

// ─── Phase 2: 质量门控 ───

// ─── Phase 3: 提炼原子笔记（AI 模式） ───
//
// 核心逻辑已移至 extraction/ai-extractor.ts，此处仅作导入重导出

export { extractAtomicNotes } from './extraction/ai-extractor';

// ─── 完整提炼流程 ───

/**
 * 完整的提炼流程（Phase 1-6）
 */

export interface ExtractionResult {
  success: boolean;
  notes?: AtomicNote[];
  steps: Step[];
  error?: string;
  gateWarnings?: string[];
  /** 是否因质量门控被阻断（用于上层决定是否提供强制提炼选项） */
  gateBlocked?: boolean;
  detectedProfile?: ContentProfile;
  profileSource?: 'auto' | 'manual';
  crossBatchDuplicates?: DuplicateInfo[];
  verificationSummary?: { traced: number; needsCompare: number; outOfScope: number };
  vaultDedupResult?: DedupResult;
  vaultDedupPending?: PendingDuplicate[];
  // 疑似重复提示（中相似度），供 main.ts 判断是否走"确认后保存"流程
  duplicateHints?: { noteIndex: number; similarity: number; matchedNote: string; matchedContent: string; newNoteTitle: string; newNoteContent: string }[];
  /** 复查评分详情（启用复查时） */
  reviewDetails?: ReviewResult[];
}

/** 中相似度疑似重复，需用户确认 */
export interface PendingDuplicate {
  similarity: number;
  matchedNote: string;
  matchedContent: string;
  newNoteIndex: number;
  newNoteTitle: string;
  newNoteContent: string;
  /** 是否为高相似度（>= vaultHighThreshold），用于 UI 红色警示 */
  highSimilarity?: boolean;
}

export async function runExtraction(
  input: {
    type: 'url' | 'text' | 'selection';
    content: string;
  },
  config: Partial<ExtractorConfig> = {}
): Promise<ExtractionResult> {
  const fullConfig: ExtractorConfig = { ...DEFAULT_CONFIG, ...config };
  const tracker: ProgressTracker = createProgressTracker(fullConfig.onProgress || null);
  const truncateLength = fullConfig.inputTruncateLength && fullConfig.inputTruncateLength >= 1000
    ? fullConfig.inputTruncateLength : INPUT_TRUNCATE_LENGTH;

  // Phase 1: 读取内容
  tracker.start('Phase 1', '读取内容', '开始读取...');
  const readResult = await readContent(input, fullConfig.signal);

  if (!readResult.success) {
    tracker.fail(readResult.error || '读取失败');
    return { success: false, steps: eventsToSteps(tracker.allEvents()), error: readResult.error };
  }

  tracker.complete(`成功读取 ${readResult.content!.length} 字`);

  const content = readResult.content!;
  const truncatedContent = content.length > truncateLength
    ? content.slice(0, truncateLength)
    : content;

  // 整体超时保护（深度模式给更长时间）
  const timeoutMs = fullConfig.enableDeepMode ? EXTRACTION_TIMEOUT_MS * 2 : EXTRACTION_TIMEOUT_MS;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<ExtractionResult>((resolve) => {
    timeoutId = setTimeout(() => {
      if (fullConfig.signal && !fullConfig.signal.aborted) {
        console.warn(`[提炼] 超时（${timeoutMs / 1000}s），自动中止`);
      }
      resolve({
        success: false,
        steps: eventsToSteps(tracker.allEvents()),
        error: `提炼超时（超过 ${timeoutMs / 1000}s）。建议：缩短文本或在设置中开启深度提炼模式分段处理`,
      });
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      runExtractionPhases(content, truncatedContent, fullConfig, tracker, config, truncateLength),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Phase 2-6：质量门控 → AI 提炼 → 去重 → 核查 → 复查
 */
async function runExtractionPhases(
  content: string,
  truncatedContent: string,
  fullConfig: ExtractorConfig,
  tracker: ProgressTracker,
  config: Partial<ExtractorConfig>,
  truncateLength: number,
): Promise<ExtractionResult> {

  // Profile 分类：自动判断或手动指定（纯规则，零 API 调用，提前到门控之前）
  let detectedProfile: ContentProfile;
  let profileSource: 'auto' | 'manual';

  if (fullConfig.profile) {
    detectedProfile = fullConfig.profile;
    profileSource = 'manual';
  } else if (fullConfig.autoClassify !== false) {
    detectedProfile = classifyContent(truncatedContent);
    profileSource = 'auto';
  } else {
    detectedProfile = 'balanced';
    profileSource = 'manual';
  }

  const activeProfileConfig = resolveProfileConfig(detectedProfile, fullConfig.profileConfigs);

  // Phase 2: 质量门控（使用 Profile 差异化阈值，skipGate 时跳过）
  let gateResult: { passed: boolean; summary: string; reasons: string[]; warnings: string[] } = {
    passed: true, summary: '', reasons: [], warnings: [],
  };

  if (!fullConfig.skipGate) {
    tracker.start('Phase 2', '质量门控', '开始检查...');
    gateResult = runGateChecks(truncatedContent, activeProfileConfig);

    if (!gateResult.passed) {
      tracker.fail(gateResult.summary);
      return { success: false, steps: eventsToSteps(tracker.allEvents()), error: gateResult.summary, gateBlocked: true };
    }

    if (gateResult.warnings.length > 0) {
      tracker.complete(`通过（${gateResult.warnings.length} 条提醒：${gateResult.warnings[0]}${gateResult.warnings.length > 1 ? '...' : ''}）`);
    } else {
      tracker.complete('通过');
    }
  } else {
    // 强制提炼：仍运行门控检查（不阻断），收集警告供 ResultModal 展示
    tracker.start('Phase 2', '质量门控', '已跳过阻断（强制提炼）');
    gateResult = runGateChecks(truncatedContent, activeProfileConfig);
    if (gateResult.warnings.length > 0) {
      tracker.complete(`跳过门控，但检测到 ${gateResult.warnings.length} 条质量提醒`);
    } else {
      tracker.skip('用户选择强制提炼（无质量警告）');
    }
  }

  // 取消检查点（Phase 2 → 3，在调用 AI API 前最后检查）
  {
    const r = checkAborted(fullConfig.signal, tracker);
    if (r) return r;
  }

  // Phase 3: 提炼原子笔记（AI 模式 / 深度模式）
  let extractResult: { success: boolean; notes?: AtomicNote[]; error?: string };

  const profileLabel = `${profileSource === 'auto' ? '自动检测' : '手动指定'}`;
  const deepHint = (content.length > truncateLength && !fullConfig.enableDeepMode) ? '（可在设置中开启深度提炼模式处理超长文本）' : '';
  const truncateNote = content.length > truncateLength
    ? ` 原文 ${content.length} 字，截断至 ${truncateLength} 字后发送${deepHint}`
    : '';

  if (fullConfig.enableDeepMode && content.length > truncateLength) {
    tracker.start('Phase 3', '提炼原子笔记（深度模式）', `${profileLabel} | 文本 ${content.length} 字，分段提炼中...`);
    const chunkedNotes = await extractChunked(content, config, fullConfig.onProgress, truncateLength, tracker);
    if (chunkedNotes.length === 0) {
      extractResult = { success: false, error: '深度提炼未产出任何笔记' };
    } else {
      extractResult = { success: true, notes: chunkedNotes };
    }
  } else {
    tracker.start('Phase 3', '提炼原子笔记', `${profileLabel} | 正在调用 DeepSeek API...${truncateNote}`);
    extractResult = await extractAtomicNotes(truncatedContent, config);
  }

  if (!extractResult.success) {
    tracker.fail(extractResult.error || '提炼失败');
    return { success: false, steps: eventsToSteps(tracker.allEvents()), error: extractResult.error };
  }

  tracker.complete(`成功提炼 ${extractResult.notes!.length} 条原子笔记`);
  let notes: AtomicNote[] = extractResult.notes!;

  // Phase 4: 同批交叉去重
  tracker.start('Phase 4', '同批交叉去重', '开始去重...');
  const dedupResult = crossCheckBatch(notes, activeProfileConfig.crossBatchThreshold);
  tracker.complete(`去重后剩余 ${dedupResult.uniqueNotes.length} 条（去除 ${notes.length - dedupResult.uniqueNotes.length} 条重复）`);
  notes = dedupResult.uniqueNotes;

  if (notes.length === 0) {
    return { success: false, steps: eventsToSteps(tracker.allEvents()), error: '未提炼出任何符合标准的原子笔记', notes: [] };
  }

  // 取消检查点（Phase 4 → 4b）
  {
    const r = checkAborted(fullConfig.signal, tracker);
    if (r) return r;
  }

  // Phase 4b: 知识库去重（可选）
  const vaultResult = await runVaultDedupPhase(notes, fullConfig, activeProfileConfig, tracker);
  notes = vaultResult.notes;
  let vaultDedupResult = vaultResult.vaultDedupResult;
  let vaultDedupPending = vaultResult.vaultDedupPending;

  // 取消检查点（Phase 4b → 5）
  {
    const r = checkAborted(fullConfig.signal, tracker);
    if (r) return r;
  }

  // Phase 5: 内容核查（可选）
  const factCheckResult = await runFactCheckPhase(notes, truncatedContent, fullConfig, vaultDedupPending, tracker, content);
  notes = factCheckResult.notes;
  const verificationSummary = factCheckResult.verificationSummary;
  vaultDedupPending = factCheckResult.vaultDedupPending;

  // 取消检查点（Phase 5 → 6）
  {
    const r = checkAborted(fullConfig.signal, tracker);
    if (r) return r;
  }

  // Phase 6: 笔记复查（可选）
  const reviewResult = await runReviewPhase(notes, fullConfig, activeProfileConfig, vaultDedupPending, tracker);
  notes = reviewResult.notes;
  vaultDedupPending = reviewResult.vaultDedupPending;
  const reviewDetails = reviewResult.reviewDetails;

  // 收尾
  tracker.finish();

  // **更新 vaultDedupResult.uniqueNotes**：确保它引用最终过滤后的笔记数组
  // Phase 5/6 可能进一步过滤笔记，但 vaultDedupResult 是在 Phase 4b 构建的
  if (vaultDedupResult) {
    vaultDedupResult = {
      ...vaultDedupResult,
      uniqueNotes: notes,
    };
  }

  // 构造 duplicateHints（从 vaultDedupPending 派生）
  const duplicateHints = vaultDedupPending.length > 0
    ? vaultDedupPending.map(p => ({
        noteIndex: p.newNoteIndex,
        similarity: p.similarity,
        matchedNote: p.matchedNote,
        matchedContent: p.matchedContent,
        newNoteTitle: p.newNoteTitle,
        newNoteContent: p.newNoteContent,
      }))
    : undefined;

  return {
    success: true,
    notes,
    steps: eventsToSteps(tracker.allEvents()),
    gateWarnings: gateResult.warnings.length > 0 ? gateResult.warnings : undefined,
    detectedProfile,
    profileSource,
    crossBatchDuplicates: dedupResult.duplicates.length > 0 ? dedupResult.duplicates : undefined,
    verificationSummary,
    vaultDedupResult,
    vaultDedupPending: vaultDedupPending.length > 0 ? vaultDedupPending : undefined,
    duplicateHints,
    reviewDetails,
  };
}
