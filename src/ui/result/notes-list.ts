/**
 * 笔记列表渲染器
 *
 * 负责渲染提炼结果中的笔记卡片列表，包含：
 * - 筛选工具栏（全部 / 有问题 / 已溯源 + 搜索）
 * - 全选/取消全选
 * - 笔记卡片：标题、预览（可展开）、核查详情（可折叠）、标签、编辑
 * - 批内去重详情（可折叠，支持恢复）
 *
 * 从 ResultModal 中拆分出来，减少单文件复杂度。
 */

import { ResultViewModel, FilterMode } from '../result-view-model';
import { AtomicNote } from '../../utils/notes-standards';

export interface NotesListElements {
  /** 整个笔记列表容器元素 */
  notesListEl: HTMLElement;
  /** 卡片容器 */
  cardsContainerEl: HTMLElement;
  /** 倒计时文案元素 */
  countEl: HTMLElement;
  /** 全选/取消全选按钮 */
  toggleBtn: HTMLButtonElement;
  /** 筛选按钮 Map */
  filterBtnEls: Record<string, HTMLButtonElement>;
}

/**
 * 渲染笔记列表（头部 + 筛选栏 + 卡片容器）
 */
export function renderNotesList(
  vm: ResultViewModel,
  container: HTMLElement,
  onSave: (notes: AtomicNote[]) => Promise<void>,
  onClose: () => void,
): NotesListElements {
  const notesEl = container.createEl('div');

  const headerEl = notesEl.createEl('div', {
    attr: {
      style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px',
    },
  });
  headerEl.createEl('h3', {
    text: `提炼结果（${vm.result.notes.length} 条）`,
    attr: { style: 'margin:0' },
  });

  // 全选/取消全选
  const toggleBtn = headerEl.createEl('button', {
    text: '取消全选',
    attr: { style: 'font-size:11px;padding:2px 8px;cursor:pointer' },
  }) as HTMLButtonElement;
  toggleBtn.addEventListener('click', () => {
    vm.toggleAll();
    updateSelectionSync(vm, notesEl, toggleBtn);
  });

  // ── 筛选栏 + 搜索框 ──
  const toolbar = notesEl.createEl('div', {
    attr: { style: 'display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap' },
  });

  const filterGroup = toolbar.createEl('div', { attr: { style: 'display:flex;gap:4px' } });

  const filterBtns: { mode: FilterMode; label: string }[] = [
    { mode: 'all', label: '全部' },
    { mode: 'issues', label: '有问题' },
    { mode: 'traced', label: '已溯源' },
  ];

  const filterBtnEls: Record<string, HTMLButtonElement> = {};

  for (const { mode, label } of filterBtns) {
    const counts = vm.filterCounts;
    const count = counts[mode];

    const btn = filterGroup.createEl('button', {
      text: `${label}${count > 0 ? ` (${count})` : ''}`,
      attr: {
        style: `font-size:11px;padding:3px 10px;cursor:pointer;border-radius:6px;border:1px solid var(--background-modifier-border);background:${vm.filterMode === mode ? 'var(--interactive-accent)' : 'var(--background-secondary)'};color:${vm.filterMode === mode ? 'var(--text-on-accent)' : 'var(--text-muted)'}`,
      },
    }) as HTMLButtonElement;
    btn.addEventListener('click', () => {
      vm.setFilterMode(mode);
      for (const [m, b] of Object.entries(filterBtnEls)) {
        const isActive = m === mode;
        b.style.background = isActive ? 'var(--interactive-accent)' : 'var(--background-secondary)';
        b.style.color = isActive ? 'var(--text-on-accent)' : 'var(--text-muted)';
      }
      refreshCards(vm, notesEl);
    });
    filterBtnEls[mode] = btn;
  }

  // 搜索框
  const searchInput = toolbar.createEl('input', {
    attr: {
      type: 'text',
      placeholder: '搜索标题或内容...',
      style:
        'flex:1;min-width:120px;font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid var(--background-modifier-border);background:var(--background-primary)',
    },
  }) as HTMLInputElement;
  searchInput.addEventListener('input', () => {
    vm.setSearchQuery(searchInput.value.trim());
    refreshCards(vm, notesEl);
  });

  // 卡片容器
  const cardsContainerEl = notesEl.createEl('div', { cls: 'atomic-notes-cards-container' });
  renderNoteCards(vm, cardsContainerEl);

  // 选中数量
  const countEl = container.createEl('p', {
    text: `已选 ${vm.selectedNotes.size} / ${vm.result.notes.length} 条`,
    attr: { style: 'font-size:12px;color:var(--text-muted);margin:8px 0' },
  });

  // 操作按钮
  renderActions(vm, container, onSave, onClose, notesEl);

  return { notesListEl: notesEl, cardsContainerEl, countEl, toggleBtn, filterBtnEls };
}

