/**
 * P0 样式系统化测试
 *
 * 目标：验证「样式双轨制」消除——初始渲染后，UI 元素不再写内联 style
 * （除行为驱动的 display 显隐外），且正确挂载 P0 原子类。
 *
 * 复用 ui-smoke.test.ts 的 FakeEl 最小 DOM 工厂。
 */
import { renderNotesList } from '../src/ui/result/notes-list';
import { ResultViewModel } from '../src/ui/result-view-model';
import { ResultModal } from '../src/ui/result-modal';
import { InputTab } from '../src/ui/tabs/input-tab';
import { AtomicNote } from '../src/utils/notes-standards';
import { ExtractionResult } from '../src/extractor';

// ─── 最小 fake DOM 节点（同 ui-smoke.test.ts）───

class FakeEl {
  tag: string;
  children: FakeEl[] = [];
  text = '';
  cls = '';
  attr: Record<string, string> = {};
  style: Record<string, string> = {};
  listeners: Record<string, Array<() => void>> = {};
  parent: FakeEl | null = null;

  constructor(tag: string) {
    this.tag = tag;
  }

  createEl(tag: string, opts: { text?: string; cls?: string; attr?: Record<string, string> } = {}): FakeEl {
    const el = new FakeEl(tag);
    el.parent = this;
    if (opts.text !== undefined) el.text = opts.text;
    if (opts.cls !== undefined) el.cls = opts.cls;
    if (opts.attr) el.attr = { ...opts.attr };
    this.children.push(el);
    return el;
  }

  setText(t: string): void {
    this.text = t;
  }

  get textContent(): string {
    return this.text;
  }

  set textContent(v: string) {
    this.text = v;
  }

  appendText(t: string): void {
    this.text += t;
  }

  setAttr(_k: string, _v: string): void {}

  remove(): void {
    if (this.parent) {
      this.parent.children = this.parent.children.filter((c) => c !== this);
    }
  }

  empty(): void {
    this.children = [];
  }

  addClass(c: string): void {
    const set = new Set(this.cls.split(/\s+/).filter(Boolean));
    set.add(c);
    this.cls = [...set].join(' ');
  }

  removeClass(c: string): void {
    this.cls = this.cls
      .split(/\s+/)
      .filter((x) => x && x !== c)
      .join(' ');
  }

  toggleClass(c: string, on?: boolean): void {
    const has = this.cls.split(/\s+/).includes(c);
    const want = on ?? !has;
    if (want) this.addClass(c);
    else this.removeClass(c);
  }

  addEventListener(event: string, cb: () => void): void {
    (this.listeners[event] ||= []).push(cb);
  }

  querySelector(_sel: string): FakeEl | null {
    return this.children[0] || null;
  }

