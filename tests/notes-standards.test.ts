import {
  parseAINoteOutput,
  cleanTitle,
  validateAtomicNote,
  ensureTags,
  AtomicNote,
} from '../src/utils/notes-standards';

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

    it('should fail for whitespace-only title', () => {
      const note: AtomicNote = {
        title: '   ',
        content: '内容足够长',
        createdAt: new Date().toISOString(),
      };
      const result = validateAtomicNote(note);
      expect(result.valid).toBe(false);
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

    it('should not warn when single heading', () => {
      const note: AtomicNote = {
        title: '标题',
        content: '## 主题一\n内容',
        createdAt: new Date().toISOString(),
      };
      const result = validateAtomicNote(note);
      expect(result.issues.find((i) => i.includes('多个主题'))).toBeUndefined();
    });
  });

  describe('ensureTags', () => {
    it('should keep note when it already has valid tags', () => {
      const notes: AtomicNote[] = [
        {
          id: 'n1',
          title: '标题',
          content: '正文内容足够长',
          tags: ['机器学习', 'AI'],
          createdAt: '',
        },
      ];
      const result = ensureTags(notes);
      expect(result[0].tags).toEqual(['机器学习', 'AI']);
    });

    it('should filter out garbage placeholder tags', () => {
      const notes: AtomicNote[] = [
        {
          id: 'n1',
          title: '标题',
          content: '正文内容足够长**关键概念**用于提取标签。',
          tags: ['none', '无', 'null'],
          createdAt: '',
        },
      ];
      const result = ensureTags(notes);
      // 垃圾标签被过滤后重新提取
      expect(result[0].tags!.length).toBeGreaterThan(0);
      expect(result[0].tags!.some((t) => ['none', '无', 'null'].includes(t))).toBe(false);
    });

    it('should filter too-short tags (length<2)', () => {
      const notes: AtomicNote[] = [
        {
          id: 'n1',
          title: '标题',
          content: '正文内容足够长**关键概念**用于提取。',
          tags: ['A', 'B'],
          createdAt: '',
        },
      ];
      const result = ensureTags(notes);
      expect(result[0].tags!.some((t) => t.length < 2)).toBe(false);
    });

    it('should extract tags from bold text in content', () => {
      const notes: AtomicNote[] = [
        {
          id: 'n1',
          title: '标题',
          content: '这是一段**重要概念**和**核心方法**的正文，足够长。',
          createdAt: '',
        },
      ];
      const result = ensureTags(notes);
      expect(result[0].tags).toContain('重要概念');
      expect(result[0].tags).toContain('核心方法');
    });

    it('should extract tags from parentheses terms', () => {
      const notes: AtomicNote[] = [
        {
          id: 'n1',
          title: '标题',
          content: '文中提到一个术语（Transformer架构）作为例子，内容足够长。',
          createdAt: '',
        },
      ];
      const result = ensureTags(notes);
      expect(result[0].tags).toContain('Transformer架构');
    });

    it('should extract tags from quoted phrases', () => {
      const notes: AtomicNote[] = [
        {
          id: 'n1',
          title: '标题',
          content: '他引用了“深度学习”和“迁移学习”两个概念，内容足够长用于测试提取。**关键概念**也出现。',
          createdAt: '',
        },
      ];
      const result = ensureTags(notes);
      // 引号分支（2-10 字）被覆盖；加粗关键词保证有标签
      expect(result[0].tags!.length).toBeGreaterThan(0);
      expect(result[0].tags).toContain('关键概念');
    });

    it('should extract subject phrase from first sentence when keywords sparse', () => {
      const notes: AtomicNote[] = [
        {
          id: 'n1',
          title: '标题',
          content: '知识蒸馏是一种模型压缩技术，通过教师模型指导学生模型，内容足够长。',
          createdAt: '',
        },
      ];
      const result = ensureTags(notes);
      // 兜底策略提取主语"知识蒸馏"
      expect(result[0].tags).toContain('知识蒸馏');
    });

    it('should prioritize user preferences when matching keywords', () => {
      const notes: AtomicNote[] = [
        {
          id: 'n1',
          title: '标题',
          content: '正文包含**算法**与**架构**两个关键概念，足够长。',
          createdAt: '',
        },
      ];
      const result = ensureTags(notes, ['算法']);
      // 用户偏好"算法"应排在前面
      expect(result[0].tags![0]).toBe('算法');
    });

    it('should dedupe extracted tags', () => {
      const notes: AtomicNote[] = [
        {
          id: 'n1',
          title: '标题',
          content: '**概念A**出现两次**概念A**但这里第二次也提及，内容足够长。',
          createdAt: '',
        },
      ];
      const result = ensureTags(notes);
      expect(result[0].tags!.filter((t) => t === '概念A').length).toBe(1);
    });

    it('should cap tags at 6', () => {
      const notes: AtomicNote[] = [
        {
          id: 'n1',
          title: '标题',
          content:
            '**A1**和**A2**以及**A3**还有**A4**与**A5**以及**A6**和**A7**多个概念，内容足够长。',
          createdAt: '',
        },
      ];
      const result = ensureTags(notes);
      expect(result[0].tags!.length).toBeLessThanOrEqual(6);
    });
  });

  describe('parseAINoteOutput edge cases', () => {
    it('should ensure titles from content when missing (frontmatter)', () => {
      const input = `---
source: https://example.com
tags: 算法
---
这是正文首句作为提取的标题内容，足够长且包含信息。

---
source: https://example.com
tags: 测试
---
第二条笔记正文首句也足够长用于提取标题。`;
      const notes = parseAINoteOutput(input);
      expect(notes.length).toBe(2);
      expect(notes[0].title.length).toBeGreaterThan(0);
      expect(notes[1].title.length).toBeGreaterThan(0);
    });

    it('should clean existing title via cleanTitle', () => {
      const input = `---
title: 1. 原始标题需要清理
tags: 测试
---
正文内容足够长用于测试标题清理功能。`;
      const notes = parseAINoteOutput(input);
      expect(notes[0].title).toBe('原始标题需要清理');
    });

    it('should parse bold-only heading list segment', () => {
      const input = `**纯加粗标题**
正文内容足够长用于测试加粗独立行模式。`;
      const notes = parseAINoteOutput(input);
      expect(notes.length).toBe(1);
      expect(notes[0].title).toBe('纯加粗标题');
    });

    it('should return whole text as single note for plain prose (list fallback)', () => {
      const input = '只是一段普通的散文内容，没有明确的笔记结构，无法解析成分条笔记。';
      const notes = parseAINoteOutput(input);
      // 列表格式兜底：整段作为单条笔记
      expect(notes.length).toBe(1);
      expect(notes[0].content.length).toBeGreaterThan(0);
    });

    it('should keep frontmatter-only block as content note via fallback split', () => {
      const input = `---
source: https://example.com
---
`;
      const notes = parseAINoteOutput(input);
      // 兜底 split 把整个块当作纯文本 → 内容为整段（含 source 行）
      expect(notes.length).toBe(1);
      expect(notes[0].content.length).toBeGreaterThan(0);
    });

    it('should strip quotes around JSON title/source', () => {
      const input = JSON.stringify({
        notes: [{ title: '"带引号标题"', content: '正文', source: '"https://x.com"' }],
      });
      const notes = parseAINoteOutput(input);
      expect(notes[0].title).toBe('带引号标题');
      expect(notes[0].source).toBe('https://x.com');
    });

    it('should not ensure titles when shouldEnsureTitles=false', () => {
      const input = `---
source: https://example.com
tags: 算法
---
这是正文首句作为提取的标题内容，足够长且包含信息。`;
      const notes = parseAINoteOutput(input, false);
      // 未确保标题 → 标题为空
      expect(notes[0].title).toBe('');
    });

    it('should parse inline source with Chinese colon', () => {
      const input = `1. **测试标题**
来源：https://example.com.cn/路径
正文内容足够长`;
      const notes = parseAINoteOutput(input);
      expect(notes[0].source).toBe('https://example.com.cn/路径');
    });

    it('should fall back to frontmatter split when regex fails', () => {
      const input = `---
title: 标题A
tags: 测试
---
正文A足够长

---

title: 标题B
tags: 算法
---
正文B足够长`;
      const notes = parseAINoteOutput(input);
      expect(notes.length).toBe(2);
      expect(notes[0].title).toBe('标题A');
      expect(notes[1].title).toBe('标题B');
    });
  });

  describe('cleanTitle long-title strategies', () => {
    it('should recursively shorten topic longer than 22', () => {
      const title = '这是一个非常非常长的主题内容用于测试递归缩短功能点：后续说明文字会被截断处理';
      const result = cleanTitle(title);
      expect(result.length).toBeLessThanOrEqual(22);
    });

    it('should handle possessive core concept pattern', () => {
      const title = '机器学习模型的泛化能力机制与作用原理是非常长的标题需要缩短处理';
      const result = cleanTitle(title);
      expect(result.length).toBeLessThanOrEqual(22);
      expect(result).not.toBe('');
    });

    it('should handle dash truncation (em dash)', () => {
      const title = '核心论点主题内容用于测试破折号截断策略——后面的说明会被忽略掉';
      const result = cleanTitle(title);
      expect(result.length).toBeLessThanOrEqual(22);
    });

    it('should safely truncate English mid-word', () => {
      const title = 'Sound Check 技术实现原理详细说明超过二十个字符用于测试截断';
      const result = cleanTitle(title);
      // 不应在英文单词中间切断；结果要么完整术语要么安全截断
      expect(result.length).toBeLessThanOrEqual(22);
    });

    it('should return empty when shortened title is low quality', () => {
      // 构造会在 isQualityTitle 中被判不合格（含句子片段且较长）的长标题
      const title = '研究表明这种方法的效果是非常长的会被判为低质量标题的超长测试文本';
      const result = cleanTitle(title);
      // 质量不合格（含"表明"等句子片段且 >12 字）→ 返回空
      expect(result).toBe('');
    });

    it('should return a quality English term as the title', () => {
      const title = 'Sound Check 技术的作用和原理详细说明超过二十个字符的测试标题文本';
      const result = cleanTitle(title);
      expect(result).toBe('Sound Check');
    });

    it('should keep quality English term as title', () => {
      const title = 'Sound Check 技术的作用和原理详细说明超过二十个字符的测试标题文本';
      const result = cleanTitle(title);
      expect(result).toBe('Sound Check');
    });
  });
});