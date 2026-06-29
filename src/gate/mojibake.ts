import { GateResult } from './types';

const ok = (): GateResult => ({ status: 'ok' });
const warn = (reason: string): GateResult => ({ status: 'warn', reason });
const block = (reason: string): GateResult => ({ status: 'block', reason });

const MOJIBAKE_PATTERNS: RegExp[] = [
  /锟斤拷/g,
  /烫烫烫/g,
  /屯屯屯/g,
  /(?:[ÂÃÄÅÆÇÈÉÊËÌÍÎÏ]){3,}/g,
  /\uFFFD{3,}/g,
];

const MOJIBAKE_BLOCK_COUNT = 3;
const MOJIBAKE_WARN_COUNT = 1;

export function checkMojibake(
  content: string,
  blockCount: number = MOJIBAKE_BLOCK_COUNT,
  warnCount: number = MOJIBAKE_WARN_COUNT,
  lengthFactor: number = 1,
): GateResult {
  let totalHits = 0;
  const found: string[] = [];

  // 长文偶尔出现少量乱码不应直接阻断，按长度因子放宽阈值
  const effectiveBlockCount = Math.max(blockCount, Math.floor(blockCount * lengthFactor * 0.7));
  const effectiveWarnCount = Math.max(warnCount, Math.floor(warnCount * lengthFactor * 0.6));

  for (const pattern of MOJIBAKE_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      totalHits += matches.length;
      found.push(matches[0]);
    }
  }

  if (totalHits >= effectiveBlockCount) {
    return block(`检测到乱码特征（${found.slice(0, 3).join('、')}），内容编码可能有误`);
  }

  if (totalHits >= effectiveWarnCount) {
    return warn(`检测到疑似乱码（${found[0]}），建议检查内容编码`);
  }

  return ok();
}
