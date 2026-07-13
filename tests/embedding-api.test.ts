import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// 拦截 obsidian.requestUrl，驱动真实的 API 重试 / 冷却 / 失败标记逻辑
const requestUrlMock = vi.fn();
vi.mock('obsidian', () => ({
  requestUrl: (...args: unknown[]) => requestUrlMock(...args),
}));

import {
  fetchEmbeddings,
  SemanticDedupManager,
  EmbeddingConfig,
  CachePersistence,
  EmbeddingCacheData,
} from '../src/utils/embedding';

/** 构造 requestUrl 的成功/失败响应 */
function mockResponse(status: number, json: unknown = {}, text = '') {
  return { status, json, text };
}

/** 构造一条成功返回的标准 embedding 向量（维度 EMBEDDING_DIM，这里用 8 维足够） */
function okEmbedding(index: number, dims = 8): { index: number; embedding: number[] } {
  const emb = new Array(dims).fill(0);
  emb[0] = index + 1;
  return { index, embedding: emb };
}

describe('fetchEmbeddings', () => {
  beforeEach(() => {
    requestUrlMock.mockReset();
  });

  it('should return empty for empty input', async () => {
    const result = await fetchEmbeddings([], { apiKey: 'k' });
    expect(result).toEqual([]);
    expect(requestUrlMock).not.toHaveBeenCalled();
  });

  it('should batch multiple texts into one API call', async () => {
    requestUrlMock.mockResolvedValue(
      mockResponse(200, { data: [okEmbedding(0), okEmbedding(1), okEmbedding(2)] }),
    );
    const result = await fetchEmbeddings(['a', 'b', 'c'], { apiKey: 'k' });
    expect(result.length).toBe(3);
    expect(requestUrlMock).toHaveBeenCalledTimes(1);
    // 向量重建为固定维度
    expect(result[0].length).toBeGreaterThan(0);
  });

  it('should map embedding into fixed dimensions and zero-pad', async () => {
    // 返回比目标维度短的向量 → 应零填充到固定维度
    requestUrlMock.mockResolvedValue(
      mockResponse(200, { data: [{ index: 0, embedding: [1, 2] }] }),
    );
    const result = await fetchEmbeddings(['a'], { apiKey: 'k' });
    expect(result[0].slice(0, 2)).toEqual([1, 2]);
    expect(result[0].every((v, i) => i < 2 || v === 0)).toBe(true);
  });

  it('should retry transient 5xx then succeed', async () => {
    requestUrlMock
      .mockResolvedValueOnce(mockResponse(503, {}, 'Service Unavailable'))
      .mockResolvedValueOnce(mockResponse(200, { data: [okEmbedding(0)] }));
    const result = await fetchEmbeddings(['a'], { apiKey: 'k' });
    expect(requestUrlMock).toHaveBeenCalledTimes(2);
    expect(result[0][0]).toBe(1);
  });

  it('should retry 429 then succeed', async () => {
    requestUrlMock
      .mockResolvedValueOnce(mockResponse(429, {}, 'Too Many Requests'))
      .mockResolvedValueOnce(mockResponse(200, { data: [okEmbedding(0)] }));
    const result = await fetchEmbeddings(['a'], { apiKey: 'k' });
    expect(requestUrlMock).toHaveBeenCalledTimes(2);
    expect(result[0][0]).toBe(1);
  });

  it('should retry on status 0 (network error) then succeed', async () => {
    requestUrlMock
      .mockResolvedValueOnce(mockResponse(0, {}, 'Network Error'))
      .mockResolvedValueOnce(mockResponse(200, { data: [okEmbedding(0)] }));
    const result = await fetchEmbeddings(['a'], { apiKey: 'k' });
    expect(requestUrlMock).toHaveBeenCalledTimes(2);
    expect(result[0][0]).toBe(1);
  });

  it('should return failed-marker vector after exhausting retries on 5xx', async () => {
    requestUrlMock
      .mockResolvedValueOnce(mockResponse(500, {}, 'err1'))
      .mockResolvedValueOnce(mockResponse(500, {}, 'err2'))
      .mockResolvedValueOnce(mockResponse(500, {}, 'err3'));
    const result = await fetchEmbeddings(['a'], { apiKey: 'k' });
    expect(requestUrlMock).toHaveBeenCalledTimes(3); // 首次 + 2 次重试
    expect(result[0][0]).toBe(-99999); // FAILED_VECTOR_MARKER
  });

  it('should not retry on non-retriable 4xx errors', async () => {
    requestUrlMock.mockResolvedValueOnce(mockResponse(401, { error: { message: 'Unauthorized' } }));
    const result = await fetchEmbeddings(['a'], { apiKey: 'bad' });
    expect(requestUrlMock).toHaveBeenCalledTimes(1);
    expect(result[0][0]).toBe(-99999);
  });

  it('should respect custom apiUrl from config', async () => {
    requestUrlMock.mockResolvedValue(mockResponse(200, { data: [okEmbedding(0)] }));
    await fetchEmbeddings(['a'], { apiKey: 'k', apiUrl: 'https://custom.example/emb' });
    const calledUrl = requestUrlMock.mock.calls[0][0].url;
    expect(calledUrl).toBe('https://custom.example/emb');
  });

  it('should abort before calling API when signal already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      fetchEmbeddings(['a'], { apiKey: 'k', signal: controller.signal }),
    ).rejects.toThrow('用户取消了提炼');
    expect(requestUrlMock).not.toHaveBeenCalled();
  });

  it('should sort API response by index before mapping', async () => {
    // API 返回乱序 index
    requestUrlMock.mockResolvedValue(
      mockResponse(200, {
        data: [
          { index: 2, embedding: [3] },
          { index: 0, embedding: [1] },
          { index: 1, embedding: [2] },
        ],
      }),
    );
    const result = await fetchEmbeddings(['a', 'b', 'c'], { apiKey: 'k' });
    expect(result[0][0]).toBe(1);
    expect(result[1][0]).toBe(2);
    expect(result[2][0]).toBe(3);
  });
});