  querySelectorAll(sel: string): FakeEl[] {
    const cls = sel.replace(/^\./, '');
    const out: FakeEl[] = [];
    const walk = (el: FakeEl) => {
      for (const c of el.children) {
        if (c.cls.split(/\s+/).includes(cls)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }

  /** 测试辅助：触发某事件的所有监听器 */
  fire(event: string): void {
    (this.listeners[event] || []).forEach((cb) => cb());
  }

  findText(keyword: string): FakeEl | null {
    if (this.text.includes(keyword)) return this;
    for (const c of this.children) {
      const found = c.findText(keyword);
      if (found) return found;
    }
    return null;
  }

  countByClass(cls: string): number {
    const tokens = this.cls.split(/\s+/);
    let n = tokens.includes(cls) ? 1 : 0;
    for (const c of this.children) n += c.countByClass(cls);
    return n;
  }
}

// 断言：初始渲染后，所有节点不得有「非 display」的内联 style（样式系统化核心）
function assertNoInlineStyleExceptDisplay(root: FakeEl): void {
  const violations: string[] = [];
  const walk = (el: FakeEl) => {
    const keys = Object.keys(el.style).filter((k) => k !== 'display');
    if (keys.length > 0) {
      violations.push(`<${el.tag} class="${el.cls}"> 含非法内联: ${keys.join(',')}`);
    }
    for (const c of el.children) walk(c);
  };
  walk(root);
  if (violations.length > 0) {
    throw new Error('发现内联 style 破窗:\n' + violations.join('\n'));
  }
}

function makeNotes(n: number): AtomicNote[] {
  const notes: AtomicNote[] = [];
  for (let i = 0; i < n; i++) {
    notes.push({
      id: `n${i}`,
      title: `笔记 ${i + 1}`,
      content: `这是第 ${i + 1} 条原子笔记的内容，长度足够以渲染预览与展开区域。知识管理强调把阅读沉淀为可检索的节点。`,
      createdAt: new Date().toISOString(),
      tags: i % 2 === 0 ? ['ai', '知识'] : [],
    });
  }
  return notes;
}

function makeResult(notes: AtomicNote[], opts: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    success: true,
    notes,
    steps: [],
    detectedProfile: 'balanced',
    ...opts,
  } as ExtractionResult;
}

describe('P0 样式系统化：notes-list', () => {
  it('初始渲染无内联 style 破窗', () => {
    const notes = makeNotes(3);
    const vm = new ResultViewModel(makeResult(notes));
    const container = new FakeEl('div');
    renderNotesList(vm, container as unknown as HTMLElement, async () => {}, () => {});
    expect(() => assertNoInlineStyleExceptDisplay(container)).not.toThrow();
  });

  it('挂载正确的 P0 原子类', () => {
    const notes = makeNotes(3);
    const vm = new ResultViewModel(makeResult(notes));
    const container = new FakeEl('div');
    renderNotesList(vm, container as unknown as HTMLElement, async () => {}, () => {});
    expect(container.countByClass('atomic-notes-notes-header')).toBe(1);
    expect(container.countByClass('atomic-notes-filter-btn')).toBe(3);
    expect(container.countByClass('atomic-notes-search-input')).toBe(1);
    expect(container.countByClass('atomic-notes-selected-count')).toBe(1);
    expect(container.countByClass('atomic-notes-card')).toBe(3);
    expect(container.countByClass('atomic-notes-edit-btn')).toBe(3);
    // apply-btn 在编辑面板内，初始渲染不存在（点击编辑后出现）
    expect(container.countByClass('atomic-notes-apply-btn')).toBe(0);
  });

  it('点击编辑后出现应用修改按钮（无内联 style 破窗）', () => {
    const notes = makeNotes(1);
    const vm = new ResultViewModel(makeResult(notes));
    const container = new FakeEl('div');
    renderNotesList(vm, container as unknown as HTMLElement, async () => {}, () => {});
    const editBtn = container.findText('✎ 编辑');
    expect(editBtn).toBeDefined();
    editBtn!.fire('click');
    expect(container.countByClass('atomic-notes-apply-btn')).toBe(1);
    expect(container.countByClass('atomic-notes-apply-edit-btn')).toBe(1);
    // 编辑面板展开后仍无非法内联 style
    expect(() => assertNoInlineStyleExceptDisplay(container)).not.toThrow();
  });

  it('有核查详情时挂载折叠区类', () => {
    const notes = makeNotes(1).map((n) => ({
      ...n,
      verification: [{ claim: '声明', status: '已溯源' as const, sourceText: '来源' }],
    }));
    const vm = new ResultViewModel(makeResult(notes));
    const container = new FakeEl('div');
    renderNotesList(vm, container as unknown as HTMLElement, async () => {}, () => {});
    expect(container.countByClass('atomic-notes-collapsible-header')).toBe(1);
    expect(container.countByClass('atomic-notes-verify-status')).toBe(1);
    expect(container.countByClass('verify-status--green')).toBe(1);
  });

  it('无标签笔记渲染综合判断 chip（synth 变体类，非内联背景）', () => {
    const notes = makeNotes(1).map((n) => ({
      ...n,
      tags: [],
      tracedCount: 1,
    })) as AtomicNote[];
    const vm = new ResultViewModel(makeResult(notes));
    const container = new FakeEl('div');
    renderNotesList(vm, container as unknown as HTMLElement, async () => {}, () => {});
    expect(container.countByClass('atomic-notes-synth-chip')).toBe(1);
    expect(container.countByClass('synth--green')).toBe(1);
  });
});

describe('P0 样式系统化：ResultModal', () => {
  function fakeApp(): any {
    return {
      vault: { getAbstractFileByPath: () => null },
      workspace: { getActiveViewOfType: () => null },
    };
  }

  it('onOpen 初始渲染无内联 style 破窗', () => {
    const notes = makeNotes(2);
    const vm = new ResultViewModel(makeResult(notes));
    const modal = new ResultModal(fakeApp(), makeResult(notes), undefined, async () => {});
    const contentEl = new FakeEl('div');
    (modal as unknown as { contentEl: FakeEl }).contentEl = contentEl;
    modal.onOpen();
    expect(() => assertNoInlineStyleExceptDisplay(contentEl)).not.toThrow();
  });

  it('含 profileLabel 时挂载策略徽标类', () => {
    const notes = makeNotes(2);
    const vm = new ResultViewModel(makeResult(notes, { detectedProfile: 'scholar' }));
    const modal = new ResultModal(fakeApp(), makeResult(notes, { detectedProfile: 'scholar' }), undefined, async () => {});
    const contentEl = new FakeEl('div');
    (modal as unknown as { contentEl: FakeEl }).contentEl = contentEl;
    modal.onOpen();
    expect(contentEl.countByClass('atomic-notes-profile-badge')).toBe(1);
  });

  it('语义去重跳过时挂载信息框类', () => {
    const notes = makeNotes(2);
    const result = makeResult(notes, { semanticDedupSkipped: true });
    const modal = new ResultModal(fakeApp(), result, undefined, async () => {});
    const contentEl = new FakeEl('div');
    (modal as unknown as { contentEl: FakeEl }).contentEl = contentEl;
    modal.onOpen();
    expect(contentEl.countByClass('atomic-notes-info-box')).toBe(1);
  });

  it('批内去重段挂载折叠区 + dup-card 类', () => {
    const notes = makeNotes(2);
    const result = makeResult(notes, {
      crossBatchDuplicates: [
        {
          similarity: 0.9,
          removedTitle: '旧',
          removedContent: '被合并内容',
          matchedNote: '新',
          matchedContent: '并入内容',
        },
      ],
    });
    const modal = new ResultModal(fakeApp(), result, undefined, async () => {});
    const contentEl = new FakeEl('div');
    (modal as unknown as { contentEl: FakeEl }).contentEl = contentEl;
    modal.onOpen();
    expect(contentEl.countByClass('atomic-notes-collapsible-header')).toBeGreaterThanOrEqual(1);
    expect(contentEl.countByClass('atomic-notes-dup-card')).toBe(1);
    expect(contentEl.countByClass('atomic-notes-restore-btn')).toBe(1);
  });

  it('疑似重复段挂载 pending-desc + decide-btn 类', () => {
    const notes = makeNotes(2);
    const result = makeResult(notes, {
      vaultDedupPending: [
        {
          noteId: 'n0',
          newNoteTitle: '新',
          newNoteContent: '内容',
          matchedNote: '旧',
          matchedContent: '旧内容',
          localSimilarity: 0.95,
          highSimilarity: true,
        },
      ],
    });
    const modal = new ResultModal(fakeApp(), result, undefined, async () => {});
    const contentEl = new FakeEl('div');
    (modal as unknown as { contentEl: FakeEl }).contentEl = contentEl;
    modal.onOpen();
    expect(contentEl.countByClass('atomic-notes-pending-desc')).toBe(1);
    expect(contentEl.countByClass('atomic-notes-decide-btn')).toBeGreaterThanOrEqual(2);
    expect(contentEl.countByClass('is-high')).toBeGreaterThanOrEqual(1);
  });
});

describe('P0 样式系统化：InputTab', () => {
  function fakePlugin(): any {
    return {
      _isExtracting: false,
      cancelExtraction: () => {},
      runExtraction: async () => {},
    };
  }

  it('render 后静态结构挂载原子类，无内联 style 破窗（display 显隐除外）', () => {
    const tab = new InputTab(fakePlugin());
    const panel = new FakeEl('div');
    const progressWrap = new FakeEl('div');
    const buttonWrap = new FakeEl('div');
    tab.render(panel as unknown as HTMLElement, progressWrap as unknown as HTMLElement, buttonWrap as unknown as HTMLElement);

    // 静态结构类
    expect(panel.countByClass('atomic-notes-subtoggle-bar')).toBe(1);
    expect(panel.countByClass('atomic-notes-subtoggle-btn')).toBe(2);
    expect(panel.countByClass('atomic-notes-meta-actions')).toBeGreaterThanOrEqual(1);
    expect(progressWrap.countByClass('atomic-notes-progress-title')).toBe(1);
    expect(progressWrap.countByClass('atomic-notes-progress-body')).toBe(1);

    // setInputSubMode('url') 会同步设 display（行为显隐），排除 display 后应无破窗
    expect(() => assertNoInlineStyleExceptDisplay(panel)).not.toThrow();
    expect(() => assertNoInlineStyleExceptDisplay(progressWrap)).not.toThrow();
  });
});
