/**
 * extractor 编排层依赖注入（DI）脚手架测试
 *
 * 验证：通过 config.deps 注入下游依赖后，runExtraction 的编排逻辑
 * 走注入路径；不注入时回退真实实现（行为不变）。
 *
 * 这是 P1-1 的脚手架，P1-2 将在此基础上补齐全分支用例。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as obsidian from 'obsidian';
import { runExtraction, getProviderLabel } from '../src/extractor';
import type { ExtractorConfig, ExtractionDeps } from '../src/extractor';
import type { AtomicNote } from '../src/utils/notes-standards';
import type { VaultMatchInfo, DuplicateInfo } from '../src/deduplicator';
import type { ReviewResult } from '../src/review/note-reviewer';

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

  // ── Task 1：收尾逻辑（duplicateHints 派生 + vaultDedupResult.uniqueNotes 更新）──

  it('启用 vault dedup → duplicateHints 派生且 vaultDedupResult.uniqueNotes 同步最终 notes', async () => {
    const noteA = makeNote('a', '笔记A', '笔记A的内容');
    const noteB = makeNote('b', '笔记B', '笔记B的内容');
    const extractSpy = vi.fn(async () => ({ success: true, notes: [noteA, noteB] }));
    const dedupSpy = vi.fn(async (notes: AtomicNote[]) => ({ uniqueNotes: notes, duplicates: [] }));
    // 知识库去重：noteA 无匹配（bestMatch:null 保留），noteB 中相似度匹配 → 进入 pending
    const matchInfoA: VaultMatchInfo = {
      note: noteA,
      noteIndex: 0,
      bestMatch: null,
    };
    const matchInfoB: VaultMatchInfo = {
      note: noteB,
      noteIndex: 1,
      bestMatch: { similarity: 0.7, path: 'existing/b.md', content: '已有笔记内容' },
    };
    const vaultSpy = vi.fn(async () => [matchInfoA, matchInfoB]);

    const deps: Partial<ExtractionDeps> = {
      extractAtomicNotes: extractSpy,
      crossCheckBatch: dedupSpy,
      checkAgainstVaultDetailed: vaultSpy,
    };

    const result = await runExtraction(
      { type: 'text', content: '一段足够长的测试文本用于验证收尾阶段 duplicateHints 与 vaultDedupResult 的同步逻辑正确' },
      makeConfig(deps, { enableVaultDedup: true, autoClassify: false, profile: 'balanced', vault: new (await import('obsidian')).Vault() }),
    );

    expect(result.success).toBe(true);
    // pending 派生：noteB 被标记且保留（无后续过滤）
    expect(result.vaultDedupPending).toBeDefined();
    expect(result.vaultDedupPending!.length).toBe(1);
    expect(result.vaultDedupPending![0].noteId).toBe('b');
    // duplicateHints 由 pending 派生
    expect(result.duplicateHints).toBeDefined();
    expect(result.duplicateHints!.length).toBe(1);
    expect(result.duplicateHints![0].matchedNote).toBe('existing/b.md');
    // vaultDedupResult.uniqueNotes 已同步为最终 notes（两条）
    expect(result.vaultDedupResult).toBeDefined();
    expect(result.vaultDedupResult!.uniqueNotes.length).toBe(2);
    expect(result.vaultDedupResult!.uniqueNotes.map((n) => n.id).sort()).toEqual(['a', 'b']);
  });

  // ── Task 2：Phase 4b 高/中相似度 pending 分类 ──

  it('注入高/中两条 matchInfo → pending 含 highSimilarity 标记且统计文案正确', async () => {
    const noteA = makeNote('a', '高相似', '高相似度笔记内容');
    const noteB = makeNote('b', '中相似', '中相似度笔记内容');
    const extractSpy = vi.fn(async () => ({ success: true, notes: [noteA, noteB] }));
    const dedupSpy = vi.fn(async (notes: AtomicNote[]) => ({ uniqueNotes: notes, duplicates: [] }));
    const highMatch: VaultMatchInfo = {
      note: noteA,
      noteIndex: 0,
      bestMatch: { similarity: 0.85, path: 'existing/a.md', content: '高' },
    };
    const midMatch: VaultMatchInfo = {
      note: noteB,
      noteIndex: 1,
      bestMatch: { similarity: 0.6, path: 'existing/b.md', content: '中' },
    };
    const vaultSpy = vi.fn(async () => [highMatch, midMatch]);

    const deps: Partial<ExtractionDeps> = {
      extractAtomicNotes: extractSpy,
      crossCheckBatch: dedupSpy,
      checkAgainstVaultDetailed: vaultSpy,
    };

    const result = await runExtraction(
      { type: 'text', content: '一段足够长的测试文本用于验证知识库去重阶段能正确区分高相似度与中相似度并生成对应的待确认项' },
      makeConfig(deps, { enableVaultDedup: true, autoClassify: false, profile: 'balanced', vault: new (await import('obsidian')).Vault() }),
    );

    expect(result.success).toBe(true);
    expect(result.vaultDedupPending).toBeDefined();
    expect(result.vaultDedupPending!.length).toBe(2);
    const high = result.vaultDedupPending!.find((p) => p.noteId === 'a');
    const mid = result.vaultDedupPending!.find((p) => p.noteId === 'b');
    expect(high!.highSimilarity).toBe(true);
    expect(mid!.highSimilarity).toBeUndefined();
    // tracker 统计文案含高/中相似度计数
    const summary = result.steps.map((s) => s.message).join(' ');
    expect(summary).toContain('高相似度待确认');
    expect(summary).toContain('中相似度待确认');
  });

  // ── Task 3：Phase 5 verifiedOnly 超源过滤 ──

  it('注入 verifyClaims 返回超源 → verifiedOnly 过滤掉超源笔记且触发 remap', async () => {
    const noteA = makeNote('a', '正常', '正常笔记内容');
    const noteB = makeNote('b', '超源', '超源笔记内容');
    // 给 noteB 打上 verification 超源标记（runFactCheckPhase 依此过滤）
    noteB.verification = [{ status: '超源', claim: '某声明', evidence: '原文', sourceQuote: '' }] as unknown as AtomicNote['verification'];
    const extractSpy = vi.fn(async () => ({ success: true, notes: [noteA, noteB] }));
    const dedupSpy = vi.fn(async (notes: AtomicNote[]) => ({ uniqueNotes: notes, duplicates: [] }));
    const verifySpy = vi.fn(async () => ({ traced: 1, needsCompare: 0, outOfScope: 1 }));

    const deps: Partial<ExtractionDeps> = {
      extractAtomicNotes: extractSpy,
      crossCheckBatch: dedupSpy,
      verifyClaims: verifySpy,
    };

    const result = await runExtraction(
      { type: 'text', content: '一段足够长的测试文本用于验证内容核查阶段在 verifiedOnly 模式下能正确过滤掉被标记为超源的笔记' },
      makeConfig(deps, { factCheck: true, verifiedOnly: true }),
    );

    expect(verifySpy).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.notes!.length).toBe(1);
    expect(result.notes![0].id).toBe('a');
    expect(result.verificationSummary).toBeDefined();
    expect(result.verificationSummary!.outOfScope).toBe(1);
  });

  // ── Task 3a：Phase 4b 低相似度 else 分支（保留无 pending）──

  it('注入低相似度 matchInfo → 笔记保留但无 pending（else 分支）', async () => {
    const noteA = makeNote('a', '笔记A', '笔记A的内容');
    const noteB = makeNote('b', '笔记B', '笔记B的内容');
    const extractSpy = vi.fn(async () => ({ success: true, notes: [noteA, noteB] }));
    const dedupSpy = vi.fn(async (notes: AtomicNote[]) => ({ uniqueNotes: notes, duplicates: [] }));
    // bestMatch 相似度 0.3，低于 midThreshold(0.55) → 走 else 保留分支（无 pending）
    const lowMatch: VaultMatchInfo = {
      note: noteB,
      noteIndex: 1,
      bestMatch: { similarity: 0.3, path: 'existing/b.md', content: '已有' },
    };
    const noMatch: VaultMatchInfo = {
      note: noteA,
      noteIndex: 0,
      bestMatch: null,
    };
    const vaultSpy = vi.fn(async () => [noMatch, lowMatch]);

    const deps: Partial<ExtractionDeps> = {
      extractAtomicNotes: extractSpy,
      crossCheckBatch: dedupSpy,
      checkAgainstVaultDetailed: vaultSpy,
    };

    const result = await runExtraction(
      { type: 'text', content: '一段足够长的测试文本用于验证知识库去重阶段在低相似度匹配时笔记被保留且不产生任何待确认项' },
      makeConfig(deps, { enableVaultDedup: true, autoClassify: false, profile: 'balanced', vault: new (await import('obsidian')).Vault() }),
    );

    expect(result.success).toBe(true);
    // 两条笔记全部保留
    expect(result.notes!.length).toBe(2);
    // 低相似度不进入 pending
    expect(result.vaultDedupPending).toBeUndefined();
    expect(result.duplicateHints).toBeUndefined();
  });

  // ── Task 3b：verifyClaims 返回 error 分支（L248）──

  it('注入 verifyClaims 返回 error → 管线标记核查出错且不抛出', async () => {
    const noteA = makeNote('a', '正常', '正常笔记内容');
    const extractSpy = vi.fn(async () => ({ success: true, notes: [noteA] }));
    const dedupSpy = vi.fn(async (notes: AtomicNote[]) => ({ uniqueNotes: notes, duplicates: [] }));
    const verifySpy = vi.fn(async () => ({
      traced: 0,
      needsCompare: 0,
      outOfScope: 0,
      error: '核查服务调用失败',
    }));

    const deps: Partial<ExtractionDeps> = {
      extractAtomicNotes: extractSpy,
      crossCheckBatch: dedupSpy,
      verifyClaims: verifySpy,
    };

    const result = await runExtraction(
      { type: 'text', content: '一段足够长的测试文本用于验证内容核查阶段在核查服务报错时管线能优雅标记错误而不是崩溃' },
      makeConfig(deps, { factCheck: true }),
    );

    expect(verifySpy).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    // 出错分支：verificationSummary 仍返回，但 notes 未受影响
    expect(result.verificationSummary).toBeDefined();
    expect(result.verificationSummary!.traced).toBe(0);
  });

  // ── Task 3c：verifiedOnly 的 else 分支（启用 factCheck 但不 verifiedOnly，走完整统计文案）──

  it('启用 factCheck 但不 verifiedOnly → 走 else 统计文案分支（不过滤）', async () => {
    const noteA = makeNote('a', '正常', '正常笔记内容');
    const noteB = makeNote('b', '超源', '超源笔记内容');
    noteB.verification = [{ status: '超源', claim: '某声明', evidence: '原文', sourceQuote: '' }] as unknown as AtomicNote['verification'];
    const extractSpy = vi.fn(async () => ({ success: true, notes: [noteA, noteB] }));
    const dedupSpy = vi.fn(async (notes: AtomicNote[]) => ({ uniqueNotes: notes, duplicates: [] }));
    const verifySpy = vi.fn(async () => ({ traced: 1, needsCompare: 1, outOfScope: 1 }));

    const deps: Partial<ExtractionDeps> = {
      extractAtomicNotes: extractSpy,
      crossCheckBatch: dedupSpy,
      verifyClaims: verifySpy,
    };

    const result = await runExtraction(
      { type: 'text', content: '一段足够长的测试文本用于验证内容核查阶段在未开启 verifiedOnly 时仍输出超源统计但不过滤任何笔记' },
      makeConfig(deps, { factCheck: true, verifiedOnly: false }),
    );

    expect(result.success).toBe(true);
    // 不过滤：两条都保留
    expect(result.notes!.length).toBe(2);
    // verificationSummary 完整
    expect(result.verificationSummary).toBeDefined();
    expect(result.verificationSummary!.outOfScope).toBe(1);
  });

  // ── Task 4：Phase 1 URL Jina 渲染回退分支 ──

  it('URL 主提取 REQUIRES_JS → Jina Reader 成功回退返回正文', async () => {
    const requestUrlSpy = vi.spyOn(obsidian, 'requestUrl');

    // 第一次：主 URL 返回极短 HTML → 触发 REQUIRES_JS
    requestUrlSpy.mockResolvedValueOnce({
      status: 200,
      text: '<html><body><div></div></body></html>',
      json: {} as never,
    } as never);

    // 第二次：Jina Reader 返回正文（长度需 >50 以进入回退分支）
    const jinaBody = '# 测试标题\n\n这是通过 Jina Reader 渲染出来的正文内容，足够长以确保超过五十个字符的门槛从而成功进入回退渲染分支并通过后续门控检查流程。';
    requestUrlSpy.mockResolvedValueOnce({
      status: 200,
      text: jinaBody,
      json: {} as never,
    } as never);

    const extractSpy = vi.fn(async () => ({ success: true, notes: [] }));
    const result = await runExtraction(
      { type: 'url', content: 'https://example.com/js-rendered-page' },
      makeConfig({ extractAtomicNotes: extractSpy }, { skipGate: true, maxTokens: 100 }),
    );

    expect(requestUrlSpy).toHaveBeenCalledTimes(2);
    // 主 URL + Jina 各一次；管线应走到 Phase 3（证明 URL 读取成功）
    expect(extractSpy).toHaveBeenCalledTimes(1);
    requestUrlSpy.mockRestore();
  });

  // ── Task 4a：内容截断分支（L713 content.length > truncateLength）──

  it('注入 inputTruncateLength 小于原文 → Phase 3 收到截断后内容', async () => {
    let receivedContent = '';
    const extractSpy = vi.fn(async (c: string) => {
      receivedContent = c;
      return { success: true, notes: [makeNote('n1', '截断笔记', '这是截断后的笔记内容')] };
    });
    const deps: Partial<ExtractionDeps> = { extractAtomicNotes: extractSpy };

    const longContent = 'X'.repeat(200) + '这是需要被截断的超长测试文本用于验证内容截断分支确实生效而不是把整段原文发送给 AI 接口';
    const result = await runExtraction(
      { type: 'text', content: longContent },
      makeConfig(deps, { inputTruncateLength: 50 }),
    );

    expect(result.success).toBe(true);
    // AI 收到的应被截断到 50 字
    expect(receivedContent.length).toBe(50);
    expect(receivedContent).not.toContain('这是需要被截断');
  });

  // ── Task 4b：深度模式分支（L845 enableDeepMode && 超长 → extractChunked）──

  it('启用深度模式且超长 → 走 extractChunked 而非普通 AI 提炼', async () => {
    const extractSpy = vi.fn(async () => ({ success: true, notes: [] }));
    const chunkSpy = vi.fn(async () => [makeNote('c1', '分段笔记', '深度模式分段提炼产出的笔记')]);
    const deps: Partial<ExtractionDeps> = {
      extractAtomicNotes: extractSpy,
      extractChunked: chunkSpy,
    };

    const longContent = 'Y'.repeat(200) + '深度模式分段提炼测试文本用于验证超长内容在开启深度模式时走分段提炼路径而不是单次调用普通提炼接口';
    const result = await runExtraction(
      { type: 'text', content: longContent },
      makeConfig(deps, { enableDeepMode: true, inputTruncateLength: 50 }),
    );

    expect(result.success).toBe(true);
    expect(chunkSpy).toHaveBeenCalledTimes(1);
    // 普通提炼未被调用
    expect(extractSpy).not.toHaveBeenCalled();
    expect(result.notes![0].id).toBe('c1');
  });

  // ── Task 4c：中途取消检查点（L899 Phase 4b → 5）──

  it('Phase 4 去重后在 4b→5 检查点 abort → 返回取消', async () => {
    const noteA = makeNote('a', '笔记A', '笔记A的内容');
    const extractSpy = vi.fn(async () => ({ success: true, notes: [noteA] }));
    const dedupSpy = vi.fn(async (notes: AtomicNote[]) => ({ uniqueNotes: notes, duplicates: [] }));

    const ctrl = new AbortController();
    // 在 crossCheckBatch（Phase 4）完成后、进入 4b 检查点前 abort
    const dedupAbortSpy = vi.fn(async (notes: AtomicNote[]) => {
      ctrl.abort();
      return { uniqueNotes: notes, duplicates: [] };
    });

    const deps: Partial<ExtractionDeps> = {
      extractAtomicNotes: extractSpy,
      crossCheckBatch: dedupAbortSpy,
    };

    const result = await runExtraction(
      { type: 'text', content: '一段足够长的测试文本用于验证同批去重完成后在下一个取消检查点能正确检测到已中止信号并返回取消结果' },
      makeConfig(deps, { signal: ctrl.signal }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('取消');
  });

  // ── Task 4d：Phase 5 → 6 检查点取消（L931）──

  it('Phase 5 核查后在 5→6 检查点 abort → 返回取消', async () => {
    const noteA = makeNote('a', '笔记A', '笔记A的内容');
    const extractSpy = vi.fn(async () => ({ success: true, notes: [noteA] }));
    const dedupSpy = vi.fn(async (notes: AtomicNote[]) => ({ uniqueNotes: notes, duplicates: [] }));
    const verifySpy = vi.fn(async () => {
      // 核查完成后 abort，触发 5→6 检查点
      return { traced: 1, needsCompare: 0, outOfScope: 0 };
    });

    const ctrl = new AbortController();
    const verifyAbortSpy = vi.fn(async (...args: unknown[]) => {
      ctrl.abort();
      return { traced: 1, needsCompare: 0, outOfScope: 0 };
    });

    const deps: Partial<ExtractionDeps> = {
      extractAtomicNotes: extractSpy,
      crossCheckBatch: dedupSpy,
      verifyClaims: verifyAbortSpy,
    };

    const result = await runExtraction(
      { type: 'text', content: '一段足够长的测试文本用于验证内容核查完成后在下一个取消检查点能正确检测到已中止信号并返回取消结果' },
      makeConfig(deps, { factCheck: true, signal: ctrl.signal }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('取消');
  });

  // ── Task 5a：reviewNotes 失败 → 降级使用原始笔记（L313）──

  it('注入 reviewNotes 返回 success:false → 降级保留原始笔记', async () => {
    const noteA = makeNote('a', '笔记A', '笔记A内容');
    const noteB = makeNote('b', '笔记B', '笔记B内容');
    const extractSpy = vi.fn(async () => ({ success: true, notes: [noteA, noteB] }));
    const dedupSpy = vi.fn(async (notes: AtomicNote[]) => ({ uniqueNotes: notes, duplicates: [] }));
    // 复查「失败」：内部降级返回原始笔记
    const reviewSpy = vi.fn(async () => ({
      reviewedNotes: [noteA, noteB],
      reviewDetails: [],
      success: false,
    }));

    const deps: Partial<ExtractionDeps> = {
      extractAtomicNotes: extractSpy,
      crossCheckBatch: dedupSpy,
      reviewNotes: reviewSpy,
    };

    const result = await runExtraction(
      { type: 'text', content: '一段足够长的测试文本用于验证复查阶段失败时管线降级保留原始笔记而不是丢弃任何内容' },
      makeConfig(deps, { enableReview: true }),
    );

    expect(result.success).toBe(true);
    // 降级：两条都保留
    expect(result.notes!.length).toBe(2);
  });

  // ── Task 5b：reviewNotes 成功但无过滤（L317 else 分支）──

  it('启用复查且全部保留 → 走「无低质量笔记」文案分支', async () => {
    const noteA = makeNote('a', '笔记A', '笔记A内容');
    const noteB = makeNote('b', '笔记B', '笔记B内容');
    const extractSpy = vi.fn(async () => ({ success: true, notes: [noteA, noteB] }));
    const dedupSpy = vi.fn(async (notes: AtomicNote[]) => ({ uniqueNotes: notes, duplicates: [] }));
    const reviewSpy = vi.fn(async () => ({
      reviewedNotes: [noteA, noteB],
      reviewDetails: [
        { index: 0, insightScore: 5, knowledgeScore: 5, finalScore: 10, verdict: '保留', reason: '好' },
        { index: 1, insightScore: 5, knowledgeScore: 5, finalScore: 10, verdict: '保留', reason: '好' },
      ],
      success: true,
    }));

    const deps: Partial<ExtractionDeps> = {
      extractAtomicNotes: extractSpy,
      crossCheckBatch: dedupSpy,
      reviewNotes: reviewSpy,
    };

    const result = await runExtraction(
      { type: 'text', content: '一段足够长的测试文本用于验证复查阶段在全部笔记通过评分时走无过滤文案分支且笔记数量不变' },
      makeConfig(deps, { enableReview: true }),
    );

    expect(result.success).toBe(true);
    expect(result.notes!.length).toBe(2);
    // tracker 文案含「无低质量笔记」
    const summary = result.steps.map((s) => s.message).join(' ');
    expect(summary).toContain('无低质量笔记');
  });

  // ── Task 5c：getProviderLabel 各厂商（L50-53）──

  it('getProviderLabel 正确识别各服务商', () => {
    expect(getProviderLabel('https://api.siliconflow.cn/v1/chat/completions')).toBe('SiliconFlow');
    expect(getProviderLabel('https://api.deepseek.com/v1/chat/completions')).toBe('DeepSeek');
    expect(getProviderLabel('https://api.openai.com/v1/chat/completions')).toBe('OpenAI');
    expect(getProviderLabel('https://hunyuan.tencentcloudapi.com/v1')).toBe('Hunyuan');
    // 自定义/未知地址回退 AI
    expect(getProviderLabel('https://my-custom-llm.example.com/v1')).toBe('AI');
  });

  // ── Task 5d：semanticProgressBridge 存在分支（L114，有 onProgress 时）──

  it('启用 vault dedup 且传 onProgress → semanticProgressBridge 回调被触发', async () => {
    const noteA = makeNote('a', '笔记A', '笔记A的内容');
    const extractSpy = vi.fn(async () => ({ success: true, notes: [noteA] }));
    const dedupSpy = vi.fn(async (notes: AtomicNote[]) => ({ uniqueNotes: notes, duplicates: [] }));
    const vaultSpy = vi.fn(async () => [
      { note: noteA, noteIndex: 0, bestMatch: null } as VaultMatchInfo,
    ]);
    const progressEvents: unknown[] = [];
    const onProgress = vi.fn((_ev: unknown, _all: unknown[], _elapsed: number) => {
      progressEvents.push(_ev);
    });

    const deps: Partial<ExtractionDeps> = {
      extractAtomicNotes: extractSpy,
      crossCheckBatch: dedupSpy,
      checkAgainstVaultDetailed: vaultSpy,
    };

    const result = await runExtraction(
      { type: 'text', content: '一段足够长的测试文本用于验证知识库去重阶段在有进度回调时能正确触发语义向量加载的桥接回调' },
      makeConfig(deps, {
        enableVaultDedup: true,
        autoClassify: false,
        profile: 'balanced',
        vault: new (await import('obsidian')).Vault(),
        onProgress,
      }),
    );

    expect(result.success).toBe(true);
    // 进度回调被调用（含语义去重桥接事件）
    expect(onProgress).toHaveBeenCalled();
  });

  // ── Task 5e：Jina Reader 失败 catch 分支（L552）──

  it('URL 主提取 REQUIRES_JS 但 Jina 抛错 → 回到失败路径', async () => {
    const requestUrlSpy = vi.spyOn(obsidian, 'requestUrl');
    // 第一次：主 URL 极短 → REQUIRES_JS
    requestUrlSpy.mockResolvedValueOnce({
      status: 200,
      text: '<html><body><div></div></body></html>',
      json: {} as never,
    } as never);
    // 第二次：Jina 抛错
    requestUrlSpy.mockRejectedValueOnce(new Error('Jina 网络错误'));

    const extractSpy = vi.fn(async () => ({ success: true, notes: [] }));
    const result = await runExtraction(
      { type: 'url', content: 'https://example.com/js-page' },
      makeConfig({ extractAtomicNotes: extractSpy }, { skipGate: true, maxTokens: 100 }),
    );

    // Jina 失败 → 回到 extractResult 失败路径，URL 读取失败
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    requestUrlSpy.mockRestore();
  });

  // ── Task 5f：Jina Reader 返回 "Title:" 格式解析（L533）──

  it('URL Jina 返回 Title: 格式 → 正确解析标题与正文', async () => {
    const requestUrlSpy = vi.spyOn(obsidian, 'requestUrl');
    requestUrlSpy.mockResolvedValueOnce({
      status: 200,
      text: '<html><body><div></div></body></html>',
      json: {} as never,
    } as never);
    const jinaBody =
      'Title: 解析标题\n---\n这是通过 Jina 返回的标题加正文格式内容，长度需要超过五十个字符以进入回退渲染分支并顺利通过后续门控与提炼流程验证标题解析逻辑正确。';
    requestUrlSpy.mockResolvedValueOnce({
      status: 200,
      text: jinaBody,
      json: {} as never,
    } as never);

    const extractSpy = vi.fn(async () => ({ success: true, notes: [makeNote('n1', 't', 'c')] }));
    const result = await runExtraction(
      { type: 'url', content: 'https://example.com/js-page-title' },
      makeConfig({ extractAtomicNotes: extractSpy }, { skipGate: true, maxTokens: 100 }),
    );

    expect(extractSpy).toHaveBeenCalledTimes(1);
    // 管线走到 Phase 3 证明 URL 读取成功（标题解析分支被执行）
    expect(result.success).toBe(true);
    requestUrlSpy.mockRestore();
  });
});
