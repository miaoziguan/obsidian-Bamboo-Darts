import { describe, it, expect, beforeEach } from 'vitest';
import { ResultViewModel, FilterMode } from '../src/ui/result-view-model';
import { AtomicNote } from '../src/utils/notes-standards';
import { ExtractionResult, PendingDuplicate } from '../src/extractor';
import { DedupResult, DuplicateInfo } from '../src/deduplicator';

// ─── 工厂函数 ───

function makeNote(overrides: Partial<AtomicNote> = {}): AtomicNote {
  return {
    id: 'note-0',
    title: '测试笔记',
    content: '这是一段测试内容',
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeResult(overrides: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    success: true,
    notes: [
      makeNote({ id: 'note-0' }),
      makeNote({ id: 'note-1', title: '笔记2' }),
      makeNote({ id: 'note-2', title: '笔记3' }),
    ],
    steps: [{ step: 'test', status: 'success', message: 'ok', durationMs: 10 }],
    ...overrides,
  };
}

function makePending(overrides: Partial<PendingDuplicate> = {}): PendingDuplicate {
  return {
    similarity: 0.7,
    matchedNote: '已有笔记',
    matchedContent: '已有内容',
    noteId: 'pending-0',
    newNoteTitle: '新笔记',
    newNoteContent: '新内容',
    ...overrides,
  };
}

function makeDup(overrides: Partial<DuplicateInfo> = {}): DuplicateInfo {
  return {
    isDuplicate: true,
    similarity: 0.85,
    matchedNote: '存活笔记',
    matchedContent: '存活内容',
    removedTitle: '被删笔记',
    removedContent: '被删内容',
    ...overrides,
  };
}

// ─── 测试 ───

describe('ResultViewModel', () => {
  let vm: ResultViewModel;
  let result: ExtractionResult;

  beforeEach(() => {
    result = makeResult();
    vm = new ResultViewModel(result);
  });

  // ── 初始化 ──

  describe('初始化', () => {
    it('默认全选所有笔记', () => {
      expect(vm.selectedNotes.size).toBe(3);
      expect(vm.selectedNotes.has('note-0')).toBe(true);
      expect(vm.selectedNotes.has('note-1')).toBe(true);
      expect(vm.selectedNotes.has('note-2')).toBe(true);
    });

    it('totalNotes 返回笔记总数', () => {
      expect(vm.totalNotes).toBe(3);
    });

    it('selectedCount 返回选中数量', () => {
      expect(vm.selectedCount).toBe(3);
    });

    it('allSelected 初始为 true', () => {
      expect(vm.allSelected).toBe(true);
    });

    it('空笔记列表时 allSelected 为 false', () => {
      const emptyVm = new ResultViewModel(makeResult({ notes: [] }));
      expect(emptyVm.allSelected).toBe(false);
    });

    it('notes 无笔记时返回空数组', () => {
      const noNotesVm = new ResultViewModel(makeResult({ notes: undefined }));
      expect(noNotesVm.notes).toEqual([]);
      expect(noNotesVm.totalNotes).toBe(0);
    });

    it('restoredCrossBatch 初始为空', () => {
      expect(vm.restoredCrossBatch.size).toBe(0);
    });

    it('filterMode 初始为 all', () => {
      expect(vm.filterMode).toBe('all');
    });

    it('searchQuery 初始为空', () => {
      expect(vm.searchQuery).toBe('');
    });
  });

  // ── profileLabel ──

  describe('profileLabel', () => {
    it('无 detectedProfile 返回 null', () => {
      expect(vm.profileLabel).toBeNull();
    });

    it('auto 检测显示自动标签', () => {
      const r = makeResult({ detectedProfile: 'dense', profileSource: 'auto' });
      const v = new ResultViewModel(r);
      expect(v.profileLabel).toBe('策略: 技术文献 (自动检测)');
    });

    it('manual 指定显示手动标签', () => {
      const r = makeResult({ detectedProfile: 'balanced', profileSource: 'manual' });
      const v = new ResultViewModel(r);
      expect(v.profileLabel).toBe('策略: 通用文章 (手动指定)');
    });
  });

  // ── 选择操作 ──

  describe('选择操作', () => {
    it('selectAll 全选', () => {
      vm.deselectAll();
      expect(vm.selectedCount).toBe(0);
      vm.selectAll();
      expect(vm.selectedCount).toBe(3);
    });

    it('deselectAll 取消全选', () => {
      vm.deselectAll();
      expect(vm.selectedCount).toBe(0);
      expect(vm.allSelected).toBe(false);
    });

    it('toggleSelection 切换单个', () => {
      vm.toggleSelection('note-0');
      expect(vm.selectedNotes.has('note-0')).toBe(false);
      expect(vm.selectedCount).toBe(2);

      vm.toggleSelection('note-0');
      expect(vm.selectedNotes.has('note-0')).toBe(true);
      expect(vm.selectedCount).toBe(3);
    });

    it('toggleAll 全选中时取消全选', () => {
      vm.toggleAll();
      expect(vm.selectedCount).toBe(0);
    });

    it('toggleAll 非全选时全选', () => {
      vm.toggleSelection('note-0');
      vm.toggleAll();
      expect(vm.allSelected).toBe(true);
    });

    it('选择变更触发 onChange', () => {
      const events: string[] = [];
      vm.onChange = (e) => events.push(e.type);
      vm.selectAll();
      vm.deselectAll();
      vm.toggleSelection('note-0');
      vm.toggleAll();
      expect(events).toEqual([
        'selection-changed',
        'selection-changed',
        'selection-changed',
        'selection-changed',
      ]);
    });
  });

  // ── 筛选判断 ──

  describe('筛选判断', () => {
    it('noteHasIssues 有 needsCompareCount', () => {
      result.notes![0].needsCompareCount = 2;
      expect(vm.noteHasIssues(0)).toBe(true);
      expect(vm.noteHasIssues(1)).toBe(false);
    });

    it('noteHasIssues 有 outOfScopeCount', () => {
      result.notes![1].outOfScopeCount = 1;
      expect(vm.noteHasIssues(1)).toBe(true);
    });

    it('noteIsTraced 有 traced 且无问题', () => {
      result.notes![0].tracedCount = 3;
      expect(vm.noteIsTraced(0)).toBe(true);
    });

    it('noteIsTraced 有 traced 但也有问题 → false', () => {
      result.notes![0].tracedCount = 3;
      result.notes![0].needsCompareCount = 1;
      expect(vm.noteIsTraced(0)).toBe(false);
    });

    it('noteMatchesFilter all 模式全通过', () => {
      expect(vm.noteMatchesFilter(0)).toBe(true);
      expect(vm.noteMatchesFilter(1)).toBe(true);
    });

    it('noteMatchesFilter issues 模式', () => {
      result.notes![0].needsCompareCount = 1;
      vm.filterMode = 'issues';
      expect(vm.noteMatchesFilter(0)).toBe(true);
      expect(vm.noteMatchesFilter(1)).toBe(false);
    });

    it('noteMatchesFilter traced 模式', () => {
      result.notes![2].tracedCount = 5;
      vm.filterMode = 'traced';
      expect(vm.noteMatchesFilter(2)).toBe(true);
      expect(vm.noteMatchesFilter(0)).toBe(false);
    });

    it('noteMatchesSearch 空查询全通过', () => {
      expect(vm.noteMatchesSearch(0)).toBe(true);
    });

    it('noteMatchesSearch 匹配标题', () => {
      result.notes![0].title = '量子计算基础';
      vm.searchQuery = '量子';
      expect(vm.noteMatchesSearch(0)).toBe(true);
      expect(vm.noteMatchesSearch(1)).toBe(false);
    });

    it('noteMatchesSearch 匹配内容', () => {
      result.notes![1].content = '深度学习在自然语言处理中的应用';
      vm.searchQuery = '自然语言';
      expect(vm.noteMatchesSearch(1)).toBe(true);
      expect(vm.noteMatchesSearch(0)).toBe(false);
    });

    it('noteMatchesSearch 大小写不敏感', () => {
      result.notes![0].title = 'React Hooks Guide';
      vm.searchQuery = 'react';
      expect(vm.noteMatchesSearch(0)).toBe(true);
    });
  });

  // ── filterCounts ──

  describe('filterCounts', () => {
    it('初始状态 all=3, issues=0, traced=0', () => {
      const counts = vm.filterCounts;
      expect(counts.all).toBe(3);
      expect(counts.issues).toBe(0);
      expect(counts.traced).toBe(0);
    });

    it('正确统计 issues 和 traced', () => {
      result.notes![0].needsCompareCount = 2;
      result.notes![1].tracedCount = 3;
      result.notes![2].tracedCount = 1;
      result.notes![2].outOfScopeCount = 1; // 有 traced 但也有问题 → 不算 traced
      const counts = vm.filterCounts;
      expect(counts.issues).toBe(2); // 0 和 2
      expect(counts.traced).toBe(1); // 仅 1
    });
  });

  // ── 综合判断标签 ──

  describe('noteSynthLabel', () => {
    it('无核查数据返回默认', () => {
      const { label, color } = vm.noteSynthLabel(0);
      expect(label).toBe('综合判断');
      expect(color).toBe('var(--text-faint)');
    });

    it('有超源返回红色', () => {
      result.notes![0].outOfScopeCount = 1;
      const { label, color } = vm.noteSynthLabel(0);
      expect(label).toBe('综合判断 · 超源');
      expect(color).toBe('var(--color-red)');
    });

    it('有需对比返回橙色', () => {
      result.notes![0].needsCompareCount = 2;
      const { label, color } = vm.noteSynthLabel(0);
      expect(label).toBe('综合判断 · 需对比');
      expect(color).toBe('var(--color-orange)');
    });

    it('仅溯源返回绿色', () => {
      result.notes![0].tracedCount = 3;
      const { label, color } = vm.noteSynthLabel(0);
      expect(label).toBe('综合判断 · 已溯源');
      expect(color).toBe('var(--color-green)');
    });

    it('优先级：超源 > 需对比 > 已溯源', () => {
      result.notes![0].tracedCount = 3;
      result.notes![0].needsCompareCount = 1;
      result.notes![0].outOfScopeCount = 1;
      const { label } = vm.noteSynthLabel(0);
      expect(label).toBe('综合判断 · 超源');
    });
  });

  // ── computeVisibleIndices ──

  describe('computeVisibleIndices', () => {
    it('无筛选无搜索返回全部', () => {
      expect(vm.computeVisibleIndices()).toEqual([0, 1, 2]);
    });

    it('筛选 issues 模式', () => {
      result.notes![1].needsCompareCount = 1;
      vm.filterMode = 'issues';
      expect(vm.computeVisibleIndices()).toEqual([1]);
    });

    it('搜索关键词', () => {
      result.notes![0].title = '量子物理';
      result.notes![2].title = '量子纠缠';
      vm.searchQuery = '量子';
      expect(vm.computeVisibleIndices()).toEqual([0, 2]);
    });

    it('筛选 + 搜索组合', () => {
      result.notes![0].title = '问题笔记A';
      result.notes![0].needsCompareCount = 1;
      result.notes![1].title = '问题笔记B';
      result.notes![1].needsCompareCount = 1;
      result.notes![2].title = '正常笔记';
      vm.filterMode = 'issues';
      vm.searchQuery = 'B';
      expect(vm.computeVisibleIndices()).toEqual([1]);
    });

    it('无匹配返回空', () => {
      vm.searchQuery = '不存在的关键词';
      expect(vm.computeVisibleIndices()).toEqual([]);
    });
  });

  // ── 筛选/搜索 setter ──

  describe('setFilterMode / setSearchQuery', () => {
    it('setFilterMode 更新 filterMode 并触发事件', () => {
      const events: string[] = [];
      vm.onChange = (e) => events.push(e.type);
      vm.setFilterMode('issues');
      expect(vm.filterMode).toBe('issues');
      expect(events).toEqual(['filter-changed']);
    });

    it('setSearchQuery 更新 searchQuery 并触发事件', () => {
      const events: string[] = [];
      vm.onChange = (e) => events.push(e.type);
      vm.setSearchQuery('关键词');
      expect(vm.searchQuery).toBe('关键词');
      expect(events).toEqual(['filter-changed']);
    });
  });

  // ── restoreCrossBatchNote ──

  describe('restoreCrossBatchNote', () => {
    it('恢复笔记追加到 notes 数组', () => {
      result.crossBatchDuplicates = [makeDup(), makeDup({ removedTitle: '另一篇' })];
      const restoreResult = vm.restoreCrossBatchNote(0);
      expect(restoreResult).not.toBeNull();
      expect(restoreResult!.newIndex).toBe(3);
      expect(restoreResult!.note.title).toBe('被删笔记');
      expect(result.notes!.length).toBe(4);
      // 恢复的笔记必须有唯一 id，否则 selectedNotes(Set<string>) 会混入 undefined
      expect(typeof restoreResult!.note.id).toBe('string');
      expect(restoreResult!.note.id.length).toBeGreaterThan(0);
      expect(vm.selectedNotes.has(restoreResult!.note.id)).toBe(true);
    });

    it('恢复后自动选中并记录', () => {
      result.crossBatchDuplicates = [makeDup()];
      const before = vm.selectedNotes.size;
      vm.restoreCrossBatchNote(0);
      expect(vm.selectedNotes.size).toBe(before + 1);
      expect(vm.restoredCrossBatch.has(0)).toBe(true);
    });

    it('恢复触发 note-restored 事件', () => {
      result.crossBatchDuplicates = [makeDup()];
      const events: { type: string; index?: number }[] = [];
      vm.onChange = (e) => events.push(e);
      vm.restoreCrossBatchNote(0);
      expect(events).toEqual([{ type: 'note-restored', index: 3 }]);
    });

    it('无 crossBatchDuplicates 返回 null', () => {
      expect(vm.restoreCrossBatchNote(0)).toBeNull();
    });

    it('dupIndex 越界返回 null', () => {
      result.crossBatchDuplicates = [makeDup()];
      expect(vm.restoreCrossBatchNote(5)).toBeNull();
    });
  });

  // ── editNote ──

  describe('editNote', () => {
    it('修改标题', () => {
      const editResult = vm.editNote(0, '新标题', '这是一段测试内容');
      expect(editResult.changed).toBe(true);
      expect(result.notes![0].title).toBe('新标题');
    });

    it('修改内容', () => {
      const editResult = vm.editNote(0, '测试笔记', '全新内容');
      expect(editResult.changed).toBe(true);
      expect(result.notes![0].content).toBe('全新内容');
    });

    it('内容未变 → changed=false', () => {
      const editResult = vm.editNote(0, '测试笔记', '这是一段测试内容');
      expect(editResult.changed).toBe(false);
    });

    it('内容变更时自动失效核查数据', () => {
      result.notes![0].verification = [
        { claim: '声明1', status: '已溯源' },
        { claim: '声明2', status: '需对比' },
      ];
      result.notes![0].tracedCount = 1;
      result.notes![0].needsCompareCount = 1;

      const editResult = vm.editNote(0, '测试笔记', '改过的内容');
      expect(editResult.changed).toBe(true);
      expect(editResult.invalidatedVerification).toBe(true);
      expect(result.notes![0].verification).toEqual([]);
      expect(result.notes![0].tracedCount).toBe(0);
      expect(result.notes![0].needsCompareCount).toBe(0);
    });

    it('标题变更也失效核查数据（原代码逻辑：任何变更都失效）', () => {
      result.notes![0].verification = [{ claim: '声明1', status: '已溯源' }];
      result.notes![0].tracedCount = 1;

      const editResult = vm.editNote(0, '新标题', '这是一段测试内容');
      expect(editResult.changed).toBe(true);
      expect(editResult.invalidatedVerification).toBe(true);
      expect(result.notes![0].verification).toEqual([]);
    });

    it('无任何变更不失效核查数据', () => {
      result.notes![0].verification = [{ claim: '声明1', status: '已溯源' }];
      result.notes![0].tracedCount = 1;

      const editResult = vm.editNote(0, '测试笔记', '这是一段测试内容');
      expect(editResult.changed).toBe(false);
      expect(editResult.invalidatedVerification).toBe(false);
      expect(result.notes![0].verification!.length).toBe(1);
    });

    it('索引越界返回未变更', () => {
      const editResult = vm.editNote(99, '标题', '内容');
      expect(editResult.changed).toBe(false);
    });

    it('编辑触发 note-edited 事件', () => {
      const events: { type: string; index?: number; changed?: boolean }[] = [];
      vm.onChange = (e) => events.push(e);
      vm.editNote(0, '新标题', '这是一段测试内容');
      expect(events).toEqual([{ type: 'note-edited', index: 0, changed: true }]);
    });
  });

  // ── 待确认操作 ──

  describe('待确认操作', () => {
    beforeEach(() => {
      result.vaultDedupPending = [
        makePending({ noteId: 'pending-0' }),
        makePending({ noteId: 'pending-1', highSimilarity: true }),
        makePending({ noteId: 'pending-2' }),
      ];
      vm = new ResultViewModel(result);
    });

    it('keepPendingNote 添加选中', () => {
      vm.deselectAll();
      vm.keepPendingNote('pending-1');
      expect(vm.selectedNotes.has('pending-1')).toBe(true);
    });

    it('discardPendingNote 移除选中', () => {
      vm.discardPendingNote('pending-0');
      expect(vm.selectedNotes.has('pending-0')).toBe(false);
    });

    it('keepAllPending 全选待确认', () => {
      vm.deselectAll();
      vm.keepAllPending();
      expect(vm.selectedNotes.has('pending-0')).toBe(true);
      expect(vm.selectedNotes.has('pending-1')).toBe(true);
      expect(vm.selectedNotes.has('pending-2')).toBe(true);
    });

    it('discardAllPending 全丢弃待确认', () => {
      vm.discardAllPending();
      expect(vm.selectedNotes.has('pending-0')).toBe(false);
      expect(vm.selectedNotes.has('pending-1')).toBe(false);
      expect(vm.selectedNotes.has('pending-2')).toBe(false);
    });

    it('待确认操作触发 pending-changed 事件', () => {
      const events: string[] = [];
      vm.onChange = (e) => events.push(e.type);
      vm.keepPendingNote('pending-0');
      vm.discardPendingNote('pending-1');
      vm.keepAllPending();
      vm.discardAllPending();
      expect(events).toEqual([
        'pending-changed',
        'pending-changed',
        'pending-changed',
        'pending-changed',
      ]);
    });

    it('无 vaultDedupPending 时 keepAll/discardAll 不报错', () => {
      const noVm = new ResultViewModel(makeResult());
      noVm.keepAllPending();
      noVm.discardAllPending();
      // 不抛异常即通过
    });

    it('getSelectedNotes 按 noteId 精确返回选中笔记', () => {
      vm.deselectAll();
      // toggleSelection 用 note.id；makeResult 的笔记 id 为 note-0/note-1/note-2
      vm.toggleSelection('note-1');
      const selected = vm.getSelectedNotes();
      expect(selected.length).toBe(1);
      expect(selected[0].title).toBe('笔记2');
    });
  });

  // ── pendingStats ──

  describe('pendingStats', () => {
    it('无待确认返回 null', () => {
      expect(vm.pendingStats).toBeNull();
    });

    it('正确统计高/中相似度', () => {
      result.vaultDedupPending = [
        makePending({ highSimilarity: true }),
        makePending({ highSimilarity: true }),
        makePending({ highSimilarity: false }),
      ];
      const stats = vm.pendingStats!;
      expect(stats.total).toBe(3);
      expect(stats.high).toBe(2);
      expect(stats.mid).toBe(1);
    });
  });

  // ── reviewStats ──

  describe('reviewStats', () => {
    it('无 reviewDetails 返回 null', () => {
      expect(vm.reviewStats).toBeNull();
    });

    it('正确计算均分和保留/丢弃数', () => {
      result.reviewDetails = [
        { index: 0, insightScore: 4, knowledgeScore: 3, finalScore: 7, verdict: '保留', reason: '' },
        { index: 1, insightScore: 2, knowledgeScore: 1, finalScore: 3, verdict: '丢弃', reason: '' },
        { index: 2, insightScore: 5, knowledgeScore: 4, finalScore: 9, verdict: '保留', reason: '' },
      ];
      const stats = vm.reviewStats!;
      expect(stats.kept).toBe(2);
      expect(stats.discarded).toBe(1);
      expect(stats.avgScore).toBeCloseTo(6.333, 2);
    });
  });

  // ── getSelectedNotes ──

  describe('getSelectedNotes', () => {
    it('返回选中的笔记子集', () => {
      vm.toggleSelection('note-1'); // 取消选中 note-1
      const selected = vm.getSelectedNotes();
      expect(selected.length).toBe(2);
      expect(selected[0].title).toBe('测试笔记');
      expect(selected[1].title).toBe('笔记3');
    });

    it('全选时返回全部', () => {
      expect(vm.getSelectedNotes().length).toBe(3);
    });

    it('全不选时返回空', () => {
      vm.deselectAll();
      expect(vm.getSelectedNotes()).toEqual([]);
    });
  });

  // ── dispose ──

  describe('dispose', () => {
    it('清空 selectedNotes 和 restoredCrossBatch', () => {
      result.crossBatchDuplicates = [makeDup()];
      vm.restoreCrossBatchNote(0);
      vm.dispose();
      expect(vm.selectedNotes.size).toBe(0);
      expect(vm.restoredCrossBatch.size).toBe(0);
    });

    it('清除 onChange 回调', () => {
      vm.onChange = () => {};
      vm.dispose();
      expect(vm.onChange).toBeUndefined();
    });
  });
});
