import { GateResult, ok, warn, block } from './types';

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
  warnCount: number = MOJIBAKE_WARN_COUNT
): GateResult {
  let totalHits = 0;
  const found: string[] = [];

  for (const pattern of MOJIBAKE_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      totalHits += matches.length;
      found.push(matches[0]);
    }
  }

  if (totalHits >= blockCount) {
    return block(`检测到乱码特征（${found.slice(0, 3).join('、')}），内容编码可能有误`);
  }

  if (totalHits >= warnCount) {
    return warn(`检测到疑似乱码（${found[0]}），建议检查内容编码`);
  }

  return ok();
}
