/**
 * 多轮分段提炼模块（深度模式）
 *
 * 将超长文本分成多段，段间并发调用 AI 提炼，最后统一合并结果。
 * 仅在 enableDeepMode 且文本超过 INPUT_TRUNCATE_LENGTH 时触发。
 *
 * 已知权衡：段间 CHUNK_OVERLAP 重叠区可能导致相邻分段产出语义相近的笔记，
 * 合并后由 Phase 4 同批交叉去重统一处理，不在此处预去重（避免误杀）。
 */

import { AtomicNote } from '../utils/notes-standards';
import { extractAtomicNotes, ExtractorConfig } from '../extractor';
import { INPUT_TRUNCATE_LENGTH } from '../constants';
import { ProgressTracker } from './progress';

/** 分段提炼的默认重叠字数 */
const CHUNK_OVERLAP = 500;

/**
 * 将文本按指定大小分段，段间保留重叠
 *
 * 分段策略：优先在段落边界切分，找不到则按句号切分，最后硬切
 */
export function splitContent(text: string, chunkSize: number, overlap: number): string[] {
  if (text.length <= chunkSize) return [text];

  const chunks: string[] = [];
  let offset = 0;

  while (offset < text.length) {
    const end = Math.min(offset + chunkSize, text.length);

    if (end >= text.length) {
      chunks.push(text.slice(offset));
      break;
    }

    // 尝试在段落边界切分（向前搜索最近的 \n\n）
    let splitPoint = end;
    const lastParagraph = text.lastIndexOf('\n\n', end);
    if (lastParagraph > offset + chunkSize * 0.5) {
      splitPoint = lastParagraph;
    } else {
      // 尝试在句号处切分
      const lastPeriod = text.lastIndexOf('。', end);
      const lastPeriodEn = text.lastIndexOf('. ', end);
      const best = Math.max(lastPeriod, lastPeriodEn);
      if (best > offset + chunkSize * 0.5) {
        splitPoint = best + 1; // 包含句号
      }
    }

    chunks.push(text.slice(offset, splitPoint));

    // 用 previousOffset 检测是否前进，防止死循环
    const previousOffset = offset;
    offset = splitPoint - overlap;
    if (offset < 0) offset = splitPoint;
    // 如果 overlap 导致 offset 不前进，强制跳到 splitPoint
    if (offset <= previousOffset) {
      offset = splitPoint;
    }
  }

  return chunks;
}

/**
 * 多轮分段提炼（段间并发）
 *
 * 所有分段独立并发调用 AI，最后统一合并结果。取消信号会同时中止所有
 * 进行中的请求。去重与整合由调用方（Phase 4）统一处理。
 *
 * @param content 原始文本（不做截断，由调用方决定）
 * @param config  提炼配置
 * @param onProgress 进度回调
 * @returns 合并后的原子笔记数组（未去重）
 */
export async function extractChunked(
  content: string,
  config: Partial<ExtractorConfig>,
  chunkSize: number | undefined,
  tracker: ProgressTracker,
): Promise<AtomicNote[]> {
  const effectiveChunkSize = chunkSize && chunkSize >= 1000 ? chunkSize : INPUT_TRUNCATE_LENGTH;
  const chunks = splitContent(content, effectiveChunkSize, CHUNK_OVERLAP);

  // 开始前检查取消信号
  if (config.signal?.aborted) {
    tracker.update({ detail: '已取消', status: 'failed' });
    return [];
  }

  tracker.update({ detail: `深度模式：${chunks.length} 段并发提炼中...` });

  const results = await Promise.all(
    chunks.map(async (chunk, i): Promise<{ success: boolean; notes: AtomicNote[]; error?: string }> => {
      const label = `第${i + 1}/${chunks.length}段`;
      const result = await extractAtomicNotes(chunk, config);

      const normalized: { success: boolean; notes: AtomicNote[]; error?: string } = result.success
        ? { success: true, notes: result.notes ?? [], error: undefined }
        : { success: false, notes: [], error: result.error || '未知错误' };

      if (normalized.success && normalized.notes.length > 0) {
        tracker.update({ detail: `${label}完成：产出 ${normalized.notes.length} 条笔记` });
      } else if (!normalized.success) {
        tracker.update({ detail: `${label}失败：${normalized.error}` });
      }

      return normalized;
    }),
  );

  const allNotes: AtomicNote[] = [];
  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];

  for (const r of results) {
    if (r.success && r.notes.length > 0) {
      allNotes.push(...r.notes);
      successCount++;
    } else if (!r.success) {
      failCount++;
      if (r.error && !errors.includes(r.error)) {
        errors.push(r.error);
      }
    }
  }

  if (successCount === 0) {
    const summary = errors.length > 0 ? errors.join('；') : '所有分段均未产出笔记';
    tracker.update({ detail: `深度提炼失败：${summary}`, status: 'failed' });
  } else if (failCount > 0) {
    tracker.update({
      detail: `已完成：${successCount}/${chunks.length} 段成功，${failCount} 段失败，共产出 ${allNotes.length} 条笔记`,
    });
  }

  return allNotes;
}
