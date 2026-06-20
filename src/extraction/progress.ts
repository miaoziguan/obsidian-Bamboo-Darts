/**
 * 实时进度反馈系统
 *
 * 设计目标：让用户在 30 秒的提炼过程中感知"程序还活着，正在做什么"
 *
 * 用法：
 *   const tracker = createProgressTracker(onProgress);
 *   tracker.start('Phase 3', 'AI 提炼');
 *   // ... 执行耗时操作 ...
 *   tracker.update({ detail: '已收到响应，解析中...' });
 *   tracker.complete('成功提炼 8 条笔记');
 */

// === 类型定义 ===

export type ProgressStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface ProgressEvent {
  phase: string;
  name: string;
  status: ProgressStatus;
  detail?: string;
  subProgress?: { current: number; total: number; label?: string; } | null;
  elapsedMs?: number;
}

export type ProgressCallback = (event: ProgressEvent, allEvents: ProgressEvent[], totalElapsedMs: number) => void;

// === ProgressTracker：封装阶段生命周期 ===

export interface ProgressTracker {
  start: (phase: string, name: string, detail?: string) => void;
  update: (patch: { detail?: string; subProgress?: ProgressEvent['subProgress'] }) => void;
  complete: (detail?: string) => void;
  skip: (detail?: string) => void;
  fail: (detail?: string) => void;
  finish: () => void;
  currentIndex: () => number;
  allEvents: () => ProgressEvent[];
}

export function createProgressTracker(onProgress?: ProgressCallback | null): ProgressTracker {
  const events: ProgressEvent[] = [];
  const startedAt = Date.now();
  let currentIdx = -1;
  let currentStartedAt = 0;

  const emit = () => {
    if (!onProgress) return;
    const last = events[events.length - 1];
    if (!last) return;
    onProgress(last, events.slice(), Date.now() - startedAt);
  };

  const start = (phase: string, name: string, detail?: string) => {
    // 注意：不再自动将前一个 'running' 阶段标记为 'success'
    // 每个阶段必须明确调用 complete()/fail()/skip() 来结束，
    // 否则 UI 会显示该阶段仍在运行中，避免将"异常终止"误判为"成功完成"
    currentIdx = events.length;
    currentStartedAt = Date.now();
    events.push({ phase, name, status: 'running', detail: detail || '开始...', elapsedMs: 0 });
    emit();
  };

  const update = (patch: { detail?: string; subProgress?: ProgressEvent['subProgress'] }) => {
    if (currentIdx < 0) return;
    if (patch.detail !== undefined) events[currentIdx].detail = patch.detail;
    if (patch.subProgress !== undefined) events[currentIdx].subProgress = patch.subProgress;
    events[currentIdx].elapsedMs = Date.now() - currentStartedAt;
    emit();
  };

  const complete = (detail?: string) => {
    if (currentIdx < 0) return;
    events[currentIdx].status = 'success';
    if (detail !== undefined) events[currentIdx].detail = detail;
    events[currentIdx].elapsedMs = Date.now() - currentStartedAt;
    events[currentIdx].subProgress = null;
    emit();
  };

  const skip = (detail?: string) => {
    if (currentIdx < 0) return;
    events[currentIdx].status = 'skipped';
    if (detail !== undefined) events[currentIdx].detail = detail;
    events[currentIdx].elapsedMs = 0;
    events[currentIdx].subProgress = null;
    emit();
  };

  const fail = (detail?: string) => {
    if (currentIdx < 0) return;
    events[currentIdx].status = 'failed';
    if (detail !== undefined) events[currentIdx].detail = detail;
    events[currentIdx].elapsedMs = Date.now() - currentStartedAt;
    events[currentIdx].subProgress = null;
    emit();
  };

  const finish = () => {
    // 注意：不再自动将最后一个 'running' 阶段标记为 'success'
    // 如果有阶段仍显示为 running，说明流程在此处被异常终止，
    // 需要调查原因而不是静默掩盖
    emit();
  };

  return { start, update, complete, skip, fail, finish, currentIndex: () => currentIdx, allEvents: () => events.slice() };
}
