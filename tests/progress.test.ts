import { describe, it, expect, vi } from 'vitest';
import { createProgressTracker, ProgressEvent, ProgressCallback } from '../src/extraction/progress';

describe('progress', () => {
  // ─── 生命周期 ───

  describe('lifecycle', () => {
    it('start → complete 应正确标记阶段状态', () => {
      const events: ProgressEvent[] = [];
      const cb: ProgressCallback = (_ev, all) => { events.push(...all); };
      const tracker = createProgressTracker(cb);

      tracker.start('Phase 1', '测试', '开始...');
      tracker.complete('完成');

      const final = tracker.allEvents();
      expect(final).toHaveLength(1);
      expect(final[0].status).toBe('success');
      expect(final[0].detail).toBe('完成');
    });

    it('start → fail 应标记为 failed', () => {
      const tracker = createProgressTracker();
      tracker.start('Phase 1', '测试');
      tracker.fail('出错了');

      const final = tracker.allEvents();
      expect(final[0].status).toBe('failed');
      expect(final[0].detail).toBe('出错了');
    });

    it('start → skip 应标记为 skipped', () => {
      const tracker = createProgressTracker();
      tracker.start('Phase 1', '测试');
      tracker.skip('用户跳过');

      const final = tracker.allEvents();
      expect(final[0].status).toBe('skipped');
      expect(final[0].detail).toBe('用户跳过');
    });

    it('skip 阶段 elapsedMs 应为 0', () => {
      const tracker = createProgressTracker();
      tracker.start('Phase 1', '测试');
      tracker.skip('跳过');

      expect(tracker.allEvents()[0].elapsedMs).toBe(0);
    });
  });

  // ─── 多阶段 ───

  describe('multi-phase', () => {
    it('应追踪多个阶段的进度', () => {
      const tracker = createProgressTracker();
      tracker.start('Phase 1', '读取');
      tracker.complete('读取完成');
      tracker.start('Phase 2', '处理');
      tracker.complete('处理完成');

      const final = tracker.allEvents();
      expect(final).toHaveLength(2);
      expect(final[0].phase).toBe('Phase 1');
      expect(final[0].status).toBe('success');
      expect(final[1].phase).toBe('Phase 2');
      expect(final[1].status).toBe('success');
    });
  });

  // ─── update ───

  describe('update', () => {
    it('应更新当前阶段的 detail', () => {
      const tracker = createProgressTracker();
      tracker.start('Phase 1', '处理');
      tracker.update({ detail: '正在处理中...' });

      expect(tracker.allEvents()[0].detail).toBe('正在处理中...');
      expect(tracker.allEvents()[0].status).toBe('running');
    });

    it('应更新 subProgress', () => {
      const tracker = createProgressTracker();
      tracker.start('Phase 3', '提炼');
      tracker.update({ subProgress: { current: 3, total: 10, label: '段落' } });

      const sub = tracker.allEvents()[0].subProgress;
      expect(sub).not.toBeNull();
      expect(sub!.current).toBe(3);
      expect(sub!.total).toBe(10);
    });

    it('在未 start 时 update 应安全忽略', () => {
      const tracker = createProgressTracker();
      // 不调用 start，直接 update
      tracker.update({ detail: '不应该生效' });
      expect(tracker.allEvents()).toHaveLength(0);
    });
  });

  // ─── finish ───

  describe('finish', () => {
    it('finish 不应自动将 running 标记为 success', () => {
      const tracker = createProgressTracker();
      tracker.start('Phase 1', '测试');
      // 不调用 complete，直接 finish
      tracker.finish();

      expect(tracker.allEvents()[0].status).toBe('running');
    });
  });

  // ─── 事件不可变性 ───

  describe('event immutability', () => {
    it('allEvents 应返回副本，修改不影响内部状态', () => {
      const tracker = createProgressTracker();
      tracker.start('Phase 1', '测试');
      tracker.complete('完成');

      const events = tracker.allEvents();
      events.push({ phase: 'fake', name: 'fake', status: 'success' });

      expect(tracker.allEvents()).toHaveLength(1);
    });
  });

  // ─── 回调触发 ───

  describe('callback', () => {
    it('应在每个状态变更时触发回调', () => {
      let callCount = 0;
      const cb: ProgressCallback = () => { callCount++; };
      const tracker = createProgressTracker(cb);

      tracker.start('P', 'N');       // +1
      tracker.update({ detail: 'x' }); // +1
      tracker.complete('done');        // +1

      expect(callCount).toBe(3);
    });

    it('回调应接收正确的事件列表和总耗时', () => {
      let lastAllEvents: ProgressEvent[] = [];
      let lastTotalMs = 0;
      const cb: ProgressCallback = (_ev, all, total) => {
        lastAllEvents = all;
        lastTotalMs = total;
      };
      const tracker = createProgressTracker(cb);

      tracker.start('Phase 1', '读取');
      tracker.complete('完成');

      expect(lastAllEvents).toHaveLength(1);
      expect(lastTotalMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── currentIndex ───

  describe('currentIndex', () => {
    it('初始应为 -1', () => {
      const tracker = createProgressTracker();
      expect(tracker.currentIndex()).toBe(-1);
    });

    it('start 后应指向当前事件索引', () => {
      const tracker = createProgressTracker();
      tracker.start('P1', 'N1');
      expect(tracker.currentIndex()).toBe(0);
      tracker.start('P2', 'N2');
      expect(tracker.currentIndex()).toBe(1);
    });
  });
});
