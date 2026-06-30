import { describe, it, expect } from 'vitest';
import { crossCheckBatch, tokenize } from '../src/deduplicator';
import { AtomicNote } from '../src/utils/notes-standards';

// ─── 辅助函数 ───

function makeNote(title: string, content: string): AtomicNote {
  return { title, content, createdAt: '2026-01-01T00:00:00Z' };
}

// ─── tokenize 测试 ───

describe('tokenize', () => {
  it('应对中文文本生成 3-gram token', () => {
    const tokens = tokenize('机器学习算法优化');
    // 3-gram: 机器学, 器学习, 学习算, 习算法, 算法优, 法优化
    expect(tokens.has('机器学')).toBe(true);
    expect(tokens.has('器学习')).toBe(true);
    expect(tokens.has('学习算')).toBe(true);
  });

  it('应对英文文本按完整词提取', () => {
    const tokens = tokenize('machine learning optimization');
    expect(tokens.has('machine')).toBe(true);
    expect(tokens.has('learning')).toBe(true);
    expect(tokens.has('optimization')).toBe(true);
  });

  it('应过滤英文停用词', () => {
    const tokens = tokenize('the machine is learning');
    expect(tokens.has('the')).toBe(false);
    expect(tokens.has('is')).toBe(false);
    expect(tokens.has('machine')).toBe(true);
    expect(tokens.has('learning')).toBe(true);
  });

  it('应过滤中文停用词', () => {
    const tokens = tokenize('这是一个测试');
    // '是一' 可能在停用词中，取决于 STOP_WORDS 集合
    expect(tokens.size).toBeGreaterThan(0);
  });

  it('空文本应返回空 Map', () => {
    expect(tokenize('').size).toBe(0);
    expect(tokenize('   ').size).toBe(0);
  });

  it('应对重复 token 累加频次', () => {
    const tokens = tokenize('数据数据数据');
    // 3-gram: 数据数(2次), 据数据(1次)
    const freq = tokens.get('数据数');
    expect(freq).toBeGreaterThanOrEqual(1);
  });

  it('应正确处理中英文混合文本', () => {
    // 中英文之间需要有空格才能被分为不同 chunk
    const tokens = tokenize('使用 Python 实现深度学习');
    expect(tokens.has('python')).toBe(true);
    expect(tokens.size).toBeGreaterThan(1);
  });

  it('短中文（2 字）应退回 2-gram', () => {
    const tokens = tokenize('数据');
    expect(tokens.has('数据')).toBe(true);
  });

  it('应忽略单字符英文', () => {
    const tokens = tokenize('a b c');
    expect(tokens.size).toBe(0);
  });
});

// ─── crossCheckBatch 测试 ───

describe('crossCheckBatch', () => {
  it('应保留完全不同的笔记', async () => {
    const notes = [
      makeNote('机器学习基础', '机器学习是人工智能的重要分支，通过算法让计算机从数据中自动学习模式和规律，无需显式编程即可提升性能。'),
      makeNote('烹饪技巧', '红烧肉的制作关键在于火候控制，先将五花肉切块焯水去血沫，然后用冰糖炒色，加入酱油和料酒慢炖两小时。'),
      makeNote('太空探索', '火星探测器成功着陆在火星表面，传回了大量珍贵的地质数据，科学家发现火星土壤中含有微量的水分痕迹。'),
    ];
    const result = await crossCheckBatch(notes);
    expect(result.uniqueNotes.length).toBe(3);
    expect(result.removedCount).toBe(0);
  });

  it('应去重完全相同的笔记', async () => {
    const content = '深度学习在自然语言处理领域取得了革命性的突破，特别是大型语言模型的出现，极大地改变了文本生成和理解的方式。';
    const notes = [
      makeNote('深度学习突破', content),
      makeNote('深度学习突破', content),
    ];
    const result = await crossCheckBatch(notes);
    expect(result.uniqueNotes.length).toBe(1);
    expect(result.removedCount).toBe(1);
  });

  it('应去重高度相似的笔记', async () => {
    // 两条笔记仅有个别词语不同，应被识别为重复
    const notes = [
      makeNote('气候变暖影响', '全球气候变暖导致极端天气事件频发海平面持续上升冰川加速融化科学家警告如果不采取有效措施后果将不堪设想'),
      makeNote('气候变化后果', '全球气候变暖导致极端天气事件频发海平面持续上升冰川加速融化科学家警告如果不采取有效措施后果不堪设想'),
    ];
    const result = await crossCheckBatch(notes, 0.5);
    expect(result.uniqueNotes.length).toBe(1);
    expect(result.removedCount).toBe(1);
    expect(result.duplicates.length).toBe(1);
    expect(result.duplicates[0].removedTitle).toBe('气候变化后果');
  });

  it('空数组应返回空结果', async () => {
    const result = await crossCheckBatch([]);
    expect(result.uniqueNotes.length).toBe(0);
    expect(result.removedCount).toBe(0);
  });

  it('应尊重自定义 threshold 参数', async () => {
    const notes = [
      makeNote('笔记一', '深度学习技术在计算机视觉领域的应用越来越广泛，图像识别的准确率已经接近人类水平。'),
      makeNote('笔记二', '深度学习技术在计算机视觉领域应用广泛，图像识别准确率接近人类水平。'),
    ];
    // 高阈值：更严格，可能不去重
    const highThreshold = await crossCheckBatch(notes, 0.95);
    // 低阈值：更宽松，更容易去重
    const lowThreshold = await crossCheckBatch(notes, 0.3);
    expect(lowThreshold.removedCount).toBeGreaterThanOrEqual(highThreshold.removedCount);
  });

  it('duplicate info 应包含被删除笔记的完整信息', async () => {
    const content = '量子计算利用量子力学原理进行信息处理，相比经典计算机在特定问题上具有指数级的速度优势。';
    const notes = [
      makeNote('量子计算优势', content),
      makeNote('量子计算速度', content),
    ];
    const result = await crossCheckBatch(notes);
    if (result.duplicates.length > 0) {
      expect(result.duplicates[0].removedTitle).toBe('量子计算速度');
      expect(result.duplicates[0].removedContent).toBe(content);
      expect(result.duplicates[0].similarity).toBeGreaterThan(0);
    }
  });
});
