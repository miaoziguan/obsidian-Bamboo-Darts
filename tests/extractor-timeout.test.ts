/**
 * P2 改进项测试：提炼整体超时可配置 / 可注入
 *
 * 证明 config.extractionTimeoutMs 能覆盖默认 EXTRACTION_TIMEOUT_MS，
 * 且深度模式下超时时长 = 注入值 × 2。
 *
 * 通过注入「永不 resolve」的 extractAtomicNotes + 极小超时，驱动
 * runExtraction 的 timeoutPromise resolve 分支（原硬编码 5min 不可单测）。
 */

import { describe, it, expect, vi } from 'vitest';
import { runExtraction } from '../src/extractor';
import type { ExtractorConfig, ExtractionDeps } from '../src/extractor';

/** 构造最小 config（含超时注入 + 挂起 AI） */
function makeTimeoutConfig(
  timeoutMs: number,
  deps: Partial<ExtractionDeps>,
  overrides: Partial<ExtractorConfig> = {},
): Partial<ExtractorConfig> {
  return {
    deepseekApiKey: 'sk-test',
    deepseekApiUrl: 'https://api.test/v1',
    model: 'test-model',
    maxTokens: 2000,
    skipGate: true,
    extractionTimeoutMs: timeoutMs,
    deps,
    ...overrides,
  };
}

describe('extractor 超时保护（P2 可注入）', () => {
  it('注入极小超时 → Phase 3 挂起触发 timeoutPromise resolve 分支', async () => {
    // 让 AI 调用永远挂起，确保 timeoutPromise 胜出
    const hangingAi: ExtractionDeps['extractAtomicNotes'] = () =>
      new Promise(() => {
        /* never resolves - 模拟卡死 */
      });
    const deps: Partial<ExtractionDeps> = { extractAtomicNotes: hangingAi };

    const ctrl = new AbortController();
    const startedAt = Date.now();

    const result = await runExtraction(
      { type: 'text', content: '一段足够长的测试文本用于验证超时分支在注入极小超时时会被正确触发而不是无限等待' },
      makeTimeoutConfig(1, deps, { abortController: ctrl }),
    );

    const elapsed = Date.now() - startedAt;

    // 超时分支生效：返回失败且提示超时
    expect(result.success).toBe(false);
    expect(result.error).toContain('超时');
    // 1ms 超时 + 合理调度余量，绝不应等待接近默认 5min
    expect(elapsed).toBeLessThan(2000);
    // 超时后已 abort 管线
    expect(ctrl.signal.aborted).toBe(true);
  });

  it('深度模式 → 超时时长 = 注入值 × 2', async () => {
    const hangingAi: ExtractionDeps['extractAtomicNotes'] = () =>
      new Promise(() => {
        /* never resolves */
      });
    const deps: Partial<ExtractionDeps> = { extractAtomicNotes: hangingAi };

    const ctrl = new AbortController();
    const startedAt = Date.now();

    // 注入 80ms，深度模式应为 160ms 左右超时
    const result = await runExtraction(
      { type: 'text', content: '一段足够长的测试文本用于验证深度模式下超时时长被放大为注入值的两倍而不是沿用单倍超时' },
      makeTimeoutConfig(80, deps, { enableDeepMode: true, abortController: ctrl }),
    );

    const elapsed = Date.now() - startedAt;

    expect(result.success).toBe(false);
    expect(result.error).toContain('超时');
    // 应明显大于单倍 80ms（证明 ×2 生效），且小于宽松上界避免 flaky
    expect(elapsed).toBeGreaterThan(120);
    expect(elapsed).toBeLessThan(1000);
    expect(ctrl.signal.aborted).toBe(true);
  });

  it('超时不传 → 回退默认常量（不注入时 timeoutPromise 不立即触发，正常走完）', async () => {
    // 不传 extractionTimeoutMs，注入一个立即成功的 AI，管线应正常返回
    const okAi: ExtractionDeps['extractAtomicNotes'] = async () => ({
      success: true,
      notes: [
        {
          id: 'n1',
          title: '正常',
          content: '正常笔记',
          tags: ['test'],
          source: 'text',
        } as never,
      ],
    });
    const deps: Partial<ExtractionDeps> = { extractAtomicNotes: okAi };

    const result = await runExtraction(
      { type: 'text', content: '一段足够长的测试文本用于验证不注入超时时管线仍走默认逻辑且能正常完成提炼' },
      makeTimeoutConfig(undefined as unknown as number, deps),
    );

    expect(result.success).toBe(true);
    expect(result.notes!.length).toBe(1);
    // 明确不传超时，确认走了回退路径（无 abort 触发）
  });
});
