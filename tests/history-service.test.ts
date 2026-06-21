import { describe, it, expect } from 'vitest';
import {
  computeSourceHash,
  getSourceTitle,
  addHistoryEntry,
  findPreviousExtraction,
  ExtractionHistoryEntry,
} from '../src/services/history-service';

describe('history-service', () => {
  // ─── FNV-1a 哈希 ───

  describe('computeSourceHash', () => {
    it('应对相同内容产生相同哈希', () => {
      const hash1 = computeSourceHash('测试内容');
      const hash2 = computeSourceHash('测试内容');
      expect(hash1).toBe(hash2);
    });

    it('应对不同内容产生不同哈希', () => {
      const hash1 = computeSourceHash('内容A');
      const hash2 = computeSourceHash('内容B');
      expect(hash1).not.toBe(hash2);
    });

    it('应返回 8 位十六进制字符串', () => {
      const hash = computeSourceHash('任意内容');
      expect(hash).toMatch(/^[0-9a-f]{8}$/);
    });

    it('应对空字符串产生确定性哈希', () => {
      const hash = computeSourceHash('');
      expect(hash).toMatch(/^[0-9a-f]{8}$/);
    });

    it('应对长文本正常工作', () => {
      const longText = '测试'.repeat(5000);
      const hash = computeSourceHash(longText);
      expect(hash).toMatch(/^[0-9a-f]{8}$/);
    });
  });

  // ─── getSourceTitle ───

  describe('getSourceTitle', () => {
    it('应对 URL 类型返回域名', () => {
      const url = 'https://example.com/article/123';
      expect(getSourceTitle('url', url)).toBe('example.com');
    });

    it('应对文本类型截取前 50 字', () => {
      const text = '这是一段很长的文本内容'.repeat(20);
      const title = getSourceTitle('text', text);
      expect(title.length).toBeLessThanOrEqual(50);
    });

    it('应对短文本返回完整内容', () => {
      const text = '短文本';
      expect(getSourceTitle('selection', text)).toBe(text);
    });
  });

  // ─── addHistoryEntry ───

  describe('addHistoryEntry', () => {
    it('应将新条目添加到历史末尾', () => {
      const history: ExtractionHistoryEntry[] = [];
      const entry: ExtractionHistoryEntry = {
        sourceHash: 'abc12345',
        sourceTitle: '测试',
        sourceType: 'text',
        extractedAt: '2026-01-01T00:00:00Z',
        noteCount: 5,
        savedPaths: ['notes/test.md'],
      };
      const result = addHistoryEntry(history, entry);
      expect(result).toHaveLength(1);
      expect(result[0].sourceHash).toBe('abc12345');
    });

    it('应在超过 50 条时裁剪旧条目', () => {
      const history: ExtractionHistoryEntry[] = Array.from({ length: 50 }, (_, i) => ({
        sourceHash: `hash${i}`,
        sourceTitle: `标题${i}`,
        sourceType: 'text' as const,
        extractedAt: new Date(i).toISOString(),
        noteCount: 1,
        savedPaths: [],
      }));
      const newEntry: ExtractionHistoryEntry = {
        sourceHash: 'newHash',
        sourceTitle: '新条目',
        sourceType: 'text',
        extractedAt: '2026-06-01T00:00:00Z',
        noteCount: 3,
        savedPaths: [],
      };
      const result = addHistoryEntry(history, newEntry);
      expect(result).toHaveLength(50);
      // 最后一条应该是新添加的
      expect(result[result.length - 1].sourceHash).toBe('newHash');
      // 最旧的一条应该被移除
      expect(result.find(e => e.sourceHash === 'hash0')).toBeUndefined();
    });

    it('不应修改输入数组', () => {
      const history: ExtractionHistoryEntry[] = [
        { sourceHash: 'a', sourceTitle: 'A', sourceType: 'text', extractedAt: '', noteCount: 1, savedPaths: [] },
      ];
      const originalLength = history.length;
      const result = addHistoryEntry(history, {
        sourceHash: 'b', sourceTitle: 'B', sourceType: 'text', extractedAt: '', noteCount: 1, savedPaths: [],
      });
      // addHistoryEntry 不应修改原数组，应返回新数组
      expect(history.length).toBe(originalLength);
      expect(result.length).toBe(originalLength + 1);
    });
  });

  // ─── findPreviousExtraction ───

  describe('findPreviousExtraction', () => {
    const history: ExtractionHistoryEntry[] = [
      { sourceHash: 'aaa11111', sourceTitle: '文章A', sourceType: 'url', extractedAt: '2026-01-01T00:00:00Z', noteCount: 5, savedPaths: ['notes/a.md'] },
      { sourceHash: 'bbb22222', sourceTitle: '文章B', sourceType: 'text', extractedAt: '2026-02-01T00:00:00Z', noteCount: 3, savedPaths: [] },
    ];

    it('应找到已存在的历史记录', () => {
      const result = findPreviousExtraction(history, 'aaa11111');
      expect(result).toBeDefined();
      expect(result!.sourceTitle).toBe('文章A');
    });

    it('应对不存在的哈希返回 undefined', () => {
      const result = findPreviousExtraction(history, 'zzz99999');
      expect(result).toBeUndefined();
    });

    it('应对空历史返回 undefined', () => {
      const result = findPreviousExtraction([], 'aaa11111');
      expect(result).toBeUndefined();
    });
  });
});
