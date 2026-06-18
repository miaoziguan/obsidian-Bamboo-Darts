import { DataCheckStatus } from './notes-standards';
import { MAX_DATA_POINTS_PER_CHECK } from '../constants';

const DATA_PATTERNS: { regex: RegExp; type: string }[] = [
  { regex: /(?:约|近|超|达|不足)?百分之[\d一二三四五六七八九十百千]+/g, type: 'percent' },
  { regex: /(?:约|近|超|达|不足)?\d+(?:\.\d+)?%/g, type: 'percent' },
  { regex: /\d+(?:\.\d+)?\s*(?:万亿|万|亿|千|百)?(?:美元|欧元|日元|英镑|人民币|元|美元|人|个|年|月|天|小时|kg|km|m|cm|mm)/g, type: 'quantity' },
  { regex: /\d{4}[-\/年]\d{1,2}[-\/月]\d{1,2}/g, type: 'date' },
  { regex: /\d{4}年\d{1,2}月\d{1,2}日/g, type: 'date' },
  { regex: /\d{1,2}月\d{1,2}日/g, type: 'date' },
  { regex: /\d{4}[-\/年]\d{1,2}/g, type: 'date' },
  { regex: /(?:第[一二三四五六七八九十\d]+|[一二三四五六七八九十]+倍|\d+倍|\d+番)/g, type: 'rank' },
];

export function extractDataPoints(content: string): { claim: string; rawNumber: string }[] {
  const points: { claim: string; rawNumber: string }[] = [];
  const seen = new Set<string>();

  const sentences = content.split(/[。！？\n\.!\?]+/);

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed || trimmed.length < 3) continue;

    for (const pattern of DATA_PATTERNS) {
      pattern.regex.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(trimmed)) !== null) {
        const rawNumber = match[0].trim();
        if (seen.has(rawNumber)) continue;
        seen.add(rawNumber);

        points.push({
          claim: trimmed.length <= 80 ? trimmed : trimmed.slice(0, 80) + '...',
          rawNumber,
        });
      }
    }
  }

  return points.slice(0, MAX_DATA_POINTS_PER_CHECK);
}

export function internalDataCheck(
  rawNumber: string,
  originalContent: string
): { status: DataCheckStatus; original?: string } | null {
  if (originalContent.includes(rawNumber)) {
    return { status: '一致', original: rawNumber };
  }

  const numMatch = rawNumber.match(/\d+(?:\.\d+)?/);
  if (!numMatch) return null;

  const numStr = numMatch[0];
  const num = parseFloat(numStr);
  if (isNaN(num)) return null;

  const allNumbers = originalContent.match(/\d+(?:\.\d+)?/g);
  if (!allNumbers) return null;

  for (const candidate of allNumbers) {
    const candidateNum = parseFloat(candidate);
    if (isNaN(candidateNum)) continue;

    if (candidateNum === num) {
      return { status: '一致', original: candidate };
    }

    const diff = Math.abs(candidateNum - num);
    const relDiff = num !== 0 ? diff / Math.abs(num) : diff;
    if (relDiff > 0 && relDiff < 0.05) {
      return { status: '偏差', original: candidate };
    }
  }

  return null;
}