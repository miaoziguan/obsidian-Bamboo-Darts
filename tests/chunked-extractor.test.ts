import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as obsidian from 'obsidian';
import { extractChunked, splitContent } from '../src/extraction/chunked-extractor';
import { createProgressTracker } from '../src/extraction/progress';
import { INPUT_TRUNCATE_LENGTH } from '../src/constants';

const mockRequestUrl = vi.spyOn(obsidian, 'requestUrl');

function buildSegment(marker: string, length: number): string {
  return `${marker}\n` + 'x'.repeat(length);
}

function mockExtractResponse(marker: string) {
  const content = `这是${marker}的内容，必须超过最短长度限制，确保能够通过内容校验。`;
  return {
    status: 200,
    text: '',
    json: {
      choices: [
        {
          message: {
            content: JSON.stringify({
              notes: [
                {
                  title: `笔记${marker}`,
                  content,
                  tags: [],
                },
              ],
            }),
          },
        },
      ],
    },
  };
}

describe('splitContent', () => {
  it('短文本不分段', () => {
    const text = '这是一个短文本。';
    const chunks = splitContent(text, INPUT_TRUNCATE_LENGTH, 500);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe(text);
  });

  it('超长文本分成多段且保留重叠', () => {
    const text = 'A段\n' + 'x'.repeat(INPUT_TRUNCATE_LENGTH + 2000) + '\n\nB段\n' + 'y'.repeat(INPUT_TRUNCATE_LENGTH + 2000);
    const chunks = splitContent(text, INPUT_TRUNCATE_LENGTH, 500);
    expect(chunks.length).toBeGreaterThan(1);
    // 重叠区应存在
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1];
      const curr = chunks[i];
      let overlap = 0;
      for (let len = 500; len > 0; len--) {
        if (prev.endsWith(curr.slice(0, len))) {
          overlap = len;
          break;
        }
      }
      expect(overlap).toBeGreaterThan(0);
    }
  });
});

describe('extractChunked', () => {
  beforeEach(() => {
    mockRequestUrl.mockReset();
  });

  it('并发处理所有分段并合并结果', async () => {
    mockRequestUrl.mockImplementation(async (opts: any) => {
      const body = JSON.parse(opts.body as string);
      const content = body.messages[1].content as string;
      const marker = content.includes('SEGMENT-A') ? 'A' : content.includes('SEGMENT-B') ? 'B' : '?';
      return mockExtractResponse(marker);
    });

    const content = `${buildSegment('SEGMENT-A', INPUT_TRUNCATE_LENGTH + 2000)}\n\n${buildSegment('SEGMENT-B', INPUT_TRUNCATE_LENGTH + 2000)}`;
    const tracker = createProgressTracker(() => {});
    const result = await extractChunked(
      content,
      { deepseekApiKey: 'test-key', model: 'deepseek-v4-flash' },
      undefined,
      tracker,
    );

    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.some((n) => n.title === '笔记A')).toBe(true);
    expect(result.some((n) => n.title === '笔记B')).toBe(true);
    expect(mockRequestUrl).toHaveBeenCalledTimes(3);
  });

  it('部分段失败时仍返回成功段的结果', async () => {
    mockRequestUrl.mockImplementation(async (opts: any) => {
      const body = JSON.parse(opts.body as string);
      const content = body.messages[1].content as string;
      if (content.includes('SEGMENT-A')) return mockExtractResponse('A');
      return { status: 500, text: 'Internal Server Error', json: {} };
    });

    const content = `${buildSegment('SEGMENT-A', INPUT_TRUNCATE_LENGTH + 2000)}\n\n${buildSegment('SEGMENT-B', INPUT_TRUNCATE_LENGTH + 2000)}`;
    const tracker = createProgressTracker(() => {});
    const result = await extractChunked(
      content,
      { deepseekApiKey: 'test-key', model: 'deepseek-v4-flash' },
      undefined,
      tracker,
    );

    expect(result.length).toBe(1);
    expect(result[0].title).toBe('笔记A');
  });

  it('取消信号会中止所有并发请求并返回空', async () => {
    const controller = new AbortController();
    mockRequestUrl.mockImplementation(async (opts: any) => {
      // 模拟一个耗时请求，等待期间可被 abort
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 2000);
        opts.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('AbortError'));
        });
      });
      return mockExtractResponse('X');
    });

    const content = `${buildSegment('SEGMENT-A', INPUT_TRUNCATE_LENGTH + 2000)}\n\n${buildSegment('SEGMENT-B', INPUT_TRUNCATE_LENGTH + 2000)}`;
    const tracker = createProgressTracker(() => {});

    const promise = extractChunked(
      content,
      { deepseekApiKey: 'test-key', model: 'deepseek-v4-flash', signal: controller.signal },
      undefined,
      tracker,
    );

    // 立即取消
    controller.abort();
    const result = await promise;

    expect(result.length).toBe(0);
  });
});
