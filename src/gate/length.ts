import { GateResult } from './types';

const ok = (): GateResult => ({ status: 'ok' });
const warn = (reason: string): GateResult => ({ status: 'warn', reason });
const block = (reason: string): GateResult => ({ status: 'block', reason });

const DEFAULT_MIN_LENGTH = 50;
const DEFAULT_WARN_LENGTH = 200;
const DEFAULT_MAX_LENGTH = 50000;
const DEFAULT_WARN_MAX_LENGTH = 20000;

/** 选中文本通常较短，允许更宽松的最小长度门槛 */
const SELECTION_LENGTH_FACTOR = 0.6;

export function checkLength(
  content: string,
  minLength: number = DEFAULT_MIN_LENGTH,
  warnLength: number = DEFAULT_WARN_LENGTH,
  maxLength: number = DEFAULT_MAX_LENGTH,
  warnMaxLength: number = DEFAULT_WARN_MAX_LENGTH,
  sourceHint?: 'selection' | 'text' | 'url',
): GateResult {
  const len = content.length;

  // 选中文本时动态放宽最小长度门槛（至少保留 20 字符下限，避免无意义片段）
  const effectiveMinLength =
    sourceHint === 'selection' ? Math.max(20, Math.floor(minLength * SELECTION_LENGTH_FACTOR)) : minLength;
  const effectiveWarnLength =
    sourceHint === 'selection' ? Math.max(40, Math.floor(warnLength * SELECTION_LENGTH_FACTOR)) : warnLength;

  if (len < effectiveMinLength) {
    return block(`内容过短（${len} 字），可能信息不足`);
  }

  if (len < effectiveWarnLength) {
    return warn(`内容偏短（${len} 字），提炼结果可能有限`);
  }

  if (maxLength > 0 && len > maxLength) {
    return block(`内容过长（${len} 字），已超过 ${maxLength} 字限制，建议分段后提炼`);
  }

  if (warnMaxLength > 0 && len > warnMaxLength) {
    return warn(`内容较长（${len} 字），提炼时间可能较长`);
  }

  return ok();
}
