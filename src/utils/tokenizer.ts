/**
 * 共享 Tokenizer（轻量 jieba 风格 DAG 分词 + n-gram + 英文完整词）
 *
 * 服务于去重（多粒度）和关键词提取两个场景。
 * 通过 ngramSize 参数控制中文分片粒度。
 *
 * 分词器内嵌一个裁剪版 jieba 词典：
 * - 保留 jieba 原词典中频率 ≥ 5000 的高频词（覆盖常用中文词汇）
 * - 合并 src/constants.ts 中的领域词表 CN_WORD_DICT
 * 最终词条约 2800 条、~55KB，兼顾效果与包体积。
 */

import { STOP_WORDS } from '../constants';
import { JIEBA_DICT, JIEBA_DICT_TOTAL } from './jieba-dict';

export interface TokenizeOptions {
  /** 中文 n-gram 大小，默认 3（去重场景）；关键词提取可设为 2 */
  ngramSize?: number;
}

/** trie 节点：子节点 + 词尾频率标记 `$` */
type TrieNode = {
  $?: number;
  [char: string]: TrieNode | number | undefined;
};

/** 根据词典构建前缀 trie */
function buildTrie(dict: Array<[string, number]>): TrieNode {
  const root: TrieNode = {};
  for (const [word, freq] of dict) {
    let node: TrieNode = root;
    for (const ch of word) {
      let next = node[ch];
      if (!next || typeof next === 'number') {
        next = {};
        node[ch] = next;
      }
      node = next;
    }
    node.$ = freq;
  }
  return root;
}

/** 为句子构建 DAG（有向无环图），记录每个位置所有可能的词尾 */
function buildDag(sentence: string, trie: TrieNode): number[][] {
  const n = sentence.length;
  const dag: number[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    const matches: number[] = [];
    let j = i;
    let node: TrieNode | undefined = trie;
    while (j < n && node && typeof node[sentence[j]] === 'object') {
      node = node[sentence[j]] as TrieNode;
      if (node.$ !== undefined) {
        matches.push(j);
      }
      j++;
    }
    // 无匹配时 fallback 为单字成词
    dag[i] = matches.length > 0 ? matches : [i];
  }
  return dag;
}

/**
 * DAG 动态规划求最大概率路径。
 * score 取 log(freq/total)，与 jieba 原算法一致。
 */
function calcRoute(
  sentence: string,
  dag: number[][],
  freq: Map<string, number>,
  total: number,
): Array<[number, number]> {
  const n = sentence.length;
  const route: Array<[number, number]> = new Array(n + 1);
  route[n] = [0, 0];

  for (let i = n - 1; i >= 0; i--) {
    let bestScore = -Infinity;
    let bestJ = i;
    for (const j of dag[i]) {
      const word = sentence.slice(i, j + 1);
      const f = freq.get(word) || 1;
      const score = Math.log(f / total) + route[j + 1][0];
      if (score > bestScore) {
        bestScore = score;
        bestJ = j;
      }
    }
    route[i] = [bestScore, bestJ];
  }

  return route;
}

/** 内嵌 jieba 分词器单例 */
const jieba = (() => {
  const trie = buildTrie(JIEBA_DICT);
  const freq = new Map<string, number>(JIEBA_DICT);
  const total = JIEBA_DICT_TOTAL;
  return { trie, freq, total };
})();

/** 使用 DAG + 最大概率路径对连续中文字符串进行分词 */
function jiebaCut(sentence: string): string[] {
  if (!sentence) return [];

  const dag = buildDag(sentence, jieba.trie);
  const route = calcRoute(sentence, dag, jieba.freq, jieba.total);

  const words: string[] = [];
  let i = 0;
  const n = sentence.length;
  while (i < n) {
    const j = route[i][1];
    words.push(sentence.slice(i, j + 1));
    i = j + 1;
  }
  return words;
}

/**
 * 从文本中提取 token：
 * - 中文：jieba DAG 分词（词汇级 token）+ 字符 n-gram（ngramSize 控制，默认 3）
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
    .filter((w) => w.length >= 1);

  for (const chunk of chunks) {
    if (/[\u4e00-\u9fff]/.test(chunk)) {
      // 中文分词（jieba 风格 DAG，补充词汇级 token）
      const words = jiebaCut(chunk);
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
