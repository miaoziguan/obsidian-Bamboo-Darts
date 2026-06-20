import { GateResult, ok, warn, block } from './types';

const DEFAULT_MIN_LENGTH = 50;
const DEFAULT_WARN_LENGTH = 200;
const DEFAULT_MAX_LENGTH = 50000;
const DEFAULT_WARN_MAX_LENGTH = 20000;

export function checkLength(
  content: string,
  minLength: number = DEFAULT_MIN_LENGTH,
  warnLength: number = DEFAULT_WARN_LENGTH,
  maxLength: number = DEFAULT_MAX_LENGTH,
  warnMaxLength: number = DEFAULT_WARN_MAX_LENGTH
): GateResult {
  const len = content.length;

  if (len < minLength) {
    return block(`内容过短（${len} 字），可能信息不足`);
  }

  if (len < warnLength) {
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
