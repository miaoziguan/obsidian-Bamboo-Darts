/**
 * ExtractionService 单元测试
 *
 * mock runExtraction 管线函数，验证 service 层的编排逻辑：
 * - mutex 守卫、API key 检查、重复检测、cancel、dispose
 * - SemanticDedupManager 创建/跳过
 * - 设置快照映射
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExtractionService, ExtractionSettingsSnapshot } from '../src/services/extraction-service';
import { computeSourceHash } from '../src/services/history-service';
import type { ExtractionResult } from '../src/extractor';

// ─── mock extractor 管线 ───

const mockRunExtraction = vi.fn();
vi.mock('../src/extractor', () => ({
  runExtraction: (...args: unknown[]) => mockRunExtraction(...args),
}));

// ─── mock embedding ───

const mockPreloadVaultVectors = vi.fn();
const mockCleanStaleCache = vi.fn().mockResolvedValue(0);

vi.mock('../src/utils/embedding', () => ({
  SemanticDedupManager: class {
    constructor() {
      // noop
    }
    preloadVaultVectors = mockPreloadVaultVectors;
    cleanStaleCache = mockCleanStaleCache;
  },
}));

// ─── 测试数据工厂 ───

function makeSettings(overrides: Partial<ExtractionSettingsSnapshot> = {}): ExtractionSettingsSnapshot {
  return {
    deepseekApiKey: 'test-key',
    deepseekApiUrl: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-v4-flash',
    maxTokens: 6000,
    tagPreferences: [],
    tagMode: 'lenient',
    factCheck: true,
    verifiedOnly: false,
    enableReview: false,
    reviewModel: '',
    reviewApiUrl: '',
    reviewApiKey: '',
    targetFolder: '原子笔记',
    dedupTargetFolder: '',
    autoClassify: true,
    contentProfile: 'balanced' as any,
    profileDense: {} as any,
    profileBalanced: {} as any,
    profileSparse: {} as any,
    enableDeepMode: false,
    inputTruncateLength: 10000,
    enableSemanticDedup: false,
    hunyuanApiKey: '',
    hunyuanApiUrl: '',
    semanticSimilarityThreshold: 0.82,
    ...overrides,
  };
}

function makeServiceConfig() {
  return {
    vault: {} as any,
    pluginDir: '/tmp/test-plugin',
    adapter: {
      exists: vi.fn().mockResolvedValue(false),
      read: vi.fn().mockResolvedValue('{}'),
      write: vi.fn().mockResolvedValue(undefined),
    } as any,
  };
}

// ─── 测试 ───

describe('ExtractionService', () => {
  let service: ExtractionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ExtractionService(makeServiceConfig());
  });

  // ── 初始状态 ──

  describe('初始状态', () => {
    it('isExtracting 初始为 false', () => {
      expect(service.isExtracting).toBe(false);
    });

    it('isBuildingIndex 初始为 false', () => {
      expect(service.isBuildingIndex).toBe(false);
    });
  });

  // ── API Key 缺失 ──

  describe('API Key 检查', () => {
    it('API Key 为空时直接返回错误，不调用管线', async () => {
      const settings = makeSettings({ deepseekApiKey: '' });
      const result = await service.extract(
        { type: 'text', content: '测试内容' },
        settings,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('API Key');
      expect(mockRunExtraction).not.toHaveBeenCalled();
    });
  });

  // ── Mutex 守卫 ──

  describe('Mutex 守卫', () => {
    it('正在提炼时第二次调用返回错误', async () => {
      const settings = makeSettings();

      // 第一次调用（模拟长耗时）
      mockRunExtraction.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true, notes: [], steps: [] }), 200)),
      );

      const first = service.extract({ type: 'text', content: '第一次' }, settings);

      // 第二次调用应被 mutex 拦截
      const second = await service.extract({ type: 'text', content: '第二次' }, settings);
      expect(second.success).toBe(false);
      expect(second.error).toContain('正在进行');

      // 等第一次完成
      await first;
    });

    it('提炼完成后 mutex 释放，可以再次调用', async () => {
      const settings = makeSettings();

      mockRunExtraction.mockResolvedValueOnce({
        success: true,
        notes: [{ title: 'test', content: 'test', createdAt: '' }],
        steps: [],
      });

      await service.extract({ type: 'text', content: '第一次' }, settings);
      expect(service.isExtracting).toBe(false);

      // 第二次应该不被拦截
      mockRunExtraction.mockResolvedValueOnce({
        success: true,
        notes: [{ title: 'test2', content: 'test2', createdAt: '' }],
        steps: [],
      });

      const result = await service.extract({ type: 'text', content: '第二次' }, settings);
      expect(result.success).toBe(true);
    });
  });

  // ── 正常提炼 ──

  describe('正常提炼流程', () => {
    it('成功提炼：调用 runExtraction 并返回结果', async () => {
      const settings = makeSettings();
      const expectedNotes = [
        { title: '笔记1', content: '内容1', createdAt: '2024-01-01' },
      ];

      mockRunExtraction.mockResolvedValueOnce({
        success: true,
        notes: expectedNotes,
        steps: [{ step: 'Phase 1', status: 'success', message: '' }],
      });

      const result = await service.extract(
        { type: 'text', content: '这是一段测试文本' },
        settings,
      );

      expect(result.success).toBe(true);
      expect(result.notes).toEqual(expectedNotes);
      expect(mockRunExtraction).toHaveBeenCalledTimes(1);
    });

    it('传递正确的 ExtractorConfig 给管线', async () => {
      const settings = makeSettings({
        deepseekApiKey: 'my-key',
        model: 'deepseek-chat',
        maxTokens: 8000,
        factCheck: true,
        enableDeepMode: true,
        inputTruncateLength: 20000,
      });

      mockRunExtraction.mockResolvedValueOnce({
        success: true,
        notes: [],
        steps: [],
      });

      await service.extract({ type: 'text', content: 'test' }, settings);

      const [_input, config] = mockRunExtraction.mock.calls[0];
      expect(config.deepseekApiKey).toBe('my-key');
      expect(config.model).toBe('deepseek-chat');
      expect(config.maxTokens).toBe(8000);
      expect(config.factCheck).toBe(true);
      expect(config.enableDeepMode).toBe(true);
      expect(config.inputTruncateLength).toBe(20000);
      expect(config.enableVaultDedup).toBe(true);
    });

    it('skipGate 选项正确传递', async () => {
      const settings = makeSettings();
      mockRunExtraction.mockResolvedValueOnce({ success: true, notes: [], steps: [] });

      await service.extract({ type: 'text', content: 'test' }, settings, { skipGate: true });

      const [_input, config] = mockRunExtraction.mock.calls[0];
      expect(config.skipGate).toBe(true);
    });

    it('onProgress 回调正确传递', async () => {
      const settings = makeSettings();
      const progressFn = vi.fn();
      mockRunExtraction.mockResolvedValueOnce({ success: true, notes: [], steps: [] });

      await service.extract({ type: 'text', content: 'test' }, settings, { onProgress: progressFn });

      const [_input, config] = mockRunExtraction.mock.calls[0];
      expect(config.onProgress).toBe(progressFn);
    });
  });

  // ── 管线异常处理 ──

  describe('管线异常处理', () => {
    it('管线抛出 AbortError 时返回取消结果', async () => {
      const settings = makeSettings();
      const abortError = new Error('aborted');
      abortError.name = 'AbortError';
      mockRunExtraction.mockRejectedValueOnce(abortError);

      const result = await service.extract({ type: 'text', content: 'test' }, settings);
      expect(result.success).toBe(false);
      expect(result.error).toContain('取消');
    });

    it('管线抛出其他错误时返回错误结果', async () => {
      const settings = makeSettings();
      mockRunExtraction.mockRejectedValueOnce(new Error('API 超时'));

      const result = await service.extract({ type: 'text', content: 'test' }, settings);
      expect(result.success).toBe(false);
      expect(result.error).toBe('API 超时');
    });
  });

  // ── Cancel ──

  describe('cancel()', () => {
    it('取消提炼时 signal 被 abort', async () => {
      const settings = makeSettings();

      // 模拟管线检查 signal
      mockRunExtraction.mockImplementationOnce(async (_input: any, config: any) => {
        // 等一小段时间让 cancel 有机会触发
        await new Promise((r) => setTimeout(r, 50));
        if (config.signal?.aborted) {
          const err = new Error('aborted');
          err.name = 'AbortError';
          throw err;
        }
        return { success: true, notes: [], steps: [] };
      });

      const promise = service.extract({ type: 'text', content: 'test' }, settings);
      // 立刻取消
      service.cancel();

      const result = await promise;
      expect(result.success).toBe(false);
      expect(result.error).toContain('取消');
    });

    it('没有在提炼时调用 cancel 不报错', () => {
      expect(() => service.cancel()).not.toThrow();
    });
  });

  // ── checkDuplicate ──

  describe('checkDuplicate()', () => {
    it('无历史时返回 undefined', () => {
      const result = service.checkDuplicate('测试内容', []);
      expect(result).toBeUndefined();
    });

    it('有匹配历史时返回记录', () => {
      // 构造一个与 computeSourceHash 匹配的记录
      // computeSourceHash 使用 fnv1aHash，所以我们需要用真实内容
      const content = '这是一段重复的内容';
      const history = [
        {
          sourceHash: '', // 先空着，下面用 service.checkDuplicate 反推
          timestamp: Date.now(),
          noteCount: 3,
          sourceTitle: '重复文章',
          extractedAt: '2024-06-01T10:00:00Z',
        },
      ];

      // 先用 computeSourceHash 算出 hash，再填入
      history[0].sourceHash = computeSourceHash(content);

      const result = service.checkDuplicate(content, history);
      expect(result).toBeDefined();
      expect(result!.noteCount).toBe(3);
    });

    it('不同内容不匹配', () => {
      const history = [
        {
          sourceHash: 'completely-different-hash',
          timestamp: Date.now(),
          noteCount: 2,
          sourceTitle: '另一篇',
          extractedAt: '2024-06-01T10:00:00Z',
        },
      ];

      const result = service.checkDuplicate('全新内容', history);
      expect(result).toBeUndefined();
    });
  });

  // ── dispose ──

  describe('dispose()', () => {
    it('dispose 后 isExtracting 不变但 abort 被调用', async () => {
      const settings = makeSettings();

      mockRunExtraction.mockImplementationOnce(async (_input: any, config: any) => {
        await new Promise((r) => setTimeout(r, 50));
        if (config.signal?.aborted) {
          const err = new Error('aborted');
          err.name = 'AbortError';
          throw err;
        }
        return { success: true, notes: [], steps: [] };
      });

      const promise = service.extract({ type: 'text', content: 'test' }, settings);
      service.dispose();

      const result = await promise;
      expect(result.success).toBe(false);
    });
  });

  // ── 语义去重管理 ──

  describe('SemanticDedupManager 创建', () => {
    it('未启用语义去重时不创建 SemanticDedupManager', async () => {
      const settings = makeSettings({ enableSemanticDedup: false });
      mockRunExtraction.mockResolvedValueOnce({ success: true, notes: [], steps: [] });

      await service.extract({ type: 'text', content: 'test' }, settings);

      const [_input, config] = mockRunExtraction.mock.calls[0];
      expect(config.semanticManager).toBeUndefined();
    });

    it('启用语义去重但无 API Key 时不创建', async () => {
      const settings = makeSettings({ enableSemanticDedup: true, hunyuanApiKey: '' });
      mockRunExtraction.mockResolvedValueOnce({ success: true, notes: [], steps: [] });

      await service.extract({ type: 'text', content: 'test' }, settings);

      const [_input, config] = mockRunExtraction.mock.calls[0];
      expect(config.semanticManager).toBeUndefined();
    });

    it('启用语义去重且有 API Key 时创建 SemanticDedupManager', async () => {
      const settings = makeSettings({
        enableSemanticDedup: true,
        hunyuanApiKey: 'hunyuan-test-key',
        semanticSimilarityThreshold: 0.85,
      });
      mockRunExtraction.mockResolvedValueOnce({ success: true, notes: [], steps: [] });

      await service.extract({ type: 'text', content: 'test' }, settings);

      const [_input, config] = mockRunExtraction.mock.calls[0];
      expect(config.semanticManager).toBeDefined();
    });

    it('isBuildingIndex 为 true 时跳过语义去重并标记', async () => {
      const settings = makeSettings({
        enableSemanticDedup: true,
        hunyuanApiKey: 'key',
      });

      // 先触发 rebuildVectorIndex（让它设置 isBuildingIndex）
      mockPreloadVaultVectors.mockImplementationOnce(
        () => new Promise((r) => setTimeout(r, 200)),
      );

      const rebuildPromise = service.rebuildVectorIndex(
        [{ path: 'test.md', stat: { mtime: 1 }, getContent: async () => 'test' } as any],
        settings,
      );

      // 在构建期间调用 extract
      mockRunExtraction.mockResolvedValueOnce({ success: true, notes: [], steps: [] });
      const result = await service.extract({ type: 'text', content: 'test' }, settings);

      // 语义去重应该被跳过
      expect(result.semanticDedupSkipped).toBe(true);
      const [_input, config] = mockRunExtraction.mock.calls[0];
      expect(config.semanticManager).toBeUndefined();

      await rebuildPromise;
    });
  });

  // ── rebuildVectorIndex ──

  describe('rebuildVectorIndex()', () => {
    it('未启用语义去重时抛出错误', async () => {
      const settings = makeSettings({ enableSemanticDedup: false });

      await expect(
        service.rebuildVectorIndex([], settings),
      ).rejects.toThrow('混元 API Key');
    });

    it('无文件时抛出错误', async () => {
      const settings = makeSettings({
        enableSemanticDedup: true,
        hunyuanApiKey: 'key',
      });

      await expect(
        service.rebuildVectorIndex([], settings),
      ).rejects.toThrow('没有可索引的文件');
    });

    it('正常构建并返回结果', async () => {
      const settings = makeSettings({
        enableSemanticDedup: true,
        hunyuanApiKey: 'key',
      });

      mockPreloadVaultVectors.mockResolvedValueOnce(undefined);
      mockCleanStaleCache.mockResolvedValueOnce(2);

      const files = [
        { path: 'note1.md', stat: { mtime: 100 } },
        { path: 'note2.md', stat: { mtime: 200 } },
      ] as any[];

      const progressFn = vi.fn();
      const result = await service.rebuildVectorIndex(files, settings, progressFn);

      expect(result.total).toBe(2);
      expect(result.cleaned).toBe(2);
      expect(mockPreloadVaultVectors).toHaveBeenCalledTimes(1);
      expect(mockCleanStaleCache).toHaveBeenCalledTimes(1);
    });

    it('重复构建时抛出错误（mutex）', async () => {
      const settings = makeSettings({
        enableSemanticDedup: true,
        hunyuanApiKey: 'key',
      });

      mockPreloadVaultVectors.mockImplementationOnce(
        () => new Promise((r) => setTimeout(r, 200)),
      );

      const files = [{ path: 'test.md', stat: { mtime: 1 } }] as any[];
      const first = service.rebuildVectorIndex(files, settings);

      await expect(
        service.rebuildVectorIndex(files, settings),
      ).rejects.toThrow('正在进行');

      await first;
    });
  });
});
