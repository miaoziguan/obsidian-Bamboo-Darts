import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  reviewNotes,
  scoreGrade,
  ReviewResult,
  ReviewConfig,
} from '../src/review/note-reviewer';
import { AtomicNote } from '../src/utils/notes-standards';

// ─── mock obsidian.requestUrl ───
// reviewNotes 通过 obsidian 的 requestUrl 调用 AI API，在 node 测试环境需要 mock。
const mockRequestUrl = vi.fn();
vi.mock('obsidian', () => ({
  requestUrl: (...args: unknown[]) => mockRequestUrl(...args),
}));

// ─── 辅助函数 ───
let _id = 0;
function makeNote(title: string, content: string, extra: Partial<AtomicNote> = {}): AtomicNote {
  return {
    id: `n_${_id++}`,
    title,
    content,
    createdAt: '2026-01-01T00:00:00Z',
    ...extra,
  };
}

/** 构造 requestUrl 的成功响应，content 为 AI 返回的 JSON 文本 */
function mockAiResponse(content: string) {
  mockRequestUrl.mockResolvedValueOnce({
    json: { choices: [{ message: { content } }] },
    status: 200,
  });
}

const baseConfig: ReviewConfig = {
  deepseekApiKey: 'test-key',
  deepseekApiUrl: 'https://api.test/v1/chat',
  model: 'test-model',
  maxTokens: 1024,
};

// ─── scoreGrade 测试 ───

describe('scoreGrade', () => {
  it('≥8 分应为 "优"', () => {
    expect(scoreGrade(8).label).toBe('优');
    expect(scoreGrade(9).label).toBe('优');
    expect(scoreGrade(10).label).toBe('优');
  });

  it('6-7 分应为 "良"', () => {
    expect(scoreGrade(6).label).toBe('良');
    expect(scoreGrade(7).label).toBe('良');
  });

  it('4-5 分应为 "中"', () => {
    expect(scoreGrade(4).label).toBe('中');
    expect(scoreGrade(5).label).toBe('中');
  });

  it('≤3 分应为 "差"', () => {
    expect(scoreGrade(2).label).toBe('差');
    expect(scoreGrade(3).label).toBe('差');
  });

  it('边界颜色应区分（避免误判相邻等级）', () => {
    expect(scoreGrade(8).color).toBe('var(--color-green)');
    expect(scoreGrade(6).color).toBe('var(--text-accent)');
    expect(scoreGrade(4).color).toBe('var(--color-orange)');
    expect(scoreGrade(2).color).toBe('var(--color-red)');
  });
});

// ─── reviewNotes: 空输入快捷返回 ───

describe('reviewNotes 空输入', () => {
  it('空笔记数组应直接返回空结果与 success=true（不调用 AI）', async () => {
    const result = await reviewNotes([], baseConfig);
    expect(result.reviewedNotes).toEqual([]);
    expect(result.reviewDetails).toEqual([]);
    expect(result.success).toBe(true);
    expect(mockRequestUrl).not.toHaveBeenCalled();
  });
});

// ─── reviewNotes: 成功路径（过滤 + 排序 + 标题注入） ───

