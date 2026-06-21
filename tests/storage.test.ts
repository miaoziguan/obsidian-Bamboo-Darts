import { describe, it, expect, beforeEach } from 'vitest';
import { App } from 'obsidian';
import {
  generateFileName,
  sanitizeFileName,
  escapeYamlValue,
  formatNoteAsMarkdown,
  saveNotes,
} from '../src/storage';
import { AtomicNote } from '../src/utils/notes-standards';

// ─── 辅助函数 ───

function makeNote(overrides: Partial<AtomicNote> = {}): AtomicNote {
  return {
    title: '测试笔记标题',
    content: '这是一条测试原子笔记的内容，用于验证存储功能。',
    tags: ['测试', '知识库'],
    createdAt: '2026-01-15T10:30:00Z',
    ...overrides,
  };
}

// ─── sanitizeFileName 测试 ───

describe('sanitizeFileName', () => {
  it('应清理非法文件名中的特殊字符', () => {
    expect(sanitizeFileName('file/name:test*file')).toBe('file-name-test-file');
  });

  it('应将多个空格合并为一个', () => {
    expect(sanitizeFileName('文件名    包含   多个空格')).toBe('文件名 包含 多个空格');
  });

  it('空名称应返回时间戳兜底', () => {
    const result = sanitizeFileName('');
    expect(result).toMatch(/^note-\d+$/);
  });

  it('应去掉首尾空白', () => {
    expect(sanitizeFileName('  标题  ')).toBe('标题');
  });

  it('超长文件名应截断', () => {
    const longName = 'a'.repeat(200);
    const result = sanitizeFileName(longName);
    expect(result.length).toBeLessThanOrEqual(100);
  });
});

// ─── escapeYamlValue 测试 ───

describe('escapeYamlValue', () => {
  it('普通文本不应添加引号', () => {
    expect(escapeYamlValue('简单标题')).toBe('简单标题');
  });

  it('包含冒号的值应被双引号包裹', () => {
    // escapeYamlValue 检测 ASCII 冒号 ':' 而非全角冒号 '：'
    expect(escapeYamlValue('标题: 说明')).toBe('"标题: 说明"');
  });

  it('包含双引号的值应转义内部引号', () => {
    const result = escapeYamlValue('他说"你好"');
    expect(result).toContain('\\"');
    expect(result).toMatch(/^".*"$/);
  });

  it('包含方括号的值应被包裹', () => {
    expect(escapeYamlValue('标签[1]')).toMatch(/^".*"$/);
  });

  it('包含反斜杠的值应转义', () => {
    const result = escapeYamlValue('路径\\文件');
    expect(result).toContain('\\\\');
  });
});

// ─── generateFileName 测试 ───

describe('generateFileName', () => {
  it('默认模板应使用标题', () => {
    const note = makeNote({ title: '我的笔记' });
    const fileName = generateFileName('{{title}}', note);
    expect(fileName).toBe('我的笔记');
  });

  it('应替换日期模板变量', () => {
    const note = makeNote();
    const fileName = generateFileName('{{date}}-{{title}}', note);
    // 日期格式为 YYYY-MM-DD
    expect(fileName).toMatch(/^\d{4}-\d{2}-\d{2}-测试笔记标题$/);
  });

  it('应替换时间模板变量', () => {
    const note = makeNote();
    const fileName = generateFileName('{{time}}', note);
    // 时间格式为 HH-MM-SS
    expect(fileName).toMatch(/^\d{2}-\d{2}-\d{2}$/);
  });

  it('空模板应回退为标题', () => {
    const note = makeNote({ title: '回退测试' });
    const fileName = generateFileName('', note);
    expect(fileName).toBe('回退测试');
  });

  it('标题为空时应使用时间戳兜底', () => {
    const note = makeNote({ title: '' });
    const fileName = generateFileName('{{title}}', note);
    expect(fileName).toMatch(/^note-\d+$/);
  });
});

// ─── formatNoteAsMarkdown 测试 ───

describe('formatNoteAsMarkdown', () => {
  it('应输出完整的 YAML frontmatter', () => {
    const note = makeNote();
    const md = formatNoteAsMarkdown(note);
    expect(md).toContain('---');
    expect(md).toContain('title: 测试笔记标题');
    expect(md).toContain('created: 2026-01-15T10:30:00Z');
    expect(md).toContain('tags:');
    expect(md).toContain('  - "测试"');
    expect(md).toContain('  - "知识库"');
  });

  it('应包含正文内容', () => {
    const note = makeNote({ content: '这是正文内容。' });
    const md = formatNoteAsMarkdown(note);
    expect(md).toContain('这是正文内容。');
  });

  it('无标签的笔记不应输出 tags 行', () => {
    const note = makeNote({ tags: [] });
    const md = formatNoteAsMarkdown(note);
    expect(md).not.toContain('tags:');
  });

  it('标题含特殊字符时应正确转义', () => {
    const note = makeNote({ title: '标题: 冒号说明' });
    const md = formatNoteAsMarkdown(note);
    expect(md).toContain('title: "标题: 冒号说明"');
  });

  it('应清理 AI 输出的来源行', () => {
    const note = makeNote({ content: '正文内容\n来源：某篇文章' });
    const md = formatNoteAsMarkdown(note);
    expect(md).not.toContain('来源：某篇文章');
    expect(md).toContain('正文内容');
  });
});

// ─── saveNotes 测试 ───

describe('saveNotes', () => {
  let app: App;

  beforeEach(() => {
    app = new App();
  });

  it('应成功保存单条笔记', async () => {
    const notes = [makeNote()];
    const result = await saveNotes(app, notes, { targetFolder: 'Notes' });
    expect(result.success).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.paths.length).toBe(1);
    expect(result.paths[0]).toMatch(/^Notes\//);
  });

  it('应批量保存多条笔记', async () => {
    const notes = [
      makeNote({ title: '笔记一' }),
      makeNote({ title: '笔记二' }),
      makeNote({ title: '笔记三' }),
    ];
    const result = await saveNotes(app, notes, { targetFolder: 'Notes' });
    expect(result.success).toBe(3);
    expect(result.failed).toBe(0);
  });

  it('标题重复时应生成递增编号', async () => {
    const notes = [
      makeNote({ title: '重复标题' }),
      makeNote({ title: '重复标题' }),
    ];
    const result = await saveNotes(app, notes, { targetFolder: 'Notes' });
    expect(result.success).toBe(2);
    // 两个路径应不同
    expect(result.paths[0]).not.toBe(result.paths[1]);
  });

  it('targetFolder 为空时应使用默认文件夹', async () => {
    const notes = [makeNote()];
    const result = await saveNotes(app, notes, { targetFolder: '' });
    expect(result.success).toBe(1);
    expect(result.paths[0]).toContain('原子笔记/');
  });
});
