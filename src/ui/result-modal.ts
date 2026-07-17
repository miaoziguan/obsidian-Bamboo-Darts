/**
 * 结果展示模态框
 *
 * 职责：Modal 生命周期 + 各段渲染编排。
 * 各段具体渲染逻辑已拆分至 src/ui/result/ 子模块。
 */

import { Modal, App } from 'obsidian';
import { AtomicNote } from '../utils/notes-standards';
import { ExtractionResult } from '../extractor';
import { DedupResult } from '../deduplicator';
import { ResultViewModel } from './result-view-model';
import {
  renderSteps,
  renderGateWarnings,
  renderDedupReport,
  renderVerificationSummary,
  renderReviewSummary,
} from './result/result-report';
import {
  renderNotesList,
  refreshCards as refreshNoteCards,
  NotesListElements,
} from './result/notes-list';

export class ResultModal extends Modal {
  private vm: ResultViewModel;
  private onSave: (notes: AtomicNote[]) => Promise<void>;
  private notesEls: NotesListElements | null = null;

  constructor(
    app: App,
    result: ExtractionResult,
    dedupResult?: DedupResult,
    onSave?: (notes: AtomicNote[]) => Promise<void>,
  ) {
    super(app);
    this.vm = new ResultViewModel(result, dedupResult);
    this.onSave = onSave || (async () => {});
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: '原子笔记提炼结果' });

    // 策略徽标
    if (this.vm.profileLabel) {
      contentEl.createEl('div', {
        cls: 'atomic-notes-profile-badge',
        text: this.vm.profileLabel,
      });
    }

    // 步骤时间线
    renderSteps(this.vm, contentEl);

    // 门控警告
    if (this.vm.result.success && this.vm.result.gateWarnings && this.vm.result.gateWarnings.length > 0) {
      renderGateWarnings(this.vm, contentEl);
    }

    // 语义去重跳过提示
    if (this.vm.result.semanticDedupSkipped) {
      const box = contentEl.createEl('div', { cls: 'atomic-notes-info-box' });
      box.createEl('span', { text: 'ℹ️ ', cls: 'atomic-notes-info-icon' });
      box.createEl('span', { text: '向量索引构建中，本次未启用语义去重。仅使用本地算法比对。' });
    }

    if (this.vm.result.success && this.vm.result.notes) {
      // 去重报告
      if (this.vm.dedupResult) {
        renderDedupReport(this.vm, contentEl);
      }

      // 批内去重详情（保留在 result-modal 中，因为涉及 restore 交互）
      if (this.vm.result.crossBatchDuplicates && this.vm.result.crossBatchDuplicates.length > 0) {
        this.renderCrossBatchDetails(contentEl);
      }

      // 疑似重复确认
      if (this.vm.result.vaultDedupPending && this.vm.result.vaultDedupPending.length > 0) {
        this.renderPendingDuplicates(contentEl);
      }

      // 核查摘要
      if (this.vm.result.verificationSummary) {
        renderVerificationSummary(this.vm, contentEl);
      }

      // 复查评分
      if (this.vm.result.reviewDetails && this.vm.result.reviewDetails.length > 0) {
        renderReviewSummary(this.vm, contentEl);
      }

      // 笔记列表（委托给 notes-list 渲染器）
      this.notesEls = renderNotesList(
        this.vm,
        contentEl,
        this.onSave,
        () => this.close(),
      );
    } else {
      const errEl = contentEl.createEl('p', { cls: 'atomic-notes-error' });
      errEl.createEl('strong', { text: '提炼失败：' });
      if (this.vm.result.error?.includes('[诊断]')) {
        errEl.createEl('pre', { cls: 'atomic-notes-diag', text: this.vm.result.error });
      } else {
        errEl.appendText(this.vm.result.error || '');
      }
    }
  }

  // ─── 批内去重详情（含恢复交互，保留在 Modal 中） ───

  private renderCrossBatchDetails(container: HTMLElement) {
    const dups = this.vm.result.crossBatchDuplicates;
    if (!dups || dups.length === 0) return;

    const section = container.createEl('div', { cls: 'atomic-notes-cross-dedup' });

    const header = section.createEl('div', { cls: 'atomic-notes-collapsible-header' });
    header.createEl('span', {
      text: '▸',
      cls: 'atomic-notes-collapsible-arrow',
    });
    header.createEl('span', {
      text: `批内去重详情（${dups.length} 条被合并）`,
      cls: 'atomic-notes-collapsible-title',
    });
    const headerHint = header.createEl('span', {
      text: '点击展开',
      cls: 'atomic-notes-collapsible-hint',
    });

    const detailContainer = section.createEl('div', { cls: 'atomic-notes-collapsible-body' });

    let isOpen = false;
    header.addEventListener('click', () => {
      isOpen = !isOpen;
      detailContainer.toggleClass('is-open', isOpen);
      header.toggleClass('is-open', isOpen);
      headerHint.textContent = isOpen ? '点击收起' : '点击展开';
    });

    for (let i = 0; i < dups.length; i++) {
      const dup = dups[i];
      const card = detailContainer.createEl('div', { cls: 'atomic-notes-dup-card' });

      const simPercent = (dup.similarity * 100).toFixed(1);
      card.createEl('div', {
        text: `相似度 ${simPercent}%`,
        cls: 'atomic-notes-dup-sim',
      });

      const removedRow = card.createEl('div', { cls: 'atomic-notes-dup-row' });
      removedRow.createEl('span', { text: '被合并：', cls: 'atomic-notes-dup-label' });
      removedRow.createEl('span', { text: dup.removedTitle, cls: 'atomic-notes-dup-value' });
      const removedPreview = dup.removedContent.slice(0, 120) + (dup.removedContent.length > 120 ? '...' : '');
      card.createEl('div', {
        text: removedPreview,
        cls: 'atomic-notes-dup-preview',
      });

      const matchedRow = card.createEl('div', { cls: 'atomic-notes-dup-row' });
      matchedRow.createEl('span', { text: '并入：', cls: 'atomic-notes-dup-label' });
      matchedRow.createEl('span', { text: dup.matchedNote || '未知', cls: 'atomic-notes-dup-value' });
      if (dup.matchedContent) {
        card.createEl('div', {
          text: dup.matchedContent.slice(0, 120) + (dup.matchedContent.length > 120 ? '...' : ''),
          cls: 'atomic-notes-dup-preview',
        });
      }

      if (this.vm.restoredCrossBatch.has(i)) {
        card.createEl('span', {
          text: '已恢复',
          cls: 'atomic-notes-restore-tag',
        });
      } else {
        const restoreBtn = card.createEl('button', {
          text: '恢复为独立笔记',
          cls: 'atomic-notes-restore-btn',
        });
        restoreBtn.addEventListener('click', () => {
          this.vm.restoreCrossBatchNote(i);
          card.style.opacity = '0.6';
          restoreBtn.detach();
          card.createEl('span', {
            text: '已恢复',
            cls: 'atomic-notes-restore-tag',
          });
          this.refreshAfterRestore();
        });
      }
    }
  }

  private refreshAfterRestore() {
    if (!this.notesEls) return;
    refreshNoteCards(this.vm, this.notesEls.notesListEl);
    // 更新选中计数
    const countEl = this.notesEls.notesListEl.parentElement?.querySelector('p');
    if (countEl) {
      countEl.textContent = `已选 ${this.vm.selectedNotes.size} / ${this.vm.result.notes.length} 条`;
    }
  }

  // ─── 疑似重复确认（保留在 Modal 中） ───

  private renderPendingDuplicates(container: HTMLElement) {
    const pending = this.vm.result.vaultDedupPending;
    if (!pending || pending.length === 0) return;

    const existingSection = container.querySelector('.atomic-notes-pending-dedup');
    if (existingSection) existingSection.remove();

    const highCount = pending.filter((p) => p.highSimilarity).length;
    const midCount = pending.length - highCount;

    const section = container.createEl('div', { cls: 'atomic-notes-pending-dedup' });
    section.createEl('div', {
      text: '⚠️ 疑似重复笔记（需确认）',
      cls: 'atomic-notes-section-header',
    });

    const descParts: string[] = [];
    if (highCount > 0) descParts.push(`${highCount} 条高相似度（极可能重复）`);
    if (midCount > 0) descParts.push(`${midCount} 条中相似度（需人工判断）`);
    section.createEl('p', {
      text: `发现 ${pending.length} 条笔记与知识库已有笔记相似度较高：${descParts.join('，')}。请逐一确认是否保留：`,
      cls: 'atomic-notes-pending-desc',
    });

    for (const item of pending) {
      const isHigh = !!item.highSimilarity;
      const card = section.createEl('div', {
        cls: `atomic-notes-dup-card${isHigh ? ' is-high' : ''}`,
      });

      const localSim = (item.localSimilarity * 100).toFixed(1);
      let simLabel = isHigh ? `⚠ 本地 ${localSim}%（高）` : `本地 ${localSim}%`;
      if (item.semanticSimilarity !== undefined) {
        simLabel += ` / 语义 ${(item.semanticSimilarity * 100).toFixed(1)}%`;
      }
      card.createEl('div', {
        text: simLabel,
        cls: `atomic-notes-dup-sim${isHigh ? ' is-high' : ''}`,
      });

      const newNoteDiv = card.createEl('div', { cls: 'atomic-notes-pending-note-row' });
      newNoteDiv.createEl('span', { text: '新笔记：', cls: 'atomic-notes-pending-note-label' });
      newNoteDiv.createEl('span', { text: item.newNoteTitle, cls: 'atomic-notes-pending-note-title' });
      card.createEl('div', {
        text: item.newNoteContent.slice(0, 120) + (item.newNoteContent.length > 120 ? '...' : ''),
        cls: 'atomic-notes-pending-note-content',
      });

      const existingDiv = card.createEl('div', { cls: 'atomic-notes-pending-note-row' });
      existingDiv.createEl('span', { text: '已有笔记：', cls: 'atomic-notes-pending-note-label' });
      existingDiv.createEl('span', { text: item.matchedNote, cls: 'atomic-notes-pending-note-title' });
      card.createEl('div', {
        text: item.matchedContent,
        cls: 'atomic-notes-pending-note-content',
      });

      const btnRow = card.createEl('div', { cls: 'atomic-notes-decide-btn-row' });
      const keepBtn = btnRow.createEl('button', {
        text: '保留新笔记',
        cls: 'atomic-notes-decide-btn',
      });
      const discardBtn = btnRow.createEl('button', {
        text: '丢弃新笔记',
        cls: 'atomic-notes-decide-btn',
      });
      keepBtn.addEventListener('click', () => {
        this.vm.keepPendingNote(item.noteId);
        card.style.opacity = '0.5';
        keepBtn.setText('已保留');
        keepBtn.setAttribute('disabled', 'true');
        discardBtn.setAttribute('disabled', 'true');
      });
      discardBtn.addEventListener('click', () => {
        this.vm.discardPendingNote(item.noteId);
        card.style.opacity = '0.5';
        discardBtn.setText('已丢弃');
        discardBtn.setAttribute('disabled', 'true');
        keepBtn.setAttribute('disabled', 'true');
      });
    }

    const quickActions = section.createEl('div', { cls: 'atomic-notes-decide-btn-row' });
    quickActions.createEl('button', { text: '全部保留', cls: 'atomic-notes-decide-btn' })
      .addEventListener('click', () => {
        this.vm.keepAllPending();
        this.renderPendingDuplicates(container);
      });
    quickActions.createEl('button', { text: '全部丢弃', cls: 'atomic-notes-decide-btn' })
      .addEventListener('click', () => {
        this.vm.discardAllPending();
        this.renderPendingDuplicates(container);
      });
  }

  onClose() {
    this.vm.dispose();
    const { contentEl } = this;
    contentEl.empty();
  }
}
