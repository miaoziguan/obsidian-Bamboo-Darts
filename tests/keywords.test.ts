import { describe, it, expect } from 'vitest';
import { extractKeywords } from '../src/discovery/keywords';

describe('extractKeywords', () => {
  it('应从中文文本提取 bigram 关键词', () => {
    const keywords = extractKeywords('机器学习算法在自然语言处理领域取得了重大突破');
    // 中文 bigram：机器、器学、学习、习算、算法、法在、在自、自然、语言、言处、处理 等
    expect(keywords.has('机器')).toBe(true);
    expect(keywords.has('学习')).toBe(true);
    expect(keywords.has('算法')).toBe(true);
    expect(keywords.has('自然')).toBe(true);
    expect(keywords.has('语言')).toBe(true);
    expect(keywords.has('处理')).toBe(true);
  });

  it('应提取英文完整词', () => {
    const keywords = extractKeywords('machine learning optimization algorithm');
    expect(keywords.has('machine')).toBe(true);
    expect(keywords.has('learning')).toBe(true);
    expect(keywords.has('optimization')).toBe(true);
    expect(keywords.has('algorithm')).toBe(true);
  });

  it('应过滤英文停用词', () => {
    const keywords = extractKeywords('the machine is learning from data');
    expect(keywords.has('the')).toBe(false);
    expect(keywords.has('is')).toBe(false);
    expect(keywords.has('from')).toBe(false);
    expect(keywords.has('machine')).toBe(true);
  });

  it('应过滤中文停用词', () => {
    const keywords = extractKeywords('这是一个非常重要的发现');
    // '这是'、'一个' 在停用词表中
    expect(keywords.has('一个')).toBe(false);
  });

  it('空文本应返回空 Set', () => {
    expect(extractKeywords('').size).toBe(0);
    expect(extractKeywords('   ').size).toBe(0);
  });

  it('应处理中英文混合文本', () => {
    // 中英文之间需要有空格分隔才能被正确分为不同词块
    const keywords = extractKeywords('Python 实现了 machine learning 模型');
    expect(keywords.has('python')).toBe(true);
    expect(keywords.has('machine')).toBe(true);
    expect(keywords.has('learning')).toBe(true);
    // 中文部分
    expect(keywords.has('实现')).toBe(true);
    expect(keywords.has('模型')).toBe(true);
  });

  it('应忽略长度小于2的词', () => {
    const keywords = extractKeywords('a b c 数据 分析');
    // 单字符英文被过滤
    expect(keywords.has('a')).toBe(false);
    expect(keywords.has('b')).toBe(false);
    // 中文 bigram 正常
    expect(keywords.has('数据')).toBe(true);
    expect(keywords.has('分析')).toBe(true);
  });

  it('应去除特殊字符后再提取', () => {
    const keywords = extractKeywords('【重要】数据分析与可视化！');
    // 特殊字符被替换为空格后正常提取
    expect(keywords.has('数据')).toBe(true);
    expect(keywords.has('分析')).toBe(true);
    expect(keywords.has('可视')).toBe(true);
  });

  it('大段文本应返回合理数量的关键词', () => {
    const text = '人工智能技术在医疗健康领域的应用正在快速发展。' +
      '深度学习算法通过分析医学影像数据，能够辅助医生进行疾病诊断。' +
      '自然语言处理技术可以帮助整理和分析大量的医学文献。' +
      '机器学习模型在药物发现和基因组学研究中展现出巨大潜力。';
    const keywords = extractKeywords(text);
    expect(keywords.size).toBeGreaterThan(5);
    expect(keywords.size).toBeLessThan(100);
  });
});
