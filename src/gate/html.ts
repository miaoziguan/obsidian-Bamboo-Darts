import { GateResult } from './types';

const ok = (): GateResult => ({ status: 'ok' });
const warn = (reason: string): GateResult => ({ status: 'warn', reason });
const block = (reason: string): GateResult => ({ status: 'block', reason });

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
  warnCount: number = HTML_WARN_COUNT,
  lengthFactor: number = 1,
): GateResult {
  let totalHits = 0;
  const found: string[] = [];

  // 长文可能包含较多 HTML 片段（如技术文档），按长度因子放宽阈值
  const effectiveBlockCount = Math.max(blockCount, Math.floor(blockCount * lengthFactor * 0.7));
  const effectiveWarnCount = Math.max(warnCount, Math.floor(warnCount * lengthFactor * 0.6));

  for (const pattern of HTML_ARTIFACT_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      totalHits += matches.length;
      found.push(...matches.slice(0, 3));
    }
  }

  if (totalHits >= effectiveBlockCount) {
    return block(`检测到大量 HTML 残留标记（${found.slice(0, 3).join('、')}），内容提取可能不完整`);
  }

  if (totalHits >= effectiveWarnCount) {
    return warn(`检测到少量 HTML 残留（${found.slice(0, 3).join('、')}），提炼结果可能受影响`);
  }

  return ok();
}
