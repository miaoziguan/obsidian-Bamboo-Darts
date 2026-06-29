import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DedupFeatureCache } from '../src/dedup/feature-cache';

function createMockAdapter() {
  const files = new Map<string, string>();
  return {
    exists: vi.fn(async (path: string) => files.has(path)),
    read: vi.fn(async (path: string) => files.get(path) ?? ''),
    write: vi.fn(async (path: string, data: string) => {
      files.set(path, data);
    }),
  };
}

describe('DedupFeatureCache', () => {
  let cache: DedupFeatureCache;
  let adapter: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    adapter = createMockAdapter();
    cache = new DedupFeatureCache();
    cache.initialize(adapter, '/plugin-dir');
  });

  it('应能保存并加载单文件夹缓存', async () => {
    cache.setFolder('notes', {
      timestamp: 123456789,
      entries: [
        {
          path: 'notes/a.md',
          contentHash: 'abc123',
          mtime: 123456,
          contentLength: 100,
          contentPreview: 'preview text',
          tokens: [['token1', 2]],
          titleTokens: [['title1', 1]],
          topTokens: ['token1'],
          simhashFp: 'ffffffffffffffff',
        },
      ],
      dfCounts: [['token1', 1]],
    });

    await cache.save();
    expect(adapter.write).toHaveBeenCalledTimes(1);

    const loaded = new DedupFeatureCache();
    loaded.initialize(adapter, '/plugin-dir');
    await loaded.load();

    const folder = loaded.getFolder('notes');
    expect(folder).not.toBeNull();
    expect(folder!.entries.length).toBe(1);
    expect(folder!.entries[0].path).toBe('notes/a.md');
    expect(folder!.entries[0].contentHash).toBe('abc123');
    expect(folder!.entries[0].contentLength).toBe(100);
    expect(folder!.entries[0].contentPreview).toBe('preview text');
    expect(folder!.entries[0].simhashFp).toBe('ffffffffffffffff');
    expect(folder!.dfCounts).toEqual([['token1', 1]]);
  });

  it('版本号不一致时应重置为空', async () => {
    await adapter.write(
      '/plugin-dir/dedup-features.json',
      JSON.stringify({ version: 99999, updatedAt: 0, folders: { notes: { entries: [], dfCounts: [], timestamp: 0 } } }),
    );
    await cache.load();
    expect(Object.keys(cache.getAllFolders())).toHaveLength(0);
  });

  it('格式损坏时应重置为空', async () => {
    await adapter.write('/plugin-dir/dedup-features.json', 'this is not json');
    await cache.load();
    expect(Object.keys(cache.getAllFolders())).toHaveLength(0);
  });

  it('invalidate 后应清空所有数据', async () => {
    cache.setFolder('notes', {
      timestamp: 1,
      entries: [],
      dfCounts: [],
    });
    cache.invalidate();
    expect(cache.getFolder('notes')).toBeNull();
    expect(Object.keys(cache.getAllFolders())).toHaveLength(0);
  });
});
