/**
 * 核心提炼模块（Phase 1-6）
 * - Phase 1: 读取内容（URL/文本/文件）
 * - Phase 2: 质量门控
 * - Phase 3: 提炼原子笔记（AI 模式）
 * - Phase 4: 同批交叉去重
 * - Phase 5: 事实核查（可选）
 * - Phase 6: 笔记复查（可选）
 */

import { requestUrl, MarkdownView, Editor } from 'obsidian';
import { runGateChecks } from './utils/gate-rules';
import { parseAINoteOutput, AtomicNote, validateAtomicNote, ensureTags } from './utils/notes-standards';
import { crossCheckBatch } from './deduplicator';
import { buildSystemPrompt, buildExtractionPrompt } from './extraction/tag-preferences';
import { verifyFacts } from './extraction/fact-checker';
import { reviewNotes, ReviewConfig } from './review/note-reviewer';
import { AI_TEMPERATURE } from './constants';

interface ExtractorConfig {
  deepseekApiKey: string;
  deepseekApiUrl: string;
  model: string;
  maxTokens: number;
  tagPreferences: string[];
  tagMode: 'lenient' | 'strict';
  factCheck: boolean;
  verifiedOnly: boolean;
  // 笔记复查
  enableReview: boolean;
  reviewModel: string;
  reviewApiUrl: string;
  reviewApiKey: string;
}

const DEFAULT_CONFIG: ExtractorConfig = {
  deepseekApiKey: '',
  deepseekApiUrl: 'https://api.deepseek.com/v1/chat/completions',
  model: 'deepseek-v4-flash',
  maxTokens: 2000,
  tagPreferences: [],
  tagMode: 'lenient',
  factCheck: false,
  verifiedOnly: false,
  enableReview: false,
  reviewModel: '',
  reviewApiUrl: '',
  reviewApiKey: '',
};

// ─── Step 日志工具 ───

interface Step {
  step: string;
  status: 'success' | 'failed' | 'skipped' | 'running';
  message: string;
}

function addStep(steps: Step[], step: string, status: Step['status'], message: string): void {
  steps.push({ step, status, message });
}

