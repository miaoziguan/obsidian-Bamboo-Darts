import { GateResult, ok, warn, block } from './types';

const HTML_ARTIFACT_PATTERNS: RegExp[] = [
  /<[a-z][a-z0-9]*\s[^>]*>/gi,
  /<\/[a-z][a-z0-9]*>/gi,
  /<(script|style|iframe|object|embed)[^>]*>/gi,
  /&[a-z]{2,8};/g,
  /&#[0-9]{2,5};/g,
];

const HTML_BLOCK_COUNT = 5;
const HTML_WARN_COUNT = 2;

export function checkHtmlArtifacts(
  content: string,
  blockCount: number = HTML_BLOCK_COUNT,
  warnCount: number = HTML_WARN_COUNT
): GateResult {
  let totalHits = 0;
  const found: string[] = [];

  for (const pattern of HTML_ARTIFACT_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      totalHits += matches.length;
      found.push(...matches.slice(0, 3));
    }
  }

  if (totalHits >= blockCount) {
    return block(`检测到大量 HTML 残留标记（${found.slice(0, 3).join('、')}），内容提取可能不完整`);
  }

  if (totalHits >= warnCount) {
    return warn(`检测到少量 HTML 残留（${found.slice(0, 3).join('、')}），提炼结果可能受影响`);
  }

  return ok();
}
