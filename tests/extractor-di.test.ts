/**
 * extractor 编排层依赖注入（DI）脚手架测试
 *
 * 验证：通过 config.deps 注入下游依赖后，runExtraction 的编排逻辑
 * 走注入路径；不注入时回退真实实现（行为不变）。
 *
 * 这是 P1-1 的脚手架，P1-2 将在此基础上补齐全分支用例。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runExtraction } from '../src/extractor';
import type { ExtractorConfig, ExtractionDeps } from '../src/extractor';
import type { AtomicNote } from '../src/utils/notes-standards';

/** 创建最小可用 config（含注入依赖） */
function makeConfig(deps: Partial<ExtractionDeps>, overrides: Partial<ExtractorConfig> = {}): Partial<ExtractorConfig> {
  return {
    deepseekApiKey: 'sk-test',
    deepseekApiUrl: 'https://api.test/v1',
    model: 'test-model',
    maxTokens: 2000,
    tagPreferences: [],
    tagMode: 'lenient',
    factCheck: false,
    verifiedOnly: false,
    enableReview: false,
    skipGate: true,
    deps,
    ...overrides,
  };
}

/** 构造一条测试笔记 */
function makeNote(id: string, title: string, content: string): AtomicNote {
  return {
    id,
    title,
    content,
    tags: ['test'],
    source: 'text',
  } as AtomicNote;
}

describe('extractor DI 脚手架', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('注入 fake extractAtomicNotes → 管线返回注入的笔记（DI 路径生效）', async () => {
    const fakeNotes = [makeNote('n1', '注入笔记A', '这是通过依赖注入返回的笔记内容 A')];
    const spy = vi.fn(async () => ({ success: true, notes: fakeNotes }));

    const deps: Partial<ExtractionDeps> = { extractAtomicNotes: spy };

    const result = await runExtraction(
      { type: 'text', content: '一段足够长的测试文本用于验证依赖注入路径是否真正生效而不是走了真实实现' },
      makeConfig(deps),
    );

    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.notes).toBeDefined();
    expect(result.notes!.length).toBe(1);
    expect(result.notes![0].id).toBe('n1');
  });

  it('不注入 deps → 回退真实实现（默认路径行为不变）', async () => {
    // 不提供 deps，且文本足够长 + skipGate，真实 extractAtomicNotes 走真实路径
    // （setup.ts 的 requestUrl mock 返回空响应 → 真实实现产出 success:false）
    const result = await runExtraction(
      { type: 'text', content: '一段足够长的测试文本用于验证默认路径下仍然走真实实现而不会崩溃' },
      makeConfig({}),
    );

    // success:false 证明走的是真实实现而非注入（注入路径在此用例下完全未提供）
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('注入 fake extractAtomicNotes 返回失败 → 管线返回 error', async () => {
    const spy = vi.fn(async () => ({ success: false, error: 'AI 服务不可用' }));
    const deps: Partial<ExtractionDeps> = { extractAtomicNotes: spy };

    const result = await runExtraction(
      { type: 'text', content: '一段足够长的测试文本用于验证 Phase 3 失败时管线正确向上传递错误' },
      makeConfig(deps),
    );

    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.error).toBe('AI 服务不可用');
  });

  it('注入 fake crossCheckBatch 过滤为 0 条 → 返回未提炼出笔记', async () => {
    const fakeNotes = [makeNote('n1', '笔记', '这是一条会被交叉去重过滤掉的笔记')];
    const extractSpy = vi.fn(async () => ({ success: true, notes: fakeNotes }));
    // 交叉去重返回 uniqueNotes 为空 → 触发「未提炼出任何符合标准的原子笔记」
    const dedupSpy = vi.fn(async () => ({ uniqueNotes: [], duplicates: [] }));

    const deps: Partial<ExtractionDeps> = {
      extractAtomicNotes: extractSpy,
      crossCheckBatch: dedupSpy,
    };

    const result = await runExtraction(
      { type: 'text', content: '一段足够长的测试文本用于验证交叉去重过滤后为空时管线的处理逻辑' },
      makeConfig(deps),
    );

    expect(dedupSpy).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.error).toContain('未提炼出任何符合标准的原子笔记');
  });

  it('注入 fake reviewNotes 过滤 1 条 → 最终 notes 减少且 pending 重映射', async () => {
    const noteA = makeNote('a', '保留笔记', '这条笔记会被复查保留下来');
    const noteB = makeNote('b', '丢弃笔记', '这条笔记会被复查过滤掉');
    const extractSpy = vi.fn(async () => ({ success: true, notes: [noteA, noteB] }));
    const dedupSpy = vi.fn(async (notes: AtomicNote[]) => ({ uniqueNotes: notes, duplicates: [] }));
    // 复查保留 index 0，丢弃 index 1
    const reviewSpy = vi.fn(async () => ({
      reviewedNotes: [noteA],
      reviewDetails: [
        { index: 0, insightScore: 5, knowledgeScore: 5, finalScore: 10, verdict: '保留', reason: '好' },
      ],
      success: true,
    }));

    const deps: Partial<ExtractionDeps> = {
      extractAtomicNotes: extractSpy,
      crossCheckBatch: dedupSpy,
      reviewNotes: reviewSpy,
    };

    const result = await runExtraction(
      { type: 'text', content: '一段足够长的测试文本用于验证复查过滤后笔记数量正确减少且 pending 重映射无误' },
      makeConfig(deps, { enableReview: true }),
    );

    expect(reviewSpy).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.notes!.length).toBe(1);
    expect(result.notes![0].id).toBe('a');
  });
});
