/**
 * 结果展示模态框
 * 展示提炼结果、步骤时间线、去重报告、存储结果
 */

import { Modal, App, Setting } from 'obsidian';
import { AtomicNote } from '../utils/notes-standards';
import { ExtractionResult, PendingDuplicate } from '../extractor';

interface DedupResult {
  uniqueNotes: AtomicNote[];
  duplicates: { isDuplicate: boolean; similarity: number; matchedNote?: string; matchedContent?: string }[];
}

/** 步骤状态对应的颜色 */
const STEP_COLORS: Record<string, string> = {
  success: 'var(--color-green)',
  failed: 'var(--color-red)',
  skipped: 'var(--text-faint)',
};
const STEP_ICONS: Record<string, string> = {
  success: '✓',
  failed: '✗',
  skipped: '—',
};

export class ResultModal extends Modal {
  private result: ExtractionResult;
  private dedupResult?: DedupResult;
  private onSave: (notes: AtomicNote[]) => Promise<void>;
  private selectedNotes: Set<number> = new Set();
  private countEl: HTMLElement | null = null;
  /** 用户确认保留的疑似重复索引 */
  private confirmedPending: Set<number> = new Set();

  constructor(
    app: App,
    result: ExtractionResult,
    dedupResult?: DedupResult,
    onSave?: (notes: AtomicNote[]) => Promise<void>
  ) {
    super(app);
    this.result = result;
    this.dedupResult = dedupResult;
    this.onSave = onSave || (async () => {});
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: '原子笔记提炼结果' });

    this.renderSteps(contentEl);

    if (this.result.success && this.result.notes) {
      this.selectedNotes = new Set(this.result.notes.map((_, i) => i));

      if (this.dedupResult) {
        this.renderDedupReport(contentEl);
      }

      if (this.result.vaultDedupPending && this.result.vaultDedupPending.length > 0) {
        this.renderPendingDuplicates(contentEl);
      }

      if (this.result.factCheckSummary) {
        this.renderFactCheckSummary(contentEl);
      }

      if (this.result.dataCheckSummary) {
        this.renderDataCheckSummary(contentEl);
      }

      this.renderNotes(contentEl);
    } else {
      const errEl = contentEl.createEl('p', { cls: 'atomic-notes-error' });
      errEl.createEl('strong', { text: '提炼失败：' });
      if (this.result.error?.includes('[诊断]')) {
        const pre = errEl.createEl('pre', { cls: 'atomic-notes-diag', text: this.result.error });
        pre.style.whiteSpace = 'pre-wrap';
        pre.style.wordWrap = 'break-word';
        pre.style.maxHeight = '400px';
        pre.style.overflowY = 'auto';
        pre.style.fontSize = '12px';
        pre.style.background = 'var(--background-secondary)';
        pre.style.padding = '10px';
        pre.style.borderRadius = '6px';
        pre.style.marginTop = '8px';
      } else {
        errEl.appendText(this.result.error || '');
      }
    }

    // 操作按钮
    this.renderActions(contentEl);
  }

  /** 时间线样式步骤展示 */
  private renderSteps(container: HTMLElement) {
    container.createEl('div', { text: '处理流程', cls: 'atomic-notes-section-header' });

    const timeline = container.createEl('div', { cls: 'atomic-notes-timeline' });

    for (const step of this.result.steps) {
      const item = timeline.createEl('div', { cls: 'atomic-notes-timeline-item' });

      // 状态圆点
      const dot = item.createEl('div', { cls: 'atomic-notes-timeline-dot' });
      dot.style.background = STEP_COLORS[step.status] || 'var(--text-faint)';
      dot.setText(STEP_ICONS[step.status] || '?');

      // 内容
      item.createEl('div', { cls: 'atomic-notes-timeline-step', text: step.step });
      item.createEl('div', { cls: 'atomic-notes-timeline-message', text: step.message });
    }
  }

  private renderDedupReport(container: HTMLElement) {
    if (!this.dedupResult) return;

    const reportEl = container.createEl('div', { cls: 'atomic-notes-dedup-report' });
    reportEl.createEl('div', { text: '去重报告', cls: 'atomic-notes-section-header' });

    if (this.dedupResult.duplicates.length === 0) {
      reportEl.createEl('p', {
        text: '未检测到与知识库重复的笔记',
        attr: { style: 'color:var(--text-muted)' },
      });
    } else {
      reportEl.createEl('p', {
        text: `检测到 ${this.dedupResult.duplicates.length} 条可能重复的笔记：`,
      });
      const dupList = reportEl.createEl('ul');
      for (const dup of this.dedupResult.duplicates) {
        dupList.createEl('li').setText(
          `相似度：${(dup.similarity * 100).toFixed(1)}% | 匹配：${dup.matchedNote || '未知'}`
        );
      }
    }

    reportEl.createEl('p', {
      text: `最终保存 ${this.dedupResult.uniqueNotes.length} 条笔记`,
      attr: { style: 'font-weight:600;color:var(--text-accent)' },
    });
  }

  /** 疑似重复确认 UI（中相似度 60-80%） */
  private renderPendingDuplicates(container: HTMLElement) {
    const pending = this.result.vaultDedupPending;
    if (!pending || pending.length === 0) return;

    const section = container.createEl('div', { cls: 'atomic-notes-pending-dedup' });
    section.createEl('div', { text: '⚠️ 疑似重复笔记（需确认）', cls: 'atomic-notes-section-header' });

    section.createEl('p', {
      text: `发现 ${pending.length} 条笔记与知识库已有笔记相似度较高（60%-80%），请逐一确认是否保留：`,
      attr: { style: 'color:var(--text-muted);font-size:13px' },
    });

    for (const item of pending) {
      const card = section.createEl('div', {
        attr: {
          style: 'border:1px solid var(--background-modifier-border);border-radius:8px;padding:12px;margin-bottom:10px;background:var(--background-secondary)',
        },
      });

      // 相似度提示
      const simPercent = (item.similarity * 100).toFixed(1);
      card.createEl('div', {
        text: `相似度 ${simPercent}%`,
        attr: { style: 'font-size:12px;color:var(--text-accent);font-weight:600;margin-bottom:6px' },
      });

      // 新笔记信息
      const newNoteDiv = card.createEl('div');
      newNoteDiv.createEl('span', {
        text: '新笔记：',
        attr: { style: 'font-weight:600;font-size:13px' },
      });
      newNoteDiv.createEl('span', {
        text: item.newNoteTitle,
        attr: { style: 'font-size:13px' },
      });
      const newPreview = item.newNoteContent.slice(0, 120) + (item.newNoteContent.length > 120 ? '...' : '');
      card.createEl('div', {
        text: newPreview,
        attr: { style: 'font-size:12px;color:var(--text-muted);margin:4px 0 8px' },
      });

      // 已有笔记信息
      const existingDiv = card.createEl('div');
      existingDiv.createEl('span', {
        text: '已有笔记：',
        attr: { style: 'font-weight:600;font-size:13px' },
      });
      existingDiv.createEl('span', {
        text: item.matchedNote,
        attr: { style: 'font-size:13px' },
      });
      card.createEl('div', {
        text: item.matchedContent,
        attr: { style: 'font-size:12px;color:var(--text-muted);margin:4px 0 8px' },
      });

      // 操作按钮
      const btnRow = card.createEl('div', {
        attr: { style: 'display:flex;gap:8px;justify-content:flex-end' },
      });

      const keepBtn = btnRow.createEl('button', {
        text: '保留新笔记',
        attr: { style: 'font-size:12px;padding:4px 12px;cursor:pointer' },
      });
      keepBtn.addEventListener('click', () => {
        this.confirmedPending.add(item.newNoteIndex);
        card.style.opacity = '0.5';
        keepBtn.setText('已保留');
        keepBtn.setAttribute('disabled', 'true');
        discardBtn.setAttribute('disabled', 'true');
      });

      const discardBtn = btnRow.createEl('button', {
        text: '丢弃新笔记',
        attr: { style: 'font-size:12px;padding:4px 12px;cursor:pointer' },
      });
      discardBtn.addEventListener('click', () => {
        this.confirmedPending.delete(item.newNoteIndex);
        this.selectedNotes.delete(item.newNoteIndex);
        card.style.opacity = '0.5';
        discardBtn.setText('已丢弃');
        discardBtn.setAttribute('disabled', 'true');
        keepBtn.setAttribute('disabled', 'true');
        this.updateSelectionCount();
      });
    }

    // 一键操作
    const quickActions = section.createEl('div', {
      attr: { style: 'display:flex;gap:8px;margin-top:8px' },
    });
    const keepAllBtn = quickActions.createEl('button', {
      text: '全部保留',
      attr: { style: 'font-size:12px;padding:4px 12px;cursor:pointer' },
    });
    keepAllBtn.addEventListener('click', () => {
      for (const item of pending) {
        this.confirmedPending.add(item.newNoteIndex);
      }
      this.renderPendingDuplicates(container);
    });

    const discardAllBtn = quickActions.createEl('button', {
      text: '全部丢弃',
      attr: { style: 'font-size:12px;padding:4px 12px;cursor:pointer' },
    });
    discardAllBtn.addEventListener('click', () => {
      for (const item of pending) {
        this.selectedNotes.delete(item.newNoteIndex);
      }
      this.renderPendingDuplicates(container);
      this.updateSelectionCount();
    });
  }

  private renderFactCheckSummary(container: HTMLElement) {
    const summary = this.result.factCheckSummary;
    if (!summary) return;

    const el = container.createEl('div');
    el.createEl('div', { text: '事实核查摘要', cls: 'atomic-notes-section-header' });

    const total = summary.verified + summary.doubtful + summary.unverified;
    if (total === 0) {
      el.createEl('p', { text: '无可核实的声明', attr: { style: 'color:var(--text-muted)' } });
      return;
    }

    const row = el.createEl('div', { attr: { style: 'display:flex;gap:12px;align-items:center' } });
    row.createEl('span', {
      text: `有据 ${summary.verified}`,
      cls: 'atomic-notes-verify-chip verified',
    });
    row.createEl('span', {
      text: `存疑 ${summary.doubtful}`,
      cls: 'atomic-notes-verify-chip doubtful',
    });
    row.createEl('span', {
      text: `无据 ${summary.unverified}`,
      cls: 'atomic-notes-verify-chip unverified',
    });
  }

  private renderDataCheckSummary(container: HTMLElement) {
    const summary = this.result.dataCheckSummary;
    if (!summary) return;

    const el = container.createEl('div');
    el.createEl('div', { text: '数据核查摘要', cls: 'atomic-notes-section-header' });

    const total = summary.consistent + summary.deviation + summary.unverifiable;
    if (total === 0) {
      el.createEl('p', { text: '未发现数据点', attr: { style: 'color:var(--text-muted)' } });
      return;
    }

    const row = el.createEl('div', { attr: { style: 'display:flex;gap:12px;align-items:center' } });
    row.createEl('span', {
      text: `数据一致 ${summary.consistent}`,
      cls: 'atomic-notes-verify-chip verified',
    });
    row.createEl('span', {
      text: `数据偏差 ${summary.deviation}`,
      cls: 'atomic-notes-verify-chip doubtful',
    });
    row.createEl('span', {
      text: `无法验证 ${summary.unverifiable}`,
      cls: 'atomic-notes-verify-chip unverified',
    });
  }

  /** 卡片式笔记列表 */
  private renderNotes(container: HTMLElement) {
    const notesEl = container.createEl('div');
    const headerEl = notesEl.createEl('div', {
      attr: { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px' },
    });
    headerEl.createEl('h3', {
      text: `提炼结果（${this.result.notes.length} 条）`,
      attr: { style: 'margin:0' },
    });

    // 全选/取消全选
    const toggleBtn = headerEl.createEl('button', {
      text: '取消全选',
      attr: { style: 'font-size:11px;padding:2px 8px;cursor:pointer' },
    });
    toggleBtn.addEventListener('click', () => {
      if (this.selectedNotes.size === this.result.notes.length) {
        this.selectedNotes.clear();
        toggleBtn.setText('全选');
      } else {
        this.selectedNotes = new Set(this.result.notes.map((_, i) => i));
        toggleBtn.setText('取消全选');
      }
      this.updateSelectionCount();
    });

    for (let i = 0; i < this.result.notes.length; i++) {
      const note = this.result.notes[i];
      const card = notesEl.createEl('div', { cls: 'atomic-notes-card' });

      // ── 标题行：复选框 + 标题 + 核查徽标 ──
      const headerRow = card.createEl('div', { cls: 'atomic-notes-card-header' });

      const checkbox = headerRow.createEl('input', {
        attr: { type: 'checkbox' },
      }) as HTMLInputElement;
      checkbox.checked = true;
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) this.selectedNotes.add(i);
        else this.selectedNotes.delete(i);
        this.updateSelectionCount();
      });

      headerRow.createEl('span', {
        cls: 'atomic-notes-card-title',
        text: `${i + 1}. ${note.title}`,
      });

      // 核查状态 chip
      if (note.verification && note.verification.length > 0) {
        if (note.unverifiedCount > 0) {
          headerRow.createEl('span', { cls: 'atomic-notes-verify-chip unverified', text: '无据' });
        } else if (note.doubtfulCount > 0) {
          headerRow.createEl('span', { cls: 'atomic-notes-verify-chip doubtful', text: '存疑' });
        } else {
          headerRow.createEl('span', { cls: 'atomic-notes-verify-chip verified', text: '已核实' });
        }
      }

      // 数据核查 chip
      if (note.dataCheck && note.dataCheck.length > 0) {
        if ((note.dataDeviationCount ?? 0) > 0) {
          headerRow.createEl('span', { cls: 'atomic-notes-data-chip deviation', text: '数据偏差' });
        } else {
          headerRow.createEl('span', { cls: 'atomic-notes-data-chip consistent', text: '数据一致' });
        }
      }

      // ── 预览 ──
      const preview = note.content.slice(0, 200) + (note.content.length > 200 ? '...' : '');
      card.createEl('div', { cls: 'atomic-notes-card-preview', text: preview });

      // ── 标签 chip ──
      if (note.tags && note.tags.length > 0) {
        const footer = card.createEl('div', { cls: 'atomic-notes-card-footer' });
        for (const tag of note.tags) {
          footer.createEl('span', { cls: 'atomic-notes-tag-chip', text: tag });
        }
      }
    }
  }

  private renderActions(container: HTMLElement) {
    if (!this.result.success || this.result.notes.length === 0) {
      // 仅有关闭按钮
      new Setting(container).addButton(btn =>
        btn.setButtonText('关闭').onClick(() => this.close())
      );
      return;
    }

    // 选中数量
    this.countEl = container.createEl('p', {
      text: `已选 ${this.selectedNotes.size} / ${this.result.notes.length} 条`,
      attr: { style: 'font-size:12px;color:var(--text-muted);margin:8px 0' },
    });

    // 按钮栏
    const bar = container.createEl('div', { cls: 'atomic-notes-action-bar' });
    bar.createEl('button', { text: '保存选中笔记', cls: 'mod-cta' })
      .addEventListener('click', async () => {
        const selected = this.result.notes.filter((_, i) => this.selectedNotes.has(i));
        if (selected.length === 0) return;
        await this.onSave(selected);
        this.close();
      });
    bar.createEl('button', { text: '关闭' })
      .addEventListener('click', () => this.close());
  }

  private updateSelectionCount() {
    if (this.countEl) {
      this.countEl.setText(`已选 ${this.selectedNotes.size} / ${this.result.notes.length} 条`);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
