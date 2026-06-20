import { GATE_DUPLICATE_THRESHOLD } from '../constants';
import { GateResult, ok, block } from './types';

export function checkDuplicate(
  content: string,
  processedContents: string[],
  threshold: number = GATE_DUPLICATE_THRESHOLD
): GateResult {
  for (const existing of processedContents) {
    const similarity = calculateSimilarity(content, existing);
    if (similarity > threshold) {
      return block(`与已处理内容高度相似（相似度：${(similarity * 100).toFixed(1)}%）`);
    }
  }
  return ok();
}

function sampleText(s: string, budget: number = 1500): string {
  if (s.length <= budget) return s;
  const segLen = Math.floor(budget / 3);
  const head = s.slice(0, segLen);
  const midStart = Math.floor((s.length - segLen) / 2);
  const mid = s.slice(midStart, midStart + segLen);
  const tail = s.slice(s.length - segLen);
  return head + mid + tail;
}

export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = sampleText(str1.toLowerCase().replace(/\s+/g, ''));
  const s2 = sampleText(str2.toLowerCase().replace(/\s+/g, ''));

  if (s1.length < 2 || s2.length < 2) return 0;

  const lenRatio = Math.min(s1.length, s2.length) / Math.max(s1.length, s2.length);
  if (lenRatio < 0.5) return 0;

  const bigrams = (s: string) => new Set(Array.from({ length: s.length - 1 }, (_, i) => s.slice(i, i + 2)));
  const a = bigrams(s1);
  const b = bigrams(s2);
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}
