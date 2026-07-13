import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Vault } from '../tests/__mocks__/obsidian';
import {
  DedupCacheManager,
  CachedNote,
  getDefaultDedupCache,
  clearDedupCache,
} from '../src/dedup/cache-manager';
import { computeIdfTable, computeTfIdfVector, IdfTable } from '../src/dedup/idf';
import type { DataAdapter } from 'obsidian';

/** 最小内存 DataAdapter mock */
function makeAdapter(): DataAdapter & { _store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    _store: store,
    async exists(p: string) {
      return store.has(p);
    },
    async read(p: string) {
      return store.get(p) ?? '';
    },
    async write(p: string, data: string) {
      store.set(p, data);
    },
  } as unknown as DataAdapter & { _store: Map<string, string> };
}

/** 构造一条 CachedNote（含真实向量） */
function makeNote(path: string, tokens: string[], mtime = 1000): CachedNote {
  const tokenMap = new Map<string, number>();
  for (const t of tokens) tokenMap.set(t, (tokenMap.get(t) || 0) + 1);
  const idf = computeIdfTable([tokenMap], 1);
  const vector = computeTfIdfVector(tokenMap, idf, tokens.length, 0);
  return {
    path,
    content: tokens.join(' '),
    contentHash: 'h' + path,
    contentLength: tokens.join('').length,
    contentPreview: tokens.join(' ').slice(0, 200),
    tokens: tokenMap,
    titleTokens: new Map(),
    vector,
    titleVector: null,
    simhashFp: 123n,
    mtime,
  };
}

function makeIdfAndDf(notes: CachedNote[]): { idfTable: IdfTable; dfCounts: Map<string, number> } {
  const idfTable = computeIdfTable(
    notes.map((n) => n.tokens),
    notes.length || 1,
  );
  const dfCounts = new Map<string, number>();
  for (const n of notes) {
    for (const t of n.tokens.keys()) dfCounts.set(t, (dfCounts.get(t) || 0) + 1);
  }
  return { idfTable, dfCounts };
}

describe('DedupCacheManager — set/get 基本流程', () => {
  let mgr: DedupCacheManager;
  let vault: Vault;

  beforeEach(async () => {
    mgr = new DedupCacheManager();
    await mgr.initialize(makeAdapter(), 'plugin-dir');
    vault = new Vault();
  });

  it('未设置缓存时 get 返回 null', () => {
    expect(mgr.get('folderA', vault)).toBeNull();
  });

  it('set 后 get 命中（文件全部有效直接返回原缓存）', () => {
    const file = vault.addFile('folderA/a.md', 'x', 1000);
    const notes = [makeNote(file.path, ['alpha', 'beta'], 1000)];
    const { idfTable, dfCounts } = makeIdfAndDf(notes);
    mgr.set('folderA', notes, idfTable, dfCounts);

    const got = mgr.get('folderA', vault);
    expect(got).not.toBeNull();
    expect(got!.notes.length).toBe(1);
  });

  it('TTL 过期后 get 删除缓存并返回 null', () => {
    const file = vault.addFile('folderA/a.md', 'x', 1000);
    const notes = [makeNote(file.path, ['alpha'], 1000)];
    const { idfTable, dfCounts } = makeIdfAndDf(notes);
    mgr.set('folderA', notes, idfTable, dfCounts);

    // 把内部 timestamp 拨到过期
    const cache = mgr.get('folderA', vault)!;
    cache.timestamp = Date.now() - 6 * 60 * 1000;

    expect(mgr.get('folderA', vault)).toBeNull();
    // 再次读取仍为 null（已删除）
    expect(mgr.get('folderA', vault)).toBeNull();
  });

  it('文件 mtime 变动导致该笔记被剔除 → 触发全量重建（返回 null）', () => {
    const f1 = vault.addFile('folderA/a.md', 'x', 1000);
    const f2 = vault.addFile('folderA/b.md', 'y', 1000);
    const notes = [
      makeNote(f1.path, ['alpha', 'beta'], 1000),
      makeNote(f2.path, ['gamma', 'delta'], 1000),
    ];
    const { idfTable, dfCounts } = makeIdfAndDf(notes);
    mgr.set('folderA', notes, idfTable, dfCounts);

    // 修改一个文件 mtime → 变动过半（2 中 1 剔除 = 50%）走重建
    f1.stat.mtime = 2000;
    expect(mgr.get('folderA', vault)).toBeNull();
  });

  it('仅删除一个文件、无新增 → 增量更新 IDF 后返回缓存', () => {
    const f1 = vault.addFile('folderA/a.md', 'x', 1000);
    const f2 = vault.addFile('folderA/b.md', 'y', 1000);
    const f3 = vault.addFile('folderA/c.md', 'z', 1000);
    const notes = [
      makeNote(f1.path, ['alpha'], 1000),
      makeNote(f2.path, ['beta'], 1000),
      makeNote(f3.path, ['gamma'], 1000),
    ];
    const { idfTable, dfCounts } = makeIdfAndDf(notes);
    mgr.set('folderA', notes, idfTable, dfCounts);

    // 删除一个文件（从 vault 移除对应 md）：3→2，剔除 1 个（33% < 50% 不重建）
    // 但 folderFiles 也会变成 2，需要 cacheByPath.size === folderFiles.size 才走增量
    // 直接篡改 mtime 使 c.md 失效，同时保持 vault 中仍有 3 个文件会走"新增"重建路径
    // 这里改为：删除 c.md 的向量并同步 vault
    // 用重新构建 vault 的方式模拟"文件被删"
    (vault as unknown as { _files: Map<string, unknown> })._files.delete('folderA/c.md');

    const got = mgr.get('folderA', vault);
    expect(got).not.toBeNull();
    expect(got!.notes.length).toBe(2);
    // IDF docCount 已更新
    expect(got!.idfTable.docCount).toBe(2);
  });
});

