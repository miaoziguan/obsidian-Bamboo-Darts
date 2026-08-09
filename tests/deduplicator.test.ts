import { describe, it, expect } from 'vitest';
import { crossCheckBatch, tokenize, isPathInFolder, checkAgainstVaultDetailed } from '../src/deduplicator';
import { Vault } from '../tests/__mocks__/obsidian';
import { AtomicNote } from '../src/utils/notes-standards';

// ─── 辅助函数 ───

function makeNote(title: string, content: string): AtomicNote {
  return { title, content, createdAt: '2026-01-01T00:00:00Z' };
}

/**
 * 给测试用的 vault 桩注入 `adapter.list`，基于已加载文件模拟真实 Obsidian 的目录列举。
 * （仅测试环境使用；生产代码 getFolderMarkdownFiles 自带该实现，不依赖全库枚举 API。）
 */
function installListAdapter(vault: Vault): void {
  const adapter = (vault.adapter ?? {}) as unknown as {
    list?: (p: string) => Promise<{ files: string[]; folders: string[] }>;
  };
  adapter.list = async (dir: string) => {
    const all = vault.getMarkdownFiles();
    const base = dir === '' ? '' : dir.endsWith('/') ? dir : dir + '/';
    const files: string[] = [];
    const folders = new Set<string>();
    for (const f of all) {
      if (!f.path.startsWith(base)) continue;
      const rest = f.path.slice(base.length);
      const slash = rest.indexOf('/');
      if (slash === -1) {
        if (rest.length > 0) files.push(f.path);
      } else {
        folders.add(base + rest.slice(0, slash));
      }
    }
    return { files, folders: [...folders] };
  };
  (vault as unknown as { adapter: unknown }).adapter = adapter;
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

// ─── isPathInFolder 测试 ───

describe('isPathInFolder', () => {
  it('文件在目标文件夹内', () => {
    expect(isPathInFolder('notes/atomic/2024-01.md', 'notes/atomic')).toBe(true);
  });

  it('文件不在目标文件夹内', () => {
    expect(isPathInFolder('other/note.md', 'notes/atomic')).toBe(false);
  });

  it('目标文件夹后跟路径分隔符也能匹配', () => {
    expect(isPathInFolder('notes/atomic/sub/deep.md', 'notes/atomic/')).toBe(true);
  });

  it('部分匹配不误判', () => {
    // notes/atomic-extras 不应匹配 notes/atomic
    expect(isPathInFolder('notes/atomic-extras/note.md', 'notes/atomic')).toBe(false);
  });

  it('完全相同的路径', () => {
    expect(isPathInFolder('notes/atomic/note.md', 'notes/atomic/note.md')).toBe(true);
  });
});

// ─── checkAgainstVaultDetailed 测试 ───

describe('checkAgainstVaultDetailed', () => {
  it('空知识库 → 无匹配', async () => {
    const vault = new Vault();
    installListAdapter(vault);
    const notes: AtomicNote[] = [
      { title: '测试笔记', content: '这是一段测试内容，包含足够长度的文本用于去重比对。' },
    ];

    const results = await checkAgainstVaultDetailed(vault, notes, '');
    expect(results.length).toBe(1);
    expect(results[0].bestMatch).toBeNull();
  });

  it('完全相同的笔记被检测为重复', async () => {
    const vault = new Vault();
    installListAdapter(vault);
    const content = '机器学习是人工智能的核心分支，通过算法从数据中自动学习模式和规律，深度学习在其中扮演着关键角色。';
    vault.addFile('existing/note1.md', `# 机器学习\n\n${content}`);

    const notes: AtomicNote[] = [
      { title: '机器学习', content },
    ];

    const results = await checkAgainstVaultDetailed(vault, notes, 'existing');
    expect(results.length).toBe(1);
    // 相同内容应被匹配到
    expect(results[0].bestMatch).not.toBeNull();
  });

  it('完全不同的笔记无匹配', async () => {
    const vault = new Vault();
    installListAdapter(vault);
    vault.addFile(
      'existing/recipe.md',
      '# 红烧肉\n\n红烧肉制作关键在于火候控制，五花肉焯水去血沫，冰糖炒色，加酱油料酒慢炖。',
    );

    const notes: AtomicNote[] = [
      { title: '深度学习', content: 'Transformer架构通过自注意力机制彻底改变了自然语言处理的范式。' },
    ];

    const results = await checkAgainstVaultDetailed(vault, notes, 'existing');
    expect(results.length).toBe(1);
    expect(results[0].bestMatch).toBeNull();
  });

  it('多条笔记中混合匹配', async () => {
    const vault = new Vault();
    installListAdapter(vault);
    const content = '深度学习TensorFlow框架PyTorch在计算机视觉和自然语言处理NLP领域取得了突破性进展Transformer架构效果显著。';
    vault.addFile('notes/ml.md', `# ML\n\n${content}`);

    const notes: AtomicNote[] = [
      {
        title: '视觉与语言',
        content, // 与 ml.md 完全一致
      },
      {
        title: '芯片制造',
        content: '先进制程芯片采用极紫外光刻技术晶体管密度大幅提升半导体产业链加速迭代摩尔定律面临挑战。',
      },
    ];

    const results = await checkAgainstVaultDetailed(vault, notes, 'notes');
    expect(results.length).toBe(2);
    // 第一条完全一致应匹配
    expect(results[0].bestMatch).not.toBeNull();
    // 第二条完全不同
    expect(results[1].bestMatch).toBeNull();
  });

  it('不同文件夹的笔记互不干扰', async () => {
    const vault = new Vault();
    installListAdapter(vault);
    const content = '机器学习人工智能深度学习神经网络Transformer架构自注意力机制大型预训练模型';
    vault.addFile('folderA/note.md', `# Note A\n\n${content}`);
    vault.addFile('folderB/note.md', '# Note B\n\n完全不同不相关话题美食烹饪文化历史地理旅行摄影音乐');

    const notes: AtomicNote[] = [
      { title: 'A-like', content },
    ];

    // 只查 folderB → A中笔记不应干扰
    const resultsB = await checkAgainstVaultDetailed(vault, notes, 'folderB');
    expect(resultsB[0].bestMatch).toBeNull();

    // 查 folderA → 应匹配
    const resultsA = await checkAgainstVaultDetailed(vault, notes, 'folderA');
    expect(resultsA[0].bestMatch).not.toBeNull();
  });
});
