/**
 * 关键词提取工具函数
 * 从 main.js 中 P() 函数反混淆而来
 */

const STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人',
  '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你',
  '会', '着', '没有', '看', '好', '自己', '这',
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
]);

/**
 * Extract keywords from text using bigrams and word filtering
 */
export function extractKeywords(text: string): Set<string> {
  if (!text) return new Set();

  const words = text
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2);

  const keywords = new Set<string>();

  for (const w of words) {
    if (/[\u4e00-\u9fff]/.test(w)) {
      // Chinese: extract overlapping bi-char bigrams
      for (let i = 0; i < w.length - 1; i++) {
        const bigram = w.slice(i, i + 2);
        if (!STOP_WORDS.has(bigram)) {
          keywords.add(bigram);
        }
      }
    } else {
      // English: filter stop words
      if (!STOP_WORDS.has(w)) {
        keywords.add(w);
      }
    }
  }

  return keywords;
}
