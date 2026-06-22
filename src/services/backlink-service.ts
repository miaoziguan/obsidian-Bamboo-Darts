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
  notePaths: string[],
): { success: number; failed: number } {
  let success = 0;
  let failed = 0;

  if (!editor) return { success: 0, failed: notePaths.length };

  for (const path of notePaths) {
    try {
      const noteName = path.split('/').pop()!.replace(/\.md$/, '');
      if (!noteName) {
        failed++;
        continue;
      }
      const backlink = `\n\n[[${noteName}]]\n`;
      const cursorPos = editor.getCursor();
      editor.replaceRange(backlink, cursorPos);
      // 更新光标位置到插入内容之后，确保下一次插入顺序正确
      const newOffset = editor.posToOffset(cursorPos) + backlink.length;
      editor.setCursor(editor.offsetToPos(newOffset));
      success++;
    } catch (e) {
      console.error(`[Bamboo Darts] 插入反向链接失败: ${path}`, e);
      failed++;
    }
  }

  return { success, failed };
}
