import { parseAINoteOutput, cleanTitle, validateAtomicNote, AtomicNote } from '../src/utils/notes-standards';

describe('notes-standards', () => {
  describe('parseAINoteOutput', () => {
    it('should parse standard YAML frontmatter format', () => {
      const input = `---
title: 原子笔记的价值
source: https://example.com
tags: 知识管理, AI
---
原子笔记是独立完整的知识单元。

---
title: 去重机制
source: https://example.com
tags: 算法
---
基于关键词Jaccard相似度的去重。`;

      const notes = parseAINoteOutput(input);

      expect(notes.length).toBe(2);
      expect(notes[0].title).toBe('原子笔记的价值');
      expect(notes[0].source).toBe('https://example.com');
      expect(notes[0].tags).toEqual(['知识管理', 'AI']);
      expect(notes[0].content).toBe('原子笔记是独立完整的知识单元。');
      expect(notes[1].title).toBe('去重机制');
    });

    it('should parse YAML with code block wrapper', () => {
      const input = `\`\`\`yaml
---
title: 测试笔记
tags: 测试
---
内容
\`\`\``;

      const notes = parseAINoteOutput(input);
      expect(notes.length).toBe(1);
      expect(notes[0].title).toBe('测试笔记');
      expect(notes[0].content).toBe('内容');
    });

    it('should parse numbered list format', () => {
      const input = `1. **标题一**
内容一

2. **标题二**
内容二`;

      const notes = parseAINoteOutput(input);
      expect(notes.length).toBe(2);
      expect(notes[0].title).toBe('标题一');
      expect(notes[0].content).toBe('内容一');
      expect(notes[1].title).toBe('标题二');
    });

    it('should parse markdown heading format', () => {
      const input = `### 标题一
内容一

### 标题二
内容二`;

      const notes = parseAINoteOutput(input);
      expect(notes.length).toBe(2);
      expect(notes[0].title).toBe('标题一');
    });

    it('should handle rejection responses', () => {
      const input = '无符合标准的原子笔记';
      const notes = parseAINoteOutput(input);
      expect(notes.length).toBe(0);
    });

    it('should handle inline tags and source in list format', () => {
      const input = `1. **测试标题**
tags: tag1, tag2
source: https://example.com
正文内容`;

      const notes = parseAINoteOutput(input);
      expect(notes.length).toBe(1);
      expect(notes[0].title).toBe('测试标题');
      expect(notes[0].tags).toEqual(['tag1', 'tag2']);
      expect(notes[0].source).toBe('https://example.com');
      expect(notes[0].content).toBe('正文内容');
    });

    it('should parse JSON object format with notes array', () => {
      const input = JSON.stringify({
        notes: [
          {
            title: 'JSON 笔记一',
            content: '这是第一条 JSON 笔记的正文。',
            tags: ['标签1', '标签2'],
            source: 'https://example.com',
          },
          {
            title: 'JSON 笔记二',
            content: '这是第二条 JSON 笔记的正文。',
          },
        ],
      });

      const notes = parseAINoteOutput(input);
      expect(notes.length).toBe(2);
      expect(notes[0].title).toBe('JSON 笔记一');
      expect(notes[0].content).toBe('这是第一条 JSON 笔记的正文。');
      expect(notes[0].tags).toEqual(['标签1', '标签2']);
      expect(notes[0].source).toBe('https://example.com');
      expect(notes[1].title).toBe('JSON 笔记二');
      expect(notes[1].tags).toBeUndefined();
    });

    it('should parse JSON array format', () => {
      const input = JSON.stringify([
        { title: '数组笔记一', content: '内容一', tags: ['a', 'b'] },
        { title: '数组笔记二', content: '内容二' },
      ]);

      const notes = parseAINoteOutput(input);
      expect(notes.length).toBe(2);
      expect(notes[0].title).toBe('数组笔记一');
      expect(notes[0].tags).toEqual(['a', 'b']);
      expect(notes[1].title).toBe('数组笔记二');
    });

    it('should parse JSON with tags as comma-separated string', () => {
      const input = JSON.stringify({
        notes: [
          {
            title: '标签字符串',
            content: '正文',
            tags: '标签1, 标签2',
          },
        ],
      });

      const notes = parseAINoteOutput(input);
      expect(notes.length).toBe(1);
      expect(notes[0].tags).toEqual(['标签1', '标签2']);
    });

    it('should parse JSON wrapped in code block', () => {
      const input = `\`\`\`json
${JSON.stringify({
        notes: [{ title: '代码块里的 JSON', content: '正文' }],
      })}
\`\`\``;

      const notes = parseAINoteOutput(input);
      expect(notes.length).toBe(1);
      expect(notes[0].title).toBe('代码块里的 JSON');
      expect(notes[0].content).toBe('正文');
    });

    it('should return empty array for empty JSON notes', () => {
      const input = JSON.stringify({ notes: [] });
      const notes = parseAINoteOutput(input);
      expect(notes.length).toBe(0);
    });

    it('should ignore malformed JSON and fall back to YAML', () => {
      const input = `not valid json
---
title: YAML 回退
tags: 测试
---
YAML 正文`;

      const notes = parseAINoteOutput(input);
      expect(notes.length).toBe(1);
      expect(notes[0].title).toBe('YAML 回退');
      expect(notes[0].content).toBe('YAML 正文');
    });
  });

  describe('cleanTitle', () => {
    it('should remove markdown bold markers', () => {
      expect(cleanTitle('**标题**')).toBe('标题');
    });

    it('should remove number prefix', () => {
      expect(cleanTitle('1. 标题')).toBe('标题');
      expect(cleanTitle('1、标题')).toBe('标题');
      expect(cleanTitle('① 标题')).toBe('标题');
    });

    it('should remove heading markers', () => {
      expect(cleanTitle('### 标题')).toBe('标题');
      expect(cleanTitle('## 标题')).toBe('标题');
    });

    it('should remove trailing punctuation', () => {
      expect(cleanTitle('标题：')).toBe('标题');
      expect(cleanTitle('标题，')).toBe('标题');
    });

    it('should shorten long titles', () => {
      const longTitle = '这是一个非常非常长的标题，用来测试标题缩短功能';
      const result = cleanTitle(longTitle);
      expect(result.length).toBeLessThanOrEqual(22);
      expect(result.length).toBeGreaterThanOrEqual(4);
    });

    it('should return empty for very short titles', () => {
      expect(cleanTitle('A')).toBe('');
    });

    it('should return short valid titles as-is', () => {
      expect(cleanTitle('的如')).toBe('的如');
      expect(cleanTitle('标题')).toBe('标题');
      expect(cleanTitle('好标题')).toBe('好标题');
    });
  });

  describe('shortenToBulletTitle (via cleanTitle)', () => {
    it('should use colon truncation strategy for long titles', () => {
      const title = '主题内容较长的标题用于测试：详细说明文字内容会被截断';
      expect(title.length).toBeGreaterThan(20);
      const result = cleanTitle(title);
      expect(result).toBe('主题内容较长的标题用于测试');
    });

    it('should use comma truncation strategy for long titles', () => {
      const title = '第一部分较长的内容用于测试截断，第二部分内容会被忽略';
      expect(title.length).toBeGreaterThan(20);
      const result = cleanTitle(title);
      expect(result).toBe('第一部分较长的内容用于测试截断');
    });

    it('should extract English terms from long titles', () => {
      const title = 'Sound Check 技术的作用和原理详细说明超过二十个字符';
      expect(title.length).toBeGreaterThan(20);
      const result = cleanTitle(title);
      expect(result).toBe('Sound Check');
    });

    it('should do safe truncation for pure Chinese long titles', () => {
      const title = '这是一个比较长的中文标题用于测试安全截断功能确保长度足够';
      expect(title.length).toBeGreaterThan(20);
      const result = cleanTitle(title);
      expect(result.length).toBeLessThanOrEqual(22);
      expect(result).toContain('这是一个');
    });
  });

  describe('validateAtomicNote', () => {
    it('should pass valid note', () => {
      const note: AtomicNote = {
        title: '有效标题',
        content: '这是足够长的内容，超过最小长度要求。',
        createdAt: new Date().toISOString(),
      };
      const result = validateAtomicNote(note);
      expect(result.valid).toBe(true);
      expect(result.issues.length).toBe(0);
    });

    it('should fail for empty title', () => {
      const note: AtomicNote = {
        title: '',
        content: '内容足够长',
        createdAt: new Date().toISOString(),
      };
      const result = validateAtomicNote(note);
      expect(result.valid).toBe(false);
      expect(result.issues[0]).toContain('缺少标题');
    });

    it('should fail for short content', () => {
      const note: AtomicNote = {
        title: '标题',
        content: '短',
        createdAt: new Date().toISOString(),
      };
      const result = validateAtomicNote(note);
      expect(result.valid).toBe(false);
      expect(result.issues[0]).toContain('内容过短');
    });

    it('should warn for multiple headings', () => {
      const note: AtomicNote = {
        title: '标题',
        content: '## 主题一\n内容\n## 主题二\n更多内容',
        createdAt: new Date().toISOString(),
      };
      const result = validateAtomicNote(note);
      expect(result.valid).toBe(true);
      expect(result.issues[0]).toContain('可能包含多个主题');
    });
  });
});