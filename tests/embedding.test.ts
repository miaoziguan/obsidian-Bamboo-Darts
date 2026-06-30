import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  cosineSimilarity,
  SemanticDedupManager,
  CachePersistence,
  EmbeddingConfig,
  EmbeddingCacheData,
} from '../src/utils/embedding';

// ─── cosineSimilarity 测试 ───

describe('cosineSimilarity', () => {
  it('两相同向量相似度应为 1', () => {
    const a = [1, 2, 3, 4, 5];
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 10);
  });

  it('正交向量相似度应为 0', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 10);
  });

  it('相反方向向量相似度应被 clamp 为 0', () => {
    // cosineSimilarity 实现中 clamps 负值为 0（业务上不需要反向相似度）
    const a = [1, 1, 1];
    const b = [-1, -1, -1];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('零向量应返回 0', () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('典型余弦相似度计算', () => {
    const a = [1, 2];
    const b = [2, 4];
    // dot = 1*2 + 2*4 = 10, |a| = sqrt(5), |b| = sqrt(20), cos = 10 / (sqrt(5)*sqrt(20)) = 10/10 = 1
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 10);
  });

  it('向量维度不一致时应安全处理', () => {
    const a = [1, 2];
    const b = [1, 2, 3];
    // 按较短维度计算
    const result = cosineSimilarity(a, b);
    expect(result).not.toBeNaN();
  });
});

// ─── SemanticDedupManager 缓存逻辑测试 ───

describe('SemanticDedupManager', () => {
  let persistence: CachePersistence;
  let storedCache: EmbeddingCacheData | null;
  let config: EmbeddingConfig;

  beforeEach(() => {
    storedCache = null;
    persistence = {
      load: vi.fn(async () => storedCache ?? { version: 1, embeddings: {} }),
      save: vi.fn(async (data) => {
        storedCache = data;
      }),
    };
    config = {
      apiKey: 'test-key',
      apiUrl: 'https://test.api/embeddings',
    };
  });

  it('应能懒加载空缓存', async () => {
    const manager = new SemanticDedupManager(config, persistence);
    const cleaned = await manager.cleanStaleCache([]);
    expect(cleaned).toBe(0);
  });

  it('应能加载已有缓存', async () => {
    storedCache = {
      version: 1,
      embeddings: { 'test.md::12345': { v: [1, 2, 3], m: 12345 } },
    };
    const manager = new SemanticDedupManager(config, persistence);
    const cleaned = await manager.cleanStaleCache([]);
    // 所有缓存条目均失效，全部清理
    expect(cleaned).toBeGreaterThanOrEqual(1);
  });

  it('应能保留未失效条目', async () => {
    const localPersistence: CachePersistence = {
      load: async () => ({ version: 1, embeddings: { 'keep.md::12345': { v: [1, 2, 3], m: 12345 } } }),
      save: async () => {},
    };
    const manager = new SemanticDedupManager(config, localPersistence);
    const cleaned = await manager.cleanStaleCache([{ path: 'keep.md', mtime: 12345 }]);
    expect(cleaned).toBe(0);
  });

  it('应能处理版本不匹配的缓存', async () => {
    storedCache = {
      version: 99, // 不匹配的版本
      embeddings: { 'file.md|12345': { v: [1, 2, 3], m: 12345 } },
    };

    const manager = new SemanticDedupManager(config, persistence);
    const cleaned = await manager.cleanStaleCache([]);
    // 版本不匹配时缓存被重置
    expect(cleaned).toBe(0);
  });

  it('persistence 加载失败应安全回退', async () => {
    persistence.load = vi.fn(async () => {
      throw new Error('磁盘读取失败');
    });

    const manager = new SemanticDedupManager(config, persistence);
    const cleaned = await manager.cleanStaleCache([]);
    expect(cleaned).toBe(0); // 不应崩溃
  });

  it('应能加载已有缓存并部分清理', async () => {
    storedCache = {
      version: 1,
      embeddings: {
        'a.md|1': { v: [1, 1, 1], m: 1 },
        'b.md|2': { v: [2, 2, 2], m: 2 },
        'c.md|3': { v: [3, 3, 3], m: 3 },
      },
    };

    const manager = new SemanticDedupManager(config, persistence);
    const validFiles = [
      { path: 'a.md', mtime: 1 },
      { path: 'c.md', mtime: 3 },
    ];
    const cleaned = await manager.cleanStaleCache(validFiles);
    // b.md (mtime 2 不匹配) 被清理，至少清理 1 条
    expect(cleaned).toBeGreaterThanOrEqual(1);
  });
});

// ─── EmbeddingConfig 类型验证 ───

describe('EmbeddingConfig', () => {
  it('最小配置应可正常工作', () => {
    const config: EmbeddingConfig = {
      apiKey: 'test',
      apiUrl: 'https://api.example.com',
    };
    expect(config.apiKey).toBe('test');
    expect(config.batchSize).toBeUndefined(); // 可选字段
  });
});
