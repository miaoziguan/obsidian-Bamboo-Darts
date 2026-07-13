import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildExtractionPrompt } from '../src/extraction/tag-preferences';

describe('buildSystemPrompt', () => {
  it('无标签偏好时返回基础 prompt（不含标签约束）', () => {
    const p = buildSystemPrompt([]);
    expect(p).toContain('原子笔记');
    expect(p).not.toContain('# 标签约束');
  });

  it('lenient 模式（默认）追加"优先使用"约束', () => {
    const p = buildSystemPrompt(['技术', '产品']);
    expect(p).toContain('# 标签约束');
    expect(p).toContain('请优先使用以下标签：[技术, 产品]');
    expect(p).toContain('可新增标签');
  });

  it('lenient 模式显式传入', () => {
    const p = buildSystemPrompt(['A'], 'lenient');
    expect(p).toContain('请优先使用以下标签：[A]');
  });

  it('strict 模式追加"仅使用/禁止新增"约束', () => {
    const p = buildSystemPrompt(['技术', '产品'], 'strict');
    expect(p).toContain('请仅使用以下标签：[技术, 产品]');
    expect(p).toContain('禁止新增标签');
  });

  it('空数组时不追加约束', () => {
    const p = buildSystemPrompt([], 'strict');
    expect(p).not.toContain('# 标签约束');
  });
});

describe('buildExtractionPrompt', () => {
  it('基础内容包裹在代码块中', () => {
    const p = buildExtractionPrompt('这是正文内容');
    expect(p).toContain('```');
    expect(p).toContain('这是正文内容');
    expect(p).toContain('输出要求');
  });

  it('按 truncateLength 截断内容', () => {
    const long = 'x'.repeat(1000);
    const p = buildExtractionPrompt(long, 10);
    expect(p).toContain('x'.repeat(10));
    expect(p).not.toContain('x'.repeat(11));
  });

  it('提供 urlTitle 时附来源信息', () => {
    const p = buildExtractionPrompt('正文', 100, '文章标题X');
    expect(p).toContain('【来源信息】');
    expect(p).toContain('- 文章标题：文章标题X');
  });

  it('提供 urlPublishDate 时附发布时间', () => {
    const p = buildExtractionPrompt('正文', 100, undefined, '2026-01-01');
    expect(p).toContain('【来源信息】');
    expect(p).toContain('- 发布时间：2026-01-01');
  });

  it('同时提供标题与发布时间', () => {
    const p = buildExtractionPrompt('正文', 100, '标题', '2026-01-01');
    expect(p).toContain('- 文章标题：标题');
    expect(p).toContain('- 发布时间：2026-01-01');
  });

  it('无来源信息时不含来源块', () => {
    const p = buildExtractionPrompt('正文');
    expect(p).not.toContain('【来源信息】');
  });
});