describe('SemanticDedupManager - cache loading', () => {
  let persistence: CachePersistence;
  let storedCache: EmbeddingCacheData | null;
  let config: EmbeddingConfig;

  beforeEach(() => {
    requestUrlMock.mockReset();
    storedCache = null;
    persistence = {
      load: vi.fn(async () => storedCache ?? { version: 1, embeddings: {} }),
      save: vi.fn(async (data: EmbeddingCacheData) => {
        storedCache = data;
      }),
    };
    config = { apiKey: 'test-key' };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should reset cache when version mismatched (version 99)', async () => {
    storedCache = { version: 99, embeddings: { 'x|1': { v: [1], m: 1 } } };
    const manager = new SemanticDedupManager(config, persistence);
    const size = await manager.getCacheSize();
    expect(size).toBe(0); // 版本不匹配被重置（内存 cache 为空）
    // 内存 cache 已被替换为 version=1 的空缓存
    const cache = (manager as unknown as { cache: EmbeddingCacheData }).cache;
    expect(cache.version).toBe(1);
    expect(cache.embeddings).toEqual({});
  });

  it('should handle save failure gracefully', async () => {
    const failPersistence: CachePersistence = {
      load: async () => ({ version: 1, embeddings: {} }),
      save: async () => {
        throw new Error('disk full');
      },
    };
    const manager = new SemanticDedupManager(config, failPersistence);
    // clearCache 内部 save 失败不应抛
    await expect(manager.clearCache()).resolves.toBeUndefined();
  });

  it('should clear cache in memory and on disk', async () => {
    storedCache = { version: 1, embeddings: { 'a|1': { v: [1], m: 1 } } };
    const manager = new SemanticDedupManager(config, persistence);
    await manager.clearCache();
    expect(await manager.getCacheSize()).toBe(0);
    expect(storedCache!.embeddings).toEqual({});
  });

  it('should prevent concurrent duplicate loading (single load call)', async () => {
    let loadCount = 0;
    const countingPersistence: CachePersistence = {
      load: vi.fn(async () => {
        loadCount++;
        await new Promise((r) => setTimeout(r, 10));
        return { version: 1, embeddings: {} };
      }),
      save: vi.fn(async () => {}),
    };
    const manager = new SemanticDedupManager(config, countingPersistence);
    await Promise.all([manager.getCacheSize(), manager.getCacheSize(), manager.getCacheSize()]);
    expect(loadCount).toBe(1);
  });
});