describe('DedupCacheManager — LRU 淘汰', () => {
  it('超过 MAX_CACHED_FOLDERS(5) 时淘汰最久未用文件夹', async () => {
    const mgr = new DedupCacheManager();
    await mgr.initialize(makeAdapter(), 'plugin-dir');
    const vault = new Vault();

    for (let i = 0; i < 6; i++) {
      const folder = `folder${i}`;
      const file = vault.addFile(`${folder}/a.md`, 'x', 1000);
      const notes = [makeNote(file.path, ['tok' + i], 1000)];
      const { idfTable, dfCounts } = makeIdfAndDf(notes);
      mgr.set(folder, notes, idfTable, dfCounts);
    }

    // folder0 应被淘汰
    expect(mgr.get('folder0', vault)).toBeNull();
    // 最近的 folder5 仍在
    expect(mgr.get('folder5', vault)).not.toBeNull();
  });
});

describe('DedupCacheManager — 持久化与恢复', () => {
  it('flush 后新管理器 initialize 能恢复缓存', async () => {
    const adapter = makeAdapter();
    const mgr1 = new DedupCacheManager();
    await mgr1.initialize(adapter, 'plugin-dir');
    const vault = new Vault();
    const file = vault.addFile('folderA/a.md', 'x', 1000);
    const notes = [makeNote(file.path, ['alpha', 'beta', 'gamma'], 1000)];
    const { idfTable, dfCounts } = makeIdfAndDf(notes);
    mgr1.set('folderA', notes, idfTable, dfCounts);
    await mgr1.flush();

    // 新管理器共用同一 adapter → 应从磁盘恢复
    const mgr2 = new DedupCacheManager();
    await mgr2.initialize(adapter, 'plugin-dir');
    const restored = mgr2.get('folderA', vault);
    expect(restored).not.toBeNull();
    expect(restored!.notes.length).toBe(1);
    expect(restored!.notes[0].path).toBe('folderA/a.md');
  });

  it('getFeatureFolderData 返回持久化特征', async () => {
    const mgr = new DedupCacheManager();
    await mgr.initialize(makeAdapter(), 'plugin-dir');
    const vault = new Vault();
    const file = vault.addFile('folderA/a.md', 'x', 1000);
    const notes = [makeNote(file.path, ['alpha'], 1000)];
    const { idfTable, dfCounts } = makeIdfAndDf(notes);
    mgr.set('folderA', notes, idfTable, dfCounts);

    const fd = mgr.getFeatureFolderData('folderA');
    expect(fd).not.toBeNull();
    expect(fd!.entries.length).toBe(1);
    expect(mgr.getFeatureFolderData('none')).toBeNull();
  });

  it('scheduleSave 防抖：连续 set 只触发一次延迟保存', async () => {
    vi.useFakeTimers();
    const adapter = makeAdapter();
    const spy = vi.spyOn(adapter, 'write');
    const mgr = new DedupCacheManager();
    await mgr.initialize(adapter, 'plugin-dir');
    const vault = new Vault();
    const file = vault.addFile('folderA/a.md', 'x', 1000);
    const notes = [makeNote(file.path, ['alpha'], 1000)];
    const { idfTable, dfCounts } = makeIdfAndDf(notes);

    mgr.set('folderA', notes, idfTable, dfCounts);
    mgr.set('folderA', notes, idfTable, dfCounts);
    mgr.set('folderA', notes, idfTable, dfCounts);

    await vi.advanceTimersByTimeAsync(600);
    // 防抖：延迟窗口内多次 set 仅写一次
    expect(spy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('initialize 恢复空 entries 文件夹被跳过（buildCache 返回 null）', async () => {
    const adapter = makeAdapter();
    // 手写一个含空 entries 的持久化文件
    adapter._store.set(
      'plugin-dir/dedup-features.json',
      JSON.stringify({
        version: 1,
        updatedAt: Date.now(),
        folders: {
          empty: { timestamp: Date.now(), entries: [], dfCounts: [] },
        },
      }),
    );
    const mgr = new DedupCacheManager();
    await mgr.initialize(adapter, 'plugin-dir');
    const vault = new Vault();
    expect(mgr.get('empty', vault)).toBeNull();
  });
});

describe('DedupCacheManager — invalidate 与单例', () => {
  it('invalidate 清空所有缓存', async () => {
    const mgr = new DedupCacheManager();
    await mgr.initialize(makeAdapter(), 'plugin-dir');
    const vault = new Vault();
    const file = vault.addFile('folderA/a.md', 'x', 1000);
    const notes = [makeNote(file.path, ['alpha'], 1000)];
    const { idfTable, dfCounts } = makeIdfAndDf(notes);
    mgr.set('folderA', notes, idfTable, dfCounts);

    mgr.invalidate();
    expect(mgr.get('folderA', vault)).toBeNull();
  });

  it('getDefaultDedupCache 返回同一单例', () => {
    const a = getDefaultDedupCache();
    const b = getDefaultDedupCache();
    expect(a).toBe(b);
  });

  it('clearDedupCache 不抛错（含未初始化场景）', () => {
    expect(() => clearDedupCache()).not.toThrow();
  });
});