/** 保存/关闭按钮 */
function renderActions(
  vm: ResultViewModel,
  container: HTMLElement,
  onSave: (notes: AtomicNote[]) => Promise<void>,
  onClose: () => void,
  notesListEl: HTMLElement,
): void {
  const bar = container.createEl('div', { cls: 'atomic-notes-action-bar' });
  bar
    .createEl('button', { text: '保存选中笔记', cls: 'mod-cta' })
    .addEventListener('click', async () => {
      // 自动应用所有未提交的编辑
      const openPanels = notesListEl.querySelectorAll('.atomic-notes-edit-panel');
      for (const panel of openPanels) {
        const panelEl = panel as HTMLElement;
        if (panelEl.style.display !== 'none') {
          const applyBtn = panelEl.querySelector('.atomic-notes-apply-edit-btn') as HTMLElement;
          if (applyBtn) applyBtn.click();
        }
      }

      const selected = vm.getSelectedNotes();
      if (selected.length === 0) return;
      await onSave(selected);
      onClose();
    });
  bar.createEl('button', { text: '关闭' }).addEventListener('click', () => {
    if (vm.selectedNotes.size > 0) {
      if (!confirm(`还有 ${vm.selectedNotes.size} 条笔记未保存，确定关闭？`)) return;
    }
    onClose();
  });
}

/** 同步选中状态到 UI */
function updateSelectionSync(vm: ResultViewModel, notesListEl: HTMLElement, toggleBtn: HTMLButtonElement): void {
  const countEl = notesListEl.parentElement?.querySelector('p');
  if (countEl) {
    countEl.textContent = `已选 ${vm.selectedNotes.size} / ${vm.result.notes.length} 条`;
  }

  const checkboxes = notesListEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  for (const cb of checkboxes) {
    const idx = parseInt(cb.dataset.noteIndex || '', 10);
    cb.checked = vm.selectedNotes.has(idx);
  }

  toggleBtn.setText(
    vm.selectedNotes.size === vm.result.notes.length ? '取消全选' : '全选',
  );
}

/** 仅刷新卡片区域（不重建工具栏） */
export function refreshCards(vm: ResultViewModel, notesListEl: HTMLElement): void {
  const cardsContainer = notesListEl.querySelector('.atomic-notes-cards-container') as HTMLElement;
  if (!cardsContainer) return;
  cardsContainer.empty();
  renderNoteCards(vm, cardsContainer);
}

/** 渲染笔记卡片 */
export function renderNoteCards(vm: ResultViewModel, container: HTMLElement): void {
  const visibleIndices: number[] = [];
  for (let i = 0; i < vm.result.notes.length; i++) {
    if (vm.noteMatchesFilter(i) && vm.noteMatchesSearch(i)) {
      visibleIndices.push(i);
    }
  }

  if (visibleIndices.length === 0) {
    container.createEl('div', {
      text: '📭 没有匹配的笔记',
      attr: { style: 'color:var(--text-muted);font-size:13px;padding:20px 0;text-align:center' },
    });
    return;
  }

  for (const i of visibleIndices) {
    renderNoteCard(vm, container, i);
  }
}