describe('SemanticDedupManager - preloadVaultVectors', () => {
  let persistence: CachePersistence;
  let storedCache: EmbeddingCacheData | null;

  beforeEach(() => {
    requestUrlMock.mockReset();
    storedCache = null;
    persistence = {
      load: vi.fn(async () => storedCache ?? { version: 1, embeddings: {} }),
      save: vi.fn(async (data: EmbeddingCacheData) => {
        storedCache = data;
      }),
    };
  });

  const makeFile = (path: string, mtime: number, content: string) => ({
    path,
    mtime,
    getContent: async () => content,
  });

  it('should return all from cache when cache hits', async () => {
    storedCache = {
      version: 1,
      embeddings: {
        'a.md::100': { v: [1, 0, 0], m: 100 },
        'b.md::200': { v: [0, 1, 0], m: 200 },
      },
    };
    const manager = new SemanticDedupManager({ apiKey: 'k' }, persistence);
    const result = await manager.preloadVaultVectors([
      makeFile('a.md', 100, 'content a'),
      makeFile('b.md', 200, 'content b'),
    ]);
    expect(result.size).toBe(2);
    expect(requestUrlMock).not.toHaveBeenCalled();
  });

  it('should fetch missed files via API and cache them', async () => {
    requestUrlMock.mockResolvedValue(
      mockResponse(200, { data: [okEmbedding(0, 3)] }),
    );
    const manager = new SemanticDedupManager({ apiKey: 'k' }, persistence);
    const result = await manager.preloadVaultVectors([makeFile('a.md', 100, 'content a')]);
    expect(result.size).toBe(1);
    expect(result.get('a.md')).toBeDefined();
    expect(requestUrlMock).toHaveBeenCalledTimes(1);
    // 缓存已写入
    expect(storedCache!.embeddings['a.md::100']).toBeDefined();
  });

  it('should not cache failed vectors and trigger cooldown after all fail', async () => {
    requestUrlMock.mockResolvedValue(mockResponse(500, {}, 'err'));
    const manager = new SemanticDedupManager({ apiKey: 'k' }, persistence);
    const result = await manager.preloadVaultVectors([makeFile('a.md', 100, 'content a')]);
    expect(result.size).toBe(0);
    // 全部失败 → 不应写入缓存
    expect(Object.keys(storedCache!.embeddings).length).toBe(0);
  });

  it('should skip API call during cooldown window', async () => {
    // 先触发冷却
    requestUrlMock.mockResolvedValue(mockResponse(500, {}, 'err'));
    const manager = new SemanticDedupManager({ apiKey: 'k' }, persistence);
    await manager.preloadVaultVectors([makeFile('a.md', 100, 'content a')]);
    // 冷却期内再次预载 → 跳过 API
    requestUrlMock.mockClear();
    const result2 = await manager.preloadVaultVectors([makeFile('b.md', 200, 'content b')]);
    expect(result2.size).toBe(0);
    expect(requestUrlMock).not.toHaveBeenCalled();
  });

  it('should handle file read failures via allSettled', async () => {
    const files = [
      { path: 'ok.md', mtime: 1, getContent: async () => 'content ok' },
      {
        path: 'bad.md',
        mtime: 2,
        getContent: async () => {
          throw new Error('read fail');
        },
      },
    ];
    requestUrlMock.mockResolvedValue(mockResponse(200, { data: [okEmbedding(0, 3)] }));
    const manager = new SemanticDedupManager({ apiKey: 'k' }, persistence);
    const result = await manager.preloadVaultVectors(files);
    // 只有成功读取的文件参与 API 调用
    expect(result.size).toBe(1);
    expect(result.has('ok.md')).toBe(true);
  });

  it('should call onProgress callbacks', async () => {
    requestUrlMock.mockResolvedValue(mockResponse(200, { data: [okEmbedding(0, 3)] }));
    const manager = new SemanticDedupManager({ apiKey: 'k' }, persistence);
    const progress: number[][] = [];
    await manager.preloadVaultVectors([makeFile('a.md', 100, 'content a')], (p, t) =>
      progress.push([p, t]),
    );
    expect(progress.length).toBeGreaterThanOrEqual(1);
  });

  it('should clean stale cache entries after preload', async () => {
    // 预置一条失效缓存（mtime 不匹配）
    storedCache = { version: 1, embeddings: { 'stale.md::999': { v: [1], m: 999 } } };
    requestUrlMock.mockResolvedValue(mockResponse(200, { data: [okEmbedding(0, 3)] }));
    const manager = new SemanticDedupManager({ apiKey: 'k' }, persistence);
    await manager.preloadVaultVectors([makeFile('fresh.md', 100, 'content')]);
    expect(storedCache!.embeddings['stale.md::999']).toBeUndefined();
  });
});

