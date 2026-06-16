/**
 * 历史记录服务
 * 从 main.js 中反混淆而来：extractionHistory, _srchs (SHA256 hash), _srcti (source title)
 */

import { createHash } from 'crypto';

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

/** Compute SHA256 hash for source content deduplication */
export function computeSourceHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
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