/** 渲染单张笔记卡片 */
function renderNoteCard(vm: ResultViewModel, container: HTMLElement, i: number): void {
  const note = vm.result.notes[i];
  const card = container.createEl('div', { cls: 'atomic-notes-card' });

  // ── 标题行 ──
  const headerRow = card.createEl('div', { cls: 'atomic-notes-card-header' });

  const checkbox = headerRow.createEl('input', {
    attr: { type: 'checkbox', 'data-note-index': String(i) },
  }) as HTMLInputElement;
  checkbox.checked = vm.selectedNotes.has(i);
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) vm.selectedNotes.add(i);
    else vm.selectedNotes.delete(i);

    const notesListEl = container.closest('.atomic-notes-cards-container')?.parentElement;
    if (notesListEl) {
      const parentContainer = notesListEl.parentElement;
      if (parentContainer) {
        const countEl = parentContainer.querySelector('p');
        if (countEl) {
          countEl.textContent = `已选 ${vm.selectedNotes.size} / ${vm.result.notes.length} 条`;
        }
      }
      const toggleBtn = notesListEl.querySelector('button') as HTMLButtonElement;
      if (toggleBtn) {
        toggleBtn.setText(
          vm.selectedNotes.size === vm.result.notes.length ? '取消全选' : '全选',
        );
      }
    }
  });

  headerRow.createEl('span', {
    cls: 'atomic-notes-card-title',
    text: `${i + 1}. ${note.title}`,
  });

  // 核查状态 chip
  if (note.verification && note.verification.length > 0) {
    const traced = note.tracedCount ?? 0;
    const needsCompare = note.needsCompareCount ?? 0;
    const outOfScope = note.outOfScopeCount ?? 0;
    const chipGroup = headerRow.createEl('span', {
      attr: { style: 'display:inline-flex;gap:4px;margin-left:auto' },
    });
    if (traced > 0) chipGroup.createEl('span', { cls: 'atomic-notes-verify-chip verified', text: `溯源${traced}` });
    if (needsCompare > 0) chipGroup.createEl('span', { cls: 'atomic-notes-verify-chip doubtful', text: `对比${needsCompare}` });
    if (outOfScope > 0) chipGroup.createEl('span', { cls: 'atomic-notes-verify-chip unverified', text: `超源${outOfScope}` });
  }

  // ── 预览（可展开）──
  renderExpandablePreview(card, note);

  // ── 核查详情（可折叠）──
  renderVerificationDetail(card, note);

  // ── 标签 / 综合判断 ──
  renderCardFooter(card, vm, note, i);

  // ── 编辑按钮 ──
  renderEditSection(card, vm, note, i);
}

/** 可展开预览 */
function renderExpandablePreview(card: HTMLElement, note: AtomicNote): void {
  const isLong = note.content.length > 200;
  const previewText = isLong ? note.content.slice(0, 200) + '...' : note.content;
  const previewEl = card.createEl('div', { cls: 'atomic-notes-card-preview', text: previewText });
  let expandHint: HTMLElement | null = null;
  if (isLong) {
    previewEl.setAttr('title', '点击展开/收起全文');
    previewEl.style.cursor = 'pointer';
    expandHint = card.createEl('span', {
      text: '展开全文 ▼',
      attr: { style: 'font-size:10px;color:var(--text-faint);cursor:pointer;user-select:none' },
    });
    let expanded = false;
    const toggleExpand = () => {
      expanded = !expanded;
      previewEl.setText(expanded ? note.content : previewText);
      if (expandHint) expandHint.setText(expanded ? '收起 ▲' : '展开全文 ▼');
    };
    previewEl.addEventListener('click', toggleExpand);
    expandHint.addEventListener('click', toggleExpand);
  }
}

/** 核查详情（可折叠） */
function renderVerificationDetail(card: HTMLElement, note: AtomicNote): void {
  if (!note.verification || note.verification.length === 0) return;

  const verifySection = card.createEl('div', { attr: { style: 'margin-top:6px' } });
  const verifyHeader = verifySection.createEl('div', {
    attr: { style: 'display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;padding:2px 0' },
  });
  const verifyArrow = verifyHeader.createEl('span', {
    text: '▸',
    attr: { style: 'font-size:10px;transition:transform 0.2s;display:inline-block;color:var(--text-muted)' },
  });
  verifyHeader.createEl('span', {
    text: '核查详情',
    attr: { style: 'font-size:11px;color:var(--text-accent);font-weight:600' },
  });

  const verifyBody = verifySection.createEl('div', {
    attr: { style: 'display:none;margin-top:6px;border-left:2px solid var(--background-modifier-border);padding-left:10px' },
  });

  let verifyOpen = false;
  verifyHeader.addEventListener('click', () => {
    verifyOpen = !verifyOpen;
    verifyBody.style.display = verifyOpen ? 'block' : 'none';
    verifyArrow.style.transform = verifyOpen ? 'rotate(90deg)' : 'rotate(0deg)';
  });

  const statusColorMap: Record<string, string> = {
    已溯源: 'var(--color-green)',
    需对比: 'var(--color-orange)',
    超源: 'var(--color-red)',
  };

  for (const item of note.verification) {
    const row = verifyBody.createEl('div', { attr: { style: 'margin-bottom:8px' } });
    const claimRow = row.createEl('div', { attr: { style: 'display:flex;align-items:flex-start;gap:6px' } });
    claimRow.createEl('span', {
      text: item.status,
      attr: { style: `font-size:9px;padding:1px 6px;border-radius:8px;color:#fff;background:${statusColorMap[item.status] || 'var(--text-faint)'};white-space:nowrap;flex-shrink:0;margin-top:1px` },
    });
    claimRow.createEl('span', { text: item.claim, attr: { style: 'font-size:11px;color:var(--text-normal);line-height:1.4' } });

    if (item.sourceText) {
      row.createEl('div', {
        text: `📖 ${item.sourceText}`,
        attr: { style: 'font-size:10px;color:var(--text-muted);margin-top:3px;padding:4px 6px;background:var(--background-secondary);border-radius:4px;line-height:1.4' },
      });
    }
    if (item.diffNote) {
      row.createEl('div', { text: `⚠ ${item.diffNote}`, attr: { style: 'font-size:10px;color:var(--color-orange);margin-top:2px' } });
    }
    if (item.reason && !item.sourceText) {
      row.createEl('div', { text: item.reason, attr: { style: 'font-size:10px;color:var(--text-faint);margin-top:2px;font-style:italic' } });
    }
  }
}

