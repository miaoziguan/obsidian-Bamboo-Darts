import { describe, it, expect } from 'vitest';
import { insertBacklinks } from '../src/services/backlink-service';

// ─── Editor Mock ───

class MockEditor {
  private content: string = '';
  private cursor: { line: number; ch: number } = { line: 0, ch: 0 };

  getCursor(): { line: number; ch: number } {
    return { ...this.cursor };
  }

  setCursor(pos: { line: number; ch: number }): void {
    this.cursor = { ...pos };
  }

  replaceRange(text: string, pos: { line: number; ch: number }): void {
    // 简单模拟：追加到内容末尾，更新内部状态
    this.content += text;
  }

  posToOffset(pos: { line: number; ch: number }): number {
    return this.content.length;
  }

  offsetToPos(offset: number): { line: number; ch: number } {
    return { line: 0, ch: offset };
  }

  getContent(): string {
    return this.content;
  }
}

describe('backlink-service', () => {
  describe('insertBacklinks', () => {
    it('应按正确顺序插入多个反向链接', () => {
      const editor = new MockEditor();
      const paths = ['Notes/笔记A.md', 'Notes/笔记B.md', 'Notes/笔记C.md'];

      const result = insertBacklinks(editor as any, paths);

      expect(result.success).toBe(3);
      expect(result.failed).toBe(0);

      const content = editor.getContent();
      // 验证顺序：A 在 B 之前，B 在 C 之前
      const posA = content.indexOf('笔记A');
      const posB = content.indexOf('笔记B');
      const posC = content.indexOf('笔记C');
      expect(posA).toBeLessThan(posB);
      expect(posB).toBeLessThan(posC);
    });

    it('应对空路径数组返回零成功', () => {
      const editor = new MockEditor();
      const result = insertBacklinks(editor as any, []);
      expect(result.success).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('应对 null editor 返回全部失败', () => {
      const result = insertBacklinks(null as any, ['Notes/test.md']);
      expect(result.success).toBe(0);
      expect(result.failed).toBe(1);
    });

    it('应正确提取文件名（去除路径和 .md 后缀）', () => {
      const editor = new MockEditor();
      const paths = ['Atomic Notes/我的笔记.md'];

      insertBacklinks(editor as any, paths);

      expect(editor.getContent()).toContain('[[我的笔记]]');
    });

    it('每条链接应以双换行包裹', () => {
      const editor = new MockEditor();
      const paths = ['Notes/test.md'];

      insertBacklinks(editor as any, paths);

      expect(editor.getContent()).toContain('\n\n[[test]]\n');
    });
  });
});
