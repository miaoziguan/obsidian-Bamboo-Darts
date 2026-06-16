/**
 * 结果展示模态框
 * 展示提炼结果、步骤时间线、去重报告、存储结果
 */

import { Modal, App, Setting } from 'obsidian';
import { AtomicNote } from '../utils/notes-standards';
import { ExtractionResult } from '../extractor';

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

    // 注入 CSS
    const styleEl = contentEl.createEl('style');
    styleEl.textContent = `
      /* 分区标题 */
      .atomic-notes-section-header{font-size:13px;font-weight:700;color:var(--text-normal);margin:16px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--background-modifier-border)}
      /* 步骤时间线 */
      .atomic-notes-timeline{position:relative;padding-left:24px;margin:4px 0}
      .atomic-notes-timeline-item{position:relative;margin-bottom:6px;padding:8px 10px;border-radius:6px;background:var(--background-secondary)}
      .atomic-notes-timeline-item:last-child{margin-bottom:0}
      .atomic-notes-timeline-dot{position:absolute;left:-20px;top:12px;width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;font-weight:bold;line-height:1}
      .atomic-notes-timeline-step{font-size:12px;font-weight:600;color:var(--text-normal);margin-bottom:2px}
      .atomic-notes-timeline-message{font-size:11px;color:var(--text-muted)}
      /* 笔记卡片 */
      .atomic-notes-card{background:var(--background-secondary);border-radius:8px;padding:10px 12px;margin:8px 0;border:1px solid var(--background-modifier-border)}
      .atomic-notes-card-header{display:flex;align-items:center;gap:8px;margin-bottom:6px}
      .atomic-notes-card-header input[type="checkbox"]{flex-shrink:0;cursor:pointer}
      .atomic-notes-card-title{font-size:14px;font-weight:600;color:var(--text-normal);flex:1}
      .atomic-notes-card-preview{font-size:12px;color:var(--text-muted);line-height:1.5;margin-bottom:6px}
      .atomic-notes-card-footer{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
      .atomic-notes-tag-chip{font-size:10px;padding:1px 8px;border-radius:10px;background:var(--background-modifier-border);color:var(--text-muted)}
      .atomic-notes-verify-chip{font-size:10px;padding:1px 8px;border-radius:10px;color:#fff}
      .atomic-notes-verify-chip.verified{background:var(--color-green)}
      .atomic-notes-verify-chip.doubtful{background:var(--color-orange)}
      .atomic-notes-verify-chip.unverified{background:var(--color-red)}
      /* 按钮栏 */
      .atomic-notes-action-bar{display:flex;gap:8px;align-items:center;margin-top:16px;padding-top:12px;border-top:1px solid var(--background-modifier-border)}
      .atomic-notes-action-bar .mod-cta{flex:1}
    `;

    // 默认全选
    this.selectedNotes = new Set(this.result.notes.map((_, i) => i));

    // 标题
    contentEl.createEl('h2', { text: '原子笔记提炼结果' });

    // 流程步骤 — 时间线样式
    this.renderSteps(contentEl);

    if (this.result.success) {
      // 去重报告
      if (this.dedupResult) {
        this.renderDedupReport(contentEl);
      }

      // 事实核查摘要
      if (this.result.factCheckSummary) {
        this.renderFactCheckSummary(contentEl);
      }

      // 笔记列表
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
      const note = this.result.notes[i] as any;
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
