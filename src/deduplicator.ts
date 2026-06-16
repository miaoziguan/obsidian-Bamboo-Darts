/**
 * 去重模块（Phase 5-6）
 * - Phase 5: 同批交叉去重
 * - Phase 6: 知识库去重比对（使用全文匹配）
 */

import { Vault } from 'obsidian';
import { AtomicNote } from './utils/notes-standards';
import { SIMILARITY_THRESHOLD, DEDUP_BATCH_SIZE } from './constants';

export interface DuplicateInfo {
  isDuplicate: boolean;
  similarity: number;
  matchedNote?: string; // 匹配的笔记路径
  matchedContent?: string; // 匹配的内容片段
}

export interface DedupResult {
  uniqueNotes: AtomicNote[];
  removedCount: number;
  duplicates: DuplicateInfo[];
}

/**
 * Phase 5: 同批交叉去重
 * 检查当前批次的笔记之间是否有重复
 */
export function crossCheckBatch(notes: AtomicNote[]): DedupResult {
  const uniqueNotes: AtomicNote[] = [];
  const duplicates: DuplicateInfo[] = [];

  for (let i = 0; i < notes.length; i++) {
    let isDuplicate = false;
    let bestMatch: DuplicateInfo | null = null;

    for (let j = 0; j < uniqueNotes.length; j++) {
      const similarity = calculateTextSimilarity(notes[i].content, uniqueNotes[j].content);
      if (similarity > SIMILARITY_THRESHOLD) {
        isDuplicate = true;
        bestMatch = {
          isDuplicate: true,
          similarity,
          matchedNote: `同批笔记 #${j + 1}: ${uniqueNotes[j].title}`,
          matchedContent: uniqueNotes[j].content.slice(0, 200),
        };
        break;
      }
    }

    if (isDuplicate && bestMatch) {
      duplicates.push(bestMatch);
    } else {
      uniqueNotes.push(notes[i]);
    }
  }

  return {
    uniqueNotes,
    removedCount: notes.length - uniqueNotes.length,
    duplicates,
  };
}

/**
 * Phase 6: 知识库去重比对（全文匹配版）
 * 将新笔记与已有笔记比对，检测语义重复
 */
export async function checkAgainstVault(
  vault: Vault,
  notes: AtomicNote[],
  targetFolder: string
): Promise<DedupResult> {
  const uniqueNotes: AtomicNote[] = [];
  const duplicates: DuplicateInfo[] = [];

  // 读取目标文件夹中的所有笔记
  const allFiles = vault.getMarkdownFiles();
  const existingFiles = targetFolder
    ? allFiles.filter(file => file.path.startsWith(targetFolder))
    : allFiles;

  const existingNotes: { path: string; content: string }[] = [];
  for (let i = 0; i < existingFiles.length; i += DEDUP_BATCH_SIZE) {
    const batch = existingFiles.slice(i, i + DEDUP_BATCH_SIZE);
    const contents = await Promise.all(batch.map(f => vault.read(f)));
    for (let j = 0; j < batch.length; j++) {
      existingNotes.push({ path: batch[j].path, content: contents[j] });
    }
  }

  // 对每个新笔记，与已有笔记比对
  for (const note of notes) {
    let isDuplicate = false;
    let bestMatch: DuplicateInfo | null = null;

    for (const existing of existingNotes) {
      const similarity = calculateTextSimilarity(note.content, existing.content);

      if (similarity > SIMILARITY_THRESHOLD) {
        isDuplicate = true;
        bestMatch = {
          isDuplicate: true,
          similarity,
          matchedNote: existing.path,
          matchedContent: existing.content.slice(0, 200) + '...',
        };
        break;
      }
    }

    if (isDuplicate && bestMatch) {
      duplicates.push(bestMatch);
    } else {
      uniqueNotes.push(note);
    }
  }

  return {
    uniqueNotes,
    removedCount: notes.length - uniqueNotes.length,
    duplicates,
  };
}

/**
 * 计算两段文本的相似度（基于关键词重合度）
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = extractKeywords(text1);
  const words2 = extractKeywords(text2);

  if (words1.size === 0 || words2.size === 0) return 0;

  // 计算 Jaccard 相似度
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * 提取关键词（简单实现：分词 + 去停用词）
 */
function extractKeywords(text: string): Set<string> {
  // 简单分词（按空格、标点分割）
  const words = text
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2); // 只保留长度 >= 2 的词

  // 常见停用词
  const stopWords = new Set([
    '的', '了', '在', '是', '我', '有', '和', '就', '不', '人',
    '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你',
    '会', '着', '没有', '看', '好', '自己', '这',
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  ]);

  return new Set(words.filter(w => !stopWords.has(w)));
}

/**
 * 生成去重报告
 */
function generateDedupReport(
  duplicates: DuplicateInfo[]
): string {
  if (duplicates.length === 0) {
    return '未检测到重复笔记';
  }

  let report = `检测到 ${duplicates.length} 条可能重复的笔记：\n\n`;

  for (const dup of duplicates) {
    report += `- **相似度**: ${(dup.similarity * 100).toFixed(1)}%\n`;
    if (dup.matchedNote) {
      report += `  **匹配笔记**: ${dup.matchedNote}\n`;
    }
    if (dup.matchedContent) {
      report += `  **内容片段**: ${dup.matchedContent}\n\n`;
    }
  }

  return report;
}
