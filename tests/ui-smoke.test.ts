/**
 * P2-1：UI 层冒烟测试
 *
 * 目标：确保渲染管线（renderNotesList / ResultModal）在真实调用路径下「不崩」，
 * 且核心交互（选择、保存、编辑）能正确连到 ViewModel。
 *
 * 由于 Obsidian 的 createEl API 在 node 环境无实现，这里提供一个最小可用的
 * fake DOM 节点工厂，支持渲染代码实际用到的 createEl/setText/setAttr/empty/
 * addEventListener/querySelector/style/cls 等能力，仅用于冒烟级验证。
 */
import { renderNotesList } from '../src/ui/result/notes-list';
import { ResultViewModel } from '../src/ui/result-view-model';
import { ResultModal } from '../src/ui/result-modal';
import { AtomicNote } from '../src/utils/notes-standards';
import { ExtractionResult } from '../src/extractor';

// ─── 最小 fake DOM 节点 ───

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

  set textContent(v: string) {
    this.text = v;
  }

  get textContent(): string {
    return this.text;
  }

  appendText(t: string): void {
    this.text += t;
  }

  setAttr(_k: string, _v: string): void {
    /* no-op for smoke */
  }

  empty(): void {
    this.children = [];
  }

  addEventListener(event: string, cb: () => void): void {
    (this.listeners[event] ||= []).push(cb);
  }

  querySelector(_sel: string): FakeEl | null {
    // 冒烟测试只关心「能调用」，返回第一个子节点即可
    return this.children[0] || null;
  }

  querySelectorAll(sel: string): FakeEl[] {
    const cls = sel.replace(/^\./, '');
    const out: FakeEl[] = [];
    const walk = (el: FakeEl) => {
      for (const c of el.children) {
        if (c.cls.includes(cls)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }

  /** 测试辅助：递归查找 text 含 keyword 的节点 */
  findText(keyword: string): FakeEl | null {
    if (this.text.includes(keyword)) return this;
    for (const c of this.children) {
      const found = c.findText(keyword);
      if (found) return found;
    }
    return null;
  }

  /** 测试辅助：触发某事件的所有监听器 */
  fire(event: string): void {
    (this.listeners[event] || []).forEach((cb) => cb());
  }

  /** 测试辅助：统计某 class 的子节点数量（递归，按空格分词精确匹配） */
  countByClass(cls: string): number {
    const tokens = this.cls.split(/\s+/);
    let n = tokens.includes(cls) ? 1 : 0;
    for (const c of this.children) n += c.countByClass(cls);
    return n;
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

function makeResult(notes: AtomicNote[]): ExtractionResult {
  return {
    success: true,
    notes,
    steps: [],
    detectedProfile: 'balanced',
  } as ExtractionResult;
}

describe('P2-1 UI 冒烟：renderNotesList', () => {
  it('无笔记时仍能渲染且不抛错', () => {
    const vm = new ResultViewModel(makeResult([]));
    const container = new FakeEl('div');
    const els = renderNotesList(vm, container as unknown as HTMLElement, async () => {}, () => {});
    expect(els).toBeDefined();
    expect(els.notesListEl).toBeDefined();
    expect(els.toggleBtn).toBeDefined();
  });

  it('多条笔记应渲染出对应数量的卡片', () => {
    const notes = makeNotes(3);
    const vm = new ResultViewModel(makeResult(notes));
    const container = new FakeEl('div');
    renderNotesList(vm, container as unknown as HTMLElement, async () => {}, () => {});
    // 每张卡片带 .atomic-notes-card 类
    expect(container.countByClass('atomic-notes-card')).toBe(3);
  });

  it('点击保存应回调 onSave 并传入选中的笔记', async () => {
    const notes = makeNotes(2);
    const vm = new ResultViewModel(makeResult(notes));
    const container = new FakeEl('div');
    let saved: AtomicNote[] | null = null;
    renderNotesList(
      vm,
      container as unknown as HTMLElement,
      async (n) => {
        saved = n;
      },
      () => {},
    );
    // 找到「保存」按钮（text 含 保存）并触发 click
    const saveBtn = container.findText('保存');
    expect(saveBtn).toBeDefined();
    saveBtn!.fire('click');
    await new Promise((r) => setTimeout(r, 0));
    expect(saved).not.toBeNull();
    expect(saved!.length).toBe(2);
  });

  it('内容含核查/标签时应渲染对应区块不崩', () => {
    const notes = makeNotes(1).map((n) => ({
      ...n,
      verification: [{ claim: '声明', status: '已溯源' as const, sourceText: '来源' }],
    }));
    const vm = new ResultViewModel(makeResult(notes));
    const container = new FakeEl('div');
    expect(() =>
      renderNotesList(vm, container as unknown as HTMLElement, async () => {}, () => {}),
    ).not.toThrow();
  });
});

describe('P2-1 UI 冒烟：ResultModal', () => {
  function fakeApp(): any {
    return {
      vault: { getAbstractFileByPath: () => null },
      workspace: { getActiveViewOfType: () => null },
    };
  }

  it('构建并 onOpen 不抛错（注入 fake contentEl）', () => {
    const notes = makeNotes(2);
    const vm = new ResultViewModel(makeResult(notes));
    const modal = new ResultModal(fakeApp(), makeResult(notes), undefined, async () => {});
    // Modal mock 的 contentEl 为 {}，替换为可渲染的 fake 节点
    (modal as unknown as { contentEl: FakeEl }).contentEl = new FakeEl('div');
    expect(() => (modal as unknown as { onOpen: () => void }).onOpen()).not.toThrow();
  });
});