/** 标签或综合判断 */
function renderCardFooter(card: HTMLElement, vm: ResultViewModel, note: AtomicNote, i: number): void {
  if (note.tags && note.tags.length > 0) {
    const footer = card.createEl('div', { cls: 'atomic-notes-card-footer' });
    for (const tag of note.tags) {
      footer.createEl('span', { cls: 'atomic-notes-tag-chip', text: tag });
    }
  } else {
    const footer = card.createEl('div', { cls: 'atomic-notes-card-footer' });
    const { label: synthLabel, color: synthColor } = vm.noteSynthLabel(i);
    footer.createEl('span', {
      text: synthLabel,
      attr: { style: `font-size:10px;padding:2px 8px;border-radius:10px;color:#fff;background:${synthColor};font-style:italic` },
    });
  }
}

/** 编辑按钮 + 编辑面板 */
function renderEditSection(card: HTMLElement, vm: ResultViewModel, note: AtomicNote, i: number): void {
  const editSection = card.createEl('div', { attr: { style: 'margin-top:8px' } });
  const editBtn = editSection.createEl('button', {
    text: '✎ 编辑',
    attr: { style: 'font-size:11px;padding:2px 10px;cursor:pointer;background:var(--background-primary);border:1px solid var(--background-modifier-border);border-radius:4px;color:var(--text-muted)' },
  });
  const editPanel = editSection.createEl('div', {
    cls: 'atomic-notes-edit-panel',
    attr: { style: 'display:none;margin-top:8px' },
  });

  let isEditing = false;
  editBtn.addEventListener('click', () => {
    isEditing = !isEditing;
    if (isEditing) {
      renderEditPanel(editPanel, card, vm, note, i);
      editPanel.style.display = 'block';
      editBtn.setText('✎ 收起编辑');
    } else {
      editPanel.style.display = 'none';
      editBtn.setText('✎ 编辑');
    }
  });
}

/** 编辑面板 */
function renderEditPanel(editPanel: HTMLElement, card: HTMLElement, vm: ResultViewModel, note: AtomicNote, i: number): void {
  editPanel.empty();
  editPanel.createEl('label', { text: '标题', attr: { style: 'font-size:11px;color:var(--text-muted);display:block;margin-bottom:2px' } });
  const titleInput = editPanel.createEl('input', {
    attr: { type: 'text', value: note.title, style: 'width:100%;font-size:13px;padding:4px 8px;border:1px solid var(--background-modifier-border);border-radius:4px;margin-bottom:8px;box-sizing:border-box' },
  }) as HTMLInputElement;
  editPanel.createEl('label', { text: '内容', attr: { style: 'font-size:11px;color:var(--text-muted);display:block;margin-bottom:2px' } });
  const contentInput = editPanel.createEl('textarea', {
    text: note.content,
    attr: { style: 'width:100%;min-height:100px;font-size:12px;padding:6px 8px;border:1px solid var(--background-modifier-border);border-radius:4px;margin-bottom:8px;box-sizing:border-box;resize:vertical;font-family:var(--font-text)' },
  }) as HTMLTextAreaElement;
  const applyBtn = editPanel.createEl('button', {
    text: '✓ 应用修改',
    cls: 'atomic-notes-apply-edit-btn',
    attr: { style: 'float:right;font-size:12px;padding:4px 10px;cursor:pointer;background:var(--text-error);color:#fff;border:1px solid var(--text-error);border-radius:4px;font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,0.15)' },
  });
  editPanel.createEl('div', { attr: { style: 'clear:both' } });

  applyBtn.addEventListener('click', () => {
    const newTitle = titleInput.value.trim() || note.title;
    const newContent = contentInput.value.trim() || note.content;
    vm.editNote(i, newTitle, newContent);
    editPanel.style.display = 'none';
    // 更新卡片标题
    const titleEl = card.querySelector('.atomic-notes-card-title') as HTMLElement;
    if (titleEl) titleEl.setText(`${i + 1}. ${note.title}`);
  });
}
