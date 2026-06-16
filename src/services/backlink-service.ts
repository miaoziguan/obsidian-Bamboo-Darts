/**
 * 自动反链服务
 * 从 main.js 中反混淆而来：autoBacklink 相关逻辑
 */

import { Editor } from 'obsidian';

/**
 * Batch insert backlinks for multiple notes
 */
export function insertBacklinks(
  editor: Editor,
  notePaths: string[]
): { success: number; failed: number } {
  let success = 0;
  let failed = 0;

  if (!editor) return { success: 0, failed: notePaths.length };

  for (const path of notePaths) {
    try {
      const noteName = path.split('/').pop()!.replace(/\.md$/, '');
      const backlink = `\n\n[[${noteName}]]\n`;
      const cursorPos = editor.getCursor();
      editor.replaceRange(backlink, cursorPos);
      success++;
    } catch {
      failed++;
    }
  }

  return { success, failed };
}
