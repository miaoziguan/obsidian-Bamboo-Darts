/**
 * 历史记录服务
 * 从 main.js 中反混淆而来：extractionHistory, _srchs (SHA256 hash), _srcti (source title)
 */

import { fnv1aHash } from '../utils/hash';

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
    try { return new URL(content).hostname; } catch { return content.slice(0, 50); }
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
  const updated = [...history, entry];
  return updated.slice(-MAX_HISTORY_SIZE);
}
