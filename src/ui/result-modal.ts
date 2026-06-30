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
      const badge = contentEl.createEl('div', {
        cls: 'atomic-notes-profile-badge',
      });
      badge.style.display = 'inline-block';
      badge.style.padding = '4px 12px';
      badge.style.borderRadius = '12px';
      badge.style.fontSize = '12px';
      badge.style.background = 'var(--background-modifier-hover)';
      badge.style.color = 'var(--text-muted)';
      badge.style.marginBottom = '8px';
      badge.textContent = this.vm.profileLabel;
    }

    // 步骤时间线
    renderSteps(this.vm, contentEl);

    // 门控警告
    if (this.vm.result.success && this.vm.result.gateWarnings && this.vm.result.gateWarnings.length > 0) {
      renderGateWarnings(this.vm, contentEl);
    }

    // 语义去重跳过提示
    if (this.vm.result.semanticDedupSkipped) {
      const box = contentEl.createEl('div', {
        attr: {
          style: [
            'border-left: 3px solid var(--text-accent)',
            'background: rgba(var(--color-blue-rgb, 68,138,255), 0.06)',
            'border-radius: 6px',
            'padding: 6px 12px',
            'margin-bottom: 10px',
            'font-size: 12px',
            'color: var(--text-muted)',
          ].join(';'),
        },
      });
      box.createEl('span', { text: 'ℹ️ ', attr: { style: 'font-size:13px' } });
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
        const pre = errEl.createEl('pre', { cls: 'atomic-notes-diag', text: this.vm.result.error });
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
        errEl.appendText(this.vm.result.error || '');
      }
    }
  }

  // ─── 批内去重详情（含恢复交互，保留在 Modal 中） ───

  private renderCrossBatchDetails(container: HTMLElement) {
    const dups = this.vm.result.crossBatchDuplicates;
    if (!dups || dups.length === 0) return;

    const section = container.createEl('div', { cls: 'atomic-notes-cross-dedup' });

    const header = section.createEl('div', {
      attr: { style: 'display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 0;user-select:none' },
    });
    const arrow = header.createEl('span', {
      text: '▶',
      attr: { style: 'font-size:10px;transition:transform 0.2s;display:inline-block' },
    });
    header.createEl('span', {
      text: `批内去重详情（${dups.length} 条被合并）`,
      attr: { style: 'font-weight:600;font-size:13px' },
    });
    header.createEl('span', {
      text: '点击展开',
      attr: { style: 'font-size:11px;color:var(--text-muted)' },
    });

    const detailContainer = section.createEl('div', {
      attr: { style: 'display:none;border-left:3px solid var(--background-modifier-border);padding-left:12px;margin-top:8px' },
    });

    let isOpen = false;
    header.addEventListener('click', () => {
      isOpen = !isOpen;
      detailContainer.style.display = isOpen ? 'block' : 'none';
      arrow.style.transform = isOpen ? 'rotate(90deg)' : 'rotate(0deg)';
      const hintEl = header.lastChild as HTMLElement;
      hintEl.textContent = isOpen ? '点击收起' : '点击展开';
    });

    const hintEl = header.lastChild as HTMLElement;

    for (let i = 0; i < dups.length; i++) {
      const dup = dups[i];
      const card = detailContainer.createEl('div', {
        attr: { style: 'border:1px solid var(--background-modifier-border);border-radius:8px;padding:10px;margin-bottom:8px;background:var(--background-secondary)' },
      });

      const simPercent = (dup.similarity * 100).toFixed(1);
      card.createEl('div', {
        text: `相似度 ${simPercent}%`,
        attr: { style: 'font-size:12px;color:var(--text-accent);font-weight:600;margin-bottom:4px' },
      });

      const removedRow = card.createEl('div', { attr: { style: 'margin-bottom:4px' } });
      removedRow.createEl('span', { text: '被合并：', attr: { style: 'font-weight:600;font-size:12px' } });
      removedRow.createEl('span', { text: dup.removedTitle, attr: { style: 'font-size:12px' } });
      const removedPreview = dup.removedContent.slice(0, 120) + (dup.removedContent.length > 120 ? '...' : '');
      card.createEl('div', {
        text: removedPreview,
        attr: { style: 'font-size:11px;color:var(--text-muted);margin-bottom:6px' },
      });

      const matchedRow = card.createEl('div', { attr: { style: 'margin-bottom:6px' } });
      matchedRow.createEl('span', { text: '并入：', attr: { style: 'font-weight:600;font-size:12px' } });
      matchedRow.createEl('span', { text: dup.matchedNote || '未知', attr: { style: 'font-size:12px' } });
      if (dup.matchedContent) {
        card.createEl('div', {
          text: dup.matchedContent.slice(0, 120) + (dup.matchedContent.length > 120 ? '...' : ''),
          attr: { style: 'font-size:11px;color:var(--text-muted);margin-bottom:6px' },
        });
      }

      if (this.vm.restoredCrossBatch.has(i)) {
        card.createEl('span', {
          text: '已恢复',
          attr: { style: 'font-size:11px;color:var(--text-muted);font-style:italic' },
        });
      } else {
        const restoreBtn = card.createEl('button', {
          text: '恢复为独立笔记',
          attr: { style: 'font-size:11px;padding:2px 10px;cursor:pointer' },
        });
        restoreBtn.addEventListener('click', () => {
          this.vm.restoreCrossBatchNote(i);
          card.style.opacity = '0.6';
          restoreBtn.detach();
          card.createEl('span', {
            text: '已恢复',
            attr: { style: 'font-size:11px;color:var(--text-muted);font-style:italic' },
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
      attr: { style: 'color:var(--text-muted);font-size:13px' },
    });

    for (const item of pending) {
      const isHigh = !!item.highSimilarity;
      const borderColor = isHigh ? 'var(--color-red)' : 'var(--background-modifier-border)';
      const card = section.createEl('div', {
        attr: { style: `border:1px solid ${borderColor};border-radius:8px;padding:12px;margin-bottom:10px;background:var(--background-secondary)` },
      });

      const localSim = (item.localSimilarity * 100).toFixed(1);
      const simColor = isHigh ? 'var(--color-red)' : 'var(--text-accent)';
      let simLabel = isHigh ? `⚠ 本地 ${localSim}%（高）` : `本地 ${localSim}%`;
      if (item.semanticSimilarity !== undefined) {
        simLabel += ` / 语义 ${(item.semanticSimilarity * 100).toFixed(1)}%`;
      }
      card.createEl('div', { text: simLabel, attr: { style: `font-size:12px;color:${simColor};font-weight:600;margin-bottom:6px` } });

      const newNoteDiv = card.createEl('div');
      newNoteDiv.createEl('span', { text: '新笔记：', attr: { style: 'font-weight:600;font-size:13px' } });
      newNoteDiv.createEl('span', { text: item.newNoteTitle, attr: { style: 'font-size:13px' } });
      card.createEl('div', {
        text: item.newNoteContent.slice(0, 120) + (item.newNoteContent.length > 120 ? '...' : ''),
        attr: { style: 'font-size:12px;color:var(--text-muted);margin:4px 0 8px' },
      });

      const existingDiv = card.createEl('div');
      existingDiv.createEl('span', { text: '已有笔记：', attr: { style: 'font-weight:600;font-size:13px' } });
      existingDiv.createEl('span', { text: item.matchedNote, attr: { style: 'font-size:13px' } });
      card.createEl('div', {
        text: item.matchedContent,
        attr: { style: 'font-size:12px;color:var(--text-muted);margin:4px 0 8px' },
      });

      const btnRow = card.createEl('div', { attr: { style: 'display:flex;gap:8px;justify-content:flex-end' } });
      const keepBtn = btnRow.createEl('button', {
        text: '保留新笔记',
        attr: { style: 'font-size:12px;padding:4px 12px;cursor:pointer' },
      });
      const discardBtn = btnRow.createEl('button', {
        text: '丢弃新笔记',
        attr: { style: 'font-size:12px;padding:4px 12px;cursor:pointer' },
      });
      keepBtn.addEventListener('click', () => {
        this.vm.keepPendingNote(item.newNoteIndex);
        card.style.opacity = '0.5';
        keepBtn.setText('已保留');
        keepBtn.setAttribute('disabled', 'true');
        discardBtn.setAttribute('disabled', 'true');
      });
      discardBtn.addEventListener('click', () => {
        this.vm.discardPendingNote(item.newNoteIndex);
        card.style.opacity = '0.5';
        discardBtn.setText('已丢弃');
        discardBtn.setAttribute('disabled', 'true');
        keepBtn.setAttribute('disabled', 'true');
      });
    }

    const quickActions = section.createEl('div', { attr: { style: 'display:flex;gap:8px;margin-top:8px' } });
    quickActions.createEl('button', { text: '全部保留', attr: { style: 'font-size:12px;padding:4px 12px;cursor:pointer' } })
      .addEventListener('click', () => {
        this.vm.keepAllPending();
        this.renderPendingDuplicates(container);
      });
    quickActions.createEl('button', { text: '全部丢弃', attr: { style: 'font-size:12px;padding:4px 12px;cursor:pointer' } })
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
