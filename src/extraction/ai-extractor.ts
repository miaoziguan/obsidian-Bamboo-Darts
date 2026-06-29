/**
 * AI 提炼：调用 DeepSeek API 将内容拆解为原子笔记
 *
 * 对 5xx 和网络错误自动重试 1 次（500ms 退避）
 */

import { requestUrl } from 'obsidian';
import type { ExtractorConfig } from '../extractor';
import {
  AtomicNote,
  parseAINoteOutput,
  validateAtomicNote,
  ensureTags,
} from '../utils/notes-standards';
import { buildSystemPrompt, buildExtractionPrompt } from './tag-preferences';
import { AI_TEMPERATURE, INPUT_TRUNCATE_LENGTH } from '../constants';

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

/** 最大重试次数（总尝试次数 = MAX_RETRY + 1） */
const MAX_RETRY = 1;

/** 重试延迟（毫秒） */
const RETRY_DELAY_MS = 500;

/** 休眠（毫秒） */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function extractAtomicNotes(
  content: string,
  config: Partial<ExtractorConfig> = {},
): Promise<{ success: boolean; notes?: AtomicNote[]; error?: string }> {
  const fullConfig: ExtractorConfig = { ...DEFAULT_CONFIG, ...config };

  if (!fullConfig.deepseekApiKey) {
    return { success: false, error: '未配置 DeepSeek API Key' };
  }

  const systemPrompt = buildSystemPrompt(fullConfig.tagPreferences, fullConfig.tagMode);
  const userPrompt = buildExtractionPrompt(
    content,
    fullConfig.inputTruncateLength || INPUT_TRUNCATE_LENGTH,
    fullConfig.urlTitle,
    fullConfig.urlPublishDate,
  );

  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    try {
      if (attempt > 0) {
        console.warn(`[提炼] 第 ${attempt + 1} 次尝试（重试）...`);
        await sleep(RETRY_DELAY_MS);
      }

      const response = await requestUrl({
        url: fullConfig.deepseekApiUrl,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${fullConfig.deepseekApiKey}`,
        },
        body: JSON.stringify({
          model: fullConfig.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: fullConfig.maxTokens,
          temperature: AI_TEMPERATURE,
          response_format: { type: 'json_object' },
        }),
        signal: fullConfig.signal,
        throw: false,
      });

      // 非 200 → 抛异常触发重试
      if (response.status !== 200) {
        throw new Error(`API 返回 ${response.status}`);
      }

      const aiContent = response.json?.choices?.[0]?.message?.content;
      if (!aiContent) {
        // 尝试从 API 响应里提取详细错误信息
        const apiError = response.json?.error?.message || response.json?.error?.type || '';
        const statusMsg = response.status ? `HTTP ${response.status}` : '';
        const errorDetail = apiError ? `（${apiError}）` : '';
        return {
          success: false,
          error: `AI 返回内容为空${statusMsg}${errorDetail}，请检查 API 配置或稍后重试`,
        };
      }

      const notes = parseAINoteOutput(aiContent, false);

      // 如果 strict 解析出 0 条，尝试宽松模式
      if (notes.length === 0) {
        console.warn('[提炼] 严格模式解析失败，尝试宽松模式降级...');
        const fallbackNotes = parseAINoteOutput(aiContent, true);
        if (fallbackNotes.length > 0) {
          console.warn(
            `[提炼] 宽松模式成功解析 ${fallbackNotes.length} 条笔记（可能包含质量较低的标题）`,
          );
          notes.push(...fallbackNotes);
        } else {
          console.warn('[提炼] 宽松模式也失败，AI 输出可能格式异常');
        }
      }

      // Phase 3.5: 校验笔记质量
      const validationResults = notes.map((note) => ({
        note,
        validation: validateAtomicNote(note),
      }));

      const validNotes = validationResults
        .filter((item) => item.validation.valid)
        .map((item) => item.note);

      if (validNotes.length === 0 && notes.length > 0) {
        const reasons = validationResults
          .map((item) => item.validation.issues.join('; '))
          .filter(Boolean)
          .join(' | ');
        return { success: false, error: `AI 输出的笔记校验失败: ${reasons}` };
      }

      ensureTags(validNotes, fullConfig.tagPreferences);

      return { success: true, notes: validNotes };
    } catch (error: unknown) {
      // 用户取消：abortController.abort() 会让 requestUrl 抛 AbortError，直接返回不重试
      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: '用户取消了提炼' };
      }

      const errorMsg = error instanceof Error ? error.message : String(error);
      // 429（限流）也视为可重试错误
      const isRetryable = /5\d{2}|429|ETIMEDOUT|ECONNREFUSED|ECONNRESET|Failed to fetch|network/i.test(
        errorMsg,
      );
      if (isRetryable && attempt < MAX_RETRY) {
        console.warn(`[提炼] 可重试错误: ${errorMsg}，${RETRY_DELAY_MS}ms 后重试（${attempt + 1}/${MAX_RETRY}）`);
        continue;
      }
      return { success: false, error: `AI 调用失败: ${errorMsg}` };
    }
  }
}