describe('reviewNotes 成功路径', () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  it('应按 verdict 过滤丢弃项，并按 finalScore 降序排序，注入原始标题', async () => {
    const notes = [
      makeNote('笔记A', '内容A'),
      makeNote('笔记B', '内容B'),
      makeNote('笔记C', '内容C'),
    ];

    // index 为 1-based；A=8(保留) B=2(丢弃) C=6(保留)
    const aiContent = JSON.stringify([
      { index: 1, insight_score: 4, knowledge_score: 4, final_score: 8, verdict: '保留', reason: '独立见解' },
      { index: 2, insight_score: 1, knowledge_score: 1, final_score: 2, verdict: '丢弃', reason: '空洞' },
      { index: 3, insight_score: 3, knowledge_score: 3, final_score: 6, verdict: '保留', reason: '基本合格' },
    ]);
    mockAiResponse(aiContent);

    const result = await reviewNotes(notes, baseConfig);

    expect(result.success).toBe(true);
    // 丢弃 B，保留 A、C；排序后 A(8) 在前，C(6) 在后
    expect(result.reviewedNotes.map((n) => n.title)).toEqual(['笔记A', '笔记C']);
    // 标题注入到对应 detail
    const detailA = result.reviewDetails.find((d) => d.index === 0);
    expect(detailA?.title).toBe('笔记A');
    expect(detailA?.finalScore).toBe(8);
    expect(detailA?.verdict).toBe('保留');
  });

  it('minScore 配置应影响保留/丢弃判定', async () => {
    const notes = [makeNote('边界笔记', '内容'), makeNote('高分笔记', '内容2')];
    const aiContent = JSON.stringify([
      { index: 1, insight_score: 3, knowledge_score: 3, final_score: 6, verdict: '保留', reason: '中' },
      { index: 2, insight_score: 5, knowledge_score: 5, final_score: 10, verdict: '保留', reason: '优' },
    ]);
    mockAiResponse(aiContent);

    // 阈值设为 7：finalScore=6 的笔记应被丢弃
    const result = await reviewNotes(notes, { ...baseConfig, minScore: 7 });
    expect(result.reviewedNotes.map((n) => n.title)).toEqual(['高分笔记']);
  });

  it('AI 未返回 verdict 时，应以重算总分与 minScore 为准', async () => {
    const notes = [makeNote('重算笔记', '内容')];
    // verdict 缺失，final_score 也缺失 → 用 insight+knowledge 重算 = 7
    const aiContent = JSON.stringify([
      { index: 1, insight_score: 4, knowledge_score: 3, verdict: '', reason: 'x' },
    ]);
    mockAiResponse(aiContent);

    const result = await reviewNotes(notes, baseConfig);
    const d = result.reviewDetails[0];
    expect(d.finalScore).toBe(7);
    expect(d.verdict).toBe('保留'); // 7 >= 6
  });

  it('AI verdict 与重算不一致时，应以重算 verdict 为准', async () => {
    const notes = [makeNote('矛盾笔记', '内容')];
    // AI 说保留，但 final_score=3 < 6 → 重算应为丢弃
    const aiContent = JSON.stringify([
      { index: 1, insight_score: 2, knowledge_score: 1, final_score: 3, verdict: '保留', reason: 'x' },
    ]);
    mockAiResponse(aiContent);

    const result = await reviewNotes(notes, baseConfig);
    expect(result.reviewDetails[0].verdict).toBe('丢弃');
    expect(result.reviewedNotes).toEqual([]);
  });

  it('分数越界应被 clamp 到 1-5', async () => {
    const notes = [makeNote('越界', '内容')];
    const aiContent = JSON.stringify([
      { index: 1, insight_score: 9, knowledge_score: -2, final_score: 7, verdict: '保留', reason: 'x' },
    ]);
    mockAiResponse(aiContent);

    const d = (await reviewNotes(notes, baseConfig)).reviewDetails[0];
    expect(d.insightScore).toBe(5);
    expect(d.knowledgeScore).toBe(1);
    // final_score 由 AI 提供(7)且非空，直接采用（不重算），verdict 以 7 >= 6 保留
    expect(d.finalScore).toBe(7);
    expect(d.verdict).toBe('保留');
  });

  it('final_score 缺失时应按 clamp 后的 insight+knowledge 重算总分', async () => {
    const notes = [makeNote('重算', '内容')];
    // final_score 缺失 → final = clamp(9)+clamp(-2) = 5+1 = 6
    const aiContent = JSON.stringify([
      { index: 1, insight_score: 9, knowledge_score: -2, verdict: '保留', reason: 'x' },
    ]);
    mockAiResponse(aiContent);

    const d = (await reviewNotes(notes, baseConfig)).reviewDetails[0];
    expect(d.insightScore).toBe(5);
    expect(d.knowledgeScore).toBe(1);
    expect(d.finalScore).toBe(6);
  });

  it('AI 遗漏部分笔记时，遗漏项应补默认保留(6分)', async () => {
    const notes = [makeNote('已评', '内容'), makeNote('遗漏', '内容2')];
    const aiContent = JSON.stringify([
      { index: 1, insight_score: 4, knowledge_score: 4, final_score: 8, verdict: '保留', reason: 'x' },
    ]);
    mockAiResponse(aiContent);

    const result = await reviewNotes(notes, baseConfig);
    expect(result.reviewDetails).toHaveLength(2);
    const missing = result.reviewDetails.find((d) => d.index === 1)!;
    expect(missing.verdict).toBe('保留');
    expect(missing.finalScore).toBe(6);
    expect(missing.reason).toContain('默认保留');
  });

  it('AI 返回的 index 越界应被忽略', async () => {
    const notes = [makeNote('唯一', '内容')];
    const aiContent = JSON.stringify([
      { index: 99, insight_score: 5, knowledge_score: 5, final_score: 10, verdict: '保留', reason: '越界' },
    ]);
    mockAiResponse(aiContent);

    const result = await reviewNotes(notes, baseConfig);
    // 越界 index 被跳过 → 仅有默认补全的 index 0
    expect(result.reviewDetails).toHaveLength(1);
    expect(result.reviewDetails[0].index).toBe(0);
    expect(result.reviewDetails[0].reason).toContain('默认保留');
  });
});

// ─── reviewNotes: 解析失败 / 降级 ───

