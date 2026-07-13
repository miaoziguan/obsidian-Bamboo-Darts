/**
 * ai-extractor 单元测试
 *
 * 用 vi.mock('obsidian') 拦截 requestUrl，真驱动 extractAtomicNotes 的
 * 重试、宽松降级、校验、AbortError 等分支。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const requestUrl = vi.fn();
vi.mock('obsidian', () => ({ requestUrl: (opts: unknown) => requestUrl(opts) }));

import { extractAtomicNotes } from '../src/extraction/ai-extractor';

/** 构造一个含合法 notes 的 AI 成功响应 */
function okResponse(notes: unknown) {
  return {
    status: 200,
    text: '',
    json: { choices: [{ message: { content: JSON.stringify({ notes }) } }] },
  };
}

const baseConfig = {
  deepseekApiKey: 'sk-test',
  deepseekApiUrl: 'https://api.test/v1',
  model: 'm',
  maxTokens: 100,
};

describe('extractAtomicNotes', () => {
  beforeEach(() => {
    requestUrl.mockReset();
  });

  it('未配置 API Key 直接返回失败', async () => {
    const r = await extractAtomicNotes('内容', { deepseekApiKey: '' });
    expect(r.success).toBe(false);
    expect(r.error).toContain('API Key');
    expect(requestUrl).not.toHaveBeenCalled();
  });

  it('成功解析并返回笔记', async () => {
    requestUrl.mockResolvedValueOnce(
      okResponse([{ title: '响度战争损害音质', content: '这是一条足够长度的原子笔记正文内容说明。' }]),
    );
    const r = await extractAtomicNotes('一些文章内容', baseConfig);
    expect(r.success).toBe(true);
    expect(r.notes!.length).toBe(1);
  });

  it('AI 返回空内容 → 返回错误（含 API error 详情）', async () => {
    requestUrl.mockResolvedValueOnce({
      status: 200,
      text: '',
      json: { choices: [{ message: { content: '' } }], error: { message: '额度不足' } },
    });
    const r = await extractAtomicNotes('内容', baseConfig);
    expect(r.success).toBe(false);
    expect(r.error).toContain('AI 返回内容为空');
    expect(r.error).toContain('额度不足');
  });

  it('非 200 → 重试后仍失败', async () => {
    requestUrl
      .mockResolvedValueOnce({ status: 500, text: '', json: {} })
      .mockResolvedValueOnce({ status: 500, text: '', json: {} });
    const r = await extractAtomicNotes('内容', baseConfig);
    expect(r.success).toBe(false);
    expect(r.error).toContain('API 返回 500');
    // MAX_RETRY=1 → 共 2 次
    expect(requestUrl).toHaveBeenCalledTimes(2);
  });

  it('可重试错误（500）重试后成功', async () => {
    requestUrl
      .mockResolvedValueOnce({ status: 503, text: '', json: {} })
      .mockResolvedValueOnce(
        okResponse([{ title: '版权保护零和假设不成立', content: '这是一条足够长度的原子笔记正文说明内容。' }]),
      );
    const r = await extractAtomicNotes('内容', baseConfig);
    expect(r.success).toBe(true);
    expect(requestUrl).toHaveBeenCalledTimes(2);
  });

  it('不可重试错误（4xx 非 429）直接失败不重试', async () => {
    requestUrl.mockResolvedValueOnce({ status: 400, text: '', json: {} });
    const r = await extractAtomicNotes('内容', baseConfig);
    expect(r.success).toBe(false);
    expect(requestUrl).toHaveBeenCalledTimes(1);
  });

  it('429 限流视为可重试', async () => {
    requestUrl
      .mockResolvedValueOnce({ status: 429, text: '', json: {} })
      .mockResolvedValueOnce(
        okResponse([{ title: '存量思维阻碍版权创新', content: '这是一条足够长度的原子笔记正文说明内容示例。' }]),
      );
    const r = await extractAtomicNotes('内容', baseConfig);
    expect(r.success).toBe(true);
    expect(requestUrl).toHaveBeenCalledTimes(2);
  });

  it('AbortError → 立即返回用户取消，不重试', async () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    requestUrl.mockRejectedValueOnce(err);
    const r = await extractAtomicNotes('内容', baseConfig);
    expect(r.success).toBe(false);
    expect(r.error).toContain('取消');
    expect(requestUrl).toHaveBeenCalledTimes(1);
  });

  it('网络错误重试耗尽后返回失败', async () => {
    requestUrl
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockRejectedValueOnce(new Error('Failed to fetch'));
    const r = await extractAtomicNotes('内容', baseConfig);
    expect(r.success).toBe(false);
    expect(r.error).toContain('AI 调用失败');
    expect(requestUrl).toHaveBeenCalledTimes(2);
  });

  it('严格解析 0 条 → 触发宽松兜底（均失败则降级告警）', async () => {
    // AI 明确返回"无符合标准的原子笔记"拒绝响应 → 解析得 0 条，
    // 触发宽松兜底分支；宽松模式同样无法解析 → 走"宽松也失败"告警分支。
    // 最终返回 success:true（空笔记列表，由上层决定后续）
    requestUrl.mockResolvedValueOnce({
      status: 200,
      text: '',
      json: {
        choices: [{ message: { content: '无符合标准的原子笔记' } }],
      },
    });
    const r = await extractAtomicNotes('内容', baseConfig);
    // 解析失败但 API 调用成功：返回成功（空笔记列表），不抛错
    expect(r.success).toBe(true);
    expect(r.notes).toBeDefined();
    expect(r.notes!.length).toBe(0);
  });
});