function updateLastStep(steps: Step[], status: Step['status'], message: string): void {
  const last = steps[steps.length - 1];
  if (last) {
    last.status = status;
    last.message = message;
  }
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
  input: { type: 'url' | 'text' | 'selection'; content: string; editor?: Editor; view?: MarkdownView }
): Promise<ReadResult> {
  if (input.type === 'url') {
    try {
      const response = await requestUrl({
        url: input.content,
        method: 'GET',
      });

      if (!response.text) {
        return { success: false, error: '无法读取 URL 内容' };
      }

      const html = response.text;

      // 简单提取正文（去掉 HTML 标签）
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      let content = bodyMatch ? bodyMatch[1] : html;

      // 去掉 script/style 标签
      content = content.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
      // 去掉 HTML 标签
      content = content.replace(/<[^>]+>/g, ' ');
      // 清理多余空白
      content = content.replace(/\s+/g, ' ').trim();

      if (content.length < 100) {
        return { success: false, error: 'URL 内容过短，可能不是文章内容页面' };
      }

      return { success: true, content, type: 'url' };
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

/**
 * Phase 2: 质量门控
 */
function runQualityGate(
  content: string,
  processedContents: string[] = []
): { passed: boolean; reasons: string[] } {
  return runGateChecks(content, processedContents);
}

// ─── Phase 3: 提炼原子笔记（AI 模式） ───

/**
 * Phase 3: 提炼原子笔记（调用 DeepSeek API）
 */
async function extractAtomicNotes(
  content: string,
  config: Partial<ExtractorConfig> = {}
): Promise<{ success: boolean; notes?: AtomicNote[]; error?: string }> {
  const fullConfig: ExtractorConfig = { ...DEFAULT_CONFIG, ...config };

  if (!fullConfig.deepseekApiKey) {
    return { success: false, error: '未配置 DeepSeek API Key' };
  }

  // 构建 Prompt（使用标签偏好动态生成 system prompt）
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
    });

    const aiContent = response.json?.choices?.[0]?.message?.content;
    if (!aiContent) {
      return { success: false, error: 'AI 返回内容为空，请检查 API 配置或稍后重试' };
    }

    const notes = parseAINoteOutput(aiContent, false);  // 纯AI模式：不修补标题，信任AI

    // 如果 strict 解析出 0 条，尝试宽松模式（带 ensureTitles）
    if (notes.length === 0) {
      const fallbackNotes = parseAINoteOutput(aiContent, true);
      if (fallbackNotes.length > 0) {
        notes.push(...fallbackNotes);
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
      const reasons = validationResults.map(item => item.validation.reason).join('; ');
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
  factCheckSummary?: { verified: number; doubtful: number; unverified: number };
}

export async function runExtraction(
  input: {
    type: 'url' | 'text' | 'selection';
    content: string;
    editor?: Editor;
    view?: MarkdownView;
  },
  config: Partial<ExtractorConfig> = {}
): Promise<ExtractionResult> {
  const fullConfig: ExtractorConfig = { ...DEFAULT_CONFIG, ...config };
  const steps: Step[] = [];

  // Phase 1: 读取内容
  addStep(steps, 'Phase 1: 读取内容', 'success', '开始读取...');
  const readResult = await readContent(input);

  if (!readResult.success) {
    updateLastStep(steps, 'failed', readResult.error || '读取失败');
    return { success: false, steps, error: readResult.error };
  }

  updateLastStep(steps, 'success', `成功读取 ${readResult.content!.length} 字`);

  const content = readResult.content!;

  // Phase 2: 质量门控
  addStep(steps, 'Phase 2: 质量门控', 'success', '开始检查...');
  const gateResult = runQualityGate(content);

  if (!gateResult.passed) {
    updateLastStep(steps, 'failed', gateResult.reasons.join('; '));
    return { success: false, steps, error: gateResult.reasons.join('; ') };
  }

  if (gateResult.warnings.length > 0) {
    updateLastStep(steps, 'success', `通过（${gateResult.warnings.length} 条提醒）`);
    // 警告信息存入 message detail
    const lastStep = steps[steps.length - 1];
    lastStep.message += '\n' + gateResult.warnings.join('\n');
  } else {
    updateLastStep(steps, 'success', '通过');
  }

  // Phase 3: 提炼原子笔记（AI 模式）
  addStep(steps, 'Phase 3: 提炼原子笔记', 'success', '正在调用 DeepSeek API...');
  const extractResult = await extractAtomicNotes(content, config);

  if (!extractResult.success) {
    updateLastStep(steps, 'failed', extractResult.error || '提炼失败');
    return { success: false, steps, error: extractResult.error };
  }

  updateLastStep(steps, 'success', `成功提炼 ${extractResult.notes!.length} 条原子笔记`);
  let notes: AtomicNote[] = extractResult.notes!;

  // Phase 4: 同批交叉去重
  addStep(steps, 'Phase 4: 同批交叉去重', 'success', '开始去重...');
  const dedupResult = crossCheckBatch(notes);
  updateLastStep(steps, 'success', `去重后剩余 ${dedupResult.uniqueNotes.length} 条（去除 ${notes.length - dedupResult.uniqueNotes.length} 条重复）`);
  notes = dedupResult.uniqueNotes;

  if (notes.length === 0) {
    return { success: false, steps, error: '未提炼出任何符合标准的原子笔记', notes: [] };
  }

  // Phase 5: 事实核查（可选）
  let factCheckSummary: { verified: number; doubtful: number; unverified: number } | undefined;

  if (fullConfig.factCheck) {
    addStep(steps, 'Phase 5: 事实核查', 'success', '正在核实关键事实...');
    const factResult = await verifyFacts(content, notes, {
      deepseekApiKey: fullConfig.deepseekApiKey,
      deepseekApiUrl: fullConfig.deepseekApiUrl,
      model: fullConfig.model,
      maxTokens: fullConfig.maxTokens,
    });

    factCheckSummary = { verified: factResult.verified, doubtful: factResult.doubtful, unverified: factResult.unverified };

    if (factResult.error) {
      updateLastStep(steps, 'failed', `核查出错: ${factResult.error}`);
    } else {
      updateLastStep(steps, 'success',
        `${notes.length} 条笔记中：有据 ${factResult.verified} 条，存疑 ${factResult.doubtful} 条，无据 ${factResult.unverified} 条`
      );

      // 如果启用了"仅保存已核实笔记"，过滤掉无据笔记
      if (fullConfig.verifiedOnly) {
        const originalCount = notes.length;
        notes = notes.filter(note => {
          const v = (note as any).verification as Array<{ status: string }> | undefined;
          if (!v || v.length === 0) return true; // 无事实声明，保留
          return !v.some(r => r.status === '无据');
        });
        updateLastStep(steps, 'success',
          `过滤无据笔记：${originalCount} → ${notes.length} 条`
        );
      }
    }
  } else {
    addStep(steps, 'Phase 5: 事实核查', 'skipped', '未启用，跳过');
  }

  // Phase 6: 笔记复查（可选）

  if (fullConfig.enableReview) {
    addStep(steps, 'Phase 6: 笔记复查（AI 双重保险）', 'success', '正在对笔记进行价值评分...');

    const reviewConfig: ReviewConfig = {
      deepseekApiKey: fullConfig.reviewApiKey || fullConfig.deepseekApiKey,
      deepseekApiUrl: fullConfig.reviewApiUrl || fullConfig.deepseekApiUrl,
      model: fullConfig.reviewModel || fullConfig.model,
      maxTokens: fullConfig.maxTokens,
    };

    const reviewResult = await reviewNotes(notes, reviewConfig);

    // 使用复查后的笔记（若复查失败，reviewNotes 内部已降级返回原始笔记）
    const filteredCount = notes.length - reviewResult.reviewedNotes.length;
    notes = reviewResult.reviewedNotes;

    const hasFailure = reviewResult.reviewDetails.some(d =>
      d.reason.includes('失败') || d.reason.includes('降级')
    );
    if (hasFailure) {
      updateLastStep(steps, 'failed', '复查失败，已降级使用原始笔记');
    } else if (filteredCount > 0) {
      updateLastStep(steps, 'success',
        `复查完成，过滤 ${filteredCount} 条低质量笔记，保留 ${notes.length} 条`
      );
    } else {
      updateLastStep(steps, 'success', '复查完成，无低质量笔记需要过滤');
    }
  } else {
    addStep(steps, 'Phase 6: 笔记复查', 'skipped', '未启用，跳过');
  }

  return { success: true, notes, steps, factCheckSummary };
}