describe('reviewNotes 解析失败与降级', () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  it('AI 返回无效 JSON 时应全部默认保留(success=true)', async () => {
    const notes = [makeNote('笔记1', '内容'), makeNote('笔记2', '内容2')];
    mockAiResponse('这不是合法 JSON');

    const result = await reviewNotes(notes, baseConfig);
    expect(result.success).toBe(true);
    expect(result.reviewedNotes).toHaveLength(2); // 全部保留
    expect(result.reviewDetails.every((d) => d.verdict === '保留')).toBe(true);
  });

  it('AI 返回空内容时应全部默认保留', async () => {
    const notes = [makeNote('笔记1', '内容')];
    mockAiResponse('');

    const result = await reviewNotes(notes, baseConfig);
    expect(result.reviewDetails[0].reason).toContain('默认保留');
  });

  it('requestUrl 抛出错误时应降级返回原始笔记(success=false)', async () => {
    const notes = [makeNote('笔记1', '内容'), makeNote('笔记2', '内容2')];
    mockRequestUrl.mockRejectedValueOnce(new Error('network down'));

    const result = await reviewNotes(notes, baseConfig);
    expect(result.success).toBe(false);
    // 降级：返回原始笔记（默认保留，3+3=6）
    expect(result.reviewedNotes).toHaveLength(2);
    expect(result.reviewDetails.every((d) => d.verdict === '保留' && d.finalScore === 6)).toBe(true);
  });
});

// ─── buildReviewPrompt 结构验证（通过审查 prompt 关键要素） ───

describe('buildReviewPrompt 结构（间接验证）', () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  it('应把评分维度与阈值写入 prompt', async () => {
    const notes = [makeNote('测试笔记', '这是测试内容')];
    let capturedBody = '';
    mockRequestUrl.mockImplementationOnce(async (req: { body: string }) => {
      capturedBody = req.body;
      return { json: { choices: [{ message: { content: '[]' } }] } };
    });

    await reviewNotes(notes, { ...baseConfig, minScore: 5 });
    const parsed = JSON.parse(capturedBody);
    const prompt = parsed.messages.find((m: { role: string }) => m.role === 'user').content;
    expect(prompt).toContain('洞见价值');
    expect(prompt).toContain('知识价值');
    expect(prompt).toContain('总分 < 5');
    expect(prompt).toContain('测试笔记');
  });

  it('超源核查的笔记应在 prompt 中附加 verification_warning', async () => {
    const notes = [
      makeNote('带核查', '内容', {
        verification: [{ claim: '某声明', status: '超源' }],
        tracedCount: 2,
        needsCompareCount: 1,
        outOfScopeCount: 1,
      }),
    ];
    let capturedBody = '';
    mockRequestUrl.mockImplementationOnce(async (req: { body: string }) => {
      capturedBody = req.body;
      return { json: { choices: [{ message: { content: '[]' } }] } };
    });

    await reviewNotes(notes, baseConfig);
    const parsed = JSON.parse(capturedBody);
    const prompt = parsed.messages.find((m: { role: string }) => m.role === 'user').content;
    expect(prompt).toContain('verification_warning');
    expect(prompt).toContain('某声明');
  });

  it('仅含需对比(无超源)的笔记应附加 verification 但不含 warning', async () => {
    const notes = [
      makeNote('部分核查', '内容', {
        verification: [{ claim: '对比点', status: '需对比' }],
        tracedCount: 1,
        needsCompareCount: 1,
        outOfScopeCount: 0,
      }),
    ];
    let capturedBody = '';
    mockRequestUrl.mockImplementationOnce(async (req: { body: string }) => {
      capturedBody = req.body;
      return { json: { choices: [{ message: { content: '[]' } }] } };
    });

    await reviewNotes(notes, baseConfig);
    const parsed = JSON.parse(capturedBody);
    const prompt = parsed.messages.find((m: { role: string }) => m.role === 'user').content;
    expect(prompt).toContain('verification:');
    expect(prompt).not.toContain('verification_warning');
  });

  it('超过 500 字的内容应截断并追加省略号', async () => {
    const longContent = '字'.repeat(800);
    const notes = [makeNote('长笔记', longContent)];
    let capturedBody = '';
    mockRequestUrl.mockImplementationOnce(async (req: { body: string }) => {
      capturedBody = req.body;
      return { json: { choices: [{ message: { content: '[]' } }] } };
    });

    await reviewNotes(notes, baseConfig);
    const parsed = JSON.parse(capturedBody);
    const prompt = parsed.messages.find((m: { role: string }) => m.role === 'user').content;
    expect(prompt).toContain('...');
    expect(prompt).not.toContain('字'.repeat(800));
  });
});
