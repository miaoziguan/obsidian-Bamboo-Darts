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
import { runGateChecks } from './utils/gate-rules';
import { parseAINoteOutput, AtomicNote, validateAtomicNote, ensureTags } from './utils/notes-standards';
import { crossCheckBatch, checkAgainstVaultDetailed, VaultMatchInfo, DedupResult, DuplicateInfo } from './deduplicator';
import { buildSystemPrompt, buildExtractionPrompt } from './extraction/tag-preferences';
import { classifyContent, resolveProfileConfig, PROFILE_LABELS, ContentProfile, ProfileConfig } from './extraction/profiles';
import { verifyClaims } from './extraction/fact-checker';
import { reviewNotes, ReviewConfig } from './review/note-reviewer';
import { extractUrlContent } from './extraction/url-extractor';
import { extractChunked } from './extraction/chunked-extractor';
import { AI_TEMPERATURE, INPUT_TRUNCATE_LENGTH } from './constants';
import { ProgressCallback, ProgressEvent, createProgressTracker, ProgressTracker } from './extraction/progress';

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
  enableVaultDedup?: boolean;
  // 进度回调
  onProgress?: ProgressCallback;
  // Profile 策略
  profile?: ContentProfile;
  autoClassify?: boolean;
  profileConfigs?: Partial<Record<ContentProfile, Partial<ProfileConfig>>>;
  // 深度提炼
  enableDeepMode?: boolean;
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
async function readContent(
  input: { type: 'url' | 'text' | 'selection'; content: string },
  signal?: AbortSignal
): Promise<ReadResult> {
  if (input.type === 'url') {
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

      return { success: true, content: extractResult.content, type: 'url' };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `读取 URL 失败: ${errorMsg}` };
    }
  } else if (input.type === 'selection') {
    // 选中文本
    const content = input.content;
    if (!content || content.trim().length < 50) {
      return { success: false, error: '选中文本过短（至少需要 50 字）' };
    }
    return { success: true, content, type: 'text' };
  } else {
    // 纯文本
    const content = input.content;
    if (!content || content.trim().length < 100) {
      return { success: false, error: '文本过短（至少需要 100 字）' };
    }
    return { success: true, content, type: 'text' };
  }
}

// ─── Phase 2: 质量门控 ───

// ─── Phase 3: 提炼原子笔记（AI 模式） ───

/**
 * Phase 3: 提炼原子笔记（调用 DeepSeek API）
 */
export async function extractAtomicNotes(
  content: string,
  config: Partial<ExtractorConfig> = {}
): Promise<{ success: boolean; notes?: AtomicNote[]; error?: string }> {
  const fullConfig: ExtractorConfig = { ...DEFAULT_CONFIG, ...config };

  if (!fullConfig.deepseekApiKey) {
    return { success: false, error: '未配置 DeepSeek API Key' };
  }

  const systemPrompt = buildSystemPrompt(fullConfig.tagPreferences, fullConfig.tagMode);
  const userPrompt = buildExtractionPrompt(content);

  try {
    const response = await requestUrl({
      url: fullConfig.deepseekApiUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${fullConfig.deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: fullConfig.model,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        max_tokens: fullConfig.maxTokens,
        temperature: AI_TEMPERATURE,
      }),
      signal: fullConfig.signal,
    });

    const aiContent = response.json?.choices?.[0]?.message?.content;
    if (!aiContent) {
      return { success: false, error: 'AI 返回内容为空，请检查 API 配置或稍后重试' };
    }

    const notes = parseAINoteOutput(aiContent, false);  // 纯AI模式：不修补标题，信任AI

    // 如果 strict 解析出 0 条，尝试宽松模式（带 ensureTitles）
    if (notes.length === 0) {
      console.warn('[提炼] 严格模式解析失败，尝试宽松模式降级...');
      const fallbackNotes = parseAINoteOutput(aiContent, true);
      if (fallbackNotes.length > 0) {
        console.warn(`[提炼] 宽松模式成功解析 ${fallbackNotes.length} 条笔记（可能包含质量较低的标题）`);
        notes.push(...fallbackNotes);
      } else {
        console.warn('[提炼] 宽松模式也失败，AI 输出可能格式异常');
      }
    }

    // Phase 3.5: 校验笔记质量
    const validationResults = notes.map(note => ({
      note,
      validation: validateAtomicNote(note),
    }));

    const validNotes = validationResults
      .filter(item => item.validation.valid)
      .map(item => item.note);

    if (validNotes.length === 0 && notes.length > 0) {
      // 有笔记但全部校验失败，记录失败原因
      const reasons = validationResults.map(item => item.validation.issues.join('; ')).filter(Boolean).join(' | ');
      return { success: false, error: `AI 输出的笔记校验失败: ${reasons}` };
    }

    // 确保每条笔记都有标签
    ensureTags(validNotes, fullConfig.tagPreferences);

    return { success: true, notes: validNotes };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: `AI 调用失败: ${errorMsg}` };
  }
}

