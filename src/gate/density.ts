import { GATE_MIN_DENSITY, GATE_WARN_DENSITY } from '../constants';
import { GateResult, ok, warn, block } from './types';

export function checkDensity(
  content: string,
  tokenMap: Map<string, number>,
  minDensity: number = GATE_MIN_DENSITY,
  warnDensity: number = GATE_WARN_DENSITY
): GateResult {
  const total = Array.from(tokenMap.values()).reduce((a, b) => a + b, 0);
  if (total < 20) return ok();

  const unique = tokenMap.size;
  const rawDensity = unique / total;

  // 长文天然 token 多样性更高，阈值自适应放宽
  const adaptiveMin = minDensity * Math.max(0.3, 1 / Math.sqrt(Math.log10(total + 10)));
  const adaptiveWarn = warnDensity * Math.max(0.5, 1 / Math.sqrt(Math.log10(total + 10)));

  if (rawDensity < adaptiveMin) {
    return block(`信息密度极低（${(rawDensity * 100).toFixed(0)}%），大量重复内容，疑似SEO水文`);
  }

  if (rawDensity < adaptiveWarn) {
    return warn(`信息密度偏低（${(rawDensity * 100).toFixed(0)}%），可能存在重复内容`);
  }

  return ok();
}
