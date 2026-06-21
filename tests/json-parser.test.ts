import { describe, it, expect } from 'vitest';
import { parseJsonArrayFromAI } from '../src/utils/json-parser';

describe('parseJsonArrayFromAI', () => {
  // ─── 基础格式 ───

  it('应解析纯 JSON 数组', () => {
    const input = '[{"title":"笔记1","content":"内容1"},{"title":"笔记2","content":"内容2"}]';
    const result = parseJsonArrayFromAI<{ title: string; content: string }>(input);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result![0].title).toBe('笔记1');
  });

  it('应解析 ```json 代码块包裹的 JSON', () => {
    const input = '```json\n[{"a":1},{"a":2}]\n```';
    const result = parseJsonArrayFromAI<{ a: number }>(input);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result![1].a).toBe(2);
  });

  it('应解析无语言标记的代码块包裹', () => {
    const input = '```\n[1, 2, 3]\n```';
    const result = parseJsonArrayFromAI<number>(input);
    expect(result).not.toBeNull();
    expect(result).toEqual([1, 2, 3]);
  });

  // ─── 边界情况 ───

  it('应处理空数组', () => {
    const result = parseJsonArrayFromAI('[]');
    expect(result).not.toBeNull();
    expect(result).toHaveLength(0);
  });

  it('应对不包含数组的文本返回 null', () => {
    const result = parseJsonArrayFromAI('这是一段纯文本，没有 JSON');
    expect(result).toBeNull();
  });

  it('应对空字符串返回 null', () => {
    const result = parseJsonArrayFromAI('');
    expect(result).toBeNull();
  });

  it('应对畸形 JSON 返回 null', () => {
    const result = parseJsonArrayFromAI('[{broken json}]');
    expect(result).toBeNull();
  });

  // ─── 贪心正则边界 ───

  it('应处理 AI 输出中包含解释文字的 JSON', () => {
    const input = '好的，以下是提取结果：\n[{"title":"测试"}]\n希望对你有帮助。';
    const result = parseJsonArrayFromAI<{ title: string }>(input);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
  });

  it('应处理嵌套数组', () => {
    const input = '[[1,2],[3,4]]';
    const result = parseJsonArrayFromAI<number[]>(input);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result![0]).toEqual([1, 2]);
  });

  it('应处理带前后空白的输入', () => {
    const input = '  \n  [{"key":"value"}]  \n  ';
    const result = parseJsonArrayFromAI<{ key: string }>(input);
    expect(result).not.toBeNull();
    expect(result![0].key).toBe('value');
  });

  it('应处理包含中文内容的 JSON 数组', () => {
    const input = '[{"title":"原子笔记标题","content":"这是一条包含中文内容的笔记","tags":["测试","中文"]}]';
    const result = parseJsonArrayFromAI<{ title: string; content: string; tags: string[] }>(input);
    expect(result).not.toBeNull();
    expect(result![0].tags).toEqual(['测试', '中文']);
  });
});
