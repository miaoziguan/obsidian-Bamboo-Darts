/**
 * 历史记录服务
 * 从 main.js 中反混淆而来：extractionHistory, _srchs (SHA256 hash), _srcti (source title)
 */

/**
 * FNV-1a 32位哈希：浏览器兼容的内容指纹
 * 用于提炼历史去重，不需要密码学安全
 */
function fnv1aHash(str: string): string {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0; // FNV prime, >>> 0 确保无符号
  }
  // 转为16进制字符串，补零到8位
  return hash.toString(16).padStart(8, '0');
}

export interface ExtractionHistoryEntry {
  sourceHash: string;
  sourceTitle: string;
  sourceType: 'url' | 'text' | 'selection';
  extractedAt: string;
  noteCount: number;
  savedPaths: string[];
}

/** Maximum number of history entries to keep */
const MAX_HISTORY_SIZE = 50;

/** 计算内容指纹哈希（FNV-1a，用于去重判断） */
export function computeSourceHash(content: string): string {
  return fnv1aHash(content);
}

/** Generate a short title for the extraction source */
export function getSourceTitle(type: string, content: string): string {
  if (type === 'url') {
    return content;
  }
  return content.slice(0, 50);
}

/** Check if content has been previously extracted */
export function findPreviousExtraction(
  history: ExtractionHistoryEntry[],
  sourceHash: string
): ExtractionHistoryEntry | undefined {
  return history.find(entry => entry.sourceHash === sourceHash);
}

/** Add a new extraction history entry, pruning old ones */
export function addHistoryEntry(
  history: ExtractionHistoryEntry[],
  entry: ExtractionHistoryEntry
): ExtractionHistoryEntry[] {
  history.push(entry);
  return history.slice(-MAX_HISTORY_SIZE);
}
