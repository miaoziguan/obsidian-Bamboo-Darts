import { describe, it, expect, beforeEach } from 'vitest';
import { DiscoveryIndex } from '../src/discovery/index-manager';
import type { DataAdapter } from 'obsidian';

/**
 * 内存版 DataAdapter，用于测试 DiscoveryIndex 的持久化逻辑
 */
function createMemoryAdapter(): DataAdapter {
  const files = new Map<string, string>();

  return {
    getName: () => 'memory',
    getResourcePath: (p: string) => p,
    mkdir: async () => {},
    trashSystem: async () => false,
    trashLocal: async () => {},
    exists: async (p: string) => files.has(p),
    read: async (p: string) => files.get(p) ?? '',
    remove: async (p: string) => { files.delete(p); },
    write: async (p: string, data: string) => { files.set(p, data); },
    append: async (p: string, data: string) => { files.set(p, (files.get(p) ?? '') + data); },
    copy: async () => {},
    rename: async () => {},
    list: async () => ({ files: [], folders: [] }),
    stat: async () => ({ ctime: 0, mtime: 0, size: 0 } as any),
    getFullPath: (p: string) => p,
  } as unknown as DataAdapter;
}

describe('DiscoveryIndex', () => {
  let adapter: DataAdapter;
  let index: DiscoveryIndex;

  beforeEach(() => {
    adapter = createMemoryAdapter();
    index = new DiscoveryIndex(adapter, '/plugins/test');
  });

  it('应能加载空索引', async () => {
    await index.load();
    expect(index.size).toBe(0);
    expect(index.loaded).toBe(true);
  });

  it('应能更新单篇笔记特征', async () => {
    await index.update(
      'notes/番茄工作法.md',
      '---\ntitle: 番茄工作法\n---\n番茄工作法是一种时间管理方法。',
      undefined,
      123456,
    );

    const feature = index.getFeature('notes/番茄工作法.md');
    expect(feature).not.toBeNull();
    expect(feature!.title).toBe('番茄工作法');
    expect(feature!.path).toBe('notes/番茄工作法.md');
    expect(feature!.updatedAt).toBe(123456);
    expect(feature!.keywords.length).toBeGreaterThan(0);
  });

  it('应从首行或文件名提取标题', async () => {
    // 无 frontmatter、无一级标题时，使用首行非空内容作为标题
    await index.update('notes/无标题.md', '这是首行内容。\n\n第二段。');
    const feature = index.getFeature('notes/无标题.md');
    expect(feature!.title).toBe('这是首行内容。');

    // 空内容时回退到文件名
    await index.update('notes/空.md', '');
    const emptyFeature = index.getFeature('notes/空.md');
    expect(emptyFeature!.title).toBe('空');
  });

  it('应支持批量更新', async () => {
    await index.updateBatch([
      {
        path: 'notes/A.md',
        content: '---\ntitle: A\n---\n内容 A',
        mtime: 1,
      },
      {
        path: 'notes/B.md',
        content: '---\ntitle: B\n---\n内容 B',
        mtime: 2,
      },
    ]);

    expect(index.size).toBe(2);
    expect(index.getFeature('notes/A.md')!.title).toBe('A');
    expect(index.getFeature('notes/B.md')!.title).toBe('B');
  });

  it('应能移除笔记', async () => {
    await index.update('notes/待删除.md', '正文');
    expect(index.size).toBe(1);
    await index.remove('notes/待删除.md');
    expect(index.size).toBe(0);
    expect(index.getFeature('notes/待删除.md')).toBeNull();
  });

  it('应按文件夹过滤特征', async () => {
    await index.updateBatch([
      { path: 'work/项目A.md', content: '项目 A 笔记' },
      { path: 'work/项目B.md', content: '项目 B 笔记' },
      { path: 'personal/日记.md', content: '日记笔记' },
    ]);

    const workFeatures = index.filterByFolder('work');
    expect(workFeatures.length).toBe(2);
    expect(workFeatures.map((f) => f.path).sort()).toEqual(['work/项目A.md', 'work/项目B.md']);
  });

  it('应能构建关键词倒排索引', async () => {
    await index.updateBatch([
      { path: 'notes/AI.md', content: '人工智能与机器学习' },
      { path: 'notes/ML.md', content: '机器学习算法' },
    ]);

    const inverted = index.buildInvertedIndex();
    expect(inverted.has('机器')).toBe(true);
    const machineNotes = inverted.get('机器')!;
    expect(machineNotes).toContain('notes/AI.md');
    expect(machineNotes).toContain('notes/ML.md');
  });

  it('应持久化到磁盘并重新加载', async () => {
    await index.update('notes/持久化.md', '---\ntitle: 持久化\n---\n测试内容');
    await index.flushSave();

    // 新建索引实例，复用同一个 adapter，模拟插件重启
    const newIndex = new DiscoveryIndex(adapter, '/plugins/test');
    await newIndex.load();

    expect(newIndex.size).toBe(1);
    const feature = newIndex.getFeature('notes/持久化.md');
    expect(feature!.title).toBe('持久化');
    expect(feature!.keywords.length).toBeGreaterThan(0);
  });
});
