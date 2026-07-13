/**
 * ResultViewModel — 提炼结果的视图模型
 *
 * 封装 ResultModal 所需的全部状态管理和业务逻辑，
 * 使 Modal 退化为纯视图层。此模块不含任何 DOM 操作，
 * 可独立单元测试。
 */

import { AtomicNote } from '../utils/notes-standards';
import { ExtractionResult } from '../extractor';
import { DedupResult } from '../deduplicator';
import { PROFILE_LABELS } from '../extraction/profiles';

// ─── 类型定义 ───

export type FilterMode = 'all' | 'issues' | 'traced';

export type ViewModelEvent =
  | { type: 'selection-changed' }
  | { type: 'filter-changed' }
  | { type: 'note-restored'; index: number }
  | { type: 'note-edited'; index: number; changed: boolean }
  | { type: 'pending-changed' };

export interface FilterCounts {
  all: number;
  issues: number;
  traced: number;
}

export interface ReviewStats {
  avgScore: number;
  kept: number;
  discarded: number;
}

export interface PendingStats {
  total: number;
  high: number;
  mid: number;
}

export interface SynthLabel {
  label: string;
  color: string;
}

export interface RestoreResult {
  note: AtomicNote;
  newIndex: number;
}

export interface EditResult {
  changed: boolean;
  invalidatedVerification: boolean;
}

// ─── ViewModel 类 ───

export class ResultViewModel {
  /** 提炼结果（可修改：支持恢复/编辑） */
  readonly result: ExtractionResult;
  readonly dedupResult?: DedupResult;

  /** 选中的笔记索引 */
  selectedNotes: Set<number>;

  /** 已恢复的批内去重索引 */
  restoredCrossBatch: Set<number> = new Set();

  /** 筛选模式 */
  filterMode: FilterMode = 'all';

  /** 搜索关键词 */
  searchQuery = '';

  /** 变更回调（视图层订阅） */
  onChange?: (event: ViewModelEvent) => void;

  constructor(result: ExtractionResult, dedupResult?: DedupResult) {
    this.result = result;
    this.dedupResult = dedupResult;

    // 默认全选
    const notes = result.notes || [];
    this.selectedNotes = new Set(notes.map((_, i) => i));
  }

  // ─── 只读 getter ───

  get notes(): AtomicNote[] {
    return this.result.notes || [];
  }

  get totalNotes(): number {
    return this.notes.length;
  }

  get selectedCount(): number {
    return this.selectedNotes.size;
  }

  get allSelected(): boolean {
    return this.totalNotes > 0 && this.selectedNotes.size === this.totalNotes;
  }

  get profileLabel(): string | null {
    if (!this.result.detectedProfile) return null;
    const name = PROFILE_LABELS[this.result.detectedProfile] || this.result.detectedProfile;
    const source = this.result.profileSource === 'auto' ? '自动检测' : '手动指定';
    return `策略: ${name} (${source})`;
  }

  // ─── 纯计算 ───

  get filterCounts(): FilterCounts {
    const notes = this.notes;
    let issues = 0;
    let traced = 0;
    for (let i = 0; i < notes.length; i++) {
      if (this.noteHasIssues(i)) issues++;
      if (this.noteIsTraced(i)) traced++;
    }
    return { all: notes.length, issues, traced };
  }

  get reviewStats(): ReviewStats | null {
    const details = this.result.reviewDetails;
    if (!details || details.length === 0) return null;
    const kept = details.filter((d) => d.verdict === '保留').length;
    const discarded = details.filter((d) => d.verdict === '丢弃').length;
    const avgScore = details.reduce((s, d) => s + d.finalScore, 0) / details.length;
    return { avgScore, kept, discarded };
  }

  get pendingStats(): PendingStats | null {
    const pending = this.result.vaultDedupPending;
    if (!pending || pending.length === 0) return null;
    const high = pending.filter((p) => p.highSimilarity).length;
    return { total: pending.length, high, mid: pending.length - high };
  }

  // ─── 判断函数 ───

  noteHasIssues(i: number): boolean {
    const note = this.notes[i];
    return (note.needsCompareCount ?? 0) > 0 || (note.outOfScopeCount ?? 0) > 0;
  }

  noteIsTraced(i: number): boolean {
    const note = this.notes[i];
    return (
      (note.tracedCount ?? 0) > 0 &&
      (note.needsCompareCount ?? 0) === 0 &&
      (note.outOfScopeCount ?? 0) === 0
    );
  }

  noteMatchesFilter(i: number): boolean {
    if (this.filterMode === 'issues') return this.noteHasIssues(i);
    if (this.filterMode === 'traced') return this.noteIsTraced(i);
    return true;
  }

  noteMatchesSearch(i: number): boolean {
    if (!this.searchQuery) return true;
    const note = this.notes[i];
    const q = this.searchQuery.toLowerCase();
    return (
      (note.title || '').toLowerCase().includes(q) ||
      (note.content || '').toLowerCase().includes(q)
    );
  }

