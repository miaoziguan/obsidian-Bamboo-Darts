import { tokenize } from '../utils/tokenizer';
import { GateResult } from './types';

const ok = (): GateResult => ({ status: 'ok' });
const warn = (reason: string): GateResult => ({ status: 'warn', reason });
const block = (reason: string): GateResult => ({ status: 'block', reason });

/** 段落间相似度的最小 token 数：过短的段落不参与比对（噪声大） */
const MIN_PARAGRAPH_TOKENS = 8;

/** 参与比对的段落上限：超过则等间隔抽样，避免长文 O(n²) 爆炸 */
const MAX_COMPARED_PARAGRAPHS = 40;

function splitParagraphs(content: string): string[] {
  return content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** 等间隔抽样，保证首尾段落必含 */
function sampleParagraphs(paragraphs: string[]): string[] {
  if (paragraphs.length <= MAX_COMPARED_PARAGRAPHS) return paragraphs;
  const step = paragraphs.length / MAX_COMPARED_PARAGRAPHS;
  const picked: string[] = [];
  const seen = new Set<number>();
  // 始终保留首段与末段
  seen.add(0);
  seen.add(paragraphs.length - 1);
  picked.push(paragraphs[0]);
  for (let i = 1; i < MAX_COMPARED_PARAGRAPHS - 1; i++) {
    const idx = Math.min(paragraphs.length - 1, Math.floor(i * step));
    if (!seen.has(idx)) {
      seen.add(idx);
      picked.push(paragraphs[idx]);
    }
  }
  picked.push(paragraphs[paragraphs.length - 1]);
  return picked;
}

/**
 * 段落重复率检测（§6.3 后续项）
 *
 * 与 2-gram 信息密度互补：密度抓 token 级重复，本规则抓**结构级**重复——
 * 即多段之间高度相似（疑似机器洗稿、模板复制、段落反复）。
 *
 * 算法：将各段落转为 2-gram token 集合，两两计算 Jaccard 相似度，
 * 取最高相似度与「达到 warn 阈值」的段落对数作为判别依据。
 */
export function checkParagraphRepetition(
  content: string,
  blockThreshold: number = 0.85,
  warnThreshold: number = 0.7,
): GateResult {
  const paragraphs = sampleParagraphs(splitParagraphs(content));
  const tokenSets = paragraphs
    .map((p) => new Set(tokenize(p, { ngramSize: 2 }).keys()))
    .filter((s) => s.size >= MIN_PARAGRAPH_TOKENS);

  // 少于 2 个有效段落无法比对
  if (tokenSets.length < 2) return ok();

  let maxSim = 0;
  let repeatPairs = 0;

  for (let i = 0; i < tokenSets.length; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      const a = tokenSets[i];
      const b = tokenSets[j];
      const intersection = a.size < b.size ? countIntersection(a, b) : countIntersection(b, a);
      const union = a.size + b.size - intersection;
      if (union === 0) continue;
      const sim = intersection / union;
      if (sim > maxSim) maxSim = sim;
      if (sim >= warnThreshold) repeatPairs++;
    }
  }

  if (maxSim >= blockThreshold) {
    return block(
      `检测到段落高度重复（最高相似度 ${(maxSim * 100).toFixed(0)}%，共 ${repeatPairs} 对相似段落），疑似机器洗稿或模板复制`,
    );
  }

  if (maxSim >= warnThreshold) {
    return warn(
      `部分段落相似度较高（最高 ${(maxSim * 100).toFixed(0)}%，共 ${repeatPairs} 对），建议人工确认`,
    );
  }

  return ok();
}

/** 小集合遍历求交集大小（避免分配新 Set） */
function countIntersection(small: Set<string>, large: Set<string>): number {
  let count = 0;
  for (const token of small) {
    if (large.has(token)) count++;
  }
  return count;
}
