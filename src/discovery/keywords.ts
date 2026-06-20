/**
 * 关键词提取工具函数
 * 基于共享 tokenizer（bigram 模式）实现
 */

import { extractKeywordSet } from '../utils/tokenizer';

/**
 * Extract keywords from text using bigrams and word filtering
 * 中文 2-gram + 英文完整词，过滤停用词
 */
export function extractKeywords(text: string): Set<string> {
  return extractKeywordSet(text);
}