  noteSynthLabel(i: number): SynthLabel {
    const note = this.notes[i];
    const outOfScope = note.outOfScopeCount ?? 0;
    const needsCompare = note.needsCompareCount ?? 0;
    const traced = note.tracedCount ?? 0;
    if (outOfScope > 0) return { label: '综合判断 · 超源', color: 'var(--color-red)' };
    if (needsCompare > 0) return { label: '综合判断 · 需对比', color: 'var(--color-orange)' };
    if (traced > 0) return { label: '综合判断 · 已溯源', color: 'var(--color-green)' };
    return { label: '综合判断', color: 'var(--text-faint)' };
  }

  computeVisibleIndices(): number[] {
    const indices: number[] = [];
    for (let i = 0; i < this.totalNotes; i++) {
      if (this.noteMatchesFilter(i) && this.noteMatchesSearch(i)) {
        indices.push(i);
      }
    }
    return indices;
  }

  // ─── 状态变更方法 ───

  selectAll(): void {
    this.selectedNotes = new Set(this.notes.map((_, i) => i));
    this.onChange?.({ type: 'selection-changed' });
  }

  deselectAll(): void {
    this.selectedNotes = new Set();
    this.onChange?.({ type: 'selection-changed' });
  }

  toggleSelection(i: number): void {
    if (this.selectedNotes.has(i)) {
      this.selectedNotes.delete(i);
    } else {
      this.selectedNotes.add(i);
    }
    this.onChange?.({ type: 'selection-changed' });
  }

  toggleAll(): void {
    if (this.allSelected) {
      this.deselectAll();
    } else {
      this.selectAll();
    }
  }

  setFilterMode(mode: FilterMode): void {
    this.filterMode = mode;
    this.onChange?.({ type: 'filter-changed' });
  }

  setSearchQuery(query: string): void {
    this.searchQuery = query;
    this.onChange?.({ type: 'filter-changed' });
  }

  /** 将被合并的批内笔记恢复为独立笔记 */
  restoreCrossBatchNote(dupIndex: number): RestoreResult | null {
    if (!this.result.notes || !this.result.crossBatchDuplicates) return null;
    const dup = this.result.crossBatchDuplicates[dupIndex];
    if (!dup) return null;

    const note: AtomicNote = {
      title: dup.removedTitle,
      content: dup.removedContent,
      tags: [],
      createdAt: new Date().toISOString(),
    };
    const newIndex = this.result.notes.length;
    this.result.notes.push(note);
    this.selectedNotes.add(newIndex);
    this.restoredCrossBatch.add(dupIndex);
    this.onChange?.({ type: 'note-restored', index: newIndex });
    return { note, newIndex };
  }

  /** 编辑笔记标题/内容；内容变更时自动失效核查数据 */
  editNote(index: number, newTitle: string, newContent: string): EditResult {
    const note = this.notes[index];
    if (!note) return { changed: false, invalidatedVerification: false };

    const titleChanged = newTitle !== note.title;
    const contentChanged = newContent !== note.content;
    const changed = titleChanged || contentChanged;

    note.title = newTitle;
    note.content = newContent;

    let invalidatedVerification = false;
    if (changed && note.verification && note.verification.length > 0) {
      note.verification = [];
      note.tracedCount = 0;
      note.needsCompareCount = 0;
      note.outOfScopeCount = 0;
      invalidatedVerification = true;
    }

    this.onChange?.({ type: 'note-edited', index, changed });
    return { changed, invalidatedVerification };
  }

  /** 保留疑似重复笔记 */
  keepPendingNote(noteIndex: number): void {
    this.selectedNotes.add(noteIndex);
    this.onChange?.({ type: 'pending-changed' });
  }

  /** 丢弃疑似重复笔记 */
  discardPendingNote(noteIndex: number): void {
    this.selectedNotes.delete(noteIndex);
    this.onChange?.({ type: 'pending-changed' });
  }

  /** 保留全部疑似重复 */
  keepAllPending(): void {
    const pending = this.result.vaultDedupPending;
    if (!pending) return;
    for (const item of pending) {
      this.selectedNotes.add(item.newNoteIndex);
    }
    this.onChange?.({ type: 'pending-changed' });
  }

  /** 丢弃全部疑似重复 */
  discardAllPending(): void {
    const pending = this.result.vaultDedupPending;
    if (!pending) return;
    for (const item of pending) {
      this.selectedNotes.delete(item.newNoteIndex);
    }
    this.onChange?.({ type: 'pending-changed' });
  }

  /** 获取选中的笔记子集 */
  getSelectedNotes(): AtomicNote[] {
    return this.notes.filter((_, i) => this.selectedNotes.has(i));
  }

  /** 释放引用 */
  dispose(): void {
    this.selectedNotes.clear();
    this.restoredCrossBatch.clear();
    this.onChange = undefined;
  }
}