describe('SemanticDedupManager - findBestMatches', () => {
  let persistence: CachePersistence;
  let requestUrlCalls: unknown[] = [];

  beforeEach(() => {
    requestUrlMock.mockReset();
    requestUrlCalls = [];
    persistence = {
      load: vi.fn(async () => ({ version: 1, embeddings: {} })),
      save: vi.fn(async () => {}),
    };
  });

  it('should return null array when no existing vectors', async () => {
    const manager = new SemanticDedupManager({ apiKey: 'k' }, persistence);
    const result = await manager.findBestMatches(['new note content'], new Map());
    expect(result).toEqual([null]);
  });

  it('should skip API during cooldown', async () => {
    // 先触发冷却
    requestUrlMock.mockResolvedValue(mockResponse(500, {}, 'err'));
    const manager = new SemanticDedupManager({ apiKey: 'k' }, persistence);
    await manager.findBestMatches(['content'], new Map([['x', [1, 0, 0]]]));
    requestUrlMock.mockClear();
    const result = await manager.findBestMatches(['content2'], new Map([['x', [1, 0, 0]]]));
    expect(result).toEqual([null]);
    expect(requestUrlMock).not.toHaveBeenCalled();
  });

  it('should return best match above threshold', async () => {
    requestUrlMock.mockResolvedValue(
      mockResponse(200, { data: [{ index: 0, embedding: [1, 0, 0] }] }),
    );
    const manager = new SemanticDedupManager({ apiKey: 'k', similarityThreshold: 0.5 }, persistence);
    const result = await manager.findBestMatches(
      ['匹配内容'],
      new Map([
        ['a.md', [1, 0, 0]],
        ['b.md', [0, 1, 0]],
      ]),
    );
    expect(result[0]).not.toBeNull();
    expect(result[0]!.path).toBe('a.md');
    expect(result[0]!.similarity).toBeCloseTo(1, 5);
  });

  it('should return null when best similarity below threshold', async () => {
    requestUrlMock.mockResolvedValue(
      mockResponse(200, { data: [{ index: 0, embedding: [1, 0, 0] }] }),
    );
    const manager = new SemanticDedupManager({ apiKey: 'k', similarityThreshold: 0.99 }, persistence);
    const result = await manager.findBestMatches(
      ['匹配内容'],
      new Map([['a.md', [0, 1, 0]]]),
    );
    expect(result[0]).toBeNull();
  });

  it('should return null for failed vector', async () => {
    requestUrlMock.mockResolvedValue(mockResponse(500, {}, 'err'));
    const manager = new SemanticDedupManager({ apiKey: 'k' }, persistence);
    const result = await manager.findBestMatches(['content'], new Map([['a.md', [1, 0, 0]]]));
    expect(result[0]).toBeNull();
  });

  it('should start cooldown when all new vectors fail', async () => {
    requestUrlMock.mockResolvedValue(mockResponse(500, {}, 'err'));
    const manager = new SemanticDedupManager({ apiKey: 'k' }, persistence);
    const result = await manager.findBestMatches(
      ['c1', 'c2'],
      new Map([['a.md', [1, 0, 0]]]),
    );
    expect(result).toEqual([null, null]);
    requestUrlMock.mockClear();
    const again = await manager.findBestMatches(['c3'], new Map([['a.md', [1, 0, 0]]]));
    expect(again).toEqual([null]);
    expect(requestUrlMock).not.toHaveBeenCalled();
  });
});