// ─── 完整提炼流程 ───

/**
 * 完整的提炼流程（Phase 1-6）
 */

export interface ExtractionResult {
  success: boolean;
  notes?: AtomicNote[];
  steps: Step[];
  error?: string;
  detectedProfile?: ContentProfile;
  profileSource?: 'auto' | 'manual';
  crossBatchDuplicates?: DuplicateInfo[];
  verificationSummary?: { traced: number; needsCompare: number; outOfScope: number };
  vaultDedupResult?: DedupResult;
  vaultDedupPending?: PendingDuplicate[];
  // 疑似重复提示（中相似度），供 main.ts 判断是否走"确认后保存"流程
  duplicateHints?: { noteIndex: number; similarity: number; matchedNote: string; matchedContent: string; newNoteTitle: string; newNoteContent: string }[];
}

/** 中相似度疑似重复，需用户确认 */
export interface PendingDuplicate {
  similarity: number;
  matchedNote: string;
  matchedContent: string;
  newNoteIndex: number;
  newNoteTitle: string;
  newNoteContent: string;
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

  // Phase 1: 读取内容
  tracker.start('Phase 1', '读取内容', '开始读取...');
  const readResult = await readContent(input, fullConfig.signal);

  if (!readResult.success) {
    tracker.fail(readResult.error || '读取失败');
    return { success: false, steps: eventsToSteps(tracker.allEvents()), error: readResult.error };
  }

  tracker.complete(`成功读取 ${readResult.content!.length} 字`);

  const content = readResult.content!;

  // 统一截断：Phase 3/5/5b 使用相同的输入，避免核查盲区
  const truncatedContent = content.length > INPUT_TRUNCATE_LENGTH
    ? content.slice(0, INPUT_TRUNCATE_LENGTH)
    : content;

  // Phase 2: 质量门控
  tracker.start('Phase 2', '质量门控', '开始检查...');
  const gateResult = runGateChecks(content);

  if (!gateResult.passed) {
    tracker.fail(gateResult.reasons.join('; '));
    return { success: false, steps: eventsToSteps(tracker.allEvents()), error: gateResult.reasons.join('; ') };
  }

  if (gateResult.warnings.length > 0) {
    tracker.complete(`通过（${gateResult.warnings.length} 条提醒）`);
  } else {
    tracker.complete('通过');
  }

  // Profile 分类：自动判断或手动指定
  let detectedProfile: ContentProfile;
  let profileSource: 'auto' | 'manual';

  if (fullConfig.profile) {
    detectedProfile = fullConfig.profile;
    profileSource = 'manual';
  } else if (fullConfig.autoClassify !== false) {
    detectedProfile = classifyContent(content);
    profileSource = 'auto';
  } else {
    detectedProfile = 'balanced';
    profileSource = 'manual';
  }

  const activeProfileConfig = resolveProfileConfig(detectedProfile, fullConfig.profileConfigs);
  tracker.complete(`策略: ${PROFILE_LABELS[detectedProfile]} (${profileSource === 'auto' ? '自动检测' : '手动指定'})`);

  // Phase 3: 提炼原子笔记（AI 模式 / 深度模式）
  let extractResult: { success: boolean; notes?: AtomicNote[]; error?: string };

