/**
 * 共享 Tokenizer（中文 n-gram + 分词 + 英文完整词）
 *
 * 服务于去重（多粒度）和关键词提取两个场景。
 * 通过 ngramSize 参数控制中文分片粒度。
 */

import { STOP_WORDS, CN_WORD_DICT } from '../constants';

export interface TokenizeOptions {
  /** 中文 n-gram 大小，默认 3（去重场景）；关键词提取可设为 2 */
  ngramSize?: number;
}

/** 正向最大匹配中文分词 */
function forwardMaxMatch(text: string): string[] {
  const words: string[] = [];
  let i = 0;
  while (i < text.length) {
    let matched = text[i]; // fallback: 单字
    let maxLen = Math.min(5, text.length - i);
    for (let len = maxLen; len >= 2; len--) {
      const candidate = text.slice(i, i + len);
      if (CN_WORD_DICT.has(candidate)) {
        matched = candidate;
        break;
      }
    }
    words.push(matched);
    i += matched.length;
  }
  return words;
}

/**
 * 从文本中提取 token：
 * - 中文：字符 n-gram（ngramSize 控制，默认 3）
 * - 英文：完整单词（≥2 字符）
 * 返回 token → 频次 的 Map
 */
export function tokenize(text: string, options?: TokenizeOptions): Map<string, number> {
  if (!text) return new Map();

  const ngramSize = options?.ngramSize ?? 3;
  const normalized = text.toLowerCase();
  const tokens = new Map<string, number>();

  // 按空格分割成"词块"（中文词块是连续汉字串）
  const chunks = normalized
    .replace(/[^\w\s\u4e00-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 1);

  for (const chunk of chunks) {
    if (/[\u4e00-\u9fff]/.test(chunk)) {
      // 中文分词（补充词汇级 token）
      const words = forwardMaxMatch(chunk);
      for (const word of words) {
        if (word.length >= 2 && !STOP_WORDS.has(word)) {
          tokens.set(`W:${word}`, (tokens.get(`W:${word}`) || 0) + 1);
        }
      }

      // 中文：字符 n-gram（长度不足 n 则退化为更小的 gram）
      if (chunk.length >= ngramSize) {
        for (let i = 0; i <= chunk.length - ngramSize; i++) {
          const gram = chunk.slice(i, i + ngramSize);
          if (!STOP_WORDS.has(gram)) {
            tokens.set(gram, (tokens.get(gram) || 0) + 1);
          }
        }
      } else if (chunk.length >= 2) {
        // 短中文：2-gram + 分词
        for (let i = 0; i <= chunk.length - 2; i++) {
          const gram = chunk.slice(i, i + 2);
          if (!STOP_WORDS.has(gram)) {
            tokens.set(gram, (tokens.get(gram) || 0) + 1);
          }
        }
      }
    } else {
      // 英文：完整词
      if (chunk.length >= 2 && !STOP_WORDS.has(chunk)) {
        tokens.set(chunk, (tokens.get(chunk) || 0) + 1);
      }
    }
  }

  return tokens;
}

/**
 * 从文本中提取关键词 Set（bigram 模式，适用于标签发现）
 * 与 tokenize 的区别：返回 Set 而非频次 Map，中文默认 2-gram
 */
export function extractKeywordSet(text: string): Set<string> {
  const tokenMap = tokenize(text, { ngramSize: 2 });
  return new Set(tokenMap.keys());
}
