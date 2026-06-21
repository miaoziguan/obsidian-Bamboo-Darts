import { describe, it, expect } from 'vitest';
import { stripImageNoise } from '../src/utils/clipboard';

describe('stripImageNoise', () => {
  // ─── base64 图片 ───

  it('应清除 base64 图片数据', () => {
    const input = '一些文本 data:image/png;base64,iVBORw0KGgoAAAANSUhEUg== 更多文本';
    const result = stripImageNoise(input);
    expect(result).not.toContain('data:image');
    expect(result).toContain('一些文本');
    expect(result).toContain('更多文本');
  });

  // ─── Markdown 图片 ───

  it('应清除 Markdown 图片语法', () => {
    const input = '文本 ![alt text](https://example.com/image.png) 更多';
    const result = stripImageNoise(input);
    expect(result).not.toContain('![alt text]');
    expect(result).not.toContain('https://example.com/image.png');
  });

  it('应清除多个 Markdown 图片', () => {
    const input = '![图1](a.png) 文本 ![图2](b.jpg)';
    const result = stripImageNoise(input);
    expect(result).not.toContain('图1');
    expect(result).not.toContain('图2');
    expect(result).toContain('文本');
  });

  // ─── HTML img 标签 ───

  it('应清除 HTML img 标签', () => {
    const input = '文本 <img src="photo.jpg" alt="照片" /> 更多';
    const result = stripImageNoise(input);
    expect(result).not.toContain('<img');
    expect(result).toContain('文本');
  });

  it('应清除自闭合 img 标签', () => {
    const input = '<img src="test.png">';
    const result = stripImageNoise(input);
    expect(result).not.toContain('<img');
  });

  // ─── 图片 URL ───

  it('应清除独立行的图片 URL', () => {
    const input = '文本\nhttps://example.com/photo.jpg\n更多文本';
    const result = stripImageNoise(input);
    expect(result).not.toContain('https://example.com/photo.jpg');
    expect(result).toContain('文本');
  });

  it('应清除各种图片扩展名的 URL', () => {
    const urls = [
      'https://cdn.example.com/a.png',
      'https://cdn.example.com/b.jpeg',
      'https://cdn.example.com/c.gif',
      'https://cdn.example.com/d.webp',
      'https://cdn.example.com/e.svg',
    ];
    for (const url of urls) {
      const result = stripImageNoise(`前文\n${url}\n后文`);
      expect(result).not.toContain(url);
    }
  });

  // ─── 裸文件名 ───

  it('应清除独立行的图片文件名', () => {
    const input = '文本\nscreenshot.png\n更多';
    const result = stripImageNoise(input);
    expect(result).not.toContain('screenshot.png');
  });

  // ─── 中文占位符 ───

  it('应清除"图"和"图片"占位符', () => {
    const input = '文本\n图\n图片\n更多';
    const result = stripImageNoise(input);
    expect(result).not.toMatch(/^图$/m);
    expect(result).not.toMatch(/^图片$/m);
  });

  // ─── 合法内容保留 ───

  it('应保留普通文本不受影响', () => {
    const input = '这是一段完全没有图片相关内容的普通文本。';
    const result = stripImageNoise(input);
    expect(result).toBe(input);
  });

  it('应保留包含"图"字但非占位符的文本', () => {
    const input = '这张图表显示了数据分析的结果';
    const result = stripImageNoise(input);
    expect(result).toContain('图表');
  });

  // ─── 多余空行清理 ───

  it('应将连续多个空行压缩为最多两个', () => {
    const input = '第一段\n\n\n\n\n第二段';
    const result = stripImageNoise(input);
    expect(result).toBe('第一段\n\n第二段');
  });
});