  if (fullConfig.enableDeepMode && content.length > INPUT_TRUNCATE_LENGTH) {
    tracker.start('Phase 3', '提炼原子笔记（深度模式）', `文本 ${content.length} 字，分段提炼中...`);
    const chunkedNotes = await extractChunked(content, config, fullConfig.onProgress);
    if (chunkedNotes.length === 0) {
      extractResult = { success: false, error: '深度提炼未产出任何笔记' };
    } else {
      extractResult = { success: true, notes: chunkedNotes };
    }
  } else {
    tracker.start('Phase 3', '提炼原子笔记', '正在调用 DeepSeek API...');
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
  if (fullConfig.signal?.aborted) {
    tracker.fail('已取消');
    return { success: false, steps: eventsToSteps(tracker.allEvents()), error: '用户取消了提炼' };
  }

  // Phase 4b: 知识库去重（可选）
  let vaultDedupResult: DedupResult | undefined;
  let vaultDedupPending: PendingDuplicate[] = [];

  if (fullConfig.enableVaultDedup && fullConfig.vault) {
    tracker.start('Phase 4b', '知识库去重', '正在与已有笔记比对...');

    const matchInfos: VaultMatchInfo[] = await checkAgainstVaultDetailed(
      fullConfig.vault,
      notes,
      fullConfig.targetFolder || ''
    );

    // 使用 Profile 策略的阈值
    const HIGH_SIM_THRESHOLD = activeProfileConfig.vaultHighThreshold;
    const MID_SIM_THRESHOLD = activeProfileConfig.vaultMidThreshold;

    const keptNotes: AtomicNote[] = [];
    const highDupCount = matchInfos.filter(m => m.bestMatch && m.bestMatch.similarity >= HIGH_SIM_THRESHOLD).length;
    const midDupCount = matchInfos.filter(m => m.bestMatch && m.bestMatch.similarity >= MID_SIM_THRESHOLD && m.bestMatch.similarity < HIGH_SIM_THRESHOLD).length;

    for (const info of matchInfos) {
      if (!info.bestMatch) {
        keptNotes.push(info.note);
      } else if (info.bestMatch.similarity >= HIGH_SIM_THRESHOLD) {
        // 高相似度：自动去重，跳过
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

    notes = keptNotes;

    vaultDedupResult = {
      uniqueNotes: keptNotes,
      removedCount: highDupCount,
      duplicates: matchInfos
        .filter(m => m.bestMatch && m.bestMatch.similarity >= MID_SIM_THRESHOLD)
        .map(m => ({
          isDuplicate: true,
          similarity: m.bestMatch!.similarity,
          matchedNote: m.bestMatch!.path,
          matchedContent: m.bestMatch!.content,
        })),
    };

    tracker.complete(`知识库去重：去除 ${highDupCount} 条高相似度重复，${midDupCount} 条待确认`);
  } else {
    tracker.start('Phase 4b', '知识库去重', '未启用或无 Vault');
    tracker.skip('未启用或无 Vault，跳过');
  }

  // 取消检查点（Phase 4b → 5）
  if (fullConfig.signal?.aborted) {
    tracker.fail('已取消');
    return { success: false, steps: eventsToSteps(tracker.allEvents()), error: '用户取消了提炼' };
  }

  // Phase 5: 内容核查（可选）—— 三层管线：原文溯源 → 语义比对 → 超源标记
  let verificationSummary: { traced: number; needsCompare: number; outOfScope: number } | undefined;

  if (fullConfig.factCheck) {
    tracker.start('Phase 5', '内容核查', '正在溯源和比对...');
    const verifyResult = await verifyClaims(truncatedContent, notes, {
      deepseekApiKey: fullConfig.deepseekApiKey,
      deepseekApiUrl: fullConfig.deepseekApiUrl,
      model: fullConfig.model,
      maxTokens: fullConfig.maxTokens,
      signal: fullConfig.signal,
    });

    verificationSummary = { traced: verifyResult.traced, needsCompare: verifyResult.needsCompare, outOfScope: verifyResult.outOfScope };

    if (verifyResult.error) {
      tracker.fail(`核查出错: ${verifyResult.error}`);
    } else {
      if (fullConfig.verifiedOnly) {
        const originalCount = notes.length;
        // Phase 5 过滤后，重新映射 vaultDedupPending 的索引
        const preFilterNotes = notes; // 过滤前的笔记数组
        const preFilterPendingIndices = new Map<string, number>(); // 标题 → 过滤前索引
        preFilterNotes.forEach((note, idx) => preFilterPendingIndices.set(note.title, idx));

        notes = notes.filter(note => {
          const v = note.verification;
          if (!v || v.length === 0) return true;
          return !v.some(r => r.status === '超源');
        });

        // 基于标题重建新数组中的索引映射
        const postFilterIndexMap = new Map<string, number>(); // 标题 → 过滤后索引
        notes.forEach((note, idx) => postFilterIndexMap.set(note.title, idx));

        // 重映射 vaultDedupPending 中的 newNoteIndex
        vaultDedupPending = vaultDedupPending
          .filter(p => {
            // 只有同时存在于过滤前后才保留
            const preIdx = preFilterPendingIndices.get(p.newNoteTitle);
            return preIdx !== undefined && postFilterIndexMap.has(p.newNoteTitle);
          })
          .map(p => ({
            ...p,
            newNoteIndex: postFilterIndexMap.get(p.newNoteTitle)!,
          }));

        tracker.complete(`溯源 ${verifyResult.traced}，需对比 ${verifyResult.needsCompare}，超源 ${verifyResult.outOfScope}（过滤超源：${originalCount} → ${notes.length}）`);
      } else {
        tracker.complete(`溯源 ${verifyResult.traced}，需对比 ${verifyResult.needsCompare}，超源 ${verifyResult.outOfScope}`);
      }
    }
  } else {
    tracker.start('Phase 5', '内容核查', '未启用');
    tracker.skip('未启用，跳过');
  }

  // 取消检查点（Phase 5 → 6）
  if (fullConfig.signal?.aborted) {
    tracker.fail('已取消');
    return { success: false, steps: eventsToSteps(tracker.allEvents()), error: '用户取消了提炼' };
  }

  // Phase 6: 笔记复查（可选）
  if (fullConfig.enableReview) {
    tracker.start('Phase 6', '笔记复查（AI 双重保险）', '正在对笔记进行价值评分...');

    const reviewConfig: ReviewConfig = {
      deepseekApiKey: fullConfig.reviewApiKey || fullConfig.deepseekApiKey,
      deepseekApiUrl: fullConfig.reviewApiUrl || fullConfig.deepseekApiUrl,
      model: fullConfig.reviewModel || fullConfig.model,
      maxTokens: fullConfig.maxTokens,
      signal: fullConfig.signal,
      minScore: activeProfileConfig.reviewMinScore,
    };

    const reviewResult = await reviewNotes(notes, reviewConfig);

    // 使用复查后的笔记（若复查失败，reviewNotes 内部已降级返回原始笔记）
    const filteredCount = notes.length - reviewResult.reviewedNotes.length;

    // Phase 6 复查后，重新映射 vaultDedupPending 的索引
    const preReviewPendingTitles = new Set(vaultDedupPending.map(p => p.newNoteTitle));
    const postReviewIndexMap = new Map<string, number>(); // 标题 → 复查后索引
    reviewResult.reviewedNotes.forEach((note, idx) => postReviewIndexMap.set(note.title, idx));

    // 过滤并重映射
    vaultDedupPending = vaultDedupPending
      .filter(p => postReviewIndexMap.has(p.newNoteTitle))
      .map(p => ({
        ...p,
        newNoteIndex: postReviewIndexMap.get(p.newNoteTitle)!,
      }));

    notes = reviewResult.reviewedNotes;

    // 以 reviewResult.success 为准，不再扫描 AI 输出的中文理由（避免"失败"二字误判）
    if (!reviewResult.success) {
      tracker.fail('复查失败，已降级使用原始笔记');
    } else if (filteredCount > 0) {
      tracker.complete(`复查完成，过滤 ${filteredCount} 条低质量笔记，保留 ${notes.length} 条`);
    } else {
      tracker.complete('复查完成，无低质量笔记需要过滤');
    }
  } else {
    tracker.start('Phase 6', '笔记复查', '未启用');
    tracker.skip('未启用，跳过');
  }

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
    detectedProfile,
    profileSource,
    crossBatchDuplicates: dedupResult.duplicates.length > 0 ? dedupResult.duplicates : undefined,
    verificationSummary,
    vaultDedupResult,
    vaultDedupPending: vaultDedupPending.length > 0 ? vaultDedupPending : undefined,
    duplicateHints,
  };
}
